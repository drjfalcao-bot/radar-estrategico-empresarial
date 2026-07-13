(() => {
  const DB_KEY = 'radar_estrategico_v2';
  const CURRENT_CASE_KEY = 'radar_current_case_id';
  const OPEN_AFTER_RELOAD = 'radar_open_lead_after_reload';
  let scheduled = false;

  const today = () => new Date().toISOString().slice(0, 10);
  const uid = () => `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const clamp = value => Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  const esc = (value = '') => String(value).replace(/[&<>'"]/g, char => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;'
  })[char]);

  function loadDB() {
    try {
      const data = JSON.parse(localStorage.getItem(DB_KEY) || '{"leads":[]}');
      if (!Array.isArray(data.leads)) data.leads = [];
      return data;
    } catch {
      return { leads: [] };
    }
  }

  function saveDB(data) {
    localStorage.setItem(DB_KEY, JSON.stringify(data));
  }

  function answer(id) {
    return Boolean(document.getElementById(id)?.checked);
  }

  function readAnswers() {
    return {
      execution: answer('risk-execution'),
      citation: answer('risk-citation'),
      block: answer('risk-block'),
      seizure: answer('risk-seizure'),
      expropriation: answer('risk-expropriation'),
      guarantee: answer('risk-guarantee'),
      multiple: answer('risk-multiple'),
      cnd: answer('risk-cnd'),
      installment: answer('risk-installment'),
      rescission: answer('risk-rescission'),
      priorBlocks: answer('risk-prior-blocks'),
      exposedAssets: answer('risk-assets')
    };
  }

  function calculate(answers) {
    let score = 8;
    const factors = [];
    const positives = [];

    if (answers.execution) { score += 22; factors.push('Execução fiscal ativa.'); }
    if (answers.citation) { score += 16; factors.push('Citação já realizada, com necessidade de controle processual e defensivo.'); }
    if (answers.block) { score += 24; factors.push('Bloqueio de valores informado.'); }
    if (answers.seizure) { score += 20; factors.push('Penhora ou constrição patrimonial identificada.'); }
    if (answers.expropriation) { score += 30; factors.push('Atos avançados de expropriação, leilão ou adjudicação.'); }
    if (answers.multiple) { score += 8; factors.push('Pluralidade de execuções aumenta a complexidade de coordenação.'); }
    if (answers.cnd) { score += 5; factors.push('A operação depende de certidão, elevando o impacto empresarial do passivo.'); }
    if (answers.rescission) { score += 8; factors.push('Há risco de rescisão de parcelamento ou negociação vigente.'); }
    if (answers.priorBlocks) { score += 7; factors.push('Histórico de bloqueios indica recorrência de exposição patrimonial.'); }
    if (answers.exposedAssets) { score += 6; factors.push('Existem ativos ou recebíveis relevantes potencialmente expostos.'); }

    if (answers.execution && !answers.guarantee) {
      score += 8;
      factors.push('Execução sem garantia informada.');
    }
    if (answers.guarantee) {
      score -= 8;
      positives.push('Há garantia apresentada ou disponível para análise.');
    }
    if (answers.installment) {
      score -= 4;
      positives.push('Existe parcelamento ou negociação ativa a ser validada e acompanhada.');
    }

    score = clamp(score);

    let band = 'Controlado';
    let bandClass = 'controlado';
    if (score >= 75) { band = 'Crítico'; bandClass = 'critico'; }
    else if (score >= 55) { band = 'Elevado'; bandClass = 'elevado'; }
    else if (score >= 30) { band = 'Atenção'; bandClass = 'atencao'; }

    let strategyTitle = 'Gestão e regularização do passivo';
    let strategyText = 'Organizar os débitos, validar exigibilidade, parcelamentos e possibilidades de negociação antes do avanço da cobrança.';
    let complexity = 'Baixa a moderada';
    let priority = 'Planejada';
    const fronts = ['Mapeamento do passivo', 'Regularização e negociação'];

    if (answers.execution) {
      strategyTitle = 'Gestão de Passivo com Acompanhamento Processual';
      strategyText = 'A existência de execução exige coordenação entre regularização, monitoramento processual e preparação da estratégia defensiva.';
      complexity = 'Moderada';
      priority = 'Prioritária';
      fronts.push('Monitoramento das execuções', 'Estratégia defensiva');
    }

    if (answers.execution && answers.citation) {
      strategyTitle = 'Gestão de Passivo com Defesa em Execução';
      strategyText = 'A citação torna necessária a condução integrada do passivo com defesa processual, análise de garantias e negociação coordenada.';
      complexity = answers.multiple ? 'Alta' : 'Moderada a alta';
      priority = 'Alta';
      fronts.push('Defesa em execução', 'Análise de garantia');
    }

    if (answers.block || answers.seizure) {
      strategyTitle = 'Gestão de Passivo com Defesa Processual Prioritária';
      strategyText = 'Bloqueio ou penhora exige atuação coordenada para avaliar desbloqueio, substituição ou apresentação de garantia e regularização do passivo.';
      complexity = 'Alta';
      priority = 'Imediata';
      fronts.push('Análise de desbloqueio', 'Substituição ou apresentação de garantia', 'Proteção da continuidade operacional');
    }

    if (answers.expropriation) {
      strategyTitle = 'Gestão Crítica do Passivo com Atuação Processual Imediata';
      strategyText = 'Atos de expropriação exigem prioridade máxima, leitura integral dos processos e coordenação imediata entre defesa, garantia e negociação.';
      complexity = 'Crítica';
      priority = 'Imediata';
      fronts.push('Contenção de atos expropriatórios', 'Leitura processual integral', 'Plano emergencial de regularização');
    }

    if (answers.multiple && complexity === 'Moderada') complexity = 'Alta';
    if (answers.cnd) fronts.push('Estratégia para certidão');
    if (answers.rescission) fronts.push('Prevenção ou tratamento de rescisão');

    const uniqueFronts = [...new Set(fronts)];
    const opportunity = answers.execution
      ? 'Gestão estratégica do passivo com acompanhamento e defesa das execuções fiscais.'
      : 'Gestão, organização e regularização estratégica do passivo tributário.';

    return { score, band, bandClass, factors, positives, strategyTitle, strategyText, complexity, priority, fronts: uniqueFronts, opportunity };
  }

  function factorList(items, emptyText) {
    const list = items.length ? items : [emptyText];
    return `<ul>${list.map(item => `<li>${esc(item)}</li>`).join('')}</ul>`;
  }

  function renderResult(result) {
    const output = document.getElementById('risk-output');
    if (!output) return;
    output.innerHTML = `
      <section class="risk-score-card">
        <div class="risk-score-top"><div><small>Risco de cobrança e execução</small><div class="risk-score">${result.score}</div></div><span class="risk-band ${result.bandClass}">${result.band}</span></div>
        <p>Indicador preliminar para priorização comercial e definição do escopo de análise. O resultado deve ser confirmado com processos, extratos e documentos.</p>
      </section>
      <section class="risk-strategy">
        <span class="tag">Estratégia indicada</span>
        <h3>${esc(result.strategyTitle)}</h3>
        <p>${esc(result.strategyText)}</p>
        <div class="risk-fronts">${result.fronts.map(front => `<span>${esc(front)}</span>`).join('')}</div>
      </section>
      <div class="risk-complexity">
        <div class="risk-mini"><small>Complexidade interna</small><strong>${esc(result.complexity)}</strong></div>
        <div class="risk-mini"><small>Prioridade</small><strong>${esc(result.priority)}</strong></div>
      </div>
      <section class="risk-box"><h4>Fatores que elevaram o risco</h4>${factorList(result.factors, 'Nenhum evento processual crítico foi informado.')}</section>
      <section class="risk-box"><h4>Oportunidade identificada</h4><p style="margin:0;color:#566d80;font-size:10px;line-height:1.55">${esc(result.opportunity)}</p></section>
      ${result.positives.length ? `<section class="risk-box"><h4>Fatores de contenção</h4>${factorList(result.positives, '')}</section>` : ''}
      <div class="risk-disclaimer">A indicação é comercial e estratégica, não substitui a análise jurídica individual dos processos e documentos do cliente.</div>`;
    output.dataset.result = JSON.stringify(result);
  }

  function question(id, title, help) {
    return `<label class="risk-question" for="${id}"><input id="${id}" type="checkbox"><span><strong>${title}</strong><span>${help}</span></span></label>`;
  }

  function buildWorkbench() {
    return `<section class="risk-workbench" id="risk-workbench">
      <header class="risk-workbench-head">
        <div><div class="eyebrow">Calculadora de risco e oportunidade</div><h2>Risco de Cobrança, Execução e Exposição Patrimonial</h2><p>Mapeie rapidamente o estágio da cobrança e transforme os fatos identificados em uma indicação preliminar de estratégia, frentes de trabalho e complexidade do caso.</p></div>
        <span class="risk-workbench-badge">Tela inicial · Pré-venda</span>
      </header>
      <div class="risk-layout">
        <div class="risk-form">
          <div class="risk-company-grid">
            <div class="risk-field"><label>Empresa</label><input id="risk-company" placeholder="Razão social ou nome da oportunidade"></div>
            <div class="risk-field"><label>CNPJ</label><input id="risk-cnpj" placeholder="00.000.000/0001-00"></div>
          </div>
          <div class="risk-section-title"><div><h3>Estágio da cobrança</h3></div><span>Marque apenas fatos já identificados</span></div>
          <div class="risk-question-grid">
            ${question('risk-execution','Existe execução fiscal?','Indica judicialização da cobrança.')}
            ${question('risk-citation','Houve citação?','A empresa já foi formalmente chamada à execução.')}
            ${question('risk-block','Houve bloqueio de valores?','Bloqueio bancário, SISBAJUD ou indisponibilidade financeira.')}
            ${question('risk-seizure','Houve penhora ou constrição?','Imóveis, veículos, recebíveis ou outros bens.')}
            ${question('risk-expropriation','Há leilão, adjudicação ou expropriação?','Atos avançados exigem tratamento imediato.')}
            ${question('risk-guarantee','Existe garantia apresentada ou disponível?','Pode reduzir exposição e apoiar a estratégia.')}
          </div>
          <div class="risk-section-title"><div><h3>Impacto empresarial e complexidade</h3></div><span>Ajuda a dimensionar o escopo</span></div>
          <div class="risk-question-grid">
            ${question('risk-multiple','Existem várias execuções?','Aumenta o volume de acompanhamento e coordenação.')}
            ${question('risk-cnd','A empresa depende de certidão?','Impacta contratos, crédito, licitações ou operação.')}
            ${question('risk-installment','Há parcelamento ou negociação ativa?','Precisa ser validado e acompanhado.')}
            ${question('risk-rescission','Existe risco de rescisão?','Parcelas em atraso ou condição ameaçada.')}
            ${question('risk-prior-blocks','Já houve bloqueios anteriores?','Indica recorrência da exposição patrimonial.')}
            ${question('risk-assets','Há ativos ou recebíveis expostos?','Imóveis, veículos, faturamento ou contas relevantes.')}
          </div>
          <div class="risk-actions">
            <button class="btn btn-primary" id="risk-calculate">Calcular risco e estratégia</button>
            <button class="btn btn-secondary" id="risk-save">Salvar como oportunidade</button>
            <button class="btn btn-secondary" id="risk-open-case">Abrir análise completa</button>
          </div>
        </div>
        <aside class="risk-result" id="risk-output"><div class="risk-empty"><strong>Mapeie os eventos já identificados.</strong><br>O sistema mostrará o nível de risco, a estratégia indicada, as frentes do trabalho e a complexidade interna do caso.</div></aside>
      </div>
    </section>`;
  }

  function currentResult() {
    const output = document.getElementById('risk-output');
    if (output?.dataset.result) {
      try { return JSON.parse(output.dataset.result); } catch { /* noop */ }
    }
    const result = calculate(readAnswers());
    renderResult(result);
    return result;
  }

  function leadDefaults() {
    return {
      id:uid(), companyName:'', tradeName:'', cnpj:'', segment:'', taxRegime:'nao_informado', city:'', state:'RS', contactName:'',
      meetingReason:'compreender', urgency:'sem_urgencia', revenueBand:'nao_informado', cashPressure:'moderada',
      rfbDebt:0, pgfnSimple:0, pgfnPrev:0, pgfnOther:0, activeExecution:false, recentBlock:false, impediment:false,
      profile:'me_epp', capag:'nao_sei', reparcelment:'nenhum', smallValue:false, certificationNeed:'media',
      b2b:'medio', priceRigidity:'medio', taxCashUse:'ocasional', reformReadiness:'parcial', documentation:'parcial', governance:'boa',
      clientValidation:'pendente', monthlyFee:'', status:'em_analise', createdAt:today(), updatedAt:today(), lastSimulation:null,
      commercialStage:'novo', interestLevel:'desconhecido', meetingDate:'', meetingOutcome:'nao_realizada', meetingNotes:'',
      proposalPresented:false, proposalSent:false, proposalSentAt:'', signatureStatus:'nao_aplicavel', offeredSolution:'',
      nextAction:'', nextActionDate:'', decisionDate:'', lastMovementAt:today(), lostReason:'', commercialNotes:'', probabilityOverride:'', commercialHistory:[],
      reportShowCosts:false, reportCostTitle:'Investimento para implementação', reportCostValue:'', reportCostDetails:''
    };
  }

  function saveOpportunity(openCase = false) {
    const companyName = String(document.getElementById('risk-company')?.value || '').trim();
    const cnpj = String(document.getElementById('risk-cnpj')?.value || '').trim();
    const answers = readAnswers();
    const result = currentResult();
    const db = loadDB();
    let lead = db.leads.find(item => (cnpj && item.cnpj === cnpj) || (companyName && item.companyName === companyName));
    const isNew = !lead;
    if (!lead) {
      lead = leadDefaults();
      db.leads.unshift(lead);
    }

    Object.assign(lead, {
      companyName: companyName || lead.companyName || 'Empresa em prospecção',
      cnpj: cnpj || lead.cnpj || '',
      activeExecution: answers.execution,
      recentBlock: answers.block,
      certificationNeed: answers.cnd ? 'alta' : (lead.certificationNeed || 'media'),
      collectionRiskAnswers: answers,
      collectionRiskScore: result.score,
      collectionRiskBand: result.band,
      collectionRiskStrategy: result.strategyTitle,
      collectionRiskComplexity: result.complexity,
      collectionRiskPriority: result.priority,
      collectionRiskFronts: result.fronts,
      offeredSolution: result.opportunity,
      updatedAt: today(),
      lastMovementAt: today()
    });

    if (!Array.isArray(lead.commercialHistory)) lead.commercialHistory = [];
    lead.commercialHistory.push({
      date:new Date().toLocaleString('pt-BR'),
      title:isNew ? 'Oportunidade criada pela calculadora de risco' : 'Risco de cobrança reavaliado',
      note:`Risco ${result.band} (${result.score}/100). Estratégia indicada: ${result.strategyTitle}.`
    });

    saveDB(db);
    localStorage.setItem(CURRENT_CASE_KEY, lead.id);
    notify(isNew ? 'Oportunidade criada.' : 'Oportunidade atualizada.');

    if (openCase) {
      localStorage.setItem(OPEN_AFTER_RELOAD, lead.id);
      setTimeout(() => location.reload(), 120);
    }
  }

  function notify(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2300);
  }

  function bindWorkbench() {
    const workbench = document.getElementById('risk-workbench');
    if (!workbench || workbench.dataset.bound === 'true') return;
    workbench.dataset.bound = 'true';

    workbench.querySelectorAll('.risk-question input').forEach(input => {
      input.addEventListener('change', () => {
        input.closest('.risk-question')?.classList.toggle('selected', input.checked);
        renderResult(calculate(readAnswers()));
      });
    });

    document.getElementById('risk-calculate')?.addEventListener('click', event => {
      event.preventDefault();
      renderResult(calculate(readAnswers()));
      document.getElementById('risk-output')?.scrollIntoView({ behavior:'smooth', block:'nearest' });
    });
    document.getElementById('risk-save')?.addEventListener('click', event => { event.preventDefault(); saveOpportunity(false); });
    document.getElementById('risk-open-case')?.addEventListener('click', event => { event.preventDefault(); saveOpportunity(true); });
  }

  function install() {
    scheduled = false;
    const hero = document.querySelector('.hero-panel');
    if (!hero || document.getElementById('risk-workbench')) return;
    const caseGrid = document.querySelector('.case-start-grid');
    const wrapper = document.createElement('div');
    wrapper.innerHTML = buildWorkbench();
    const workbench = wrapper.firstElementChild;
    if (caseGrid) caseGrid.parentNode.insertBefore(workbench, caseGrid);
    else hero.insertAdjacentElement('afterend', workbench);

    const title = hero.querySelector('.hero-copy h2');
    const copy = hero.querySelector('.hero-copy p');
    const eyebrow = hero.querySelector('.hero-copy .eyebrow');
    if (eyebrow) eyebrow.textContent = 'Central de Diagnóstico e Simulação';
    if (title) title.textContent = 'Comece pelo risco. Encontre a oportunidade. Estruture a estratégia.';
    if (copy) copy.textContent = 'Use as calculadoras para mapear Reforma Tributária, débitos da União, cobrança, execução, capacidade financeira e caminhos de regularização. Depois salve o resultado como oportunidade e acompanhe a pré-venda.';
    bindWorkbench();
  }

  function scheduleInstall() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(install);
  }

  const observer = new MutationObserver(scheduleInstall);
  observer.observe(document.documentElement, { childList:true, subtree:true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleInstall);
  else scheduleInstall();
})();
