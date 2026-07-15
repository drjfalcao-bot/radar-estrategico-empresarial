(() => {
  'use strict';

  const ROOT_ID = 'radar-report-builder';
  const STYLE_ID = 'radar-report-builder-style';
  const CURRENT_KEYS = ['radar_current_case_id', 'radar_current_lead_id', 'radar_estrategico_current_case_id'];
  const DEFAULT_CONFIG = {
    executiveSummary: true,
    profile: true,
    rtRate: true,
    financialRate: true,
    fiscalRate: true,
    collectionRate: true,
    fiscalPosition: true,
    simulations: true,
    executions: true,
    strategy: true,
    fronts: true,
    actionPlan: true,
    notes: false,
    nextSteps: true,
    additionalText: ''
  };

  const txt = (value) => String(value ?? '');
  const num = (value) => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const raw = txt(value).trim();
    if (!raw) return 0;
    const normalized = raw.includes(',')
      ? raw.replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '')
      : raw.replace(/[^0-9.-]/g, '');
    return Number(normalized) || 0;
  };
  const esc = (value) => txt(value).replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));
  const brl = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(num(value));
  const integer = (value) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(num(value));
  const dateBR = (value = new Date()) => {
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('pt-BR');
  };
  const yesNo = (value) => value ? 'Sim' : 'Não';
  const cleanCnpj = (value) => txt(value).replace(/\D/g, '');

  const maps = {
    taxRegime: {
      simples: 'Simples Nacional', presumido: 'Lucro Presumido', real: 'Lucro Real', mei: 'MEI',
      nao_informado: 'Não informado', '': 'Não informado'
    },
    cadastralStatus: {
      ativa: 'Ativa', inapta: 'Inapta', suspensa: 'Suspensa', baixada: 'Baixada',
      nao_informado: 'Não informado', '': 'Não informado'
    },
    businessPhase: {
      crescimento: 'Crescimento', estavel: 'Estável', pressao_financeira: 'Pressão financeira',
      reorganizacao: 'Reorganização', crise: 'Crise', encerramento: 'Encerramento',
      nao_informado: 'Não informado', '': 'Não informado'
    },
    capag: { a: 'A', b: 'B', c: 'C', d: 'D', A: 'A', B: 'B', C: 'C', D: 'D', nao_sei: 'Não informada', '': 'Não informada' },
    revenueBand: {
      sem_faturamento: 'Sem faturamento', ate_100: 'Até R$ 100 mil/mês', de_100_a_500: 'R$ 100 mil a R$ 500 mil/mês',
      de_500_a_2m: 'R$ 500 mil a R$ 2 milhões/mês', de_2m_a_10m: 'R$ 2 milhões a R$ 10 milhões/mês',
      acima_10m: 'Acima de R$ 10 milhões/mês', nao_informado: 'Não informado', '': 'Não informado'
    }
  };

  function label(mapName, value) {
    const key = txt(value);
    return maps[mapName]?.[key] || key.replace(/_/g, ' ').replace(/^./, (char) => char.toUpperCase()) || 'Não informado';
  }

  function databaseContext() {
    const keys = [];
    if (window.RadarCloud?.dbKey) keys.push(window.RadarCloud.dbKey);
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key && !keys.includes(key)) keys.push(key);
    }
    for (const key of keys) {
      try {
        const db = JSON.parse(localStorage.getItem(key) || 'null');
        if (db && Array.isArray(db.leads) && db.settings) return { key, db };
      } catch (_) {}
    }
    return null;
  }

  function pageIdentity() {
    const header = document.querySelector('.case-head');
    const source = header?.textContent || document.querySelector('main')?.textContent || '';
    const cnpj = cleanCnpj(source.match(/\d{2}\.?\d{3}\.?\d{3}\/\d{4}-?\d{2}/)?.[0] || '');
    const title = header?.querySelector('h1')?.textContent?.trim() || '';
    return { cnpj, title };
  }

  function currentId() {
    for (const key of CURRENT_KEYS) {
      const value = txt(localStorage.getItem(key)).replace(/^"|"$/g, '');
      if (value) return value;
    }
    return '';
  }

  function context() {
    const base = databaseContext();
    if (!base) return null;
    const identity = pageIdentity();
    let lead = null;
    if (identity.cnpj) lead = base.db.leads.find((item) => cleanCnpj(item.cnpj) === identity.cnpj) || null;
    if (!lead && identity.title && !/^nova empresa$/i.test(identity.title)) {
      lead = base.db.leads.find((item) => txt(item.companyName).trim() === identity.title) || null;
    }
    const id = currentId();
    if (!lead && id) lead = base.db.leads.find((item) => txt(item.id) === id) || null;
    return lead ? { ...base, lead } : null;
  }

  function sessionProfile() {
    const profile = window.RadarCloud?.profile || null;
    if (profile) return {
      name: profile.full_name || '',
      title: profile.professional_title || '',
      phone: profile.phone || '',
      email: profile.email || ''
    };
    for (const key of ['radar_session_v3', 'radar_session_v2', 'radar_estrategico_session_v3']) {
      try {
        const data = JSON.parse(localStorage.getItem(key) || 'null');
        if (data) return {
          name: data.name || '', title: data.professionalTitle || '', phone: data.phone || '', email: data.email || ''
        };
      } catch (_) {}
    }
    return { name: '', title: '', phone: '', email: '' };
  }

  function configFor(lead) {
    return { ...DEFAULT_CONFIG, ...(lead.reportConfig || {}) };
  }

  function saveContext(ctx) {
    ctx.lead.updatedAt = new Date().toISOString();
    localStorage.setItem(ctx.key, JSON.stringify(ctx.db));
    window.dispatchEvent(new CustomEvent('radar:lead-updated', { detail: { leadId: ctx.lead.id, source: 'report-builder' } }));
    window.dispatchEvent(new CustomEvent('radar:case-updated', { detail: { leadId: ctx.lead.id, source: 'report-builder' } }));
  }

  function numberFromAliases(lead, aliases) {
    for (const alias of aliases) {
      const value = alias.split('.').reduce((current, part) => current?.[part], lead);
      if (value !== undefined && value !== null && txt(value).trim() !== '') return num(value);
    }
    return 0;
  }

  function scoreFromPage(name) {
    const nodes = [...document.querySelectorAll('div,span,strong,small')]
      .filter((node) => node.children.length === 0 && txt(node.textContent).trim() === name);
    for (const node of nodes) {
      let parent = node.parentElement;
      for (let depth = 0; depth < 4 && parent; depth += 1, parent = parent.parentElement) {
        const text = txt(parent.textContent).replace(/\s+/g, ' ');
        const index = text.indexOf(name);
        const match = text.slice(index + name.length).match(/\b(100|[1-9]?\d)\b/);
        if (match) return Number(match[1]);
      }
    }
    return 0;
  }

  function score(lead, type) {
    const aliases = {
      rt: ['rtScore', 'scores.rt', 'rates.rt', 'ratings.rt'],
      financial: ['financialScore', 'financeScore', 'scores.financial', 'rates.financial', 'ratings.financial'],
      fiscal: ['fiscalScore', 'scores.fiscal', 'rates.fiscal', 'ratings.fiscal'],
      collection: ['collectionRiskScore', 'collectionScore', 'scores.collection', 'rates.collection', 'ratings.collection']
    }[type] || [];
    const value = numberFromAliases(lead, aliases);
    if (value) return Math.max(0, Math.min(100, Math.round(value)));
    const pageLabel = { rt: 'RT-Score', financial: 'Financeiro', fiscal: 'Fiscal', collection: 'Cobrança' }[type];
    return Math.max(0, Math.min(100, Math.round(scoreFromPage(pageLabel))));
  }

  function scoreBand(value) {
    if (value >= 80) return { label: 'Crítico', className: 'critical' };
    if (value >= 60) return { label: 'Elevado', className: 'high' };
    if (value >= 40) return { label: 'Atenção', className: 'attention' };
    return { label: 'Controlado', className: 'controlled' };
  }

  function scoreCard(title, value) {
    const band = scoreBand(value);
    return `<article class="rr-score ${band.className}"><span>${esc(title)}</span><strong>${integer(value)}</strong><small>${esc(band.label)}</small></article>`;
  }

  function debtData(lead) {
    const rfb = num(lead.rfbDebt);
    const simple = num(lead.pgfnSimple);
    const prev = num(lead.pgfnPrev);
    const other = num(lead.pgfnOther) + num(lead.pgfnTrib);
    const pgfn = simple + prev + other;
    return { rfb, simple, prev, other, pgfn, total: rfb + pgfn };
  }

  function scenarioData(lead) {
    const debts = debtData(lead);
    const core = window.RadarCalculatorCore;
    if (!core) return { debts, rfb: null, pgfn: null, reduction: 0 };
    const rfb = core.calculateRfb({
      debt: debts.rfb,
      mode: lead.reparcelment || 'nenhum',
      customEntryRate: num(lead.rfbCustomEntryRateOverride),
      totalTerm: num(lead.rfbTermOverride) || 60,
      minimum: num(lead.rfbMinInstallmentOverride) || 500
    });
    const pgfn = core.calculatePgfn({
      simple: debts.simple,
      prev: debts.prev,
      other: debts.other,
      mode: lead.pgfnModality || 'parametrizada',
      entryRate: num(lead.pgfnEntryRateOverride) || 6,
      entryMonths: num(lead.pgfnEntryMonthsOverride) || 12,
      discount: num(lead.pgfnDiscountOverride) || 35,
      totalTerm: num(lead.pgfnTermOverride) || 145,
      prevTotalTerm: num(lead.pgfnPrevTermOverride) || 60,
      minimum: num(lead.pgfnMinInstallmentOverride) || 100,
      smallValueLimit: num(lead.smallValueLimitOverride) || 0
    });
    return { debts, rfb, pgfn, reduction: num(pgfn.reduction) };
  }

  function listValues(value) {
    if (Array.isArray(value)) return value.map((item) => typeof item === 'string' ? item : (item.title || item.name || item.label || '')).filter(Boolean);
    if (typeof value === 'string') return value.split(/\n|;/).map((item) => item.trim()).filter(Boolean);
    return [];
  }

  function fronts(lead) {
    const candidates = [lead.selectedFronts, lead.strategyFronts, lead.collectionRiskFronts, lead.fronts, lead.identifiedFronts];
    const merged = candidates.flatMap(listValues);
    return [...new Set(merged)];
  }

  function actionPlan(lead) {
    const candidates = [lead.manualPlan, lead.actionPlan, lead.strategyPlan, lead.plan];
    for (const candidate of candidates) {
      const values = listValues(candidate);
      if (values.length) return values;
    }
    return [
      'Consolidar documentos e informações relevantes do caso.',
      'Validar riscos, elegibilidade e restrições aplicáveis.',
      'Comparar o cenário atual com as alternativas de regularização.',
      'Definir cronograma de implementação e responsáveis.',
      'Acompanhar a decisão e a formalização das medidas aprovadas.'
    ];
  }

  function notes(lead) {
    const values = Array.isArray(lead.caseNotes) ? lead.caseNotes : (Array.isArray(lead.notes) ? lead.notes : []);
    return values
      .filter((item) => item && (item.includeInReport || item.pinned || item.showInReport))
      .slice(0, 8)
      .map((item) => ({ title: item.title || item.category || 'Registro', body: item.body || item.text || item.note || '' }))
      .filter((item) => item.body);
  }

  function executionInfo(lead) {
    const count = Math.max(0, Math.round(num(lead.processCount)));
    const flags = {
      execution: Boolean(lead.execution), citation: Boolean(lead.citation), block: Boolean(lead.block),
      seizure: Boolean(lead.seizure), expropriation: Boolean(lead.expropriation), guarantee: Boolean(lead.guarantee),
      exposedAssets: Boolean(lead.exposedAssets), priorBlocks: Boolean(lead.priorBlocks)
    };
    let status = 'Sem execução fiscal informada na etapa atual.';
    let level = 'Monitoramento';
    if (flags.expropriation) { status = 'Há indicação de atos expropriatórios, exigindo tratamento processual prioritário.'; level = 'Prioridade máxima'; }
    else if (flags.seizure) { status = 'Há penhora informada, com necessidade de leitura processual e definição de resposta.'; level = 'Prioridade elevada'; }
    else if (flags.block) { status = 'Há bloqueio informado, com impacto potencial sobre caixa e continuidade operacional.'; level = 'Prioridade elevada'; }
    else if (flags.citation) { status = 'Há execução com citação informada, recomendando validação imediata de prazo e defesa.'; level = 'Atenção imediata'; }
    else if (flags.execution) { status = 'Há execução fiscal em curso, ainda sem ato constritivo informado nesta análise.'; level = 'Acompanhamento processual'; }
    return { count, flags, status, level };
  }

  function profileRows(lead) {
    return [
      ['Atividade', lead.activity || lead.segment || 'Não informada'],
      ['Regime tributário', label('taxRegime', lead.taxRegime)],
      ['Situação cadastral', label('cadastralStatus', lead.cadastralStatus)],
      ['Momento empresarial', label('businessPhase', lead.businessPhase)],
      ['Faturamento', lead.revenueMonthly ? `${brl(lead.revenueMonthly)} por mês` : label('revenueBand', lead.revenueBand)],
      ['Empregados ativos', lead.employees || 0],
      ['Empresas no grupo', lead.groupCompanies || 1],
      ['Objetivo informado', lead.businessGoal || lead.posture || 'Não informado']
    ];
  }

  function executiveSummary(lead, scenario) {
    const company = lead.companyName || 'A empresa analisada';
    const status = label('cadastralStatus', lead.cadastralStatus).toLowerCase();
    const phase = label('businessPhase', lead.businessPhase).toLowerCase();
    const debtText = scenario.debts.total > 0 ? `A análise preliminar identificou passivo nominal de ${brl(scenario.debts.total)}` : 'A análise encontra-se em fase de consolidação do passivo';
    const pressure = lead.cashPressure && lead.cashPressure !== 'nao_informado' ? `, em contexto de ${txt(lead.cashPressure).replace(/_/g, ' ')} pressão de caixa` : '';
    return `${company} encontra-se ${status} e em fase de ${phase}. ${debtText}${pressure}. Os dados indicam a necessidade de coordenar regularização fiscal, preservação de caixa e tratamento dos riscos operacionais identificados. As projeções apresentadas são preliminares e deverão ser confirmadas após validação documental, processual e de elegibilidade.`;
  }

  function strategyText(lead, execution) {
    const title = lead.manualStrategyTitle || lead.collectionRiskStrategy || lead.offeredSolution || 'Gestão integrada do risco fiscal e financeiro';
    const summary = lead.manualStrategySummary || lead.strategySummary || execution.status;
    return { title, summary };
  }

  function nextSteps(lead) {
    const items = [];
    if (lead.nextAction) items.push(lead.nextAction);
    if (lead.nextActionDate) items.push(`Retorno programado para ${dateBR(lead.nextActionDate)}.`);
    if (!items.length) {
      items.push('Confirmar os documentos necessários à validação do diagnóstico.');
      items.push('Definir o cenário prioritário e a capacidade de implementação.');
      items.push('Formalizar o escopo técnico e o cronograma de atuação.');
    }
    return items;
  }

  function section(title, eyebrow, body, className = '') {
    return `<section class="rr-section ${className}"><div class="rr-section-head"><small>${esc(eyebrow)}</small><h2>${esc(title)}</h2></div>${body}</section>`;
  }

  function table(rows) {
    return `<div class="rr-table">${rows.map(([key, value]) => `<div><span>${esc(key)}</span><strong>${esc(value)}</strong></div>`).join('')}</div>`;
  }

  function reportHTML(ctx, cfg) {
    const lead = ctx.lead;
    const profile = sessionProfile();
    const scenario = scenarioData(lead);
    const execution = executionInfo(lead);
    const strategy = strategyText(lead, execution);
    const selectedFronts = fronts(lead);
    const plan = actionPlan(lead);
    const selectedNotes = notes(lead);
    const rateCards = [];
    if (cfg.rtRate) rateCards.push(scoreCard('Reforma Tributária', score(lead, 'rt')));
    if (cfg.financialRate) rateCards.push(scoreCard('Financeiro', score(lead, 'financial')));
    if (cfg.fiscalRate) rateCards.push(scoreCard('Fiscal', score(lead, 'fiscal')));
    if (cfg.collectionRate) rateCards.push(scoreCard('Cobrança', score(lead, 'collection')));

    const blocks = [];
    if (cfg.executiveSummary) {
      blocks.push(section('Síntese executiva', 'LEITURA DO CASO', `<p class="rr-lead">${esc(executiveSummary(lead, scenario))}</p>`));
    }
    if (cfg.profile) {
      blocks.push(section('Perfil empresarial', 'CONTEXTO', table(profileRows(lead))));
    }
    if (rateCards.length) {
      blocks.push(section('Indicadores de risco', 'RATINGS', `<div class="rr-scores">${rateCards.join('')}</div><p class="rr-foot">Indicadores gerenciais construídos a partir das informações fornecidas e destinados à leitura comparativa do caso.</p>`));
    }
    if (cfg.fiscalPosition) {
      const fiscalRows = [
        ['Receita Federal', brl(scenario.debts.rfb)],
        ['PGFN — Simples Nacional', brl(scenario.debts.simple)],
        ['PGFN — Previdenciário', brl(scenario.debts.prev)],
        ['PGFN — Demais débitos', brl(scenario.debts.other)],
        ['Passivo nominal consolidado', brl(scenario.debts.total)],
        ['CAPAG informada', label('capag', lead.capag)],
        ['Impedimento de transação', yesNo(lead.impediment)],
        ['Necessidade de certidão', lead.certificateNeed ? txt(lead.certificateNeed).replace(/_/g, ' ') : 'Não informada']
      ];
      blocks.push(section('Posição fiscal consolidada', 'PASSIVO E CONDIÇÕES', table(fiscalRows)));
    }
    if (cfg.simulations && scenario.rfb && scenario.pgfn) {
      const reduction = scenario.reduction;
      const rfbDescription = scenario.debts.rfb > 0
        ? `<div class="rr-sim-card"><span>Receita Federal</span><strong>${brl(scenario.debts.rfb)}</strong><p>Entrada projetada: <b>${brl(scenario.rfb.entry)}</b><br>Saldo: ${scenario.rfb.months}x de ${brl(scenario.rfb.installment)}</p></div>`
        : '';
      const pgfnDescription = scenario.debts.pgfn > 0
        ? `<div class="rr-sim-card"><span>PGFN</span><strong>${brl(scenario.debts.pgfn)}</strong><p>Fase 1: ${num(lead.pgfnEntryMonthsOverride) || 12}x de <b>${brl(scenario.pgfn.entryInstallment)}</b><br>Fase 2: ${scenario.pgfn.balanceMonths}x de ${brl(scenario.pgfn.phaseTwoInstallment)}</p></div>`
        : '';
      blocks.push(section('Projeções de regularização', 'SIMULAÇÕES', `<div class="rr-sim-grid">${rfbDescription}${pgfnDescription}<div class="rr-saving"><span>Potencial de redução estimado</span><strong>${brl(reduction)}</strong><small>Estimativa condicionada à modalidade, elegibilidade e validação dos débitos.</small></div></div>`));
    }
    if (cfg.executions) {
      const flags = execution.flags;
      const rows = [
        ['Processos informados', execution.count || 'Não quantificado'],
        ['Execução fiscal', yesNo(flags.execution)],
        ['Citação', yesNo(flags.citation)],
        ['Bloqueio', yesNo(flags.block)],
        ['Penhora', yesNo(flags.seizure)],
        ['Atos expropriatórios', yesNo(flags.expropriation)],
        ['Garantia existente', yesNo(flags.guarantee)],
        ['Ativos expostos', yesNo(flags.exposedAssets)]
      ];
      blocks.push(section('Resumo das execuções', 'CONTENCIOSO E COBRANÇA', `<div class="rr-execution"><div><span>Nível de atenção</span><strong>${esc(execution.level)}</strong><p>${esc(execution.status)}</p></div>${table(rows)}</div>`));
    }
    if (cfg.strategy) {
      blocks.push(section(strategy.title, 'ESTRATÉGIA INDICADA', `<p class="rr-lead">${esc(strategy.summary)}</p>`));
    }
    if (cfg.fronts && selectedFronts.length) {
      blocks.push(section('Frentes de atuação', 'ESCOPO TÉCNICO', `<div class="rr-chips">${selectedFronts.map((item) => `<span>${esc(item)}</span>`).join('')}</div>`));
    }
    if (cfg.actionPlan) {
      blocks.push(section('Plano de atuação', 'IMPLEMENTAÇÃO', `<ol class="rr-plan">${plan.map((item) => `<li>${esc(item)}</li>`).join('')}</ol>`));
    }
    if (cfg.notes && selectedNotes.length) {
      blocks.push(section('Registros selecionados', 'CADERNO DO CASO', `<div class="rr-notes">${selectedNotes.map((item) => `<article><strong>${esc(item.title)}</strong><p>${esc(item.body)}</p></article>`).join('')}</div>`));
    }
    if (cfg.additionalText) {
      blocks.push(section('Observações complementares', 'NOTA TÉCNICA', `<p class="rr-lead">${esc(cfg.additionalText)}</p>`));
    }
    if (cfg.nextSteps) {
      blocks.push(section('Próximos passos', 'ENCAMINHAMENTO', `<ul class="rr-next">${nextSteps(lead).map((item) => `<li>${esc(item)}</li>`).join('')}</ul>`));
    }

    return `<article class="rr-document">
      <header class="rr-cover">
        <div class="rr-brand"><span>RE</span><div><strong>Radar Estratégico Empresarial</strong><small>Relatório de análise preliminar</small></div></div>
        <div class="rr-cover-grid"><div><small>EMPRESA</small><h1>${esc(lead.companyName || 'Empresa não identificada')}</h1><p>${esc(lead.cnpj || 'CNPJ não informado')}</p></div><div class="rr-date"><small>EMISSÃO</small><strong>${dateBR()}</strong></div></div>
      </header>
      <div class="rr-body">${blocks.join('')}</div>
      <footer class="rr-signature">
        <div><span>Responsável pela análise</span><strong>${esc(profile.name || lead.owner || 'Responsável não identificado')}</strong><small>${esc(profile.title || 'Especialista Fiscal')}${profile.phone ? ` · ${esc(profile.phone)}` : ''}</small></div>
        <p>Documento elaborado a partir das informações disponíveis na etapa de pré-venda. As simulações são nominais e preliminares, não constituem promessa de resultado e dependem da validação de documentos, processos, elegibilidade e regras vigentes.</p>
      </footer>
    </article>`;
  }

  function option(key, labelText, checked, description = '') {
    return `<label class="rr-option"><input type="checkbox" name="${key}" ${checked ? 'checked' : ''}><span><strong>${esc(labelText)}</strong>${description ? `<small>${esc(description)}</small>` : ''}</span></label>`;
  }

  function controlsHTML(cfg) {
    return `<aside class="rr-controls">
      <div class="rr-control-head"><div><small>MONTAGEM DO DOCUMENTO</small><h2>Relatório autoconstruído</h2><p>Os dados são carregados automaticamente. Desmarque o que não deve aparecer para o cliente.</p></div><span>Identificação e assinatura fixas</span></div>
      <div class="rr-control-grid">
        <section><h3>Blocos do relatório</h3>
          ${option('executiveSummary', 'Síntese executiva', cfg.executiveSummary)}
          ${option('profile', 'Perfil empresarial', cfg.profile)}
          ${option('fiscalPosition', 'Posição fiscal consolidada', cfg.fiscalPosition)}
          ${option('simulations', 'Simulações e potencial de redução', cfg.simulations)}
          ${option('executions', 'Resumo das execuções', cfg.executions, 'Processos, citação, bloqueio, penhora, garantia e nível de atenção.')}
          ${option('strategy', 'Estratégia indicada', cfg.strategy)}
          ${option('fronts', 'Frentes de atuação', cfg.fronts)}
          ${option('actionPlan', 'Plano de atuação', cfg.actionPlan)}
          ${option('notes', 'Registros selecionados do caderno', cfg.notes, 'Inclui apenas notas marcadas ou fixadas.')}
          ${option('nextSteps', 'Próximos passos', cfg.nextSteps)}
        </section>
        <section><h3>Indicadores do cliente</h3>
          ${option('rtRate', 'Rate Reforma Tributária', cfg.rtRate)}
          ${option('financialRate', 'Rate Financeiro', cfg.financialRate)}
          ${option('fiscalRate', 'Rate Fiscal', cfg.fiscalRate)}
          ${option('collectionRate', 'Rate de Cobrança', cfg.collectionRate)}
          <div class="rr-internal-note"><strong>Closing Rate</strong><p>Permanece interno e não é exibido no relatório do cliente.</p></div>
          <label class="rr-text"><span>Observação complementar</span><textarea name="additionalText" rows="5" placeholder="Inclua uma conclusão, ressalva ou orientação específica.">${esc(cfg.additionalText || '')}</textarea></label>
        </section>
      </div>
      <div class="rr-actions"><button type="button" data-reset>Restaurar padrão</button><button type="button" data-save>Salvar versão no caderno</button><button type="button" data-print>Imprimir relatório</button></div>
      <div class="rr-status" data-status>Configuração salva automaticamente neste caso.</div>
    </aside>`;
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${ROOT_ID}{display:grid;gap:18px;margin:0 0 22px;font-family:Inter,Arial,sans-serif;color:#0b2942}
      #${ROOT_ID} *{box-sizing:border-box}
      #${ROOT_ID} .rr-controls{background:#fff;border:1px solid #cfe0ea;border-radius:18px;padding:22px;box-shadow:0 8px 28px rgba(8,42,67,.05)}
      #${ROOT_ID} .rr-control-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;margin-bottom:18px}
      #${ROOT_ID} .rr-control-head small{font-size:10px;letter-spacing:.12em;color:#087bb7;font-weight:800}
      #${ROOT_ID} .rr-control-head h2{font-size:23px;margin:4px 0;color:#082b49}
      #${ROOT_ID} .rr-control-head p{margin:0;color:#60788a;font-size:12px;max-width:720px}
      #${ROOT_ID} .rr-control-head>span{background:#edf6fb;color:#0a628f;border-radius:999px;padding:8px 11px;font-size:10px;font-weight:800;white-space:nowrap}
      #${ROOT_ID} .rr-control-grid{display:grid;grid-template-columns:1.2fr .8fr;gap:14px}
      #${ROOT_ID} .rr-control-grid>section{border:1px solid #dce8ef;border-radius:14px;padding:15px}
      #${ROOT_ID} .rr-control-grid h3{margin:0 0 11px;font-size:13px;color:#123d5c}
      #${ROOT_ID} .rr-option{display:flex;align-items:flex-start;gap:9px;padding:9px 5px;border-bottom:1px solid #edf2f5;cursor:pointer}
      #${ROOT_ID} .rr-option:last-of-type{border-bottom:0}
      #${ROOT_ID} .rr-option input{margin-top:2px;accent-color:#0b83bf}
      #${ROOT_ID} .rr-option strong{display:block;font-size:11px;color:#163c57}
      #${ROOT_ID} .rr-option small{display:block;font-size:9px;color:#708696;margin-top:2px;line-height:1.4}
      #${ROOT_ID} .rr-internal-note{margin-top:12px;padding:11px;background:#f1f5f8;border-radius:10px}
      #${ROOT_ID} .rr-internal-note strong{font-size:10px;color:#2d526b}
      #${ROOT_ID} .rr-internal-note p{font-size:9px;color:#718696;margin:3px 0 0}
      #${ROOT_ID} .rr-text{display:grid;gap:6px;margin-top:12px}
      #${ROOT_ID} .rr-text span{font-size:10px;font-weight:800;color:#365a70;text-transform:uppercase;letter-spacing:.05em}
      #${ROOT_ID} textarea{width:100%;border:1px solid #cadbe5;border-radius:10px;padding:11px;font:inherit;color:#123650;resize:vertical}
      #${ROOT_ID} .rr-actions{display:flex;justify-content:flex-end;gap:9px;flex-wrap:wrap;margin-top:16px}
      #${ROOT_ID} button{border:1px solid #c8dbe6;background:#f3f8fb;color:#155678;border-radius:10px;padding:10px 13px;font-weight:800;font-size:10px;cursor:pointer}
      #${ROOT_ID} button[data-print]{background:#087bb7;color:#fff;border-color:#087bb7}
      #${ROOT_ID} .rr-status{font-size:9px;color:#6a8292;text-align:right;margin-top:8px}
      #${ROOT_ID} .rr-document{background:#fff;border:1px solid #cfe0ea;border-radius:18px;overflow:hidden;box-shadow:0 12px 40px rgba(8,42,67,.08)}
      #${ROOT_ID} .rr-cover{background:linear-gradient(135deg,#06223d,#0b4d78);color:#fff;padding:32px 36px 30px}
      #${ROOT_ID} .rr-brand{display:flex;align-items:center;gap:11px;margin-bottom:34px}
      #${ROOT_ID} .rr-brand>span{width:42px;height:42px;border-radius:12px;background:#2aa8ee;display:grid;place-items:center;font-weight:900}
      #${ROOT_ID} .rr-brand strong{display:block;font-size:13px}.rr-brand small{font-size:9px;opacity:.72}
      #${ROOT_ID} .rr-cover-grid{display:grid;grid-template-columns:1fr auto;gap:24px;align-items:end}
      #${ROOT_ID} .rr-cover-grid small{font-size:9px;letter-spacing:.15em;font-weight:800;opacity:.7}
      #${ROOT_ID} .rr-cover h1{font-size:28px;line-height:1.12;margin:7px 0 8px;color:#fff}
      #${ROOT_ID} .rr-cover p{margin:0;font-size:12px;opacity:.82}
      #${ROOT_ID} .rr-date{text-align:right}.rr-date strong{display:block;font-size:15px;margin-top:5px}
      #${ROOT_ID} .rr-body{padding:32px 36px}
      #${ROOT_ID} .rr-section{padding:0 0 27px;margin:0 0 27px;border-bottom:1px solid #e2ebf0;break-inside:avoid}
      #${ROOT_ID} .rr-section:last-child{border-bottom:0;margin-bottom:0}
      #${ROOT_ID} .rr-section-head small{font-size:9px;letter-spacing:.14em;font-weight:900;color:#0780ba}
      #${ROOT_ID} .rr-section-head h2{font-size:19px;color:#0b2e49;margin:5px 0 14px}
      #${ROOT_ID} .rr-lead{font-size:12px;line-height:1.75;color:#3e5b70;margin:0}
      #${ROOT_ID} .rr-table{display:grid;grid-template-columns:1fr 1fr;border:1px solid #dce7ed;border-radius:12px;overflow:hidden}
      #${ROOT_ID} .rr-table>div{padding:11px 13px;border-bottom:1px solid #e5edf2;display:grid;gap:3px}
      #${ROOT_ID} .rr-table>div:nth-child(odd){border-right:1px solid #e5edf2}
      #${ROOT_ID} .rr-table>div:nth-last-child(-n+2){border-bottom:0}
      #${ROOT_ID} .rr-table span{font-size:8px;text-transform:uppercase;letter-spacing:.05em;color:#728897;font-weight:800}
      #${ROOT_ID} .rr-table strong{font-size:11px;color:#173d58}
      #${ROOT_ID} .rr-scores{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
      #${ROOT_ID} .rr-score{border:1px solid #d7e4ec;border-top:4px solid #1e9d6b;border-radius:11px;padding:12px;background:#fff}
      #${ROOT_ID} .rr-score.attention{border-top-color:#df9700}.rr-score.high{border-top-color:#e14b60}.rr-score.critical{border-top-color:#b90d31}
      #${ROOT_ID} .rr-score span{display:block;font-size:8px;text-transform:uppercase;color:#6b8292;font-weight:800}
      #${ROOT_ID} .rr-score strong{display:block;font-size:25px;margin:4px 0 0;color:#0a2f4b}
      #${ROOT_ID} .rr-score small{font-size:9px;color:#60788a}
      #${ROOT_ID} .rr-foot{font-size:8px;color:#7b8f9c;margin:9px 0 0}
      #${ROOT_ID} .rr-sim-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      #${ROOT_ID} .rr-sim-card{border:1px solid #d9e6ed;border-radius:12px;padding:14px;background:#f9fbfc}
      #${ROOT_ID} .rr-sim-card span,.rr-saving span{display:block;font-size:8px;text-transform:uppercase;letter-spacing:.07em;color:#6f8594;font-weight:900}
      #${ROOT_ID} .rr-sim-card strong{display:block;font-size:17px;color:#0b3c5c;margin:4px 0 7px}
      #${ROOT_ID} .rr-sim-card p{font-size:9px;line-height:1.6;color:#587184;margin:0}
      #${ROOT_ID} .rr-saving{grid-column:1/-1;background:linear-gradient(135deg,#e7f8f1,#f4fcf8);border:1px solid #b8e5d2;border-radius:12px;padding:16px}
      #${ROOT_ID} .rr-saving strong{display:block;font-size:24px;color:#08754d;margin:5px 0}.rr-saving small{font-size:8px;color:#55806e}
      #${ROOT_ID} .rr-execution{display:grid;grid-template-columns:.8fr 1.2fr;gap:12px}
      #${ROOT_ID} .rr-execution>div:first-child{background:#fff6e7;border:1px solid #f0d29a;border-radius:12px;padding:15px}
      #${ROOT_ID} .rr-execution>div:first-child span{font-size:8px;text-transform:uppercase;font-weight:900;color:#936400}
      #${ROOT_ID} .rr-execution>div:first-child strong{display:block;font-size:17px;color:#6d4a00;margin:5px 0}
      #${ROOT_ID} .rr-execution>div:first-child p{font-size:9px;line-height:1.55;color:#725f38;margin:0}
      #${ROOT_ID} .rr-chips{display:flex;flex-wrap:wrap;gap:7px}.rr-chips span{background:#edf6fb;color:#0a608c;border-radius:999px;padding:7px 10px;font-size:9px;font-weight:800}
      #${ROOT_ID} .rr-plan{margin:0;padding:0;list-style:none;counter-reset:item;display:grid;gap:8px}
      #${ROOT_ID} .rr-plan li{counter-increment:item;display:grid;grid-template-columns:25px 1fr;align-items:start;gap:9px;font-size:10px;color:#3d5b70;line-height:1.55}
      #${ROOT_ID} .rr-plan li:before{content:counter(item);width:25px;height:25px;border-radius:8px;background:#0b79b3;color:#fff;display:grid;place-items:center;font-weight:900;font-size:9px}
      #${ROOT_ID} .rr-notes{display:grid;gap:8px}.rr-notes article{padding:12px;border-left:3px solid #0b81bd;background:#f7fafc}.rr-notes strong{font-size:10px}.rr-notes p{font-size:9px;line-height:1.55;margin:4px 0 0;color:#597184}
      #${ROOT_ID} .rr-next{margin:0;padding-left:18px;color:#3d5b70;font-size:10px;line-height:1.75}
      #${ROOT_ID} .rr-signature{padding:25px 36px 28px;background:#f3f7f9;border-top:1px solid #dce7ed;display:grid;grid-template-columns:.8fr 1.2fr;gap:30px;align-items:end}
      #${ROOT_ID} .rr-signature span{display:block;font-size:8px;text-transform:uppercase;letter-spacing:.08em;color:#6e8392;font-weight:900}
      #${ROOT_ID} .rr-signature strong{display:block;font-size:13px;color:#133a56;margin:5px 0 2px}.rr-signature small{font-size:9px;color:#60798a}
      #${ROOT_ID} .rr-signature p{font-size:7.5px;line-height:1.55;color:#718491;margin:0;text-align:right}
      @media(max-width:900px){#${ROOT_ID} .rr-control-grid,#${ROOT_ID} .rr-execution{grid-template-columns:1fr}#${ROOT_ID} .rr-scores{grid-template-columns:1fr 1fr}}
      @media(max-width:650px){#${ROOT_ID} .rr-control-head,#${ROOT_ID} .rr-cover-grid,#${ROOT_ID} .rr-signature{display:block}#${ROOT_ID} .rr-control-head>span{display:inline-block;margin-top:10px}#${ROOT_ID} .rr-body,#${ROOT_ID} .rr-cover,#${ROOT_ID} .rr-signature{padding-left:20px;padding-right:20px}#${ROOT_ID} .rr-table,#${ROOT_ID} .rr-sim-grid{grid-template-columns:1fr}#${ROOT_ID} .rr-table>div{border-right:0!important;border-bottom:1px solid #e5edf2!important}#${ROOT_ID} .rr-saving{grid-column:auto}#${ROOT_ID} .rr-signature p{text-align:left;margin-top:15px}}
      @media print{body *{visibility:hidden!important}#${ROOT_ID},#${ROOT_ID} .rr-document,#${ROOT_ID} .rr-document *{visibility:visible!important}#${ROOT_ID} .rr-controls{display:none!important}#${ROOT_ID}{position:absolute;left:0;top:0;width:100%;margin:0}#${ROOT_ID} .rr-document{border:0;box-shadow:none;border-radius:0}#${ROOT_ID} .rr-cover{-webkit-print-color-adjust:exact;print-color-adjust:exact}#${ROOT_ID} .rr-section{break-inside:avoid}}
    `;
    document.head.appendChild(style);
  }

  function isVisible(element) {
    return Boolean(element && element.getClientRects().length && getComputedStyle(element).display !== 'none');
  }

  function isReportScreen() {
    const tabs = [...document.querySelectorAll('button,a,[role="tab"]')].filter((node) => txt(node.textContent).trim() === 'Relatório');
    return tabs.some((node) => node.classList.contains('active') || node.classList.contains('is-active') || node.getAttribute('aria-selected') === 'true');
  }

  function legacyReportContainer() {
    const headings = [...document.querySelectorAll('h1,h2,h3,strong')].filter((node) =>
      isVisible(node) && /Gerador de Relatório|Relatório Estratégico Empresarial|Montagem do Relatório/i.test(txt(node.textContent))
    );
    for (const heading of headings) {
      const candidate = heading.closest('section,.card,.panel,article,div');
      if (candidate && candidate.id !== ROOT_ID) return candidate;
    }
    return null;
  }

  function mount() {
    if (!isReportScreen()) return;
    const ctx = context();
    if (!ctx) return;
    injectStyle();
    let root = document.getElementById(ROOT_ID);
    const legacy = legacyReportContainer();
    if (!root) {
      root = document.createElement('section');
      root.id = ROOT_ID;
      if (legacy?.parentElement) legacy.parentElement.insertBefore(root, legacy);
      else {
        const main = document.querySelector('main') || document.getElementById('app');
        main?.appendChild(root);
      }
    }
    if (legacy && legacy !== root) {
      legacy.dataset.radarLegacyReport = 'true';
      legacy.style.display = 'none';
    }
    const cfg = configFor(ctx.lead);
    root.innerHTML = controlsHTML(cfg) + reportHTML(ctx, cfg);
    bind(root, ctx);
  }

  function bind(root, ctx) {
    const rebuild = () => {
      const cfg = { ...configFor(ctx.lead) };
      root.querySelectorAll('input[type="checkbox"][name]').forEach((input) => { cfg[input.name] = input.checked; });
      cfg.additionalText = root.querySelector('textarea[name="additionalText"]')?.value || '';
      ctx.lead.reportConfig = cfg;
      saveContext(ctx);
      root.innerHTML = controlsHTML(cfg) + reportHTML(ctx, cfg);
      bind(root, ctx);
    };

    root.querySelectorAll('input[type="checkbox"][name]').forEach((input) => input.addEventListener('change', rebuild));
    const textarea = root.querySelector('textarea[name="additionalText"]');
    let timer = null;
    textarea?.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(rebuild, 350);
    });

    root.querySelector('[data-reset]')?.addEventListener('click', () => {
      ctx.lead.reportConfig = { ...DEFAULT_CONFIG };
      saveContext(ctx);
      mount();
    });

    root.querySelector('[data-print]')?.addEventListener('click', () => window.print());

    root.querySelector('[data-save]')?.addEventListener('click', () => {
      const timestamp = new Date().toISOString();
      const note = {
        id: `report_${Date.now()}`,
        date: timestamp,
        category: 'relatorio',
        title: 'Relatório estratégico atualizado',
        body: `Versão do relatório construída em ${dateBR(timestamp)}, com os blocos selecionados para apresentação ao cliente.`,
        pinned: false,
        includeInReport: false
      };
      if (!Array.isArray(ctx.lead.caseNotes)) ctx.lead.caseNotes = [];
      ctx.lead.caseNotes.unshift(note);
      ctx.lead.reportGeneratedAt = timestamp;
      saveContext(ctx);
      const status = root.querySelector('[data-status]');
      if (status) status.textContent = 'Versão registrada no caderno do caso.';
    });
  }

  document.addEventListener('click', (event) => {
    const target = event.target.closest('button,a,[role="tab"]');
    if (target && txt(target.textContent).trim() === 'Relatório') {
      setTimeout(mount, 90);
      setTimeout(mount, 280);
    }
  }, true);
  window.addEventListener('radar:lead-updated', () => setTimeout(mount, 100));
  window.addEventListener('radar:case-updated', () => setTimeout(mount, 100));
  window.addEventListener('load', () => setTimeout(mount, 1200));
  setTimeout(mount, 1500);

  window.RadarReportBuilder = { mount, getContext: context };
})();
