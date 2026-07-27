import pdfplumber, glob, re, json, sys, os

def clean_num(s):
    if s is None:
        return None
    s = str(s).strip()
    s = s.replace('\n', ' ')
    s = re.sub(r'\s+', '', s)  # remove all whitespace (fixes "1 0.405,15" -> "10.405,15")
    s = s.replace('R$', '')
    if s in ('', '-', '--'):
        return 0.0 if s == '-' else None
    s = s.replace('.', '').replace(',', '.')
    try:
        return float(s)
    except:
        return None

def parse_pdf(path):
    med_num = None
    data_med = None
    periodo = None
    contratada = None
    contrato_no = None
    rows_out = []
    section = None
    subsection = None
    totals = {}

    with pdfplumber.open(path) as pdf:
        full_text = pdf.pages[0].extract_text() or ''
        m = re.search(r'MEDIÇÃO Nº\s*(\d+)', full_text)
        if m: med_num = int(m.group(1))
        m = re.search(r'DATA:\s*([\d/]+)', full_text)
        if m: data_med = m.group(1)
        m = re.search(r'PERÍODO:\s*([\d/]+)\s*[AÀ]\s*([\d/]+)', full_text)
        if m: periodo = f'{m.group(1)} A {m.group(2)}'
        m = re.search(r'CONTRATADA:\s*(.+)', full_text)
        if m: contratada = m.group(1).split('\n')[0].strip()
        m = re.search(r'(\d{2,4}/20\d{2})', full_text)
        if m: contrato_no = m.group(1).strip()

        for page in pdf.pages:
            tables = page.extract_tables()
            for t in tables:
                for r in t:
                    r = [c.replace('\n',' ').strip() if isinstance(c,str) else c for c in r]
                    item = r[0] if len(r) > 0 else None
                    servico = r[1] if len(r) > 1 else None
                    if not any(r):
                        continue
                    if item in ('ITEM',) or (item=='' and servico==''):
                        continue
                    if item == '1' and servico:
                        section = 'MAO_DE_OBRA'
                        continue
                    if item == '2' and servico:
                        section = 'MATERIAIS'
                        continue
                    if item == '3' and servico:
                        section = 'CUSTO_OPERACIONAL'
                        continue
                    if item == 'SUB-TOTAL':
                        totals[f'{section}_subtotal_periodo'] = clean_num(r[8])
                        totals[f'{section}_subtotal_contrato'] = clean_num(r[7])
                        continue
                    if item and 'CUSTO DIRETO DA OBRA' in str(item).upper():
                        totals['custo_direto_obra_contrato'] = clean_num(r[7])
                        totals['custo_direto_obra_periodo'] = clean_num(r[8])
                        continue
                    if item and 'ESTA MEDIÇÃO' in str(item).upper():
                        val = None
                        for c in r:
                            if c and 'R$' in str(c):
                                val = clean_num(c)
                        totals['esta_medicao'] = val
                        continue
                    # subsection header: item like "1.1" with only 2 dots-level and rest empty
                    if item and re.match(r'^\d+\.\d+$', item) and not any(r[2:]):
                        subsection = servico
                        continue
                    # actual item row: item like "1.1.1" or "2.5" etc with data
                    if item and re.match(r'^\d+(\.\d+)+$', item) and servico:
                        rows_out.append({
                            'medicao': med_num,
                            'data_medicao': data_med,
                            'periodo': periodo,
                            'contratada': contratada,
                            'contrato_no': contrato_no,
                            'section': section,
                            'subsection': subsection,
                            'item': item,
                            'descricao': servico,
                            'unidade': r[2],
                            'qtd_contrato': clean_num(r[3]),
                            'qtd_periodo': clean_num(r[4]),
                            'qtd_saldo': clean_num(r[5]),
                            'preco_unitario': clean_num(r[6]),
                            'valor_contrato': clean_num(r[7]),
                            'valor_periodo': clean_num(r[8]),
                            'valor_saldo': clean_num(r[9]),
                        })
    return {'meta': {'medicao': med_num, 'data': data_med, 'periodo': periodo, 'contratada': contratada,
                      'contrato_no': contrato_no, **totals}, 'rows': rows_out}

if __name__ == '__main__':
    src_dir = sys.argv[1]
    out_path = sys.argv[2]
    os.chdir(src_dir)
    files = sorted(glob.glob('*.pdf'), key=lambda x: int(re.search(r'(\d+)', x).group(1)))
    all_data = []
    for f in files:
        d = parse_pdf(f)
        d['file'] = f
        all_data.append(d)
        print(f, '-> medicao', d['meta']['medicao'], 'rows', len(d['rows']), 'meta', d['meta'])
    with open(out_path, 'w', encoding='utf-8') as fo:
        json.dump(all_data, fo, ensure_ascii=False, indent=2)
