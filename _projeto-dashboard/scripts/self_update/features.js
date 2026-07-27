/* ===== Aplicações: relatório, upload de PDF, publicação automática, compartilhamento ===== */
const PARSED_MARK_A='/*__PARSED'+'_START__*/', PARSED_MARK_B='/*__PARSED'+'_END__*/';
function regenerateHTML(newParsed){
  const a=ORIGINAL_HTML.indexOf(PARSED_MARK_A), b=ORIGINAL_HTML.indexOf(PARSED_MARK_B);
  if(a<0||b<0){ alert('Não foi possível localizar os dados embutidos para regenerar.'); return null; }
  return ORIGINAL_HTML.slice(0,a+PARSED_MARK_A.length)+JSON.stringify(newParsed)+ORIGINAL_HTML.slice(b);
}
function downloadHTML(html, filename){
  const blob=new Blob([html],{type:'text/html;charset=utf-8'});
  const url=URL.createObjectURL(blob); const a=document.createElement('a');
  a.href=url; a.download=filename; document.body.appendChild(a); a.click();
  setTimeout(()=>{document.body.removeChild(a);URL.revokeObjectURL(url);},1500);
}

/* ---------- Publicação automática no GitHub ---------- */
const GH_OWNER='Allison-Souto', GH_REPO='Equipe-Preventiva-Aparecida-do-Taboado';
const SHARE_URL='https://allison-souto.github.io/Equipe-Preventiva-Aparecida-do-Taboado/';
function ghToken(){ try{ return localStorage.getItem('gh_token')||''; }catch(e){ return ''; } }
function configurarPublicacao(){
  const cur=ghToken();
  const t=prompt('Cole seu token do GitHub (fine-grained, com permissão "Contents: Read and write" neste repositório).\n\nEle fica salvo SÓ neste navegador e nunca vai para o arquivo publicado nem para terceiros. Deixe em branco e OK para remover.', cur);
  if(t===null) return;
  try{ localStorage.setItem('gh_token', t.trim()); }catch(e){}
  const st=document.getElementById('uploadStatus');
  if(st){ st.textContent = t.trim() ? 'Publicação automática ativada neste navegador.' : 'Token removido — voltará a baixar o arquivo.'; st.className = t.trim()?'up-ok':''; }
}
async function ghApi(path, method, body){
  const r=await fetch('https://api.github.com'+path, {
    method: method||'GET',
    headers:{ 'Authorization':'Bearer '+ghToken(), 'Accept':'application/vnd.github+json', 'X-GitHub-Api-Version':'2022-11-28', 'Content-Type':'application/json' },
    body: body? JSON.stringify(body): undefined
  });
  if(!r.ok){ const txt=await r.text(); throw new Error('GitHub '+r.status+': '+txt.slice(0,160)); }
  return r.json();
}
function utf8ToB64(str){ return btoa(unescape(encodeURIComponent(str))); }
async function publishToGitHub(html){
  const o=GH_OWNER, rp=GH_REPO;
  const ref=await ghApi(`/repos/${o}/${rp}/git/ref/heads/main`);
  const latest=ref.object.sha;
  const commit=await ghApi(`/repos/${o}/${rp}/git/commits/${latest}`);
  const blob=await ghApi(`/repos/${o}/${rp}/git/blobs`,'POST',{content:utf8ToB64(html),encoding:'base64'});
  const tree=await ghApi(`/repos/${o}/${rp}/git/trees`,'POST',{base_tree:commit.tree.sha,tree:[{path:'index.html',mode:'100644',type:'blob',sha:blob.sha}]});
  const nc=await ghApi(`/repos/${o}/${rp}/git/commits`,'POST',{message:'Atualiza dashboard (nova medição)',tree:tree.sha,parents:[latest]});
  await ghApi(`/repos/${o}/${rp}/git/refs/heads/main`,'PATCH',{sha:nc.sha});
}

/* ---------- Compartilhar (WhatsApp com o link) ---------- */
function downloadShareCopy(){ downloadHTML(ORIGINAL_HTML,'Dashboard_Medicoes_Equipe_Preventiva.html'); }
function shareDashboard(){
  const msg='Dashboard de Medições — Equipe Preventiva (Contrato 131/2024, Aparecida do Taboado/MS). Abra pelo link (funciona em qualquer celular): '+SHARE_URL;
  try{ if(navigator.clipboard) navigator.clipboard.writeText(SHARE_URL); }catch(e){}
  window.open('https://wa.me/?text='+encodeURIComponent(msg),'_blank');
}

