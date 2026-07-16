(() => {
  'use strict';

  const ID = 'radar-notebook-commercial-hub';
  const MODAL_ID = 'radar-notebook-commercial-modal';
  let scheduled = false;

  const text = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
  const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));
  const number = (value) => window.RadarStrategicCalculatorEngine?.number?.(value) || 0;
  const money = (value) => number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const uid = (prefix) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

  function context() {
    const strategic = window.RadarStrategicCalculator?.getContext?.();
    if (strategic?.lead) return strategic;
    const lead = window.RadarExt?.currentLead?.();
    const db = window.RadarExt?.readDB?.();
    return lead && db ? { key: window.RadarExt.DB_KEY, db, lead } : null;
  }

  function persist(ctx, note) {
    const now = new Date().toISOString();
    ctx.lead.updatedAt = now;
    ctx.lead.lastMovementAt = now;
    if (note) {
      ctx.lead.notes = Array.isArray(ctx.lead.notes) ? ctx.lead.notes : [];
      ctx.lead.notes.push({
        id: uid('note'), date: now.slice(0, 10), title: note.title, body: note.body,
        tags: note.tags || ['estratégia'], pinned: false, automatic: true,
        createdAt: now, updatedAt: now
      });
    }
    localStorage.setItem(ctx.key, JSON.stringify(ctx.db));
    window.dispatchEvent(new CustomEvent('radar:case-updated', { detail: { leadId: ctx.lead.id, source: 'notebook-commercial-hub' } }));
    document.dispatchEvent(new CustomEvent('radar:lead-updated', { detail: { leadId: ctx.lead.id, source: 'notebook-commercial-hub' } }));
  }

  function notebookActive() {
    const tab = [...document.querySelectorAll('button,a,[role="tab"]')].find((node) => text(node.textContent) === 'Caderno');
    return Boolean(tab && (tab.classList.contains('active') || tab.classList.contains('is-active') || tab.getAttribute('aria-selected') === 'true'));
  }

  function notebookHeading() {
    return [...document.querySelectorAll('h1,h2,h3')].find((node) => /Caderno do Caso|Caderno/i.test(text(node.textContent))) || null;
  }

  const RISK_LABELS = {
    'RT-Score': ['Risco da Reforma Tributária', 'Risco de exposição à Reforma Tributária'],
    'Financial Rate': ['Risco de caixa', 'Risco de comprometimento de caixa'],
    'Fiscal Rate': ['Risco fiscal', 'Risco fiscal e de regularidade'],
    'Collection Rate': ['Risco de cobrança', 'Risco de cobrança e execução'],
    'Need Rate': ['Necessidade estratégica', 'Nível de necessidade estratégica'],
    'Opportunity Rate': ['Potencial da oportunidade', 'Potencial da oportunidade'],
    'Closing Rate': ['Probabilidade de fechamento', 'Probabilidade de fechamento']
  };

  function translateRiskLabels(root = document) {
    root.querySelectorAll('small,span,strong,b,label,h2,h3,h4,button').forEach((node) => {
      if (node.children.length) return;
      const current = text(node.textContent);
      const replacement = RISK_LABELS[current];
      if (!replacement) return;
      const clientDocument = Boolean(node.closest('.generated-document,.report,.ext-builder-preview,.report-preview,.proposal-preview'));
      node.textContent = replacement[clientDocument ? 1 : 0];
    });
  }

  function hubHtml(lead) {
    const diagnostic = lead.diagnosticFinal || {};
    const selected = Array.isArray(lead.reportScenarioSelections) ? lead.reportScenarioSelections.length : 0;
    const strategyReady = Boolean(text(lead.manualStrategyTitle) && text(lead.manualStrategySummary));
    const proposalReady = Boolean(lead.commercialProposal?.services?.length);
    return `<div class="nch-head"><div><span class="nch-kicker">Central de documentos e fechamento</span><h2>Do diagnóstico à contratação, dentro do Caderno.</h2><p>Revise a estratégia, monte o relatório do cliente e transforme as frentes indicadas em uma proposta totalmente editável.</p></div><span class="nch-badge">${esc(lead.companyName || 'Caso atual')}</span></div>
      <div class="nch-actions-grid">
        <article><span class="nch-step">1</span><div><small>ESTRATÉGIA</small><h3>Gerar estratégia indicada</h3><p>Use os riscos e cenários para construir a recomendação, as frentes e o plano de atuação.</p><em>${strategyReady ? 'Estratégia disponível' : 'Aguardando consolidação'}</em></div><button data-nch-strategy>${strategyReady ? 'Revisar estratégia' : 'Gerar estratégia'}</button></article>
        <article><span class="nch-step">2</span><div><small>RELATÓRIO</small><h3>Gerar diagnóstico final</h3><p>Apresente riscos em português, comparação de cenários, redução e conclusão estratégica.</p><em>${selected} cenário${selected === 1 ? '' : 's'} selecionado${selected === 1 ? '' : 's'}</em></div><button data-nch-report>Montar relatório</button></article>
        <article class="featured"><span class="nch-step">3</span><div><small>PROPOSTA</small><h3>Montar proposta comercial</h3><p>Receba indicações de serviços e edite escopo, descrição, custo e forma de pagamento.</p><em>${proposalReady ? 'Proposta em edição' : diagnostic.title ? 'Sugestões disponíveis' : 'Aguardando estratégia'}</em></div><button data-nch-proposal>${proposalReady ? 'Continuar proposta' : 'Montar proposta'}</button></article>
      </div>`;
  }

  function mountHub() {
    scheduled = false;
    translateRiskLabels();
    if (!notebookActive()) return;
    const ctx = context();
    const heading = notebookHeading();
    if (!ctx?.lead || !heading) return;
    let hub = document.getElementById(ID);
    if (!hub) {
      hub = document.createElement('section');
      hub.id = ID;
      const host = heading.closest('section,article,.card') || heading.parentElement;
      host.insertAdjacentElement('afterend', hub);
      hub.addEventListener('click', (event) => {
        if (event.target.closest('[data-nch-strategy]')) openStrategy();
        if (event.target.closest('[data-nch-report]')) openReport();
        if (event.target.closest('[data-nch-proposal]')) openProposal();
      });
    }
    const signature = JSON.stringify({
      leadId: ctx.lead.id || '',
      companyName: ctx.lead.companyName || '',
      selected: ctx.lead.reportScenarioSelections || [],
      strategyTitle: ctx.lead.manualStrategyTitle || '',
      strategySummary: ctx.lead.manualStrategySummary || '',
      diagnosticTitle: ctx.lead.diagnosticFinal?.title || '',
      proposalUpdatedAt: ctx.lead.commercialProposal?.updatedAt || ''
    });
    if (hub.dataset.signature !== signature) {
      hub.dataset.signature = signature;
      hub.dataset.leadId = String(ctx.lead.id || '');
      hub.innerHTML = hubHtml(ctx.lead);
    }
  }

  function modal() {
    let node = document.getElementById(MODAL_ID);
    if (!node) {
      node = document.createElement('div');
      node.id = MODAL_ID;
      node.className = 'nch-backdrop';
      node.addEventListener('click', (event) => {
        if (event.target === node || event.target.closest('[data-nch-close]')) node.classList.remove('show');
      });
      document.body.appendChild(node);
    }
    return node;
  }

  function openReport() {
    if (window.RadarDocumentBuilder?.open) {
      window.RadarDocumentBuilder.open('report');
      setTimeout(() => translateRiskLabels(document.getElementById('radar-doc-builder') || document), 50);
      return;
    }
    window.RadarExt?.toast?.('O construtor do relatório ainda está carregando. Tente novamente em instantes.', 'warn');
  }

  function strategyHtml(lead) {
    const diagnostic = lead.diagnosticFinal || {};
    const fronts = [...new Set([...(diagnostic.fronts || []), ...(lead.selectedFronts || [])])];
    return `<section class="nch-modal"><header><div><span class="nch-kicker">Estratégia indicada</span><h2>Transformar diagnóstico em plano de atuação</h2><p>O sistema sugere; você mantém controle total sobre o texto que seguirá para o cliente.</p></div><button data-nch-close>×</button></header><div class="nch-modal-body">
      <label class="nch-field"><span>Título da estratégia</span><input name="strategyTitle" value="${esc(lead.manualStrategyTitle || diagnostic.title || '')}"></label>
      <label class="nch-field"><span>Justificativa e recomendação</span><textarea name="strategySummary" rows="6">${esc(lead.manualStrategySummary || diagnostic.summary || '')}</textarea></label>
      <div class="nch-field"><span>Frentes indicadas</span><div class="nch-fronts">${fronts.map((front) => `<label><input type="checkbox" name="strategyFront" value="${esc(front)}" checked><span>${esc(front)}</span></label>`).join('') || '<p>Registre a simulação para gerar as frentes automáticas.</p>'}</div></div>
      <label class="nch-field"><span>Plano de atuação — uma etapa por linha</span><textarea name="strategyPlan" rows="7">${esc(lead.manualPlan || (diagnostic.plan || []).join('\n'))}</textarea></label>
      <div class="nch-next-step"><span>Próximo passo sugerido</span><strong>${esc(diagnostic.nextStep || 'Validar o escopo e formalizar a estratégia aprovada.')}</strong></div>
    </div><footer><button class="nch-secondary" data-nch-close>Cancelar</button><button class="nch-primary" data-nch-save-strategy>Salvar estratégia no Caderno</button></footer></section>`;
  }

  function openStrategy() {
    const ctx = context();
    if (!ctx?.lead) return;
    const node = modal();
    node.innerHTML = strategyHtml(ctx.lead);
    node.classList.add('show');
    node.querySelector('[data-nch-save-strategy]')?.addEventListener('click', () => {
      ctx.lead.manualStrategyTitle = text(node.querySelector('[name="strategyTitle"]')?.value);
      ctx.lead.manualStrategySummary = String(node.querySelector('[name="strategySummary"]')?.value || '').trim();
      ctx.lead.manualPlan = String(node.querySelector('[name="strategyPlan"]')?.value || '').trim();
      ctx.lead.selectedFronts = [...node.querySelectorAll('[name="strategyFront"]:checked')].map((input) => input.value);
      persist(ctx, { title: 'Estratégia final revisada', body: ctx.lead.manualStrategyTitle, tags: ['estratégia', 'relatório'] });
      node.classList.remove('show');
      mountHub();
      window.RadarExt?.toast?.('Estratégia salva no Caderno.');
    });
  }

  function serviceSuggestion(id, category, name, description, cost, included = true, reason = '') {
    return { id, category, name, description, cost: Math.max(0, number(cost)), included, billing: category === 'defense' ? 'mensal' : 'unico', reason };
  }

  function suggestedServices(lead, db) {
    const selections = new Set(lead.reportScenarioSelections || []);
    const diagnostic = lead.diagnosticFinal || {};
    const ratings = lead.ratings || diagnostic.ratings || {};
    const pricing = db.settings?.pricing || {};
    const debts = window.RadarStrategicCalculatorEngine?.leadDebt?.(lead) || { rfb: 0, pgfn: 0, total: 0 };
    const services = [];
    if (selections.has('migration')) services.push(serviceSuggestion('migration', 'judicial', 'Atuação estratégica para migração RFB → PGFN', 'Análise do passivo, definição da medida adequada, acompanhamento da migração e preparação do cenário de negociação na PGFN.', Math.max(number(pricing.oabMsMinimum), debts.rfb * number(pricing.msPassivoRate || 10) / 100), true, 'Indicado pelo cenário de migração selecionado.'));
    if (selections.has('pgfn') || selections.has('tis')) services.push(serviceSuggestion('negotiation', 'negotiation', selections.has('tis') ? 'Estruturação e negociação da TIS' : 'Negociação e regularização do passivo PGFN', 'Validação de elegibilidade, classificação dos débitos, montagem da negociação e acompanhamento até a formalização.', 0, true, 'Indicado pelos cenários de transação selecionados.'));
    if (number(ratings.collection) >= 55 || lead.execution || lead.citation) {
      const count = number(lead.processCount);
      const monthly = count <= number(pricing.defenseTier1Max || 3) ? number(pricing.defenseTier1Monthly || 1560) : count <= number(pricing.defenseTier2Max || 10) ? number(pricing.defenseTier2Monthly || 2500) : number(pricing.defenseTier3Monthly || 5400);
      services.push(serviceSuggestion('defense', 'defense', 'Gestão do passivo e acompanhamento processual', 'Monitoramento das cobranças e execuções, análise de riscos, coordenação defensiva e alinhamento com a estratégia de regularização.', monthly, true, 'Indicado pelo risco de cobrança e execução.'));
    }
    if (number(ratings.rt) >= 55) services.push(serviceSuggestion('tax-reform', 'reform', 'Projeto de adequação à Reforma Tributária', 'Leitura de exposição, revisão de caixa, contratos, preço e preparação operacional para o novo ambiente tributário.', 0, true, 'Indicado pelo risco de exposição à Reforma Tributária.'));
    const guaranteeProjection = window.RadarStrategicCalculatorEngine?.calculateGuarantee?.({
      model: lead.guaranteeMode || 'prescricao_percentual', base: number(lead.guaranteeBaseOverride) || debts.total,
      costRate: number(lead.guaranteeCostPctOverride || 15), entryRate: number(lead.guaranteeEntryPctOverride || 5),
      months: number(lead.guaranteeInstallmentsOverride || 60), additionalCosts: number(lead.guaranteeAdditionalCosts)
    });
    services.push(serviceSuggestion('guarantee', 'guarantee', 'Estruturação e apresentação de garantia', 'Análise da garantia, organização documental, apresentação e acompanhamento de sua aceitação no procedimento aplicável.', guaranteeProjection?.total || 0, Boolean(lead.guarantee || lead.block || lead.seizure), 'Serviço opcional disponível exclusivamente na proposta.'));
    if (!services.length) services.push(serviceSuggestion('diagnostic', 'custom', 'Diagnóstico e planejamento estratégico', 'Consolidação dos dados, validação das premissas e definição do plano de atuação recomendado.', 0, true, 'Serviço base para estruturação do caso.'));
    return services;
  }

  function previousProposalServices(lead) {
    const services = lead.proposalConfig?.services;
    if (!Array.isArray(services)) return [];
    return services.map((service) => ({
      id: service.id || uid('service'),
      category: service.category || service.type || 'custom',
      name: service.description || 'Serviço personalizado',
      description: service.detail || 'Atuação conforme o escopo técnico definido na proposta anterior.',
      cost: Math.max(0, number(service.finalValue || service.base)),
      included: true,
      billing: service.type === 'defense' ? 'mensal' : 'unico',
      reason: 'Item recuperado da proposta anteriormente salva neste caso.'
    }));
  }

  function initialProposalServices(lead, db) {
    const suggested = suggestedServices(lead, db);
    const previous = previousProposalServices(lead);
    if (!previous.length) return suggested;
    const previousCategories = new Set(previous.map((service) => service.category));
    return [...previous, ...suggested.filter((service) => service.category === 'guarantee' || !previousCategories.has(service.category))];
  }

  function proposalState(lead, db) {
    const stored = lead.commercialProposal || {};
    return {
      title: stored.title || 'Proposta de Atuação Estratégica',
      services: Array.isArray(stored.services) && stored.services.length ? stored.services : initialProposalServices(lead, db),
      paymentMode: stored.paymentMode || 'entrada_parcelas',
      entry: number(stored.entry),
      installments: Math.max(1, number(stored.installments) || 6),
      successRate: number(stored.successRate),
      paymentTerms: stored.paymentTerms || lead.proposalConfig?.paymentTerms || '',
      validity: stored.validity || lead.proposalConfig?.validity || '10 dias',
      notes: stored.notes || lead.proposalConfig?.notes || ''
    };
  }

  function serviceRow(service) {
    return `<article class="nch-service-row" data-service-id="${esc(service.id)}"><label class="nch-service-check"><input type="checkbox" data-service-included ${service.included ? 'checked' : ''}><span></span></label><div class="nch-service-main"><div class="nch-service-title"><input data-service-name value="${esc(service.name)}"><button data-remove-service title="Remover">×</button></div><textarea data-service-description rows="3">${esc(service.description)}</textarea>${service.reason ? `<small>${esc(service.reason)}</small>` : ''}</div><div class="nch-service-price"><label><span>Custo</span><input data-service-cost type="number" min="0" step="50" value="${number(service.cost).toFixed(2)}"></label><label><span>Cobrança</span><select data-service-billing><option value="unico" ${service.billing === 'unico' ? 'selected' : ''}>Valor único</option><option value="mensal" ${service.billing === 'mensal' ? 'selected' : ''}>Mensal</option><option value="exito" ${service.billing === 'exito' ? 'selected' : ''}>Êxito</option></select></label><input type="hidden" data-service-category value="${esc(service.category)}"></div></article>`;
  }

  function paymentText(state, total) {
    if (state.paymentTerms) return state.paymentTerms;
    if (state.paymentMode === 'avista') return `Pagamento à vista no valor de ${money(total)}.`;
    if (state.paymentMode === 'mensalidade') return `${state.installments} mensalidades, conforme cronograma de atuação.`;
    if (state.paymentMode === 'exito') return `Honorários de êxito de ${number(state.successRate).toLocaleString('pt-BR')}%, conforme resultado e base definidos no contrato.`;
    if (state.paymentMode === 'entrada_parcelas') {
      const remainder = Math.max(0, total - number(state.entry));
      return `Entrada de ${money(state.entry)} e saldo em ${state.installments} parcelas de ${money(remainder / state.installments)}.`;
    }
    return 'Condições de pagamento a definir entre as partes.';
  }

  function proposalPreview(lead, state) {
    const included = state.services.filter((service) => service.included);
    const total = included.reduce((sum, service) => sum + number(service.cost), 0);
    return `<article class="proposal-preview nch-proposal-preview" id="nch-proposal-preview"><header><div><span>Radar Estratégico Empresarial</span><h1>PROPOSTA DE ATUAÇÃO ESTRATÉGICA</h1></div><div><small>EMPRESA</small><strong>${esc(lead.companyName || 'Empresa não informada')}</strong><span>${esc(lead.cnpj || '')}</span></div></header><section><h2>Contexto e objetivo</h2><p>${esc(lead.manualStrategySummary || lead.diagnosticFinal?.summary || 'Atuação estruturada a partir do diagnóstico e das prioridades identificadas para o caso.')}</p></section><section><h2>Serviços indicados</h2><div class="nch-preview-services">${included.map((service) => `<div><span><strong>${esc(service.name)}</strong><small>${esc(service.description)}</small></span><b>${money(service.cost)}${service.billing === 'mensal' ? '/mês' : service.billing === 'exito' ? ' · êxito' : ''}</b></div>`).join('') || '<p>Nenhum serviço selecionado.</p>'}</div></section><section class="nch-preview-total"><span>Investimento indicado</span><strong>${money(total)}</strong></section><section><h2>Forma de pagamento</h2><p>${esc(paymentText(state, total))}</p><p><strong>Validade:</strong> ${esc(state.validity)}</p>${state.notes ? `<p>${esc(state.notes)}</p>` : ''}</section><footer>A contratação formaliza o escopo, as responsabilidades e o início da validação documental da estratégia selecionada.</footer></article>`;
  }

  function proposalHtml(lead, state) {
    return `<section class="nch-modal wide"><header><div><span class="nch-kicker">Montagem da proposta</span><h2>Serviços indicados, valores e pagamento</h2><p>As sugestões vêm do diagnóstico. Tudo permanece editável antes da apresentação ao cliente.</p></div><button data-nch-close>×</button></header><div class="nch-proposal-layout"><section class="nch-proposal-editor"><label class="nch-field"><span>Título da proposta</span><input name="proposalTitle" value="${esc(state.title)}"></label><div class="nch-services-head"><div><h3>Serviços da proposta</h3><p>Marque o que entra e ajuste livremente descrição e custo.</p></div><button class="nch-secondary" data-add-service>+ Serviço</button></div><div class="nch-services-list">${state.services.map(serviceRow).join('')}</div><section class="nch-payment"><div><h3>Forma de pagamento</h3><p>Defina a composição financeira depois do escopo.</p></div><div class="nch-payment-grid"><label><span>Modelo</span><select name="paymentMode"><option value="avista" ${state.paymentMode === 'avista' ? 'selected' : ''}>À vista</option><option value="entrada_parcelas" ${state.paymentMode === 'entrada_parcelas' ? 'selected' : ''}>Entrada + parcelas</option><option value="mensalidade" ${state.paymentMode === 'mensalidade' ? 'selected' : ''}>Mensalidade</option><option value="exito" ${state.paymentMode === 'exito' ? 'selected' : ''}>Êxito</option><option value="personalizado" ${state.paymentMode === 'personalizado' ? 'selected' : ''}>Personalizado</option></select></label><label><span>Entrada</span><input name="paymentEntry" type="number" min="0" step="50" value="${number(state.entry).toFixed(2)}"></label><label><span>Parcelas / meses</span><input name="paymentInstallments" type="number" min="1" max="60" value="${state.installments}"></label><label><span>Êxito (%)</span><input name="paymentSuccess" type="number" min="0" max="100" step="0.5" value="${state.successRate}"></label></div><label class="nch-field"><span>Condição por extenso — opcional</span><textarea name="paymentTerms" rows="3" placeholder="Se preenchido, este texto substitui a composição automática.">${esc(state.paymentTerms)}</textarea></label><div class="nch-payment-grid"><label><span>Validade</span><input name="proposalValidity" value="${esc(state.validity)}"></label></div><label class="nch-field"><span>Observações</span><textarea name="proposalNotes" rows="3">${esc(state.notes)}</textarea></label></section></section><aside class="nch-proposal-preview-host">${proposalPreview(lead, state)}</aside></div><footer><button class="nch-secondary" data-nch-close>Fechar</button><button class="nch-primary" data-save-proposal>Salvar proposta no Caderno</button></footer></section>`;
  }

  function collectProposal(root) {
    const services = [...root.querySelectorAll('.nch-service-row')].map((row) => ({
      id: row.dataset.serviceId || uid('service'),
      included: Boolean(row.querySelector('[data-service-included]')?.checked),
      category: row.querySelector('[data-service-category]')?.value || 'custom',
      name: text(row.querySelector('[data-service-name]')?.value),
      description: String(row.querySelector('[data-service-description]')?.value || '').trim(),
      cost: Math.max(0, number(row.querySelector('[data-service-cost]')?.value)),
      billing: row.querySelector('[data-service-billing]')?.value || 'unico',
      reason: text(row.querySelector('.nch-service-main small')?.textContent)
    }));
    return {
      title: text(root.querySelector('[name="proposalTitle"]')?.value) || 'Proposta de Atuação Estratégica',
      services,
      paymentMode: root.querySelector('[name="paymentMode"]')?.value || 'personalizado',
      entry: Math.max(0, number(root.querySelector('[name="paymentEntry"]')?.value)),
      installments: Math.max(1, number(root.querySelector('[name="paymentInstallments"]')?.value) || 1),
      successRate: Math.max(0, number(root.querySelector('[name="paymentSuccess"]')?.value)),
      paymentTerms: String(root.querySelector('[name="paymentTerms"]')?.value || '').trim(),
      validity: text(root.querySelector('[name="proposalValidity"]')?.value) || '10 dias',
      notes: String(root.querySelector('[name="proposalNotes"]')?.value || '').trim()
    };
  }

  function refreshProposalPreview(root, lead) {
    const state = collectProposal(root);
    const host = root.querySelector('.nch-proposal-preview-host');
    if (host) host.innerHTML = proposalPreview(lead, state);
  }

  function saveProposal(ctx, root) {
    const state = collectProposal(root);
    state.updatedAt = new Date().toISOString();
    ctx.lead.commercialProposal = state;
    const included = state.services.filter((service) => service.included);
    const total = included.reduce((sum, service) => sum + number(service.cost), 0);
    const terms = paymentText(state, total);
    ctx.lead.proposalConfig = {
      ...(ctx.lead.proposalConfig || {}),
      title: state.title,
      paymentTerms: terms,
      validity: state.validity,
      notes: state.notes,
      services: included.map((service) => ({
        id: service.id, type: service.category === 'defense' ? 'defense' : 'custom',
        category: service.category, description: service.name, detail: service.description,
        rate: 0, months: service.billing === 'mensal' ? state.installments : 1,
        base: service.cost, finalValue: service.cost
      }))
    };
    ctx.lead.proposal = {
      ...(ctx.lead.proposal || {}),
      services: included.map((service) => service.id),
      customDescription: included.map((service) => `${service.name}: ${service.description}`).join('\n'),
      customValue: total,
      paymentTerms: terms,
      validity: state.validity,
      notes: state.notes,
      generatedAt: state.updatedAt
    };
    persist(ctx, { title: 'Proposta comercial atualizada', body: `${included.length} serviço(s) selecionado(s), total indicado de ${money(total)}.`, tags: ['proposta', 'estratégia'] });
    return state;
  }

  function bindProposal(node, ctx) {
    const body = node.querySelector('.nch-modal');
    body.addEventListener('input', () => refreshProposalPreview(body, ctx.lead));
    body.addEventListener('change', () => refreshProposalPreview(body, ctx.lead));
    body.addEventListener('click', (event) => {
      const remove = event.target.closest('[data-remove-service]');
      if (remove) {
        remove.closest('.nch-service-row')?.remove();
        refreshProposalPreview(body, ctx.lead);
        return;
      }
      if (event.target.closest('[data-add-service]')) {
        const list = body.querySelector('.nch-services-list');
        list.insertAdjacentHTML('beforeend', serviceRow(serviceSuggestion(uid('service'), 'custom', 'Novo serviço', 'Descreva o escopo deste serviço.', 0, true, 'Serviço adicionado manualmente.')));
        refreshProposalPreview(body, ctx.lead);
        return;
      }
      if (event.target.closest('[data-save-proposal]')) {
        saveProposal(ctx, body);
        refreshProposalPreview(body, ctx.lead);
        mountHub();
        window.RadarExt?.toast?.('Proposta salva no Caderno.');
      }
    });
  }

  function openProposal() {
    const ctx = context();
    if (!ctx?.lead) return;
    const state = proposalState(ctx.lead, ctx.db);
    const node = modal();
    node.innerHTML = proposalHtml(ctx.lead, state);
    node.classList.add('show');
    bindProposal(node, ctx);
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(mountHub);
  }

  const app = document.getElementById('app');
  if (app) new MutationObserver(schedule).observe(app, { childList: true, subtree: true });
  document.addEventListener('click', (event) => {
    const target = event.target.closest('button,a,[role="tab"]');
    if (text(target?.textContent) === 'Caderno') {
      setTimeout(schedule, 60);
      setTimeout(schedule, 220);
    }
  }, true);
  window.addEventListener('radar:cloud-synced', schedule);
  window.addEventListener('radar:case-updated', schedule);
  window.addEventListener('load', schedule);
  [800, 1500, 2600].forEach((delay) => setTimeout(schedule, delay));

  window.RadarNotebookCommercialHub = { mount: schedule, openStrategy, openReport, openProposal, translateRiskLabels };
})();
