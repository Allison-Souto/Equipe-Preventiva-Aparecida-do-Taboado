// Port of build_dataset.py aggregation to JS
function norm_role(desc){ if(!desc) return desc; let s=desc.split(/COM ENC/)[0].trim(); return s.replace(/\s+/g,' '); }
function month_label(periodo){
  if(!periodo) return null;
  const start=periodo.split(' A ')[0];
  const [dd,mm,yyyy]=start.split('/');
  const meses=['','Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  return `${meses[parseInt(mm,10)]}/${yyyy.slice(2)}`;
}
function norm_co(desc){
  const s=desc.trim().toUpperCase();
  const mapping=[['ALIMENTACAO','ALIMENTAÇÃO - REFEIÇÃO/CAFÉ/ALMOÇO OPERÁRIO'],['COMBUSTIVEIS','COMBUSTÍVEIS - GASOLINA COMUM'],['INTERNET','INTERNET - DISPÊNDIO MENSAL'],['VALE TRANSPORTE','VALE TRANSPORTE PARA OPERÁRIO'],['VEICULO DE PASSEIO','VEÍCULO DE PASSEIO UTILITÁRIO 1.6 (EXCLUSIVE MOTORISTA)'],['VEICULO STRADA','VEÍCULO STRADA (EXCLUSIVE MOTORISTA)']];
  for(const [k,v] of mapping){ if(s.startsWith(k)) return v; }
  return s;
}
function desc_norm(desc){ return desc.trim().toUpperCase().replace(/\s+/g,' '); }
function abc_class(cum){ return cum<=0.8?'A':(cum<=0.95?'B':'C'); }
function r2(x){ return x==null?null:Math.round((x+Number.EPSILON)*100)/100; }
function r4(x){ return x==null?null:Math.round((x+Number.EPSILON)*10000)/10000; }

// pivot: index key -> month -> agg. mode 'sum' or 'mean'
function pivot(rows, keyFn, valField, mode){
  const acc={}; // key -> month -> {sum,count}
  for(const r of rows){
    const k=keyFn(r); const m=r.mes_label; const v=r[valField];
    if(v==null||Number.isNaN(v)) continue;
    (acc[k] ||= {}); (acc[k][m] ||= {sum:0,count:0});
    acc[k][m].sum+=v; acc[k][m].count++;
  }
  const out={};
  for(const k in acc){ out[k]={}; for(const m in acc[k]){ const c=acc[k][m]; out[k][m]= mode==='mean'? c.sum/c.count : c.sum; } }
  return out;
}

function build_deltas(pq,pv,pu,keys,month_order){
  const deltas={};
  for(const role of keys){
    const entries=[]; let pQ=null,pV=null,pU=null;
    for(const mes of month_order){
      let qtd=(pq[role]&&mes in pq[role])?pq[role][mes]:null;
      let val=(pv[role]&&mes in pv[role])?pv[role][mes]:null;
      let unit=(pu[role]&&mes in pu[role])?pu[role][mes]:null;
      let tipo='sem_dado',dq=null,dv=null,du=null;
      if(val!=null&&pV==null) tipo='inicio';
      else if(val==null&&pV!=null) tipo='supressao_total';
      else if(val!=null&&pV!=null){ dv=r2(val-pV); dq=(qtd==null||pQ==null)?null:r2(qtd-pQ); du=(unit==null||pU==null)?null:r4(unit-pU); tipo=Math.abs(dv)<0.005?'estavel':(dv>0?'aditivo':'supressao'); }
      entries.push({mes,qtd,valor:val,preco_unit:unit,delta_qtd:dq,delta_valor:dv,delta_preco_unit:du,tipo});
      if(val!=null){pQ=qtd;pV=val;pU=unit;}
    }
    deltas[role]=entries;
  }
  return deltas;
}

function buildDataset(parsed){
  const meta_rows=parsed.map(m=>m.meta);
  const rows=[]; for(const m of parsed) for(const r of m.rows) rows.push({...r});
  meta_rows.sort((a,b)=>a.medicao-b.medicao);
  const med_to_label={}; for(const mr of meta_rows) med_to_label[mr.medicao]=month_label(mr.periodo);
  for(const r of rows) r.mes_label=med_to_label[r.medicao];

  const mo=rows.filter(r=>r.section==='MAO_DE_OBRA');
  const mo_q=pivot(mo,r=>norm_role(r.descricao),'qtd_periodo','sum');
  const mo_v=pivot(mo,r=>norm_role(r.descricao),'valor_periodo','sum');
  const mo_u=pivot(mo,r=>norm_role(r.descricao),'preco_unitario','mean');
  const month_order=meta_rows.map(mr=>med_to_label[mr.medicao]).filter(m=>Object.values(mo_q).some(o=>m in o));
  const mo_keys=Object.keys(mo_v);

  const mat=rows.filter(r=>r.section==='MATERIAIS').map(r=>({...r,dn:desc_norm(r.descricao)}));
  // monthly abc
  const meds=[...new Set(mat.map(r=>r.medicao))].sort((a,b)=>a-b);
  const abc_mensal={};
  for(const medn of meds){
    const g=mat.filter(r=>r.medicao===medn);
    const byd={}; for(const r of g){ (byd[r.dn]||={valor:0,qtd:0,unidade:r.unidade}); byd[r.dn].valor+=r.valor_periodo||0; byd[r.dn].qtd+=r.qtd_periodo||0; }
    let arr=Object.entries(byd).map(([desc_norm,o])=>({desc_norm,valor:o.valor,qtd:o.qtd,unidade:o.unidade}));
    arr.sort((a,b)=>b.valor-a.valor); const total=arr.reduce((s,x)=>s+x.valor,0); let cum=0;
    arr.forEach(x=>{ x.pct=total?x.valor/total:0; cum+=x.pct; x.cum_pct=cum; x.classe=abc_class(cum); });
    abc_mensal[medn]=arr.slice(0,15);
  }
  // acumulado
  const byda={}; for(const r of mat){ (byda[r.dn]||={valor_total:0,qtd_total:0,unidade:r.unidade,meds:new Set()}); byda[r.dn].valor_total+=r.valor_periodo||0; byda[r.dn].qtd_total+=r.qtd_periodo||0; byda[r.dn].meds.add(r.medicao); }
  let acc=Object.entries(byda).map(([desc_norm,o])=>({desc_norm,valor_total:o.valor_total,qtd_total:o.qtd_total,unidade:o.unidade,n_medicoes:o.meds.size}));
  acc.sort((a,b)=>b.valor_total-a.valor_total); const tacc=acc.reduce((s,x)=>s+x.valor_total,0); let cuma=0;
  acc.forEach(x=>{ x.pct=tacc?x.valor_total/tacc:0; cuma+=x.pct; x.cum_pct=cuma; x.classe=abc_class(cuma); });

  const co=rows.filter(r=>r.section==='CUSTO_OPERACIONAL');
  const co_v=pivot(co,r=>norm_co(r.descricao),'valor_periodo','sum');
  const co_q=pivot(co,r=>norm_co(r.descricao),'qtd_periodo','sum');
  const co_u=pivot(co,r=>norm_co(r.descricao),'preco_unitario','mean');
  const co_keys=Object.keys(co_v);

  const mo_deltas=build_deltas(mo_q,mo_v,mo_u,mo_keys,month_order);
  const co_deltas=build_deltas(co_q,co_v,co_u,co_keys,month_order);

  // materiais recorrentes
  const recorrentes=new Set(acc.filter(x=>x.n_medicoes>=2).map(x=>x.desc_norm));
  const matrec=mat.filter(r=>recorrentes.has(r.dn));
  const mr_q=pivot(matrec,r=>r.dn,'qtd_periodo','sum');
  const mr_v=pivot(matrec,r=>r.dn,'valor_periodo','sum');
  const mr_u=pivot(matrec,r=>r.dn,'preco_unitario','mean');
  const ordem=acc.map(x=>x.desc_norm).filter(d=>d in mr_v);
  const mat_deltas=build_deltas(mr_q,mr_v,mr_u,ordem,month_order);

  const totais=meta_rows.map(mr=>({medicao:mr.medicao,mes_label:med_to_label[mr.medicao],data:mr.data,periodo:mr.periodo,mao_de_obra:mr.MAO_DE_OBRA_subtotal_periodo,materiais:mr.MATERIAIS_subtotal_periodo,custo_operacional:mr.CUSTO_OPERACIONAL_subtotal_periodo,total:mr.custo_direto_obra_periodo}));

  const asRow=(piv,keys)=>{ const o={}; for(const k of keys) o[k]=month_order.map(m=>(piv[k]&&m in piv[k])?piv[k][m]:null); return o; };

  return {
    meses:month_order,
    totais,
    mao_de_obra:{qtd:asRow(mo_q,mo_keys),valor:asRow(mo_v,mo_keys),preco_unit:asRow(mo_u,mo_keys)},
    custo_operacional:{valor:asRow(co_v,co_keys),qtd:asRow(co_q,co_keys),preco_unit:asRow(co_u,co_keys)},
    abc_mensal:Object.fromEntries(Object.entries(abc_mensal).map(([k,v])=>[String(k),v])),
    abc_acumulado:acc,
    abc_acumulado_top20:acc.slice(0,20),
    mao_de_obra_deltas:mo_deltas,
    custo_operacional_deltas:co_deltas,
    materiais_recorrentes:{qtd:asRow(mr_q,ordem),valor:asRow(mr_v,ordem),preco_unit:asRow(mr_u,ordem)},
    materiais_recorrentes_deltas:mat_deltas,
    medicao_to_mes:Object.fromEntries(Object.entries(med_to_label).map(([k,v])=>[String(k),v])),
  };
}