/* ---------- pdf.js sob demanda ---------- */
let _pdfjsReady=null;
function loadPdfJs(){
  if(_pdfjsReady) return _pdfjsReady;
  _pdfjsReady=new Promise((res,rej)=>{
    if(window.pdfjsLib){ try{pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';}catch(e){} return res(window.pdfjsLib); }
    const s=document.createElement('script');
    s.src='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    s.onload=()=>{ try{pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';}catch(e){} res(window.pdfjsLib); };
    s.onerror=()=>rej(new Error('Falha ao carregar o leitor de PDF (precisa de internet na 1ª vez).'));
    document.head.appendChild(s);
  });
  return _pdfjsReady;
}

/* ---------- Adicionar medição ---------- */
async function handleUpload(fileList){
  const status=document.getElementById('uploadStatus');
  const files=[...fileList].filter(f=>/\.pdf$/i.test(f.name));
  if(!files.length) return;
  status.textContent='Carregando leitor de PDF…'; status.className='up-info';
  try{ await loadPdfJs(); }catch(e){ status.textContent=e.message; status.className='up-err'; return; }
  const novos=[]; const problemas=[];
  for(const f of files){
    status.textContent='Lendo '+f.name+'…';
    try{
      const buf=new Uint8Array(await f.arrayBuffer());
      const r=await parsePdf(buf);
      if(r.meta.medicao==null||!r.rows.length){ problemas.push(f.name+': não reconhecido como boletim'); continue; }
      novos.push({meta:r.meta,rows:r.rows,file:f.name});
    }catch(e){ problemas.push(f.name+': '+e.message); }
  }
  if(!novos.length){ status.textContent='Nenhuma medição válida. '+problemas.join('; '); status.className='up-err'; return; }
  const byNum=new Map(PARSED.map(m=>[m.meta.medicao,m]));
  const substituidas=[];
  for(const n of novos){ if(byNum.has(n.meta.medicao)) substituidas.push(n.meta.medicao); byNum.set(n.meta.medicao,n); }
  const merged=[...byNum.values()].sort((a,b)=>a.meta.medicao-b.meta.medicao);
  const resumo=novos.map(n=>'nº'+n.meta.medicao+' ('+n.rows.length+' itens)').join(', ');
  const temToken=!!ghToken();
  let msg='Medições processadas: '+resumo+'.';
  if(substituidas.length) msg+=' Substituídas: '+substituidas.join(', ')+'.';
  if(problemas.length) msg+=' Ignoradas: '+problemas.join('; ')+'.';
  msg+= temToken ? '\n\nO dashboard será atualizado e PUBLICADO automaticamente no link do prefeito. Continuar?'
                 : '\n\nO dashboard será atualizado e uma cópia (index.html) será baixada. Continuar?';
  if(!confirm(msg)){ status.textContent='Cancelado.'; status.className=''; return; }
  const html=regenerateHTML(merged); if(!html) return;
  if(temToken){
    status.textContent='Publicando no GitHub…'; status.className='up-info';
    try{
      await publishToGitHub(html);
      status.textContent='Publicado! O link do prefeito será atualizado em ~1 min. Recarregando com os novos dados…'; status.className='up-ok';
    }catch(e){
      status.textContent='Não consegui publicar ('+e.message+'). Baixei o index.html para você subir manualmente.'; status.className='up-err';
      downloadHTML(html,'index.html');
    }
  } else {
    downloadHTML(html,'index.html');
    status.textContent='index.html baixado. (Dica: clique em “Publicação automática” e configure o token para não precisar subir manualmente.)'; status.className='up-ok';
  }
  const blob=new Blob([html],{type:'text/html;charset=utf-8'});
  setTimeout(()=>{ window.location.href=URL.createObjectURL(blob); }, 1500);
}

