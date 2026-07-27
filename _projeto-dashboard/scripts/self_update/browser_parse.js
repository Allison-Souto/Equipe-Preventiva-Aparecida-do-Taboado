function cleanNum(s){ if(s==null)return null; s=String(s).replace(/\s+/g,'').replace('R$',''); if(s===''||s==='--')return null; if(s==='-')return 0.0; s=s.replace(/\./g,'').replace(',','.'); const f=parseFloat(s); return Number.isNaN(f)?null:f; }
const isCode=t=>/^\d+(\.\d+)+$/.test(t);
const NUMNAMES=['qtd_contrato','qtd_periodo','qtd_saldo','preco_unitario','valor_contrato','valor_periodo','valor_saldo'];
function mul(m,n){return [m[0]*n[0]+m[2]*n[1],m[1]*n[0]+m[3]*n[1],m[0]*n[2]+m[2]*n[3],m[1]*n[2]+m[3]*n[3],m[0]*n[4]+m[2]*n[5]+m[4],m[1]*n[4]+m[3]*n[5]+m[5]];}
function ap(m,x,y){return [m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];}
async function fullDividers(page){
  const ol=await page.getOperatorList(); const OPS=pdfjsLib.OPS; let ctm=[1,0,0,1,0,0]; const st=[]; const H=[];
  const add=(y,xlo,xhi)=>{ if(xlo<40&&xhi>720) H.push(Math.round(y)); };
  for(let i=0;i<ol.fnArray.length;i++){ const fn=ol.fnArray[i],a=ol.argsArray[i];
    if(fn===OPS.save)st.push(ctm.slice()); else if(fn===OPS.restore)ctm=st.pop()||ctm; else if(fn===OPS.transform)ctm=mul(ctm,a);
    else if(fn===OPS.constructPath){ const ops=a[0],args=a[1]; let j=0,cx=0,cy=0;
      for(const op of ops){ if(op===OPS.moveTo){cx=args[j++];cy=args[j++];}
        else if(op===OPS.lineTo){ const nx=args[j++],ny=args[j++]; const[X1,Y1]=ap(ctm,cx,cy),[X2,Y2]=ap(ctm,nx,ny); if(Math.abs(Y1-Y2)<0.6) add((Y1+Y2)/2,Math.min(X1,X2),Math.max(X1,X2)); cx=nx;cy=ny; }
        else if(op===OPS.rectangle){ const x=args[j++],y=args[j++],w=args[j++],h=args[j++]; const[X1,Y1]=ap(ctm,x,y),[X2,Y2]=ap(ctm,x+w,y+h); add(Y1,Math.min(X1,X2),Math.max(X1,X2)); add(Y2,Math.min(X1,X2),Math.max(X1,X2)); cx=x;cy=y; } } } }
  const u=[...new Set(H)].sort((a,b)=>b-a); const o=[]; for(const y of u){ if(!o.length||Math.abs(o[o.length-1]-y)>2)o.push(y); } return o;
}
function clusterCenters(vals,gap){ vals=vals.slice().sort((a,b)=>a-b); const cl=[]; let cur=[vals[0]]; for(let i=1;i<vals.length;i++){ if(vals[i]-vals[i-1]>gap){cl.push(cur);cur=[vals[i]];}else cur.push(vals[i]); } cl.push(cur); return cl.map(c=>({mid:c.reduce((a,b)=>a+b,0)/c.length,n:c.length})); }
async function parsePdf(buf){
  const doc=await pdfjsLib.getDocument({data:new Uint8Array(buf),useSystemFonts:true}).promise;
  let meta={medicao:null,data:null,periodo:null,contratada:null,contrato_no:null}, fullText='';
  const pageData=[];
  for(let p=1;p<=doc.numPages;p++){
    const page=await doc.getPage(p); const tc=await page.getTextContent();
    if(p===1) fullText=tc.items.map(i=>i.str).join(' ');
    const HL=await fullDividers(page);
    const sx=page.getViewport({scale:1}); // not used
    const items=tc.items.filter(i=>i.str.trim()).map(i=>({x:i.transform[4],y:i.transform[5],w:i.width,str:i.str}));
    const band=y=>{ for(let k=0;k<HL.length-1;k++){ if(y<=HL[k]+0.5&&y>HL[k+1]-0.5)return k; } return -1; };
    const bands={}; for(const it of items){ const b=band(it.y); if(b<0)continue; (bands[b]||=[]).push(it); }
    pageData.push(bands);
  }
  // calibrate 7 numeric columns by RIGHT edge of tokens in the numeric zone (x>310) of data rows
  const rights=[];
  for(const bands of pageData) for(const b in bands){ const its=bands[b]; const lead=its.find(i=>i.x<45); if(!(lead&&isCode(lead.str.trim())))continue; for(const it of its){ if(it.x>315){ rights.push(it.x+it.w); } } }
  let cc=clusterCenters(rights,16).filter(c=>c.n>=2);
  if(cc.length>7) cc=cc.slice(cc.length-7);
  const numRight=cc.map(c=>c.mid);
  const names=NUMNAMES.slice(NUMNAMES.length-numRight.length);
  const firstNumLeftApprox = numRight.length? numRight[0]-70 : 315; // left boundary of first numeric col
  function assignNum0(rx){ let bi=-1,bd=1e9; for(let i=0;i<numRight.length;i++){ const d=Math.abs(rx-numRight[i]); if(d<bd){bd=d;bi=i;} } return bd<22?bi:-1; }
  // calibrate unidade column x from LABOR rows (section 1): rightmost non-numeric token
  const uCal=[];
  for(const bands of pageData) for(const b in bands){ const its=bands[b]; const lead=its.find(i=>i.x<45); if(!(lead&&/^1\.\d+\.\d+$/.test(lead.str.trim())))continue; const nonNum=its.filter(it=>it.x>=45 && it.x<numRight[numRight.length-1] && assignNum0(it.x+it.w)<0); if(nonNum.length){ uCal.push(Math.max(...nonNum.map(i=>i.x))); } }
  uCal.sort((a,b)=>a-b); const unidadeX = uCal.length? uCal[Math.floor(uCal.length/2)] : (firstNumLeftApprox-30);
  function assignNum(rx){ let bi=-1,bd=1e9; for(let i=0;i<numRight.length;i++){ const d=Math.abs(rx-numRight[i]); if(d<bd){bd=d;bi=i;} } return bd<22?names[bi]:null; }
  const rows=[]; let section=null;
  for(const bands of pageData){
    for(const b of Object.keys(bands).map(Number).sort((a,b)=>a-b)){
      const its=bands[b].sort((a,b)=> b.y-a.y || a.x-b.x);
      const lead=its.find(i=>i.x<45); const code=lead&&isCode(lead.str.trim())?lead.str.trim():null;
      const cells={}; let hasNum=false; const used=new Set();
      for(const it of its){ if(it.x<45){used.add(it);continue;} const rx=it.x+it.w; const c=assignNum(rx); if(c && it.x> firstNumLeftApprox-40){ cells[c]=(cells[c]?cells[c]+it.str:it.str); hasNum=true; used.add(it);} }
      // special total rows (SUB-TOTAL, CUSTO DIRETO DA OBRA, ESTA MEDICAO)
      const lineTxt = its.map(i=>i.str).join(' ').toUpperCase();
      if(/SUB-?TOTAL/.test(lineTxt) || /CUSTO DIRETO DA OBRA/.test(lineTxt) || /ESTA MEDI/.test(lineTxt)){
        const nc={}; for(const it of its){ if(it.x<45) continue; const bi=assignNum0(it.x+it.w); if(bi>=0 && it.x>firstNumLeftApprox-40){ const nm=names[bi]; nc[nm]=(nc[nm]?nc[nm]+it.str:it.str); } }
        if(/SUB-?TOTAL/.test(lineTxt) && section){ meta[section+'_subtotal_periodo']=cleanNum(nc.valor_periodo); meta[section+'_subtotal_contrato']=cleanNum(nc.valor_contrato); }
        else if(/CUSTO DIRETO DA OBRA/.test(lineTxt)){ meta.custo_direto_obra_contrato=cleanNum(nc.valor_contrato); meta.custo_direto_obra_periodo=cleanNum(nc.valor_periodo); }
        else if(/ESTA MEDI/.test(lineTxt)){ let v=null; for(const it of its){ if(/R\$/.test(it.str)||/^[\d.]+,\d/.test(it.str.trim())){ const cn=cleanNum(it.str); if(cn) v=cn; } } if(v) meta.esta_medicao=v; }
        continue;
      }
      if(!(code&&hasNum)){ continue; }
      // unidade = non-numeric token nearest unidadeX; description = tokens left of unidade column
      const leftTokens=its.filter(it=>!used.has(it) && it.x>=45);
      let unidade=null, uTok=null, bud=1e9;
      for(const it of leftTokens){ const d=Math.abs(it.x-unidadeX); if(d<bud && d<16){bud=d;uTok=it;} }
      if(uTok){ unidade=uTok.str.trim(); }
      const descToks=leftTokens.filter(it=> it!==uTok && it.x < unidadeX-8);
      const top=code.split('.')[0]; if(top==='1')section='MAO_DE_OBRA';else if(top==='2')section='MATERIAIS';else if(top==='3')section='CUSTO_OPERACIONAL';
      const desc=descToks.sort((a,b)=> b.y-a.y || a.x-b.x).map(i=>i.str).join(' ').replace(/\s+/g,' ').trim();
      const c=cells;
      rows.push({medicao:null,data_medicao:null,periodo:null,contratada:null,contrato_no:null,section,subsection:null,item:code,descricao:desc,unidade:unidade,
        qtd_contrato:cleanNum(c.qtd_contrato),qtd_periodo:cleanNum(c.qtd_periodo),qtd_saldo:cleanNum(c.qtd_saldo),
        preco_unitario:cleanNum(c.preco_unitario),valor_contrato:cleanNum(c.valor_contrato),valor_periodo:cleanNum(c.valor_periodo),valor_saldo:cleanNum(c.valor_saldo)});
    }
  }
  // meta by position on page 1
  {
    const p1=await doc.getPage(1); const tc1=await p1.getTextContent();
    const its=tc1.items.filter(i=>i.str.trim()).map(i=>({x:i.transform[4],y:i.transform[5],str:i.str}));
    const byY=[]; for(const it of its){ let ln=byY.find(l=>Math.abs(l.y-it.y)<3.5); if(!ln){ln={y:it.y,its:[]};byY.push(ln);} ln.its.push(it); }
    for(const ln of byY) ln.its.sort((a,b)=>a.x-b.x);
    const lineText=ln=>ln.its.map(i=>i.str).join(' ');
    const rightOf=(ln,label)=>{ const li=ln.its.findIndex(i=>i.str.toUpperCase().includes(label)); if(li<0)return ''; const lx=ln.its[li].x; return ln.its.filter(i=>i.x>lx+5).map(i=>i.str).join(' ').trim(); };
    let mm;
    const allTxt=byY.map(lineText).join(' \n ');
    if(mm=allTxt.match(/MEDIÇÃO Nº\s*(\d+)/i)) meta.medicao=parseInt(mm[1],10);
    for(const ln of byY){ const t=lineText(ln).toUpperCase();
      if(meta.data==null && t.includes('DATA:')){ const v=rightOf(ln,'DATA:'); const dm=v.match(/(\d{2}\/\d{2}\/\d{4})/); if(dm)meta.data=dm[1]; }
      if(meta.periodo==null && t.includes('PERÍODO:')){ const v=rightOf(ln,'PERÍODO:'); const dm=v.match(/(\d{2}\/\d{2}\/\d{4}).*?(\d{2}\/\d{2}\/\d{4})/); if(dm)meta.periodo=`${dm[1]} A ${dm[2]}`; }
      if(meta.contratada==null && t.includes('CONTRATADA:')){ const v=rightOf(ln,'CONTRATADA:'); if(v)meta.contratada=v.replace(/\s+/g,' ').trim(); }
    }
    if(mm=allTxt.match(/(\d{2,4}\/20\d{2})/)) meta.contrato_no=mm[1];
  }
  for(const r of rows){r.medicao=meta.medicao;r.data_medicao=meta.data;r.periodo=meta.periodo;r.contratada=meta.contratada;r.contrato_no=meta.contrato_no;}
  return {meta,rows,_num:numRight.map(Math.round)};
}
