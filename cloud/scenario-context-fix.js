(() => {
  'use strict';
  const KEYS=['radar_current_case_id','radar_current_lead_id','radar_estrategico_current_case_id'];
  const n=v=>{const s=String(v??'').trim();if(!s)return 0;const x=s.includes(',')?s.replace(/\./g,'').replace(',','.').replace(/[^0-9.-]/g,''):s.replace(/[^0-9.-]/g,'');const r=Number(x);return Number.isFinite(r)?r:0};
  const same=(a,b)=>Math.abs(n(a)-n(b))<.05;
  let running=false;

  function db(){
    const keys=[];if(window.RadarCloud?.dbKey)keys.push(window.RadarCloud.dbKey);
    for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k&&!keys.includes(k))keys.push(k)}
    for(const key of keys){try{const data=JSON.parse(localStorage.getItem(key)||'null');if(data&&Array.isArray(data.leads)&&data.settings)return data}catch(_){}}
    return null;
  }

  function pgfnVisible(){
    const box=document.querySelector('section.radar-payment-flow');if(!box)return 0;
    const m=(box.innerText||'').match(/Total:\s*R\$\s*([\d.]+(?:,\d{1,2})?)\s*[·-]\s*([\d.,]+)%/i);
    if(!m)return 0;const entry=n(m[1]),rate=n(m[2]);return entry>0&&rate>0?entry/(rate/100):0;
  }

  function current(data){
    for(const key of KEYS){const id=(localStorage.getItem(key)||'').replace(/^"|"$/g,'');const lead=data.leads.find(x=>String(x.id)===id);if(lead)return lead}
    const title=document.querySelector('.case-head h1,main h1')?.textContent?.trim()||'';
    if(title&&!/^nova empresa$/i.test(title)){const lead=data.leads.find(x=>String(x.companyName||'').trim()===title);if(lead)return lead}
    const total=pgfnVisible();
    const hits=data.leads.filter(x=>same(n(x.pgfnSimple)+n(x.pgfnPrev)+n(x.pgfnOther),total));
    if(hits.length)return hits.sort((a,b)=>(Date.parse(b.updatedAt||b.lastMovementAt||0)||0)-(Date.parse(a.updatedAt||a.lastMovementAt||0)||0))[0];
    const unnamed=data.leads.filter(x=>!String(x.companyName||'').trim()||/^nova empresa$/i.test(String(x.companyName||'').trim()));
    return unnamed.length===1?unnamed[0]:null;
  }

  function run(){
    if(running)return;running=true;
    try{
      const final=document.getElementById('radar-calculator-workbench');
      if(final){const old=document.querySelector('section.radar-payment-flow');if(old)old.hidden=true;return}
      if(!document.querySelector('section.radar-payment-flow')&&!document.body.innerText.includes('Parâmetros técnicos adicionais'))return;
      const data=db();if(!data)return;const lead=current(data);if(!lead?.id)return;
      KEYS.forEach(k=>localStorage.setItem(k,String(lead.id)));
      window.dispatchEvent(new CustomEvent('radar:cloud-synced',{detail:{leadId:lead.id}}));
    }finally{running=false}
  }

  new MutationObserver(run).observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('click',()=>setTimeout(run,80),true);
  window.addEventListener('load',run);
  setInterval(run,700);
  run();
})();
