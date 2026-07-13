(() => {
  const DB_KEY = 'radar_estrategico_v2';
  const CURRENT_LEAD_KEY = 'radar_current_case_id';
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
  let draggedLeadId = null;
  let dragJustEnded = false;
  let scheduled = false;

  const esc = (value = '') => String(value).replace(/[&<>'"]/g, char => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;'
  })[char]);
  const today = () => new Date().toISOString().slice(0, 10);

  function loadDB() {
    try {
      const db = JSON.parse(localStorage.getItem(DB_KEY) || '{"leads":[]}');
      if (!Array.isArray(db.leads)) db.leads = [];
      return db;
    } catch {
      return { leads: [] };
    }
  }

  function saveDB(db) {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  }

  function migrateCaseSettings() {
    const db = loadDB();
    let changed = false;
    db.leads.forEach(lead => {
      const defaults = {
        reportShowCosts: false,
        reportCostTitle: 'Investimento para implementação',
        reportCostValue: '',
        reportCostDetails: ''
      };
      Object.entries(defaults).forEach(([key, value]) => {
        if (lead[key] === undefined) {
          lead[key] = value;
          changed = true;
        }
      });
    });
    if (changed) saveDB(db);
    return db;
  }

  function getCurrentLead() {
    const db = migrateCaseSettings();
    const storedId = localStorage.getItem(CURRENT_LEAD_KEY);
    let lead = db.leads.find(item => item.id === storedId);
    if (lead) return lead;

    const companyInput = document.querySelector('[data-field="companyName"]');
    const cnpjInput = document.querySelector('[data-field="cnpj"]');
    const company = String(companyInput?.value || '').trim();
    const cnpj = String(cnpjInput?.value || '').trim();
    if (company || cnpj) {
      lead = db.leads.find(item => (company && item.companyName === company) || (cnpj && item.cnpj === cnpj));
    }

    if (!lead && document.querySelector('.quick-form, .reading-grid, .strategy-strip, .report')) {
      lead = [...db.leads].sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')))[0];
    }

    if (lead) localStorage.setItem(CURRENT_LEAD_KEY, lead.id);
    return lead || null;
  }

  function updateLead(id, patch) {
    const db = migrateCaseSettings();
    const lead = db.leads.find(item => item.id === id);
    if (!lead) return null;
    Object.assign(lead, patch, { updatedAt: today() });
    saveDB(db);
    return lead;
  }

  function rememberVisibleCase() {
    if (!document.querySelector('.quick-form, .reading-grid, .strategy-strip, .report')) return;
    getCurrentLead();
  }

  function enhanceHome() {
    const hero = document.querySelector('.hero-panel');
    if (!hero || hero.dataset.caseHome === 'true') return;
    hero.dataset.caseHome = 'true';
    hero.classList.add('case-home');

    const eyebrow = hero.querySelector('.hero-copy .eyebrow');
    const title = hero.querySelector('.hero-copy h2');
    const copy = hero.querySelector('.hero-copy p');
    if (eyebrow) eyebrow.textContent = 'Sistema de Análise de Caso';
    if (title) title.textContent = 'Analise o caso, compare cenários e gere o parecer final.';
    if (copy) copy.textContent = 'Abra um caso, registre somente os dados essenciais, use as calculadoras quando necessário e conclua com uma indicação estratégica e um parecer executivo.';

    const topbarSubtitle = document.querySelector('.topbar .brand small');
    if (topbarSubtitle) topbarSubtitle.textContent = 'Sistema de Análise de Caso';
    const pipelineButton = document.getElementById('pipeline-launch');
    if (pipelineButton) pipelineButton.textContent = 'Gestão comercial';

    const firstAction = hero.querySelector('.hero-actions [data-action="new"]');
    if (firstAction) firstAction.textContent = '+ Iniciar novo caso';

    const analysisList = hero.nextElementSibling;
    if (!document.querySelector('.case-start-grid')) {
      const grid = document.createElement('section');
      grid.className = 'case-start-grid';
      grid.innerHTML = `
        <article class="case-start-card primary">
          <div class="case-step">Fluxo principal</div>
          <h3>Sistema de Análise de Caso</h3>
          <p>Construa a leitura do cenário e chegue a uma indicação objetiva de estratégia, sem transformar a reunião em um questionário extenso.</p>
          <div class="case-flow"><span>Ficha rápida</span><span>Calculadoras</span><span>Estratégia</span><span>Parecer final</span></div>
          <button class="btn" data-case-action="new">+ Iniciar análise</button>
        </article>
        <article class="case-start-card">
          <div class="case-step">Base de casos</div>
          <h3>Casos em andamento</h3>
          <p>Retome análises já iniciadas, revise simulações e atualize a estratégia antes de emitir o documento final.</p>
          <button class="btn btn-secondary" data-case-action="cases">Ver casos salvos</button>
        </article>
        <article class="case-start-card">
          <div class="case-step">Módulo separado</div>
          <h3>Gestão comercial</h3>
          <p>Acompanhe reunião, proposta, assinatura, próxima ação, chance de fechamento e tempo sem movimentação.</p>
          <button class="btn btn-secondary" data-case-action="pipeline">Abrir funil Kanban</button>
        </article>`;
      if (analysisList) hero.parentNode.insertBefore(grid, analysisList);
      else hero.insertAdjacentElement('afterend', grid);
    }
  }

  function createReportControls() {
    const report = document.querySelector('.report');
    const actions = document.querySelector('.report-actions');
    if (!report || !actions || document.querySelector('.case-report-controls')) return;
    const lead = getCurrentLead();
    if (!lead) return;

    const controls = document.createElement('section');
    controls.className = 'case-report-controls';
    controls.innerHTML = `
      <div class="case-report-control-head">
        <div>
          <h3>Custos no parecer</h3>
          <p>O documento pode ser emitido apenas com a análise e a estratégia. Ative esta opção somente quando quiser incluir custos ou condições.</p>
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <span class="case-cost-status ${lead.reportShowCosts ? 'visible' : ''}" id="case-cost-status">${lead.reportShowCosts ? 'Visível no parecer' : 'Oculto no parecer'}</span>
          <label class="case-cost-toggle">
            <input id="case-show-costs" type="checkbox" ${lead.reportShowCosts ? 'checked' : ''}>
            <span class="case-toggle-track"></span>
          </label>
        </div>
      </div>
      <div class="case-cost-fields ${lead.reportShowCosts ? '' : 'hidden'}" id="case-cost-fields">
        <label>Título do bloco
          <input data-report-field="reportCostTitle" value="${esc(lead.reportCostTitle || '')}" placeholder="Ex.: Investimento para implementação">
        </label>
        <label>Valor ou condição
          <input data-report-field="reportCostValue" value="${esc(lead.reportCostValue || '')}" placeholder="Ex.: R$ 4.500 + 6 parcelas">
        </label>
        <label class="full">Observações que devem constar no documento
          <textarea data-report-field="reportCostDetails" placeholder="Escopo incluído, forma de pagamento, validade ou condições específicas">${esc(lead.reportCostDetails || '')}</textarea>
        </label>
      </div>`;
    actions.insertAdjacentElement('afterend', controls);
    renderCostSection(lead);
  }

  function renderCostSection(lead) {
    document.querySelectorAll('.report-cost-section').forEach(node => node.remove());
    if (!lead?.reportShowCosts) return;
    const reportBody = document.querySelector('.report-body');
    if (!reportBody) return;
    const sections = [...reportBody.querySelectorAll('.report-section')];
    const conclusion = sections[sections.length - 1] || null;
    const section = document.createElement('section');
    section.className = 'report-section report-cost-section';
    section.innerHTML = `
      <h3>Condições e custos da implementação</h3>
      <div class="report-cost-box">
        <span>${esc(lead.reportCostTitle || 'Investimento para implementação')}</span>
        <strong>${esc(lead.reportCostValue || 'A definir conforme o escopo aprovado')}</strong>
        ${lead.reportCostDetails ? `<p>${esc(lead.reportCostDetails)}</p>` : ''}
      </div>`;
    if (conclusion) reportBody.insertBefore(section, conclusion);
    else reportBody.appendChild(section);
  }

  function enhanceReportStrategyLabel() {
    document.querySelectorAll('.report-section h3').forEach(title => {
      if (title.textContent.includes('Estratégia recomendada')) title.textContent = title.textContent.replace('Estratégia recomendada', 'Estratégia indicada');
    });
  }

  function enableKanbanDrag() {
    const board = document.querySelector('.pipeline-board');
    if (!board) return;

    const description = document.querySelector('.pipeline-head p');
    if (description && !document.querySelector('.pipeline-drag-hint')) {
      const hint = document.createElement('span');
      hint.className = 'pipeline-drag-hint';
      hint.textContent = '↔ Arraste os cards entre as etapas para atualizar o funil';
      description.insertAdjacentElement('afterend', hint);
    }

    [...board.querySelectorAll('.pipeline-column')].forEach((column, index) => {
      const stage = STAGES[index]?.[0];
      if (!stage) return;
      column.dataset.dropStage = stage;
      const cardsArea = column.querySelector('.pipeline-cards');
      const empty = cardsArea?.querySelector('div[style]');
      if (empty) empty.classList.add('drop-empty');

      if (column.dataset.dragBound !== 'true') {
        column.dataset.dragBound = 'true';
        column.addEventListener('dragover', event => {
          event.preventDefault();
          if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
          column.classList.add('drag-over');
        });
        column.addEventListener('dragleave', event => {
          if (!column.contains(event.relatedTarget)) column.classList.remove('drag-over');
        });
        column.addEventListener('drop', event => {
          event.preventDefault();
          column.classList.remove('drag-over');
          const leadId = event.dataTransfer?.getData('text/plain') || draggedLeadId;
          if (leadId) moveLeadToStage(leadId, stage);
        });
      }
    });

    board.querySelectorAll('.lead-card[data-p-edit]').forEach(card => {
      if (card.dataset.dragBound === 'true') return;
      card.dataset.dragBound = 'true';
      card.draggable = true;
      card.dataset.dragLead = card.dataset.pEdit;
      card.addEventListener('dragstart', event => {
        draggedLeadId = card.dataset.dragLead;
        card.classList.add('dragging');
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', draggedLeadId || '');
        }
      });
      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
        document.querySelectorAll('.pipeline-column.drag-over').forEach(column => column.classList.remove('drag-over'));
        draggedLeadId = null;
        dragJustEnded = true;
        setTimeout(() => { dragJustEnded = false; }, 250);
      });
    });
  }

  function moveLeadToStage(leadId, nextStage) {
    const db = loadDB();
    const lead = db.leads.find(item => item.id === leadId);
    if (!lead || lead.commercialStage === nextStage) return;
    const previousStage = lead.commercialStage || 'novo';
    lead.commercialStage = nextStage;
    lead.lastMovementAt = today();
    lead.updatedAt = today();
    if (!Array.isArray(lead.commercialHistory)) lead.commercialHistory = [];
    lead.commercialHistory.push({
      date: new Date().toLocaleString('pt-BR'),
      title: `Etapa alterada por arraste: ${STAGE_LABEL[previousStage] || previousStage} → ${STAGE_LABEL[nextStage] || nextStage}`,
      note: 'Movimentação realizada diretamente no quadro Kanban.'
    });
    if (nextStage === 'fechado') lead.status = 'concluido';
    else if (nextStage === 'proposta_enviada') lead.status = 'proposta_emitida';
    else if (nextStage === 'reuniao_realizada') lead.status = 'estrategia_apresentada';
    saveDB(db);
    document.querySelector('[data-p-action="refresh-movement"]')?.click();
    notify(`Lead movida para ${STAGE_LABEL[nextStage]}.`);
  }

  function notify(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2300);
  }

  function apply() {
    scheduled = false;
    migrateCaseSettings();
    enhanceHome();
    rememberVisibleCase();
    createReportControls();
    enhanceReportStrategyLabel();
    enableKanbanDrag();
    const pipelineButton = document.getElementById('pipeline-launch');
    if (pipelineButton) pipelineButton.textContent = 'Gestão comercial';
  }

  function scheduleApply() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(apply);
  }

  document.addEventListener('click', event => {
    const open = event.target.closest('[data-open]');
    if (open?.dataset.open) localStorage.setItem(CURRENT_LEAD_KEY, open.dataset.open);

    const openDiagnostic = event.target.closest('[data-p-action="open-diagnostic"]');
    if (openDiagnostic?.dataset.id) localStorage.setItem(CURRENT_LEAD_KEY, openDiagnostic.dataset.id);

    const caseAction = event.target.closest('[data-case-action]');
    if (caseAction) {
      const action = caseAction.dataset.caseAction;
      if (action === 'new') document.querySelector('.hero-actions [data-action="new"], .section-title [data-action="new"]')?.click();
      if (action === 'cases') document.querySelector('.case-start-grid')?.nextElementSibling?.scrollIntoView({ behavior:'smooth', block:'start' });
      if (action === 'pipeline') document.getElementById('pipeline-launch')?.click();
    }

    if (dragJustEnded && event.target.closest('.lead-card')) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  document.addEventListener('change', event => {
    const toggle = event.target.closest('#case-show-costs');
    if (!toggle) return;
    const lead = getCurrentLead();
    if (!lead) return;
    const updated = updateLead(lead.id, { reportShowCosts: toggle.checked });
    document.getElementById('case-cost-fields')?.classList.toggle('hidden', !toggle.checked);
    const status = document.getElementById('case-cost-status');
    if (status) {
      status.textContent = toggle.checked ? 'Visível no parecer' : 'Oculto no parecer';
      status.classList.toggle('visible', toggle.checked);
    }
    renderCostSection(updated);
  });

  document.addEventListener('input', event => {
    const field = event.target.closest('[data-report-field]');
    if (!field) return;
    const lead = getCurrentLead();
    if (!lead) return;
    const updated = updateLead(lead.id, { [field.dataset.reportField]: field.value });
    renderCostSection(updated);
  });

  const observer = new MutationObserver(scheduleApply);
  observer.observe(document.documentElement, { childList:true, subtree:true });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleApply);
  else scheduleApply();
})();