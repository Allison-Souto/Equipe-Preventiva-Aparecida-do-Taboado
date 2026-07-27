import json, re
import pandas as pd
import numpy as np

d = json.load(open('/sessions/modest-vigilant-hypatia/mnt/outputs/parsed.json', encoding='utf-8'))

meta_rows = []
rows = []
for med in d:
    meta_rows.append(med['meta'])
    rows.extend(med['rows'])

meta_df = pd.DataFrame(meta_rows).sort_values('medicao').reset_index(drop=True)
df = pd.DataFrame(rows)

def month_label(periodo):
    if not periodo:
        return None
    start = periodo.split(' A ')[0]
    dd, mm, yyyy = start.split('/')
    meses = ['', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
    return f"{meses[int(mm)]}/{yyyy[2:]}"

meta_df['mes_label'] = meta_df['periodo'].apply(month_label)
med_to_label = dict(zip(meta_df['medicao'], meta_df['mes_label']))
df['mes_label'] = df['medicao'].map(med_to_label)

# ---------- MAO DE OBRA ----------
mo = df[df.section == 'MAO_DE_OBRA'].copy()
def norm_role(desc):
    if not desc:
        return desc
    s = re.split(r'COM ENC', desc)[0].strip()
    return re.sub(r'\s+', ' ', s)
mo['role'] = mo['descricao'].apply(norm_role)

mo_pivot = mo.pivot_table(index='role', columns='mes_label', values='qtd_periodo', aggfunc='sum')
mo_pivot_val = mo.pivot_table(index='role', columns='mes_label', values='valor_periodo', aggfunc='sum')
mo_pivot_unit = mo.pivot_table(index='role', columns='mes_label', values='preco_unitario', aggfunc='mean')

month_order = [m for m in meta_df.sort_values('medicao')['mes_label'] if m in mo_pivot.columns]
mo_pivot = mo_pivot[month_order]
mo_pivot_val = mo_pivot_val[month_order]
mo_pivot_unit = mo_pivot_unit[month_order]

mo_detail = mo[['medicao','mes_label','role','descricao','unidade','qtd_periodo','preco_unitario','valor_periodo']].sort_values(['role','medicao'])

# ---------- MATERIAIS - CURVA ABC ----------
mat = df[df.section == 'MATERIAIS'].copy()
mat['desc_norm'] = mat['descricao'].str.strip().str.upper().str.replace(r'\s+', ' ', regex=True)

def abc_class(cum_pct):
    if cum_pct <= 0.8:
        return 'A'
    elif cum_pct <= 0.95:
        return 'B'
    else:
        return 'C'

monthly_abc = {}
for medn, g in mat.groupby('medicao'):
    gg = g.groupby('desc_norm', as_index=False).agg(valor=('valor_periodo','sum'), qtd=('qtd_periodo','sum'), unidade=('unidade','first'))
    gg = gg.sort_values('valor', ascending=False).reset_index(drop=True)
    total = gg['valor'].sum()
    gg['pct'] = gg['valor'] / total if total else 0
    gg['cum_pct'] = gg['pct'].cumsum()
    gg['classe'] = gg['cum_pct'].apply(abc_class)
    monthly_abc[int(medn)] = gg

acc = mat.groupby('desc_norm', as_index=False).agg(
    valor_total=('valor_periodo','sum'),
    qtd_total=('qtd_periodo','sum'),
    unidade=('unidade','first'),
    n_medicoes=('medicao','nunique')
)
acc = acc.sort_values('valor_total', ascending=False).reset_index(drop=True)
total_acc = acc['valor_total'].sum()
acc['pct'] = acc['valor_total'] / total_acc if total_acc else 0
acc['cum_pct'] = acc['pct'].cumsum()
acc['classe'] = acc['cum_pct'].apply(abc_class)

# ---------- CUSTO OPERACIONAL ----------
co = df[df.section == 'CUSTO_OPERACIONAL'].copy()
def norm_co(desc):
    s = desc.strip().upper()
    mapping = {
        'ALIMENTACAO': 'ALIMENTAÇÃO - REFEIÇÃO/CAFÉ/ALMOÇO OPERÁRIO',
        'COMBUSTIVEIS': 'COMBUSTÍVEIS - GASOLINA COMUM',
        'INTERNET': 'INTERNET - DISPÊNDIO MENSAL',
        'VALE TRANSPORTE': 'VALE TRANSPORTE PARA OPERÁRIO',
        'VEICULO DE PASSEIO': 'VEÍCULO DE PASSEIO UTILITÁRIO 1.6 (EXCLUSIVE MOTORISTA)',
        'VEICULO STRADA': 'VEÍCULO STRADA (EXCLUSIVE MOTORISTA)',
    }
    for k, v in mapping.items():
        if s.startswith(k):
            return v
    return s
co['item_norm'] = co['descricao'].apply(norm_co)

co_pivot_val = co.pivot_table(index='item_norm', columns='mes_label', values='valor_periodo', aggfunc='sum')
co_pivot_qtd = co.pivot_table(index='item_norm', columns='mes_label', values='qtd_periodo', aggfunc='sum')
co_pivot_unit = co.pivot_table(index='item_norm', columns='mes_label', values='preco_unitario', aggfunc='mean')
co_pivot_val = co_pivot_val[month_order]
co_pivot_qtd = co_pivot_qtd[month_order]
co_pivot_unit = co_pivot_unit[month_order]

co_detail = co[['medicao','mes_label','item_norm','descricao','unidade','qtd_periodo','preco_unitario','valor_periodo']].sort_values(['item_norm','medicao'])

def build_deltas(pivot_qtd, pivot_val, pivot_unit):
    deltas = {}
    for role in pivot_val.index:
        entries = []
        prev_qtd = None
        prev_val = None
        prev_unit = None
        for mes in month_order:
            qtd = pivot_qtd.loc[role, mes] if role in pivot_qtd.index and mes in pivot_qtd.columns else None
            val = pivot_val.loc[role, mes] if mes in pivot_val.columns else None
            unit = pivot_unit.loc[role, mes] if role in pivot_unit.index and mes in pivot_unit.columns else None
            qtd = None if pd.isna(qtd) else qtd
            val = None if pd.isna(val) else val
            unit = None if pd.isna(unit) else unit
            tipo = 'sem_dado'
            d_qtd = None
            d_val = None
            d_unit = None
            if val is not None and prev_val is None:
                tipo = 'inicio'
            elif val is None and prev_val is not None:
                tipo = 'supressao_total'
            elif val is not None and prev_val is not None:
                d_val = round(val - prev_val, 2)
                d_qtd = None if (qtd is None or prev_qtd is None) else round(qtd - prev_qtd, 2)
                d_unit = None if (unit is None or prev_unit is None) else round(unit - prev_unit, 4)
                if abs(d_val) < 0.005:
                    tipo = 'estavel'
                elif d_val > 0:
                    tipo = 'aditivo'
                else:
                    tipo = 'supressao'
            entries.append({
                'mes': mes, 'qtd': qtd, 'valor': val, 'preco_unit': unit,
                'delta_qtd': d_qtd, 'delta_valor': d_val, 'delta_preco_unit': d_unit, 'tipo': tipo
            })
            if val is not None:
                prev_qtd, prev_val, prev_unit = qtd, val, unit
        deltas[role] = entries
    return deltas

mo_deltas = build_deltas(mo_pivot, mo_pivot_val, mo_pivot_unit)
co_deltas = build_deltas(co_pivot_qtd, co_pivot_val, co_pivot_unit)

# ---------- MATERIAIS RECORRENTES (mesmo padrão de Mão de Obra / Custo Operacional) ----------
# Apenas materiais que aparecem em 2+ medições têm "evolução mensal" com sentido;
# itens comprados uma única vez ficam só na Curva ABC.
recorrentes_desc = set(acc[acc['n_medicoes'] >= 2]['desc_norm'])
mat_rec = mat[mat['desc_norm'].isin(recorrentes_desc)].copy()

mat_pivot_qtd = mat_rec.pivot_table(index='desc_norm', columns='mes_label', values='qtd_periodo', aggfunc='sum')
mat_pivot_val = mat_rec.pivot_table(index='desc_norm', columns='mes_label', values='valor_periodo', aggfunc='sum')
mat_pivot_unit = mat_rec.pivot_table(index='desc_norm', columns='mes_label', values='preco_unitario', aggfunc='mean')
mat_pivot_qtd = mat_pivot_qtd.reindex(columns=month_order)
mat_pivot_val = mat_pivot_val.reindex(columns=month_order)
mat_pivot_unit = mat_pivot_unit.reindex(columns=month_order)

# ordenar por valor total acumulado (desc), igual ranking da curva ABC
ordem_valor = acc.set_index('desc_norm')['valor_total']
ordem_lista = [d for d in ordem_valor.sort_values(ascending=False).index if d in mat_pivot_val.index]
mat_pivot_qtd = mat_pivot_qtd.loc[ordem_lista]
mat_pivot_val = mat_pivot_val.loc[ordem_lista]
mat_pivot_unit = mat_pivot_unit.loc[ordem_lista]

mat_deltas = build_deltas(mat_pivot_qtd, mat_pivot_val, mat_pivot_unit)

# ---------- TOTALS PER SECTION PER MEDICAO ----------
totais = meta_df[['medicao','mes_label','data','periodo',
                   'MAO_DE_OBRA_subtotal_periodo','MATERIAIS_subtotal_periodo',
                   'CUSTO_OPERACIONAL_subtotal_periodo','custo_direto_obra_periodo']].copy()
totais.columns = ['medicao','mes_label','data','periodo','mao_de_obra','materiais','custo_operacional','total']

out = {
    'meses': month_order,
    'totais': totais.to_dict(orient='records'),
    'mao_de_obra': {
        'qtd': {role: [None if pd.isna(v) else v for v in row] for role, row in zip(mo_pivot.index, mo_pivot.values)},
        'valor': {role: [None if pd.isna(v) else v for v in row] for role, row in zip(mo_pivot_val.index, mo_pivot_val.values)},
        'preco_unit': {role: [None if pd.isna(v) else v for v in row] for role, row in zip(mo_pivot_unit.index, mo_pivot_unit.values)},
    },
    'custo_operacional': {
        'valor': {role: [None if pd.isna(v) else v for v in row] for role, row in zip(co_pivot_val.index, co_pivot_val.values)},
        'qtd': {role: [None if pd.isna(v) else v for v in row] for role, row in zip(co_pivot_qtd.index, co_pivot_qtd.values)},
        'preco_unit': {role: [None if pd.isna(v) else v for v in row] for role, row in zip(co_pivot_unit.index, co_pivot_unit.values)},
    },
    'abc_mensal': {
        str(medn): gg.head(15).to_dict(orient='records') for medn, gg in monthly_abc.items()
    },
    'abc_acumulado': acc.to_dict(orient='records'),
    'abc_acumulado_top20': acc.head(20).to_dict(orient='records'),
    'mao_de_obra_deltas': mo_deltas,
    'custo_operacional_deltas': co_deltas,
    'materiais_recorrentes': {
        'qtd': {item: [None if pd.isna(v) else v for v in row] for item, row in zip(mat_pivot_qtd.index, mat_pivot_qtd.values)},
        'valor': {item: [None if pd.isna(v) else v for v in row] for item, row in zip(mat_pivot_val.index, mat_pivot_val.values)},
        'preco_unit': {item: [None if pd.isna(v) else v for v in row] for item, row in zip(mat_pivot_unit.index, mat_pivot_unit.values)},
    },
    'materiais_recorrentes_deltas': mat_deltas,
    'medicao_to_mes': {str(k): v for k, v in med_to_label.items()},
}

with open('/sessions/modest-vigilant-hypatia/mnt/outputs/dashboard_data.json', 'w', encoding='utf-8') as f:
    json.dump(out, f, ensure_ascii=False, indent=2, default=str)

mo_detail.to_csv('/sessions/modest-vigilant-hypatia/mnt/outputs/mao_de_obra_detalhe.csv', index=False)
co_detail.to_csv('/sessions/modest-vigilant-hypatia/mnt/outputs/custo_operacional_detalhe.csv', index=False)
acc.to_csv('/sessions/modest-vigilant-hypatia/mnt/outputs/curva_abc_acumulada.csv', index=False)
mat.to_csv('/sessions/modest-vigilant-hypatia/mnt/outputs/materiais_detalhe.csv', index=False)
totais.to_csv('/sessions/modest-vigilant-hypatia/mnt/outputs/totais_por_medicao.csv', index=False)

print('MESES:', month_order)
print('MAO DE OBRA roles:', list(mo_pivot.index))
print('MATERIAIS RECORRENTES:', len(mat_pivot_val.index))
print()
print('TOTAIS:')
print(totais.to_string())
print()
print('Classe counts acumulado:', acc['classe'].value_counts().to_dict())
