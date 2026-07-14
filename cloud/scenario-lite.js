(() => {
  'use strict';
  const core = window.RadarCalculatorCore;
  if (!core) return;
  const PANEL_ID = 'radar-scenario-lite';
  const STYLE_ID = 'radar-scenario-lite-style';
  const CURRENT_KEYS = ['radar_current_case_id','radar_current_lead_id','radar_estrategico_current_case_id'];
  const txt = v => String(v ?? '');
  const num = core.number;
  const esc = v => txt(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const brl = v => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(num(v));
  const pct = v => `${new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2}).format(num(v))}%`;
  let lastLeadId = '';

  function dbContext(){
    const keys=[];
    if(window.RadarCloud?.dbKey) keys.push(window.RadarCloud.dbKey);
    for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k&&!keys.includes(k))keys.push(k)}
    for(const key of keys){
      try{const db=JSON.parse(localStorage.getItem(key)||'null');if(db&&Array.isArray(db.leads)&&db.settings)return{key,db}}catch(_){ }
    }
    return null;
  }
  function currentId(){
    for(const key of CURRENT_KEYS){const id=(localStorage.getItem(key)||'').replace(/^"|"$/g,'');if(id)return id}
    return '';
  }
  function pageIdentity(){
    const title=document.querySelector('.case-head h1, main h1')?.textContent?.trim()||'';
    const text=document.querySelector('.case-head p')?.textContent||document.body.innerText||'';
    const cnpj=(text.match(/\d{2}\.?\d{3}\.?\d{3}\/\d{4}-?\d{2}/)?.[0]||'').replace(/\D/g,'');
    return{title,cnpj};
  }
  function resolveLead(ctx){
    const id=currentId();
    if(id){const lead=ctx.db.leads.find(x=>txt(x.id)===id);if(lead)return lead}
    const {title,cnpj}=pageIdentity();
    if(cnpj){const lead=ctx.db.leads.find(x=>txt(x.cnpj).replace(/\D/g,'')===cnpj);if(lead)return lead}
    if(title&&!/^nova empresa$/i.test(title)){const lead=ctx.db.leads.find(x=>txt(x.companyName).trim()===title);if(lead)return lead}
    return null;
  }
  function ctx(){const c=dbContext();if(!c)return null;const lead=resolveLead(c);return lead?{...c,lead}:null}
  function settings(c){return c.db.settings?.pricing||{}}
  function favored(lead){return ['simples','mei','me_epp','pf'].includes(lead.taxRegime)||lead.profile==='me_epp'}
  function defaults(c,mode){const lead=c.lead,s=settings(c),onlyPrev=num(lead.pgfnPrev)>0&&num(lead.pgfnSimple)+num(lead.pgfnOther)===0;return core.modalityDefaults(mode,{settings:s,favored:favored(lead),onlyPrev,capag:lead.capag||'nao_sei'})}
  function sVal(c,key,fallback){const v=settings(c)[key];return txt(v).trim()!==''?v:fallback}
  function state(c,panel){
    const lead=c.lead, read=(name,fallback)=>panel?.querySelector(`[name="${name}"]`)?.value??fallback;
    const mode=read('pgfnMode',lead.pgfnModality||'parametrizada'), d=defaults(c,mode), stored=(k,f)=>txt(lead[k]).trim()!==''?lead[k]:f;
    return{
      rfbMode:read('rfbMode',lead.reparcelment||'nenhum'),
      rfbCustom:num(read('rfbCustom',stored('rfbCustomEntryRateOverride',0))),
      rfbTerm:Math.max(1,Math.round(num(read('rfbTerm',stored('rfbTermOverride',60))))),
      rfbMin:Math.max(0,num(read('rfbMin',stored('rfbMinInstallmentOverride',sVal(c,'rfbMinPJ',500))))),
      pgfnMode:mode,
      eligibility:read('eligibility',lead.pgfnEligibilityStatus||'nao_avaliado'),
      entryRate:core.clamp(read('entryRate',stored('pgfnEntryRateOverride',d.entryRate)),0,100),
      entryMonths:Math.max(1,Math.round(num(read('entryMonths',stored('pgfnEntryMonthsOverride',d.entryMonths))))),
      discount:core.clamp(read('discount',stored('pgfnDiscountOverride',d.discount)),0,70),
      totalTerm:Math.max(2,Math.round(num(read('totalTerm',stored('pgfnTermOverride',d.totalTerm))))),
      prevTerm:Math.max(2,Math.min(60,Math.round(num(read('prevTerm',stored('pgfnPrevTermOverride',d.prevTotalTerm)))))),
      minimum:Math.max(0,num(read('minimum',stored('pgfnMinInstallmentOverride',d.minimum)))),
      smallLimit:Math.max(0,num(read('smallLimit',stored('smallValueLimitOverride',d.smallValueLimit)))),
      note:read('note',lead.pgfnModalityNote||'')
    }
  }
  function calc(c,s){
    const rfb=core.calculateRfb({debt:num(c.lead.rfbDebt),mode:s.rfbMode,customEntryRate:s.rfbCustom,totalTerm:s.rfbTerm,minimum:s.rfbMin});
    const pgfn=core.calculatePgfn({simple:num(c.lead.pgfnSimple),prev:num(c.lead.pgfnPrev),other:num(c.lead.pgfnOther),mode:s.pgfnMode,entryRate:s.entryRate,entryMonths:s.entryMonths,discount:s.discount,totalTerm:s.totalTerm,prevTotalTerm:s.prevTerm,minimum:s.minimum,smallValueLimit:s.smallLimit});
    return{rfb,pgfn,warnings:core.validateScenario(rfb,pgfn)};
  }
  function modeLabel(m){return{parametrizada:'Transação parametrizada',tis:'TIS — Transação Individual Simplificada',pequeno_valor:'Transação de pequeno valor',manual:'Cenário manual'}[m]||'Transação parametrizada'}
  function rfbLabel(m,r){return m==='primeiro'?'Primeiro reparcelamento — 10%':m==='segundo_ou_mais'?'Segundo ou posterior — 20%':m==='personalizado'?`Entrada personalizada — ${pct(r)}`:'Parcelamento ordinário'}
  function metric(label,value,sub=''){return`<div class="rsl-metric"><span>${esc(label)}</span><strong>${value}</strong>${sub?`<small>${sub}</small>`:''}</div>`}
  function input(label,name,value,min=0,max=999999999,step=1){return`<label><span>${esc(label)}</span><input type="number" name="${name}" value="${esc(value)}" min="${min}" max="${max}" step="${step}"></label>`}
  function html(c,s,o){
    const lead=c.lead, hasPrev=num(lead.pgfnPrev)>0;
    const rows=[['Simples',o.pgfn.simple],['Previdenciário',o.pgfn.prev],['Demais',o.pgfn.other]].filter(([,x])=>x.debt>0);
    return`<div class="rsl-head"><div><small>SIMULADOR DE REGULARIZAÇÃO</small><h2>Receita e PGFN em cenários separados</h2><p>Ajuste as premissas do caso sem sair da análise.</p></div><b>${esc(txt(lead.companyName)||'Empresa')}</b></div>
    <div class="rsl-grid">
      <section class="rsl-card"><header><div><h3>Receita Federal</h3><small>${brl(o.rfb.debt)}</small></div></header>
        <div class="rsl-fields"><label class="wide"><span>Modalidade</span><select name="rfbMode"><option value="nenhum" ${s.rfbMode==='nenhum'?'selected':''}>Parcelamento ordinário</option><option value="primeiro" ${s.rfbMode==='primeiro'?'selected':''}>Primeiro reparcelamento — 10%</option><option value="segundo_ou_mais" ${s.rfbMode==='segundo_ou_mais'?'selected':''}>Segundo ou posterior — 20%</option><option value="personalizado" ${s.rfbMode==='personalizado'?'selected':''}>Entrada personalizada</option></select></label>${s.rfbMode==='personalizado'?input('Entrada personalizada (%)','rfbCustom',s.rfbCustom,0,100,.1):''}${input('Prazo total','rfbTerm',s.rfbTerm,1,120,1)}${input('Parcela mínima','rfbMin',s.rfbMin,0,999999999,.01)}</div>
        <div class="rsl-output">${metric('Regra',rfbLabel(s.rfbMode,o.rfb.entryRate))}${metric('Entrada',brl(o.rfb.entry),pct(o.rfb.entryRate))}${metric('Saldo',brl(o.rfb.balance))}${metric('Parcelamento',`${o.rfb.months}x de ${brl(o.rfb.installment)}`)}</div>
      </section>
      <section class="rsl-card"><header><div><h3>PGFN</h3><small>${brl(o.pgfn.debt)}</small></div></header>
        <div class="rsl-fields"><label class="wide"><span>Modalidade</span><select name="pgfnMode"><option value="parametrizada" ${s.pgfnMode==='parametrizada'?'selected':''}>Transação parametrizada</option><option value="tis" ${s.pgfnMode==='tis'?'selected':''}>TIS</option><option value="pequeno_valor" ${s.pgfnMode==='pequeno_valor'?'selected':''}>Pequeno valor</option><option value="manual" ${s.pgfnMode==='manual'?'selected':''}>Cenário manual</option></select></label><label><span>Elegibilidade</span><select name="eligibility"><option value="nao_avaliado" ${s.eligibility==='nao_avaliado'?'selected':''}>Não avaliada</option><option value="possivel" ${s.eligibility==='possivel'?'selected':''}>Possível</option><option value="elegivel" ${s.eligibility==='elegivel'?'selected':''}>Elegível após validação</option><option value="nao_elegivel" ${s.eligibility==='nao_elegivel'?'selected':''}>Não enquadrada</option></select></label>${input('Entrada (%)','entryRate',s.entryRate,0,30,.1)}${input('Parcelas da entrada','entryMonths',s.entryMonths,1,24,1)}${input('Redução estimada (%)','discount',s.discount,0,70,.1)}${input('Prazo total','totalTerm',s.totalTerm,2,180,1)}${hasPrev?input('Prazo previdenciário','prevTerm',s.prevTerm,2,60,1):''}${input('Parcela mínima','minimum',s.minimum,0,999999999,.01)}${s.pgfnMode==='pequeno_valor'?input('Referência de pequeno valor','smallLimit',s.smallLimit,0,999999999,.01):''}<label class="wide"><span>Observação</span><textarea name="note" rows="2">${esc(s.note)}</textarea></label></div>
        <div class="rsl-output">${metric('Modalidade',modeLabel(s.pgfnMode))}${metric('Fase 1 — entrada',`${s.entryMonths}x de ${brl(o.pgfn.entryInstallment)}`,`Total ${brl(o.pgfn.entry)}`)}${metric('Fase 2 — saldo',`${o.pgfn.balanceMonths}x de ${brl(o.pgfn.phaseTwoInstallment)}`,`Saldo ${brl(o.pgfn.balance)}`)}${metric('Redução',brl(o.pgfn.reduction),pct(s.discount))}</div>
        ${rows.length?`<div class="rsl-table"><strong>Separação por natureza</strong><table><thead><tr><th>Natureza</th><th>Valor</th><th>Entrada</th><th>Saldo / parcela</th></tr></thead><tbody>${rows.map(([n,x])=>`<tr><td>${n}</td><td>${brl(x.debt)}</td><td>${brl(x.entry)}</td><td>${x.months}x de ${brl(x.installment)}</td></tr>`).join('')}</tbody></table></div>`:''}
      </section>
    </div>
    ${(o.warnings.length||lead.impediment)?`<div class="rsl-warn"><strong>Pontos de validação</strong><ul>${lead.impediment?'<li>Impedimento informado: mantenha cenário alternativo.</li>':''}${o.warnings.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`:''}
    <div class="rsl-actions"><span data-status>Revise as premissas e aplique para salvar no caso.</span><button type="button" data-apply>Aplicar e recalcular</button></div>`;
  }
  function injectStyle(){if(document.getElementById(STYLE_ID))return;const s=document.createElement('style');s.id=STYLE_ID;s.textContent=`#${PANEL_ID}{background:#fff;border:1px solid #bfd8e7;border-radius:18px;padding:22px;margin:0 0 16px;box-shadow:0 6px 22px rgba(13,50,78,.05)}#${PANEL_ID} *{box-sizing:border-box}#${PANEL_ID} .rsl-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:18px}#${PANEL_ID} .rsl-head small{font-size:10px;font-weight:800;letter-spacing:.12em;color:#0578b4}#${PANEL_ID} h2{margin:4px 0 5px;color:#082946;font-size:23px}#${PANEL_ID} p{margin:0;color:#627a8c;font-size:12px}#${PANEL_ID} .rsl-head>b{font-size:11px;background:#edf6fb;color:#0b5d88;padding:8px 10px;border-radius:999px}#${PANEL_ID} .rsl-grid{display:grid;grid-template-columns:1fr 1fr;gap:15px}#${PANEL_ID} .rsl-card{border:1px solid #d6e5ee;border-radius:15px;padding:17px;min-width:0}#${PANEL_ID} .rsl-card header{display:flex;justify-content:space-between;margin-bottom:13px}#${PANEL_ID} h3{margin:0;color:#0a2e4a;font-size:18px}#${PANEL_ID} .rsl-card header small{display:block;margin-top:4px;color:#0b5d88;font-weight:800}#${PANEL_ID} .rsl-fields{display:grid;grid-template-columns:1fr 1fr;gap:10px}#${PANEL_ID} label{display:grid;gap:5px}#${PANEL_ID} label.wide{grid-column:1/-1}#${PANEL_ID} label>span{font-size:9px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#395b71}#${PANEL_ID} input,#${PANEL_ID} select,#${PANEL_ID} textarea{width:100%;border:1px solid #ccdae4;border-radius:9px;padding:10px;font:inherit;color:#0b2d49;background:#fff}#${PANEL_ID} .rsl-output{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:13px}#${PANEL_ID} .rsl-metric{background:#f2f7fa;border-radius:10px;padding:10px;min-width:0}#${PANEL_ID} .rsl-metric span{display:block;font-size:9px;font-weight:800;text-transform:uppercase;color:#6a8192}#${PANEL_ID} .rsl-metric strong{display:block;margin-top:4px;color:#0a4267;font-size:14px;word-break:break-word}#${PANEL_ID} .rsl-metric small{display:block;margin-top:3px;color:#6a8192;font-size:9px}#${PANEL_ID} .rsl-table{margin-top:13px;border:1px solid #dfeaf0;border-radius:10px;overflow:auto}#${PANEL_ID} .rsl-table>strong{display:block;padding:9px 10px;background:#f6f9fb;font-size:10px;color:#36596f}#${PANEL_ID} table{width:100%;border-collapse:collapse;font-size:9px}#${PANEL_ID} th,#${PANEL_ID} td{padding:8px;border-top:1px solid #e6eef3;text-align:left;white-space:nowrap}#${PANEL_ID} .rsl-warn{margin-top:13px;padding:11px 13px;border-radius:11px;background:#fff7df;color:#705700;font-size:10px}#${PANEL_ID} .rsl-warn ul{margin:6px 0 0;padding-left:16px}#${PANEL_ID} .rsl-actions{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:16px;padding-top:14px;border-top:1px solid #dfebf1;font-size:11px;color:#5d7485}#${PANEL_ID} button{border:0;border-radius:10px;background:#0879b5;color:#fff;padding:11px 15px;font-weight:800;cursor:pointer}@media(max-width:900px){#${PANEL_ID} .rsl-grid{grid-template-columns:1fr}}@media(max-width:600px){#${PANEL_ID}{padding:15px}#${PANEL_ID} .rsl-fields,#${PANEL_ID} .rsl-output{grid-template-columns:1fr}#${PANEL_ID} label.wide{grid-column:auto}#${PANEL_ID} .rsl-head{display:block}#${PANEL_ID} .rsl-head>b{display:inline-block;margin-top:10px}}`;document.head.appendChild(s)}
  function findAnchor(){return document.querySelector('section.radar-payment-flow')||[...document.querySelectorAll('summary')].find(x=>/Ajustar premissas avançadas|Parâmetros técnicos adicionais/i.test(x.textContent||''))?.closest('section')||null}
  function onScenarioScreen(){return Boolean(findAnchor())||[...document.querySelectorAll('button,a')].some(x=>x.textContent?.trim()==='Cenários'&&x.classList.contains('active'))}
  function render(panel,c,s){const o=calc(c,s);panel.innerHTML=html(c,s,o);bind(panel,c)}
  function bind(panel,c){
    panel.querySelectorAll('select,input,textarea').forEach(el=>el.addEventListener('change',()=>render(panel,c,state(c,panel))));
    panel.querySelector('[data-apply]')?.addEventListener('click',()=>{const s=state(c,panel),o=calc(c,s),t=new Date().toISOString();Object.assign(c.lead,{reparcelment:s.rfbMode,rfbCustomEntryRateOverride:txt(s.rfbCustom),rfbTermOverride:txt(s.rfbTerm),rfbMinInstallmentOverride:txt(s.rfbMin),pgfnModality:s.pgfnMode,pgfnEligibilityStatus:s.eligibility,pgfnEntryRateOverride:txt(s.entryRate),pgfnEntryMonthsOverride:txt(s.entryMonths),pgfnDiscountOverride:txt(s.discount),pgfnTermOverride:txt(s.totalTerm),pgfnPrevTermOverride:txt(s.prevTerm),pgfnMinInstallmentOverride:txt(s.minimum),smallValueLimitOverride:txt(s.smallLimit),pgfnModalityNote:s.note,lastSimulation:{title:`${modeLabel(s.pgfnMode)} — ${new Date().toLocaleDateString('pt-BR')}`,summary:`Receita: entrada ${brl(o.rfb.entry)} e ${o.rfb.months}x de ${brl(o.rfb.installment)}. PGFN: entrada ${s.entryMonths}x de ${brl(o.pgfn.entryInstallment)} e saldo ${o.pgfn.balanceMonths}x de ${brl(o.pgfn.phaseTwoInstallment)}.`},updatedAt:t,lastMovementAt:t});localStorage.setItem(c.key,JSON.stringify(c.db));panel.querySelector('[data-status]').textContent='Cenário salvo. A sincronização com o Supabase ocorrerá automaticamente.';window.dispatchEvent(new CustomEvent('radar:cloud-synced',{detail:{leadId:c.lead.id}}))})
  }
  function mount(){
    if(!onScenarioScreen())return;
    const c=ctx(), anchor=findAnchor(); if(!c||!anchor)return;
    injectStyle(); let panel=document.getElementById(PANEL_ID); if(!panel){panel=document.createElement('section');panel.id=PANEL_ID;anchor.parentElement.insertBefore(panel,anchor)}
    if(lastLeadId!==txt(c.lead.id)||!panel.innerHTML){lastLeadId=txt(c.lead.id);render(panel,c,state(c,panel))}
    const old=document.querySelector('section.radar-payment-flow'); if(old) old.hidden=true;
  }
  document.addEventListener('click',e=>{const el=e.target.closest('button,a');if(el&&el.textContent?.trim()==='Cenários'){setTimeout(mount,80);setTimeout(mount,260)}},true);
  window.addEventListener('radar:cloud-synced',()=>setTimeout(mount,80));
  window.addEventListener('load',()=>{setTimeout(mount,900);setTimeout(mount,1800)});
  setTimeout(mount,1200);
  window.RadarScenarioLite={mount,getContext:ctx};
})();