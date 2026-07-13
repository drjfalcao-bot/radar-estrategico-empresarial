(() => {
  const DB_KEY = 'radar_estrategico_v2';
  const OPEN_AFTER_RELOAD = 'radar_open_lead_after_reload';
  const STAGES = [
    ['novo', 'Novo'],
    ['reuniao_agendada', 'Reunião agendada'],
    ['reuniao_realizada', 'Reunião realizada'],
    ['proposta_elaboracao', 'Proposta em elaboração'],
    ['proposta_enviada', 'Proposta enviada'],
    ['aguardando_assinatura', 'Aguardando assinatura'],
    ['fechado', 'Fechado'],
    ['perdido', 'Perdido']
  ];
  const STAGE_LABEL = Object.fromEntries(STAGES);
  const INTEREST_LABEL = { desconhecido:'Não classificado', baixo:'Baixo', medio:'Médio', alto:'Alto' };
  const MEETING_LABEL = { nao_realizada:'Não realizada', excelente:'Excelente', boa:'Boa', neutra:'Neutra', ruim:'Ruim', nao_compareceu:'Não compareceu' };
  const SIGNATURE_LABEL = { nao_aplicavel:'Não aplicável', minuta:'Minuta em preparação', enviada:'Enviada para assinatura', ajustes:'Em ajustes', assinada:'Assinada' };
  const pipelineState = { view:'board', search:'', stage:'todos', sort:'score', editingId:null };
  let pipelineOpen = false;

  const esc = (v='') => String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const today = () => new Date().toISOString().slice(0,10);
  const uid = () => `r${Date.now().toString(36)}${Math.random().toString(36).slice(2,7)}`;
  const clamp = n => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
  const dateValue = value => value ? new Date(`${value}T12:00:00`) : null;
  const daysSince = value => {
    const d = dateValue(value);
    if (!d) return 0;
    const now = dateValue(today());
    return Math.max(0, Math.floor((now - d) / 86400000));
  };
  const daysUntil = value => {
    const d = dateValue(value);
    if (!d) return null;
    const now = dateValue(today());
    return Math.ceil((d - now) / 86400000);
  };
  const fmtDate = value => value ? dateValue(value).toLocaleDateString('pt-BR') : '—';
  const fmtBRL = n => Number(n || 0).toLocaleString('pt-BR', { style:'currency', currency:'BRL', maximumFractionDigits:2 });

  function loadDB(){
    try {
      const data = JSON.parse(localStorage.getItem(DB_KEY) || '{"leads":[]}');
      if (!Array.isArray(data.leads)) data.leads = [];
      return data;
    } catch {
      return { leads:[] };
    }
  }
  function saveDB(data){ localStorage.setItem(DB_KEY, JSON.stringify(data)); }

  function commercialDefaults(lead){
    return {
      commercialStage: lead.commercialStage || stageFromLegacy(lead.status),
      interestLevel: lead.interestLevel || 'desconhecido',
      meetingDate: lead.meetingDate || '',
      meetingOutcome: lead.meetingOutcome || 'nao_realizada',
      meetingNotes: lead.meetingNotes || '',
      proposalPresented: Boolean(lead.proposalPresented),
      proposalSent: Boolean(lead.proposalSent),
      proposalSentAt: lead.proposalSentAt || '',
      signatureStatus: lead.signatureStatus || 'nao_aplicavel',
      offeredSolution: lead.offeredSolution || '',
      nextAction: lead.nextAction || '',
      nextActionDate: lead.nextActionDate || '',
      decisionDate: lead.decisionDate || '',
      lastMovementAt: lead.lastMovementAt || lead.updatedAt || lead.createdAt || today(),
      lostReason: lead.lostReason || '',
      commercialNotes: lead.commercialNotes || '',
      probabilityOverride: lead.probabilityOverride ?? '',
      commercialHistory: Array.isArray(lead.commercialHistory) ? lead.commercialHistory : []
    };
  }

  function stageFromLegacy(status){
    return ({
      em_analise:'novo', leitura_pronta:'reuniao_realizada', estrategia_apresentada:'reuniao_realizada',
      interesse_confirmado:'proposta_elaboracao', proposta_emitida:'proposta_enviada', concluido:'fechado'
    })[status] || 'novo';
  }

  function migrate(){
    const db = loadDB();
    let changed = false;
    db.leads.forEach(lead => {
      const defs = commercialDefaults(lead);
      Object.entries(defs).forEach(([key,value]) => {
        if (lead[key] === undefined) { lead[key] = value; changed = true; }
      });
      if (lead.successRate !== undefined) { delete lead.successRate; changed = true; }
    });
    if (changed) saveDB(db);
    return db;
  }

  function chanceScore(lead){
    if (lead.commercialStage === 'fechado') return 100;
    if (lead.commercialStage === 'perdido') return 0;
    const override = String(lead.probabilityOverride ?? '').trim();
    if (override !== '') return clamp(override);
    let score = ({
      novo:14, reuniao_agendada:28, reuniao_realizada:44, proposta_elaboracao:56,
      proposta_enviada:69, aguardando_assinatura:84
    })[lead.commercialStage] ?? 14;
    score += ({alto:12, medio:5, baixo:-8, desconhecido:0})[lead.interestLevel] || 0;
    score += ({excelente:12, boa:7, neutra:0, ruim:-12, nao_compareceu:-18, nao_realizada:0})[lead.meetingOutcome] || 0;
    score += ({confirmada:8, possivel:4, sem_urgencia:0})[lead.urgency] || 0;
    if (lead.proposalPresented) score += 3;
    if (lead.proposalSent) score += 5;
    if (lead.signatureStatus === 'enviada') score += 4;
    if (lead.signatureStatus === 'ajustes') score += 2;
    if (lead.offeredSolution?.trim()) score += 3;
    const decision = daysUntil(lead.decisionDate);
    if (decision !== null && decision >= 0 && decision <= 7) score += 6;
    if (decision !== null && decision < 0) score -= 5;
    const next = daysUntil(lead.nextActionDate);
    if (next !== null && next >= 0 && next <= 3) score += 3;
    if (next !== null && next < 0) score -= 6;
    const inactive = daysSince(lead.lastMovementAt);
    if (inactive > 21) score -= 20;
    else if (inactive > 14) score -= 14;
    else if (inactive > 7) score -= 8;
    else if (inactive > 3) score -= 3;
    return clamp(score);
  }

  function scoreClass(score){ return score >= 70 ? 'hot' : score < 35 ? 'cold' : ''; }
  function temperature(score){ return score >= 75 ? 'Quente' : score >= 55 ? 'Em evolução' : score >= 35 ? 'Morna' : 'Fria'; }
  function inactivityClass(days){ return days > 14 ? 'danger' : days > 7 ? 'warn' : ''; }

  function filteredLeads(){
    const db = migrate();
    const term = pipelineState.search.trim().toLowerCase();
    let leads = db.leads.filter(lead => {
      const matchesSearch = !term || [lead.companyName, lead.tradeName, lead.cnpj, lead.contactName, lead.offeredSolution]
        .some(v => String(v || '').toLowerCase().includes(term));
      const matchesStage = pipelineState.stage === 'todos' || lead.commercialStage === pipelineState.stage;
      return matchesSearch && matchesStage;
    });
    if (pipelineState.sort === 'score') leads.sort((a,b) => chanceScore(b) - chanceScore(a));
    if (pipelineState.sort === 'inactive') leads.sort((a,b) => daysSince(b.lastMovementAt) - daysSince(a.lastMovementAt));
    if (pipelineState.sort === 'movement') leads.sort((a,b) => String(b.lastMovementAt).localeCompare(String(a.lastMovementAt)));
    if (pipelineState.sort === 'decision') leads.sort((a,b) => String(a.decisionDate || '9999').localeCompare(String(b.decisionDate || '9999')));
    return leads;
  }

  function metrics(leads){
    const open = leads.filter(l => !['fechado','perdido'].includes(l.commercialStage));
    return {
      total: open.length,
      hot: open.filter(l => chanceScore(l) >= 70).length,
      proposals: open.filter(l => ['proposta_enviada','aguardando_assinatura'].includes(l.commercialStage)).length,
      stale: open.filter(l => daysSince(l.lastMovementAt) > 7).length,
      won: leads.filter(l => l.commercialStage === 'fechado').length
    };
  }

  function openPipeline(){ pipelineOpen = true; migrate(); renderPipeline(); }
  function closePipeline(){ pipelineOpen = false; location.reload(); }

  function pipelineHeader(){
    return `<header class="pipeline-topbar"><div class="pipeline-brand"><div class="mark">RE</div><div><h1>Radar Estratégico Empresarial</h1><small>Gestão de oportunidades e avanço comercial</small></div></div><div class="pipeline-top-actions"><button class="btn btn-ghost" data-p-action="back">← Voltar ao Radar</button></div></header>`;
  }

  function renderPipeline(){
    const all = migrate().leads;
    const leads = filteredLeads();
    const m = metrics(all);
    document.getElementById('app').innerHTML = `<div class="pipeline-app">${pipelineHeader()}<main class="pipeline-shell">
      <div class="pipeline-head"><div><div class="eyebrow">Controle comercial</div><h2>Funil de leads e prioridade de fechamento</h2><p>Acompanhe reunião, proposta, assinatura, oferta, próxima ação e tempo sem movimentação. O score é um indicador de priorização, calculado a partir do estágio e dos sinais registrados.</p></div><div class="pipeline-head-actions"><button class="btn btn-secondary" data-p-action="new">+ Nova lead</button><button class="btn btn-primary" data-p-action="refresh-movement">Atualizar visão</button></div></div>
      <section class="pipeline-kpis"><article class="pipeline-kpi"><small>Oportunidades abertas</small><strong>${m.total}</strong><span>Sem contar fechadas e perdidas</span></article><article class="pipeline-kpi"><small>Leads quentes</small><strong>${m.hot}</strong><span>Score de fechamento ≥ 70</span></article><article class="pipeline-kpi"><small>Propostas em decisão</small><strong>${m.proposals}</strong><span>Enviadas ou em assinatura</span></article><article class="pipeline-kpi"><small>Paradas há +7 dias</small><strong>${m.stale}</strong><span>Exigem retomada ou descarte</span></article><article class="pipeline-kpi"><small>Negócios fechados</small><strong>${m.won}</strong><span>Histórico total salvo</span></article></section>
      <section class="pipeline-toolbar"><div class="pipeline-filters"><div class="pipeline-search"><input id="pipeline-search" value="${esc(pipelineState.search)}" placeholder="Buscar empresa, CNPJ, contato ou oferta"></div><select id="pipeline-stage-filter"><option value="todos">Todas as etapas</option>${STAGES.map(([v,t]) => `<option value="${v}" ${pipelineState.stage===v?'selected':''}>${t}</option>`).join('')}</select><select id="pipeline-sort"><option value="score" ${pipelineState.sort==='score'?'selected':''}>Maior chance de fechamento</option><option value="inactive" ${pipelineState.sort==='inactive'?'selected':''}>Mais tempo sem movimento</option><option value="movement" ${pipelineState.sort==='movement'?'selected':''}>Movimentação mais recente</option><option value="decision" ${pipelineState.sort==='decision'?'selected':''}>Prazo de decisão</option></select></div><div class="pipeline-view-tabs"><button class="${pipelineState.view==='board'?'active':''}" data-p-view="board">Funil</button><button class="${pipelineState.view==='ranking'?'active':''}" data-p-view="ranking">Ranking</button></div></section>
      ${pipelineState.view === 'board' ? boardView(leads) : rankingView(leads)}
    </main>${pipelineState.editingId ? editModal(pipelineState.editingId) : ''}</div>`;
    bindPipeline();
  }

  function boardView(leads){
    return `<section class="pipeline-board">${STAGES.map(([stage,label]) => {
      const items = leads.filter(l => l.commercialStage === stage);
      return `<article class="pipeline-column"><header class="pipeline-column-head"><div class="pipeline-column-title"><i></i><strong>${label}</strong></div><span>${items.length}</span></header><div class="pipeline-cards">${items.length ? items.map(leadCard).join('') : '<div style="padding:18px 8px;text-align:center;color:var(--muted);font-size:10px">Nenhuma lead nesta etapa</div>'}</div></article>`;
    }).join('')}</section>`;
  }

  function leadCard(lead){
    const score = chanceScore(lead);
    const inactive = daysSince(lead.lastMovementAt);
    return `<article class="lead-card" data-p-edit="${lead.id}"><div class="lead-card-top"><div><h4>${esc(lead.companyName || 'Empresa sem nome')}</h4><div class="cnpj">${esc(lead.cnpj || 'CNPJ não informado')}</div></div><div class="lead-score ${scoreClass(score)}" title="Chance estimada de fechamento">${score}</div></div><div class="lead-meta"><div class="lead-meta-row"><span>Temperatura</span><strong>${temperature(score)}</strong></div><div class="lead-meta-row"><span>Reunião</span><strong>${lead.meetingDate ? fmtDate(lead.meetingDate) : 'Não registrada'}</strong></div><div class="lead-meta-row"><span>Resultado</span><strong>${MEETING_LABEL[lead.meetingOutcome] || '—'}</strong></div><div class="lead-meta-row"><span>Proposta</span><strong>${lead.proposalSent ? 'Enviada' : lead.proposalPresented ? 'Apresentada' : 'Não apresentada'}</strong></div></div>${lead.offeredSolution ? `<div class="lead-offer"><strong>Oferta:</strong> ${esc(lead.offeredSolution)}</div>` : ''}<div class="lead-next"><strong>Próxima ação</strong>${esc(lead.nextAction || 'Não definida')}${lead.nextActionDate ? ` · ${fmtDate(lead.nextActionDate)}` : ''}</div><div style="margin-top:10px"><span class="inactive-badge ${inactivityClass(inactive)}">${inactive === 0 ? 'Movimentada hoje' : `${inactive} dia${inactive===1?'':'s'} sem movimento`}</span></div></article>`;
  }

  function rankingView(leads){
    return `<section class="pipeline-ranking"><div class="ranking-row header"><div>#</div><div>Empresa</div><div>Chance</div><div>Etapa</div><div>Sem movimento</div><div>Próxima ação / oferta</div><div></div></div>${leads.length ? leads.map((lead,index) => {
      const score=chanceScore(lead), inactive=daysSince(lead.lastMovementAt);
      return `<div class="ranking-row"><div class="ranking-pos">${index+1}</div><div class="ranking-company"><strong>${esc(lead.companyName || 'Empresa sem nome')}</strong><span>${esc(lead.cnpj || 'CNPJ não informado')}</span></div><div class="probability"><div class="probability-bar"><i style="width:${score}%"></i></div><strong>${score}</strong></div><div><span class="stage-pill">${STAGE_LABEL[lead.commercialStage] || 'Novo'}</span></div><div><span class="inactive-badge ${inactivityClass(inactive)}">${inactive}d</span></div><div><strong>${esc(lead.nextAction || 'Sem próxima ação')}</strong><div style="color:var(--muted);font-size:9px;margin-top:4px">${esc(lead.offeredSolution || 'Oferta não registrada')}</div></div><div><button class="ranking-action" data-p-edit="${lead.id}">Gerenciar</button></div></div>`;
    }).join('') : '<div class="history-empty" style="padding:34px;text-align:center">Nenhuma lead encontrada com os filtros atuais.</div>'}</section>`;
  }

  function editModal(id){
    const lead = migrate().leads.find(l => l.id === id);
    if (!lead) return '';
    const score = chanceScore(lead);
    const history = [...(lead.commercialHistory || [])].reverse();
    return `<div class="pipeline-modal-backdrop"><section class="pipeline-modal"><header class="pipeline-modal-head"><div><h3>${esc(lead.companyName || 'Gerenciar lead')}</h3><div style="color:var(--muted);font-size:10px;margin-top:4px">Chance estimada: <strong>${score}% · ${temperature(score)}</strong></div></div><button data-p-action="close-edit">×</button></header><div class="pipeline-modal-body"><form id="pipeline-form" class="pipeline-form">
      <input type="hidden" name="id" value="${lead.id}">
      <div class="pipeline-field two"><label>Empresa</label><input name="companyName" value="${esc(lead.companyName || '')}" placeholder="Razão social ou nome da oportunidade"></div><div class="pipeline-field"><label>CNPJ</label><input name="cnpj" value="${esc(lead.cnpj || '')}" placeholder="00.000.000/0001-00"></div>
      <div class="pipeline-field"><label>Etapa do funil</label><select name="commercialStage">${STAGES.map(([v,t]) => `<option value="${v}" ${lead.commercialStage===v?'selected':''}>${t}</option>`).join('')}</select></div><div class="pipeline-field"><label>Nível de interesse</label><select name="interestLevel">${Object.entries(INTEREST_LABEL).map(([v,t]) => `<option value="${v}" ${lead.interestLevel===v?'selected':''}>${t}</option>`).join('')}</select></div><div class="pipeline-field"><label>Chance manual (%) <span style="color:var(--muted);font-weight:500">opcional</span></label><input name="probabilityOverride" type="number" min="0" max="100" value="${esc(lead.probabilityOverride ?? '')}" placeholder="Automática"></div>
      <div class="pipeline-field"><label>Data da reunião</label><input name="meetingDate" type="date" value="${esc(lead.meetingDate || '')}"></div><div class="pipeline-field"><label>Como foi a reunião?</label><select name="meetingOutcome">${Object.entries(MEETING_LABEL).map(([v,t]) => `<option value="${v}" ${lead.meetingOutcome===v?'selected':''}>${t}</option>`).join('')}</select></div><div class="pipeline-field"><label>Prazo esperado de decisão</label><input name="decisionDate" type="date" value="${esc(lead.decisionDate || '')}"></div>
      <div class="pipeline-field full"><label>Resumo da reunião</label><textarea name="meetingNotes" placeholder="O que o cliente disse, dores, objeções, decisores e sinais de interesse">${esc(lead.meetingNotes || '')}</textarea></div>
      <div class="pipeline-field full"><label>O que foi ofertado</label><textarea name="offeredSolution" placeholder="Ex.: regularização em duas etapas, defesa processual, garantia, CAPAG, gestão do passivo...">${esc(lead.offeredSolution || '')}</textarea></div>
      <div class="pipeline-field full"><div class="pipeline-checks"><label class="pipeline-check"><input name="proposalPresented" type="checkbox" ${lead.proposalPresented?'checked':''}> Proposta apresentada</label><label class="pipeline-check"><input name="proposalSent" type="checkbox" ${lead.proposalSent?'checked':''}> Proposta enviada</label><label class="pipeline-check"><span>Data do envio</span><input name="proposalSentAt" type="date" value="${esc(lead.proposalSentAt || '')}" style="min-width:0;width:100%"></label></div></div>
      <div class="pipeline-field"><label>Status da assinatura</label><select name="signatureStatus">${Object.entries(SIGNATURE_LABEL).map(([v,t]) => `<option value="${v}" ${lead.signatureStatus===v?'selected':''}>${t}</option>`).join('')}</select></div><div class="pipeline-field"><label>Última movimentação</label><input name="lastMovementAt" type="date" value="${esc(lead.lastMovementAt || today())}"></div><div class="pipeline-field"><label>Próxima ação — data</label><input name="nextActionDate" type="date" value="${esc(lead.nextActionDate || '')}"></div>
      <div class="pipeline-field full"><label>Próxima ação</label><input name="nextAction" value="${esc(lead.nextAction || '')}" placeholder="Ex.: cobrar documentos, ligar para decisor, reenviar proposta, acompanhar assinatura"></div>
      <div class="pipeline-field full"><label>Observações comerciais</label><textarea name="commercialNotes" placeholder="Objeções, concorrentes, condição interna, combinação de retorno e demais informações">${esc(lead.commercialNotes || '')}</textarea></div>
      ${lead.commercialStage === 'perdido' ? `<div class="pipeline-field full"><label>Motivo da perda</label><textarea name="lostReason" placeholder="Registre o motivo para aprendizado e análise futura">${esc(lead.lostReason || '')}</textarea></div>` : '<input type="hidden" name="lostReason" value="">'}
      <div class="pipeline-field full"><label>Registrar movimentação agora</label><input name="movementNote" placeholder="Ex.: cliente confirmou recebimento da proposta; retorno combinado para sexta-feira"></div>
    </form><div class="pipeline-modal-foot"><button class="btn btn-secondary" data-p-action="open-diagnostic" data-id="${lead.id}">Abrir diagnóstico</button><div class="pipeline-modal-actions"><button class="btn btn-secondary" data-p-action="register-movement">Registrar movimentação</button><button class="btn btn-primary" data-p-action="save-edit">Salvar alterações</button></div></div>
    <section class="history"><h4>Histórico comercial</h4>${history.length ? history.map(item => `<div class="history-item"><time>${esc(item.date || '')}</time><div><strong>${esc(item.title || 'Movimentação')}</strong><span>${esc(item.note || '')}</span></div></div>`).join('') : '<div class="history-empty">Nenhuma movimentação registrada ainda.</div>'}</section></div></section></div>`;
  }

  function readForm(){
    const form = document.getElementById('pipeline-form');
    if (!form) return null;
    const fd = new FormData(form);
    const data = Object.fromEntries(fd.entries());
    data.proposalPresented = form.elements.proposalPresented.checked;
    data.proposalSent = form.elements.proposalSent.checked;
    return data;
  }

  function saveLead(registerMovement=false){
    const values = readForm();
    if (!values) return;
    const db = migrate();
    const lead = db.leads.find(l => l.id === values.id);
    if (!lead) return;
    const oldStage = lead.commercialStage;
    const oldProposalSent = lead.proposalSent;
    const movementNote = String(values.movementNote || '').trim();
    delete values.id; delete values.movementNote;
    Object.assign(lead, values);
    lead.probabilityOverride = String(lead.probabilityOverride || '').trim();
    lead.updatedAt = today();
    let historyTitle = 'Cadastro comercial atualizado';
    let historyNote = movementNote;
    const meaningfulMovement = registerMovement || oldStage !== lead.commercialStage || (!oldProposalSent && lead.proposalSent) || movementNote;
    if (oldStage !== lead.commercialStage) {
      historyTitle = `Etapa alterada: ${STAGE_LABEL[oldStage]} → ${STAGE_LABEL[lead.commercialStage]}`;
    } else if (!oldProposalSent && lead.proposalSent) {
      historyTitle = 'Proposta marcada como enviada';
    } else if (registerMovement) {
      historyTitle = 'Movimentação registrada';
    }
    if (meaningfulMovement) lead.lastMovementAt = today();
    if (!Array.isArray(lead.commercialHistory)) lead.commercialHistory = [];
    lead.commercialHistory.push({ date:new Date().toLocaleString('pt-BR'), title:historyTitle, note:historyNote || 'Informações comerciais atualizadas.' });
    if (lead.commercialStage === 'fechado') lead.status = 'concluido';
    if (lead.commercialStage === 'proposta_enviada') lead.status = 'proposta_emitida';
    saveDB(db);
    pipelineState.editingId = null;
    renderPipeline();
    notify(registerMovement ? 'Movimentação registrada.' : 'Lead atualizada.');
  }

  function createLead(){
    const db = migrate();
    const lead = {
      id:uid(), companyName:'', cnpj:'', createdAt:today(), updatedAt:today(), status:'em_analise', urgency:'sem_urgencia',
      commercialStage:'novo', interestLevel:'desconhecido', meetingDate:'', meetingOutcome:'nao_realizada', meetingNotes:'',
      proposalPresented:false, proposalSent:false, proposalSentAt:'', signatureStatus:'nao_aplicavel', offeredSolution:'',
      nextAction:'', nextActionDate:'', decisionDate:'', lastMovementAt:today(), lostReason:'', commercialNotes:'', probabilityOverride:'',
      commercialHistory:[{date:new Date().toLocaleString('pt-BR'),title:'Lead criada',note:'Oportunidade incluída no funil comercial.'}]
    };
    db.leads.unshift(lead); saveDB(db); pipelineState.editingId = lead.id; renderPipeline();
  }

  function bindPipeline(){
    document.querySelectorAll('[data-p-action]').forEach(btn => btn.onclick = () => {
      const action = btn.dataset.pAction;
      if (action === 'back') closePipeline();
      if (action === 'new') createLead();
      if (action === 'refresh-movement') renderPipeline();
      if (action === 'close-edit') { pipelineState.editingId = null; renderPipeline(); }
      if (action === 'save-edit') saveLead(false);
      if (action === 'register-movement') saveLead(true);
      if (action === 'open-diagnostic') { localStorage.setItem(OPEN_AFTER_RELOAD, btn.dataset.id); location.reload(); }
    });
    document.querySelectorAll('[data-p-edit]').forEach(btn => btn.onclick = () => { pipelineState.editingId = btn.dataset.pEdit; renderPipeline(); });
    document.querySelectorAll('[data-p-view]').forEach(btn => btn.onclick = () => { pipelineState.view = btn.dataset.pView; renderPipeline(); });
    const search = document.getElementById('pipeline-search');
    if (search) search.oninput = e => { pipelineState.search = e.target.value; renderPipeline(); setTimeout(() => { const s=document.getElementById('pipeline-search'); if(s){s.focus();s.setSelectionRange(s.value.length,s.value.length)} },0); };
    const stage = document.getElementById('pipeline-stage-filter'); if (stage) stage.onchange = e => { pipelineState.stage=e.target.value; renderPipeline(); };
    const sort = document.getElementById('pipeline-sort'); if (sort) sort.onchange = e => { pipelineState.sort=e.target.value; renderPipeline(); };
  }

  function installPipelineButton(){
    if (pipelineOpen) return;
    const actions = document.querySelector('.top-actions');
    if (actions && !document.getElementById('pipeline-launch')) {
      const btn = document.createElement('button');
      btn.id = 'pipeline-launch'; btn.className = 'btn btn-ghost pipeline-launch'; btn.textContent = 'Funil comercial';
      btn.onclick = openPipeline; actions.insertBefore(btn, actions.firstChild);
    }
    const pending = localStorage.getItem(OPEN_AFTER_RELOAD);
    if (pending) {
      const openButton = document.querySelector(`[data-open="${CSS.escape(pending)}"]`);
      if (openButton) { localStorage.removeItem(OPEN_AFTER_RELOAD); setTimeout(() => openButton.click(), 50); }
    }
  }

  function removeValidationGate(){
    document.querySelectorAll('.validation').forEach(section => {
      if (section.dataset.strategyClean === 'true') return;
      const text = section.textContent || '';
      if (!text.includes('Essa estratégia faz sentido')) return;
      section.dataset.strategyClean = 'true';
      section.className = 'card strategy-next';
      section.innerHTML = `<h3>Próximos passos</h3><p>A estratégia pode ser ajustada conforme a reação do cliente e os dados que surgirem na reunião. Não há etapa obrigatória de aprovação dentro do sistema.</p><div class="strategy-next-actions"><button class="btn btn-secondary" data-enh-target="calculadoras">Revisar cenários</button><button class="btn btn-primary" data-enh-target="parecer">Abrir parecer</button><button class="btn btn-secondary" data-enh-pipeline>Registrar no funil</button></div>`;
    });
  }

  function prepareGuaranteeModal(){
    const modal = document.querySelector('.modal');
    if (!modal || !modal.textContent.includes('Calculadora de garantia')) return;
    const label = [...modal.querySelectorAll('.label')].find(el => el.textContent.includes('Dívida ou valor da garantia'));
    if (label) label.textContent = 'Valor de referência da dívida ou garantia';
    const note = modal.querySelector('.calc-note');
    if (note) note.innerHTML = '<strong>Base corrigida:</strong> o percentual informado é aplicado ao valor de referência para determinar o custo da garantia. A entrada incide sobre esse custo, e as despesas adicionais são demonstradas separadamente.';
  }

  function correctedGuarantee(){
    const get = id => document.getElementById(id)?.value || document.querySelector(`[data-field="${id}"]`)?.value || '';
    const toNum = v => Number(String(v ?? '').replace(/\./g,'').replace(',','.').replace(/[^0-9.-]/g,'')) || 0;
    const model = get('g-model');
    const reference = toNum(get('g-debt'));
    const costPct = Math.max(0, Math.min(100, toNum(get('g-cost')))) / 100;
    const entryPct = Math.max(5, Math.min(100, toNum(get('g-entry')) || 5)) / 100;
    let months = Math.max(1, Math.floor(toNum(get('g-months')) || 1));
    const maxMonths = model === 'contrato_impedido' ? 24 : 60;
    months = Math.min(months, maxMonths);
    const monthsInput = document.getElementById('g-months'); if (monthsInput) monthsInput.value = months;
    const output = document.getElementById('calc-output');
    if (!output) return;
    if (reference <= 0 || costPct <= 0) {
      output.innerHTML = '<div class="calc-alert"><strong>Dados insuficientes:</strong> informe um valor de referência e um percentual de custo superior a zero.</div>';
      return;
    }
    const guaranteeCost = reference * costPct;
    const entry = guaranteeCost * entryPct;
    const financed = Math.max(0, guaranteeCost - entry);
    const installment = financed / months;
    const linkCost = document.getElementById('g-link')?.checked ? 1400 : 0;
    const updateCost = document.getElementById('g-update')?.checked ? 1400 : 0;
    const extras = linkCost + updateCost;
    const grandTotal = guaranteeCost + extras;
    const modelName = ({prescricao:'Busca de prescrição com garantia',contrato_impedido:'Contrato de garantia — impedido',contrato_prescricao:'Contrato de garantia — prescrição'})[model] || 'Garantia';
    output.innerHTML = `<div class="kpis"><div class="kpi"><small>Valor de referência</small><strong>${fmtBRL(reference)}</strong></div><div class="kpi"><small>Custo da garantia (${(costPct*100).toLocaleString('pt-BR')}%)</small><strong>${fmtBRL(guaranteeCost)}</strong></div><div class="kpi"><small>Entrada (${(entryPct*100).toLocaleString('pt-BR')}%)</small><strong>${fmtBRL(entry)}</strong></div><div class="kpi"><small>Saldo em ${months}x</small><strong>${fmtBRL(installment)}</strong></div></div><div class="compare-card guarantee-breakdown"><span class="badge blue">${esc(modelName)}</span><h4 style="margin:14px 0 4px">Composição do cálculo</h4><div class="compare-line"><span>Valor de referência</span><strong>${fmtBRL(reference)}</strong></div><div class="compare-line"><span>Percentual aplicado</span><strong>${(costPct*100).toLocaleString('pt-BR')}%</strong></div><div class="compare-line"><span>Custo-base da garantia</span><strong>${fmtBRL(guaranteeCost)}</strong></div><div class="compare-line"><span>Entrada</span><strong>${fmtBRL(entry)}</strong></div><div class="compare-line"><span>Saldo parcelado</span><strong>${fmtBRL(financed)}</strong></div><div class="compare-line"><span>Parcelamento</span><strong>${months}x de ${fmtBRL(installment)}</strong></div><div class="compare-line"><span>Vinculação de matrícula</span><strong>${fmtBRL(linkCost)}</strong></div><div class="compare-line"><span>Atualização de matrícula</span><strong>${fmtBRL(updateCost)}</strong></div><div class="compare-line"><span>Total geral estimado</span><strong>${fmtBRL(grandTotal)}</strong></div><div class="guarantee-formula">Fórmula: valor de referência × percentual de custo = custo-base da garantia. A entrada é calculada sobre o custo-base; o saldo é dividido pelo número de parcelas permitido no modelo.</div></div>`;
    notify('Cálculo de garantia atualizado.');
  }

  function notify(message){
    const el = document.createElement('div'); el.className='toast'; el.textContent=message; document.body.appendChild(el); setTimeout(()=>el.remove(),2300);
  }

  document.addEventListener('click', event => {
    const guaranteeButton = event.target.closest('[data-action="run-guarantee"]');
    if (guaranteeButton) {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation(); correctedGuarantee(); return;
    }
    const target = event.target.closest('[data-enh-target]');
    if (target) {
      event.preventDefault();
      document.querySelector(`.nav-tab[data-view="${target.dataset.enhTarget}"]`)?.click();
    }
    if (event.target.closest('[data-enh-pipeline]')) { event.preventDefault(); openPipeline(); }
  }, true);

  const observer = new MutationObserver(() => {
    if (!pipelineOpen) {
      installPipelineButton();
      removeValidationGate();
      prepareGuaranteeModal();
    }
  });
  observer.observe(document.documentElement, { childList:true, subtree:true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { migrate(); installPipelineButton(); removeValidationGate(); prepareGuaranteeModal(); });
  } else {
    migrate(); installPipelineButton(); removeValidationGate(); prepareGuaranteeModal();
  }
})();