/* ===== Relatório técnico (impressão) ===== */
function fillReport(){
  try{
    const T=DATA.totais, meses=DATA.meses;
    let mo=0,mat=0,co=0,tot=0;
    for(const r of T){ mo+=r.mao_de_obra||0; mat+=r.materiais||0; co+=r.custo_operacional||0; tot+=r.total||0; }
    const per = meses.length? (meses[0]+' a '+meses[meses.length-1]) : '';
    const hc=document.getElementById('hdrCount'); if(hc) hc.textContent=T.length+' medições · '+per;
    const rp=document.getElementById('repPeriodo'); if(rp) rp.textContent='Período coberto: '+per+'  ·  '+T.length+' medições  ·  Contrato 131/2024 — Solo Construções e Incorporações';
    const rg=document.getElementById('repGerado'); if(rg) rg.textContent='Gerado em '+new Date().toLocaleDateString('pt-BR');
    const cats=[['Mão de obra',mo,'#4f8dfd'],['Materiais e insumos',mat,'#33c17a'],['Custo operacional',co,'#f0b93b']].sort((a,b)=>b[1]-a[1]);
    document.getElementById('repKpis').innerHTML =
      `<div class="repkpi total"><div class="l">Custo direto total (acumulado)</div><div class="v">${fmtBRC(tot)}</div><div class="s">${T.length} medições</div></div>`+
      cats.map(c=>`<div class="repkpi" style="border-top-color:${c[2]}"><div class="l">${c[0]}</div><div class="v">${fmtBRC(c[1])}</div><div class="s">${fmtPct(tot?c[1]/tot:0)} do total</div></div>`).join('');
    const topCat=cats[0]; const abcMat=DATA.abc_acumulado||[]; const topItem=abcMat[0];
    document.getElementById('repGargalo').innerHTML =
      `A maior parcela do gasto está em <b>${topCat[0]}</b> (${fmtBRC(topCat[1])}, ${fmtPct(tot?topCat[1]/tot:0)} do custo direto acumulado). `+
      (topItem?`Entre materiais e insumos, o item de maior dispêndio é <b>${topItem.desc_norm}</b> (${fmtBRC(topItem.valor_total)}).`:'');
    new Chart(document.getElementById('repCatChart'),{type:'doughnut',data:{labels:cats.map(c=>c[0]),datasets:[{data:cats.map(c=>c[1]),backgroundColor:cats.map(c=>c[2])}]},options:{responsive:false,animation:false,plugins:{legend:{position:'bottom',labels:{color:'#20304d',font:{size:11}}},title:{display:true,text:'Distribuição do custo por categoria',color:'#20304d'}}}});
    new Chart(document.getElementById('repTrendChart'),{type:'bar',data:{labels:meses,datasets:[{label:'Custo direto (R$)',data:T.map(r=>r.total),backgroundColor:'#4f8dfd'}]},options:{responsive:false,animation:false,plugins:{legend:{display:false},title:{display:true,text:'Evolução do custo direto por medição',color:'#20304d'}},scales:{x:{ticks:{color:'#20304d',font:{size:9}}},y:{ticks:{color:'#20304d',callback:v=>'R$ '+(v/1000).toFixed(0)+'k'}}}}});
    document.getElementById('repTotaisTable').innerHTML='<thead><tr><th class="l">Medição</th><th>Mão de obra</th><th>Materiais</th><th>Custo op.</th><th>Total</th></tr></thead><tbody>'+
      T.map(r=>`<tr><td class="l">${r.mes_label||('nº'+r.medicao)}</td><td>${fmtBRC(r.mao_de_obra)}</td><td>${fmtBRC(r.materiais)}</td><td>${fmtBRC(r.custo_operacional)}</td><td><b>${fmtBRC(r.total)}</b></td></tr>`).join('')+
      `<tr class="rep-tot"><td class="l">Acumulado</td><td>${fmtBRC(mo)}</td><td>${fmtBRC(mat)}</td><td>${fmtBRC(co)}</td><td>${fmtBRC(tot)}</td></tr></tbody>`;
    const abcFromMap=(mapObj)=>{ const arr=Object.entries(mapObj).map(([desc,vals])=>({desc,valor:(vals||[]).reduce((a,b)=>a+(b||0),0)})).filter(x=>x.valor>0.005); arr.sort((a,b)=>b.valor-a.valor); const total=arr.reduce((s,x)=>s+x.valor,0); let cum=0; arr.forEach(x=>{ x.pct=total?x.valor/total:0; cum+=x.pct; x.cum=cum; }); return arr; };
    const moArr=abcFromMap(DATA.mao_de_obra.valor);
    const coArr=abcFromMap(DATA.custo_operacional.valor);
    const matArr=abcMat.map(x=>({desc:x.desc_norm,valor:x.valor_total,pct:x.pct,cum:x.cum_pct}));
    const renderAbc=(id,arr)=>{ const el=document.getElementById(id); if(!el)return; const totv=arr.reduce((s,x)=>s+x.valor,0); el.innerHTML='<thead><tr><th class="c">#</th><th class="l">Descrição</th><th>Valor total</th><th>% do total</th><th>% acumulado</th></tr></thead><tbody>'+arr.map((x,i)=>`<tr><td class="c">${i+1}</td><td class="l">${x.desc}</td><td>${fmtBRC(x.valor)}</td><td>${fmtPct(x.pct)}</td><td>${fmtPct(x.cum)}</td></tr>`).join('')+`<tr class="rep-tot"><td class="c"></td><td class="l">Total (${arr.length} itens)</td><td>${fmtBRC(totv)}</td><td>100,0%</td><td></td></tr></tbody>`; };
    renderAbc('repAbcMO',moArr); renderAbc('repAbcMat',matArr); renderAbc('repAbcCO',coArr);
  }catch(e){ console.error('relatório',e); }
}

document.addEventListener('DOMContentLoaded',()=>{ fillReport(); const inp=document.getElementById('pdfInput'); if(inp) inp.addEventListener('change',e=>handleUpload(e.target.files)); });
