(() => {
  'use strict';

  const Engine = window.RadarStrategicCalculatorEngine;
  if (!Engine) return;

  const ID = 'radar-strategic-calculator';
  const CASE_KEYS = ['radar_current_case_id', 'radar_current_lead_id', 'radar_estrategico_current_case_id'];
  const LABELS = {
    rfb: 'RFB convencional',
    migration: 'RFB — ação estratégica',
    pgfn: 'PGFN',
    tis: 'TIS',
    guarantee: 'Garantia'
  };
  let currentLeadId = '';
  let activeTab = 'rfb';
  let showTis = false;
  let scheduled = false;
  let toastTimer = null;

  const text = (value) => String(value ?? '').trim();
  const escapeHtml = (value) => text(value).replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));
  const number = Engine.number;
  const digits = (value) => text(value).replace(/\D/g, '');
  const brl = (value) => new Intl.NumberFormat('pt-BR', {
    style: 'currency', currency: 'BRL'
  }).format(number(value));
  const pct = (value) => `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(number(value))}%`;
  const raw = (value) => number(value).toLocaleString('pt-BR', { maximumFractionDigits: 2, useGrouping: false });

  function database() {
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
      } catch (_) { /* conteúdo de outra aplicação */ }
    }
    return null;
  }

  function identity() {
    const head = document.querySelector('.case-head');
    const pageText = head?.textContent || document.querySelector('main')?.textContent || '';
    return {
      cnpj: digits(pageText.match(/\d{2}\.?\d{3}\.?\d{3}\/\d{4}-?\d{2}/)?.[0] || ''),
      name: head?.querySelector('h1')?.textContent?.trim() || ''
    };
  }

  function context() {
    const base = database();
    if (!base) return null;
    const id = identity();
    let lead = id.cnpj ? base.db.leads.find((item) => digits(item.cnpj) === id.cnpj) : null;
    if (!lead && id.name && !/^nova empresa$/i.test(id.name)) {
      lead = base.db.leads.find((item) => text(item.companyName) === id.name);
    }
    if (!lead) {
      for (const key of CASE_KEYS) {
        const storedId = text(localStorage.getItem(key)).replace(/^"|"$/g, '');
        if (storedId) lead = base.db.leads.find((item) => text(item.id) === storedId);
        if (lead) break;
      }
    }
    return lead ? { ...base, lead } : null;
  }

  const stored = (lead, key, fallback) => text(lead?.[key]) === '' ? fallback : lead[key];

  function stateFromLead(lead) {
    const selections = Array.isArray(lead.reportScenarioSelections)
      ? lead.reportScenarioSelections.filter((item) => LABELS[item])
      : [];
    return {
      debts: {
        rfb: number(text(lead.rfbDebt) !== '' ? lead.rfbDebt : lead.rfbTotal),
        simple: number(lead.pgfnSimple),
        socialSecurity: number(lead.pgfnPrev),
        tax: number(lead.pgfnTrib),
        other: number(lead.pgfnOther)
      },
      impediment: Boolean(lead.hasImpediment),
      simplified: Boolean(lead.simplifiedProposal),
      rfbMode: stored(lead, 'reparcelment', 'nenhum'),
      rfbCustomEntry: number(stored(lead, 'rfbCustomEntryRateOverride', 0)),
      rfbTerm: number(stored(lead, 'rfbTermOverride', 60)),
      rfbMinimum: number(stored(lead, 'rfbMinInstallmentOverride', 500)),
      pgfnEntryRate: number(stored(lead, 'pgfnEntryRateOverride', 6)),
      pgfnEntryMonths: number(stored(lead, 'pgfnEntryMonthsOverride', 12)),
      pgfnDiscount: number(stored(lead, 'pgfnDiscountOverride', 35)),
      pgfnTerm: number(stored(lead, 'pgfnTermOverride', 145)),
      pgfnSocialTerm: number(stored(lead, 'pgfnPrevTermOverride', 60)),
      pgfnMinimum: number(stored(lead, 'pgfnMinInstallmentOverride', 100)),
      migrationEntryRate: number(stored(lead, 'rfbMigrationEntryRate', 6)),
      migrationEntryMonths: number(stored(lead, 'rfbMigrationEntryMonths', 12)),
      migrationDiscount: number(stored(lead, 'rfbMigrationDiscount', 35)),
      migrationTerm: number(stored(lead, 'rfbMigrationTerm', 145)),
      tisDiscount: number(stored(lead, 'tisDiscountOverride', 65)),
      tisTerm: number(stored(lead, 'tisTermOverride', 145)),
      guaranteeModel: stored(lead, 'guaranteeMode', 'prescricao_percentual'),
      guaranteeBase: number(stored(lead, 'guaranteeBaseOverride', 0)),
      guaranteeCostRate: number(stored(lead, 'guaranteeCostPctOverride', 15)),
      guaranteeEntryRate: number(stored(lead, 'guaranteeEntryPctOverride', 5)),
      guaranteeMonths: number(stored(lead, 'guaranteeInstallmentsOverride', 60)),
      guaranteeAdditionalCosts: number(stored(lead, 'guaranteeAdditionalCosts', 0)),
      selections
    };
  }

  function calculate(state) {
    const pgfnDebt = Object.values(state.debts).slice(1).reduce((sum, value) => sum + number(value), 0);
    const totalDebt = number(state.debts.rfb) + pgfnDebt;
    const rfb = Engine.calculateRfb({
      debt: state.debts.rfb, mode: state.rfbMode, customEntryRate: state.rfbCustomEntry,
      totalTerm: state.rfbTerm, minimum: state.rfbMinimum
    });
    const pgfn = Engine.calculatePgfn({
      simple: state.debts.simple, socialSecurity: state.debts.socialSecurity,
      tax: state.debts.tax, other: state.debts.other,
      entryRate: state.pgfnEntryRate, entryMonths: state.pgfnEntryMonths,
      discountRate: state.pgfnDiscount, simpleTerm: state.pgfnTerm,
      socialSecurityTerm: state.pgfnSocialTerm, taxTerm: state.pgfnTerm,
      otherTerm: state.pgfnTerm, minimum: state.pgfnMinimum
    });
    const migration = Engine.calculateMigration({
      debt: state.debts.rfb, entryRate: state.migrationEntryRate,
      entryMonths: state.migrationEntryMonths, discountRate: state.migrationDiscount,
      totalTerm: state.migrationTerm, minimum: state.pgfnMinimum
    });
    const tis = Engine.calculateTis({
      pgfnDebt, rfbDebt: state.debts.rfb,
      discountRate: state.tisDiscount, totalTerm: state.tisTerm
    });
    const guarantee = Engine.calculateGuarantee({
      model: state.guaranteeModel,
      base: state.guaranteeBase || totalDebt,
      costRate: state.guaranteeCostRate,
      entryRate: state.guaranteeEntryRate,
      months: state.guaranteeMonths,
      additionalCosts: state.guaranteeAdditionalCosts
    });
    const strategicReduction = pgfn.reduction + migration.reduction;
    return {
      totalDebt, pgfnDebt, rfb, pgfn, migration, tis, guarantee,
      strategicReduction,
      strategicBalance: Math.max(0, totalDebt - strategicReduction)
    };
  }

  function scenarioReduction(id, output) {
    if (id === 'migration') return output.migration.reduction;
    if (id === 'pgfn') return output.pgfn.reduction;
    if (id === 'tis') return output.tis.reduction;
    return 0;
  }

  function selectedReduction(state, output) {
    if (state.selections.includes('tis')) return output.tis.reduction;
    return state.selections.reduce((sum, id) => sum + scenarioReduction(id, output), 0);
  }

  function reportButton(id, state, label = 'Incluir no relatório final') {
    const selected = state.selections.includes(id);
    return `<button class="rsc-report-btn ${selected ? 'selected' : ''}" data-report="${id}">${selected ? '✓ Incluído no relatório final' : label}</button>`;
  }

  function metric(label, value, className = '') {
    return `<div class="rsc-metric"><dt>${label}</dt><dd class="${className}">${value}</dd></div>`;
  }

  function advancedField(label, name, value, attributes = '') {
    return `<div class="rsc-advanced-field"><label for="rsc-${name}">${label}</label><input id="rsc-${name}" name="${name}" type="number" value="${escapeHtml(value)}" ${attributes}></div>`;
  }

  function rfbPanel(state, output) {
    if (!output.rfb.debt) {
      return `<div class="rsc-empty"><b>RFB</b><div><strong>Nenhum débito da Receita informado</strong><p>Ao informar um valor, o comparativo convencional × ação estratégica será exibido aqui.</p></div></div>`;
    }
    const conventional = output.rfb;
    const strategic = output.migration;
    const modeLabel = conventional.mode === 'primeiro' ? 'Primeiro reparcelamento' : conventional.mode === 'segundo_ou_mais' ? 'Segundo ou posterior' : conventional.mode === 'personalizado' ? 'Entrada personalizada' : 'Parcelamento ordinário';
    return `
      <div class="rsc-panel-title"><strong>Comparação da Receita Federal</strong><small>Condição atual × estratégia de migração</small></div>
      <div class="rsc-comparison">
        <article class="rsc-scenario">
          <div class="rsc-scenario-head"><span class="rsc-tag">RFB convencional</span><h3>${modeLabel}</h3><p>Projeção sem redução, conforme a entrada selecionada.</p></div>
          <dl class="rsc-metrics">
            ${metric('Dívida considerada', brl(conventional.debt))}
            ${metric(`Entrada (${pct(conventional.entryRate)})`, brl(conventional.entry))}
            ${metric('Saldo parcelado', `${conventional.months}x de ${brl(conventional.installment)}`)}
            ${metric('Redução estimada', brl(0))}
          </dl>
          <div class="rsc-report-wrap">${reportButton('rfb', state)}</div>
        </article>
        <div class="rsc-versus"><span>VS</span></div>
        <article class="rsc-scenario strategic">
          <div class="rsc-scenario-head"><span class="rsc-tag">Ação estratégica</span><h3>Migração para a PGFN</h3><p>Entrada fracionada, redução projetada e saldo alongado.</p></div>
          <dl class="rsc-metrics">
            ${metric(`Entrada em ${strategic.entryMonths}x`, `${brl(strategic.entryInstallment)} / mês`)}
            ${metric('Saldo após a entrada', `${strategic.balanceMonths}x de ${brl(strategic.phaseTwoInstallment)}`)}
            ${metric('Prazo projetado', `${strategic.projectedTotalMonths} meses`)}
            ${metric('Redução potencial', brl(strategic.reduction), 'rsc-good')}
          </dl>
          <div class="rsc-report-wrap">${reportButton('migration', state)}</div>
        </article>
      </div>
      <div class="rsc-impact"><div><span>Custo projetado no cenário convencional</span><strong>${brl(conventional.debt)}</strong></div><div><span>Potencial de redução com a estratégia</span><strong>${brl(strategic.reduction)}</strong></div></div>`;
  }

  function pgfnPanel(state, output) {
    const rows = [
      ['Simples Nacional', output.pgfn.natures.simple],
      ['Previdenciária', output.pgfn.natures.socialSecurity],
      ['Tributária', output.pgfn.natures.tax],
      ['Demais débitos', output.pgfn.natures.other]
    ];
    const visible = rows.filter(([, item]) => item.debt > 0);
    if (!visible.length) {
      return `<div class="rsc-empty"><b>PGFN</b><div><strong>Nenhum débito PGFN informado</strong><p>Preencha ao menos uma natureza para visualizar o detalhamento da transação.</p></div></div>`;
    }
    return `
      <div class="rsc-panel-title"><strong>Detalhamento PGFN</strong><small>Projeção separada por natureza</small></div>
      <div class="rsc-table-wrap"><table class="rsc-table">
        <thead><tr><th>Natureza</th><th>Dívida original</th><th>Redução</th><th>Entrada</th><th>Saldo / parcelas</th></tr></thead>
        <tbody>${visible.map(([label, item]) => `<tr><td><strong>${label}</strong><br><span class="rsc-condition">Prazo total: ${item.projectedTotalMonths} meses</span></td><td>${brl(item.debt)}</td><td class="saving">${brl(item.reduction)}</td><td>${item.entryMonths}x de ${brl(item.entryInstallment)}</td><td>${item.balanceMonths}x de ${brl(item.phaseTwoInstallment)}</td></tr>`).join('')}</tbody>
      </table></div>
      <div class="rsc-impact"><div><span>Saldo negociado PGFN</span><strong>${brl(output.pgfn.negotiatedBalance)}</strong></div><div><span>Redução potencial PGFN</span><strong>${brl(output.pgfn.reduction)}</strong></div></div>
      <div class="rsc-report-wrap">${reportButton('pgfn', state)}</div>`;
  }

  function tisPanel(state, output) {
    const tis = output.tis;
    if (!tis.eligible) {
      const message = tis.individual
        ? 'A base alcança R$ 10 milhões ou mais e deve ser tratada como negociação individual, não como TIS.'
        : 'A base ainda não supera R$ 1 milhão. O cenário permanece oculto até que a premissa seja atingida.';
      return `<div class="rsc-empty"><b>TIS</b><div><strong>Cenário TIS indisponível</strong><p>${message}</p></div></div>`;
    }
    return `
      <div class="rsc-tis-head"><div><span class="rsc-tag">Transação Individual Simplificada</span><h3>Escalonamento projetado da TIS</h3><p>${tis.strategicEligible ? 'Cenário condicionado à migração dos débitos da Receita para a PGFN.' : 'Cenário calculado sobre o passivo PGFN atualmente informado.'}</p></div><span class="status">Potencialmente elegível</span></div>
      <div class="rsc-tis-kpis">
        <div class="rsc-kpi"><span>Base da negociação</span><strong>${brl(tis.basis)}</strong><small>${tis.strategicEligible ? 'PGFN + RFB após migração' : 'PGFN atual'}</small></div>
        <div class="rsc-kpi green"><span>Redução projetada</span><strong>${brl(tis.reduction)}</strong><small>${pct(tis.discountRate)} sobre a base</small></div>
        <div class="rsc-kpi"><span>Saldo após redução</span><strong>${brl(tis.balance)}</strong><small>Prazo total de ${tis.totalTerm} meses</small></div>
      </div>
      <div class="rsc-tis-layout">
        <div class="rsc-table-wrap"><table class="rsc-table"><thead><tr><th>Faixa</th><th>Percentual do saldo</th><th>Total da faixa</th><th>Parcela projetada</th></tr></thead><tbody>${tis.bands.map((band) => `<tr><td><strong>${band.label} parcela</strong></td><td>${pct(band.share)}</td><td>${brl(band.total)}</td><td class="saving">${band.months}x de ${brl(band.installment)}</td></tr>`).join('')}</tbody></table></div>
        <div class="rsc-box"><h4>Como o cenário é formado</h4><p>A projeção distribui o saldo já reduzido em quatro faixas.</p><div class="rsc-steps"><div class="rsc-step"><b>1</b><div><strong>Validação da base</strong><p>Débitos PGFN atuais ou total após migração.</p></div></div><div class="rsc-step"><b>2</b><div><strong>Redução estimada</strong><p>Aplicação da premissa ajustável da TIS.</p></div></div><div class="rsc-step"><b>3</b><div><strong>Escalonamento</strong><p>3%, 4%, 5% e os 88% remanescentes.</p></div></div></div></div>
      </div>
      <div class="rsc-warning">Projeção estratégica. A elegibilidade definitiva depende da inscrição, modalidade disponível, capacidade de pagamento e regras vigentes.</div>
      <div class="rsc-report-wrap">${reportButton('tis', state, 'Incluir cenário TIS no relatório final')}</div>`;
  }

  function guaranteePanel(state, output) {
    const guarantee = output.guarantee;
    return `
      <div class="rsc-panel-title"><strong>Projeção de garantia</strong><small>Custos e pagamento estimados</small></div>
      <div class="rsc-tis-kpis"><div class="rsc-kpi"><span>Base da operação</span><strong>${brl(guarantee.operationBase)}</strong></div><div class="rsc-kpi"><span>Entrada</span><strong>${brl(guarantee.entry)}</strong><small>${pct(state.guaranteeEntryRate)}</small></div><div class="rsc-kpi green"><span>Parcela projetada</span><strong>${brl(guarantee.installment)}</strong><small>${guarantee.months} parcelas</small></div></div>
      <div class="rsc-impact"><div><span>Custos adicionais</span><strong>${brl(guarantee.additionalCosts)}</strong></div><div><span>Custo total projetado</span><strong>${brl(guarantee.total)}</strong></div></div>
      <div class="rsc-warning">Os parâmetros de garantia podem ser ajustados na janela de premissas avançadas.</div>
      <div class="rsc-report-wrap">${reportButton('guarantee', state)}</div>`;
  }

  function assumptionsPanel(state, output) {
    return `<div class="rsc-box"><h4>Premissas aplicadas</h4><p>Os motores permanecem configuráveis sem poluir a tela principal.</p><div class="rsc-table-wrap"><table class="rsc-table"><tbody><tr><td>PGFN</td><td>${pct(state.pgfnDiscount)} de redução · entrada em ${state.pgfnEntryMonths}x · até ${state.pgfnTerm} meses</td></tr><tr><td>Migração RFB</td><td>${pct(state.migrationDiscount)} de redução · entrada em ${state.migrationEntryMonths}x · até ${state.migrationTerm} meses</td></tr><tr><td>TIS</td><td>${pct(state.tisDiscount)} de redução · ${state.tisTerm} meses · base superior a R$ 1 milhão e inferior a R$ 10 milhões</td></tr><tr><td>Passivo analisado</td><td>${brl(output.totalDebt)}</td></tr></tbody></table></div><div class="rsc-warning">Todos os valores são projeções para análise estratégica e devem ser validados conforme a situação fiscal e as regras vigentes.</div></div>`;
  }

  function advancedModal(state) {
    return `<div class="rsc-modal-backdrop" data-modal><div class="rsc-modal" role="dialog" aria-modal="true" aria-labelledby="rsc-modal-title">
      <div class="rsc-modal-head"><div><h2 id="rsc-modal-title">Parâmetros avançados</h2><p>Ajuste os motores da simulação sem alterar a navegação principal.</p></div><button class="rsc-modal-close" data-close-modal aria-label="Fechar">×</button></div>
      <div class="rsc-modal-body"><div class="rsc-advanced-grid">
        <section class="rsc-advanced-group"><h3>Receita Federal convencional</h3><div class="rsc-advanced-field"><label for="rsc-rfbMode">Modalidade</label><select id="rsc-rfbMode" name="rfbMode"><option value="nenhum" ${state.rfbMode === 'nenhum' ? 'selected' : ''}>Ordinário</option><option value="primeiro" ${state.rfbMode === 'primeiro' ? 'selected' : ''}>1º reparcelamento — 10%</option><option value="segundo_ou_mais" ${state.rfbMode === 'segundo_ou_mais' ? 'selected' : ''}>2º ou posterior — 20%</option><option value="personalizado" ${state.rfbMode === 'personalizado' ? 'selected' : ''}>Personalizado</option></select></div>${advancedField('Entrada personalizada (%)', 'rfbCustomEntry', state.rfbCustomEntry, 'min="0" max="100" step="0.1"')}${advancedField('Prazo total', 'rfbTerm', state.rfbTerm, 'min="1" max="120"')}${advancedField('Parcela mínima', 'rfbMinimum', state.rfbMinimum, 'min="0" step="0.01"')}</section>
        <section class="rsc-advanced-group"><h3>PGFN</h3>${advancedField('Entrada (%)', 'pgfnEntryRate', state.pgfnEntryRate, 'min="0" max="30" step="0.1"')}${advancedField('Parcelas da entrada', 'pgfnEntryMonths', state.pgfnEntryMonths, 'min="1" max="24"')}${advancedField('Redução (%)', 'pgfnDiscount', state.pgfnDiscount, 'min="0" max="70" step="0.1"')}${advancedField('Prazo geral', 'pgfnTerm', state.pgfnTerm, 'min="2" max="180"')}${advancedField('Prazo previdenciário', 'pgfnSocialTerm', state.pgfnSocialTerm, 'min="2" max="60"')}${advancedField('Parcela mínima', 'pgfnMinimum', state.pgfnMinimum, 'min="0" step="0.01"')}</section>
        <section class="rsc-advanced-group"><h3>RFB — ação estratégica</h3>${advancedField('Entrada (%)', 'migrationEntryRate', state.migrationEntryRate, 'min="0" max="30" step="0.1"')}${advancedField('Parcelas da entrada', 'migrationEntryMonths', state.migrationEntryMonths, 'min="1" max="24"')}${advancedField('Redução (%)', 'migrationDiscount', state.migrationDiscount, 'min="0" max="70" step="0.1"')}${advancedField('Prazo total', 'migrationTerm', state.migrationTerm, 'min="2" max="180"')}</section>
        <section class="rsc-advanced-group"><h3>TIS e garantia</h3>${advancedField('Redução TIS (%)', 'tisDiscount', state.tisDiscount, 'min="0" max="70" step="0.1"')}${advancedField('Prazo TIS', 'tisTerm', state.tisTerm, 'min="37" max="180"')}<div class="rsc-advanced-field"><label for="rsc-guaranteeModel">Modelo da garantia</label><select id="rsc-guaranteeModel" name="guaranteeModel"><option value="prescricao_percentual" ${state.guaranteeModel === 'prescricao_percentual' ? 'selected' : ''}>Prescrição percentual</option><option value="contrato_impedido" ${state.guaranteeModel === 'contrato_impedido' ? 'selected' : ''}>Contrato — impedimento</option><option value="contrato_prescricao" ${state.guaranteeModel === 'contrato_prescricao' ? 'selected' : ''}>Contrato — prescrição</option></select></div>${advancedField('Base da garantia', 'guaranteeBase', state.guaranteeBase, 'min="0" step="0.01"')}${advancedField('Custo (%)', 'guaranteeCostRate', state.guaranteeCostRate, 'min="0" max="100" step="0.1"')}${advancedField('Entrada (%)', 'guaranteeEntryRate', state.guaranteeEntryRate, 'min="0" max="100" step="0.1"')}${advancedField('Parcelas', 'guaranteeMonths', state.guaranteeMonths, 'min="1" max="60"')}${advancedField('Custos adicionais', 'guaranteeAdditionalCosts', state.guaranteeAdditionalCosts, 'min="0" step="0.01"')}</section>
      </div></div><div class="rsc-modal-foot"><button class="rsc-secondary" data-close-modal>Cancelar</button><button class="rsc-modal-save" data-save-advanced>Aplicar parâmetros</button></div>
    </div></div>`;
  }

  function render(panel, ctx) {
    const state = stateFromLead(ctx.lead);
    const output = calculate(state);
    const availableSelections = state.selections.filter((id) => {
      if ((id === 'rfb' || id === 'migration') && !output.rfb.debt) return false;
      if (id === 'pgfn' && !output.pgfnDebt) return false;
      if (id === 'tis' && !output.tis.eligible) return false;
      return true;
    });
    if (availableSelections.length !== state.selections.length) {
      state.selections = availableSelections;
      ctx.lead.reportScenarioSelections = availableSelections;
      persist(ctx);
    }
    if (!output.rfb.debt && activeTab === 'rfb') activeTab = 'pgfn';
    if ((!showTis || !output.tis.eligible) && activeTab === 'tis') activeTab = output.rfb.debt ? 'rfb' : 'pgfn';
    const potential = selectedReduction(state, output);
    const selectedLabels = state.selections.map((id) => LABELS[id]);
    const tisAlert = output.tis.individual
      ? `<div class="rsc-tis-alert"><div class="rsc-tis-icon">NI</div><div><small>Negociação individual</small><strong>O passivo alcança a faixa de negociação individual.</strong><p>A base estratégica é de ${brl(output.tis.basis || output.totalDebt)} e não se enquadra na faixa da TIS.</p></div></div>`
      : output.tis.eligible
        ? `<div class="rsc-tis-alert"><div class="rsc-tis-icon">TIS</div><div><small>Oportunidade identificada</small><strong>${output.tis.strategicEligible ? 'Retirando os débitos da Receita, você pode atingir a negociação individual simplificada.' : 'O passivo PGFN já pode viabilizar uma negociação individual simplificada.'}</strong><p>${output.tis.strategicEligible ? `A migração eleva a base de ${brl(output.pgfnDebt)} para ${brl(output.totalDebt)}.` : `O passivo PGFN atual já alcança ${brl(output.pgfnDebt)}.`}</p><div class="rsc-tis-values"><span>Base: <b>${brl(output.tis.basis)}</b></span><span>Redução projetada: <b>${brl(output.tis.reduction)}</b></span></div></div><button class="rsc-tis-button ${showTis ? 'selected' : ''}" data-toggle-tis>${showTis ? 'Cenário TIS incluído' : 'Incluir cenário TIS'}</button></div>`
        : '';

    panel.innerHTML = `<div class="rsc-shell">
      <header class="rsc-hero"><p class="rsc-kicker">Central de simulações estratégicas</p><h2>Transforme o passivo em cenários claros de decisão.</h2><p>Compare Receita Federal, migração, PGFN, TIS e garantia em uma leitura única — com os mesmos motores lógicos registrados no caso.</p></header>
      <div class="rsc-workspace">
        <aside class="rsc-card rsc-inputs"><h2 class="rsc-title">Dívidas por natureza</h2><p class="rsc-copy">Informe os valores para atualizar todos os cenários.</p>
          ${[['rfb','Receita Federal','RFB'],['simple','Simples Nacional','PGFN'],['socialSecurity','Previdenciária','PGFN'],['tax','Tributária','PGFN'],['other','Demais débitos','PGFN']].map(([name,label,badge]) => `<label class="rsc-field"><span>${label}<b>${badge}</b></span><div class="rsc-money"><b>R$</b><input name="debt-${name}" value="${escapeHtml(raw(state.debts[name]))}" inputmode="decimal" autocomplete="off"></div></label>`).join('')}
          <div class="rsc-divider"></div><div class="rsc-option"><input id="rsc-impediment" name="impediment" type="checkbox" ${state.impediment ? 'checked' : ''}><label for="rsc-impediment">Impedimento<small>Registra a condição no caso.</small></label></div><div class="rsc-option"><input id="rsc-simplified" name="simplified" type="checkbox" ${state.simplified ? 'checked' : ''}><label for="rsc-simplified">Simplificar proposta<small>Prioriza a leitura executiva no relatório.</small></label></div><div class="rsc-option"><input id="rsc-advanced" type="checkbox"><label for="rsc-advanced">Parâmetros avançados<small>Ajuste prazos, entradas e percentuais em um popup.</small></label></div><button class="rsc-primary" data-recalculate>Visualizar simulação</button><p class="rsc-micro">Valores salvos no caso após a atualização.</p></aside>
        <main class="rsc-card rsc-results"><div class="rsc-results-head"><div><h2 class="rsc-title">Leitura estratégica</h2><p class="rsc-copy">Cenários calculados para ${escapeHtml(ctx.lead.companyName || 'a empresa')}.</p></div><span class="rsc-status">Simulação atualizada</span></div>
          <div class="rsc-summary"><div class="rsc-kpi"><span>Passivo total</span><strong>${brl(output.totalDebt)}</strong><small>RFB + PGFN</small></div><div class="rsc-kpi green"><span>Redução estratégica</span><strong>${brl(output.strategicReduction)}</strong><small>PGFN atual + migração da RFB</small></div><div class="rsc-kpi"><span>Saldo projetado</span><strong>${brl(output.strategicBalance)}</strong><small>Após a redução estimada</small></div></div>
          ${tisAlert}
          <nav class="rsc-tabs" aria-label="Cenários"><button class="rsc-tab ${activeTab === 'rfb' ? 'active' : ''}" data-tab="rfb" ${output.rfb.debt ? '' : 'hidden'}>RFB - ESTRATÉGIA</button><button class="rsc-tab ${activeTab === 'pgfn' ? 'active' : ''}" data-tab="pgfn">DETALHAMENTO PGFN</button><button class="rsc-tab ${activeTab === 'tis' ? 'active' : ''}" data-tab="tis" ${showTis && output.tis.eligible ? '' : 'hidden'}>CENÁRIO TIS</button><button class="rsc-tab ${activeTab === 'guarantee' ? 'active' : ''}" data-tab="guarantee">GARANTIA</button><button class="rsc-tab ${activeTab === 'assumptions' ? 'active' : ''}" data-tab="assumptions">PREMISSAS E ALERTAS</button></nav>
          <section class="rsc-panel ${activeTab === 'rfb' ? 'active' : ''}" data-panel="rfb">${rfbPanel(state, output)}</section><section class="rsc-panel ${activeTab === 'pgfn' ? 'active' : ''}" data-panel="pgfn">${pgfnPanel(state, output)}</section><section class="rsc-panel ${activeTab === 'tis' ? 'active' : ''}" data-panel="tis">${tisPanel(state, output)}</section><section class="rsc-panel ${activeTab === 'guarantee' ? 'active' : ''}" data-panel="guarantee">${guaranteePanel(state, output)}</section><section class="rsc-panel ${activeTab === 'assumptions' ? 'active' : ''}" data-panel="assumptions">${assumptionsPanel(state, output)}</section>
          <div class="rsc-final-report ${state.selections.length ? 'show' : ''}"><div class="rsc-final-top"><strong>Resumo selecionado para o relatório</strong><div class="rsc-selected">${selectedLabels.map((label) => `<span>${label}</span>`).join('')}</div></div><div class="rsc-final-message"><p>Com a estratégia certa, o potencial de redução é de</p><strong>${brl(potential)}</strong><small>Projeção formada apenas pelos cenários selecionados, sem duplicidade de bases.</small></div></div>
          <footer class="rsc-footer"><span data-save-status>Premissas e valores vinculados ao caso.</span><button class="rsc-save" data-save-snapshot>Registrar fotografia no Caderno</button></footer>
        </main>
      </div>${advancedModal(state)}<div class="rsc-toast" role="status"></div>
    </div>`;
  }

  function collectDebts(panel, lead) {
    const get = (name) => number(panel.querySelector(`[name="debt-${name}"]`)?.value);
    Object.assign(lead, {
      rfbDebt: get('rfb'), rfbTotal: get('rfb'),
      pgfnSimple: get('simple'), pgfnPrev: get('socialSecurity'),
      pgfnTrib: get('tax'), pgfnOther: get('other'),
      impediment: Boolean(panel.querySelector('[name="impediment"]')?.checked),
      hasImpediment: Boolean(panel.querySelector('[name="impediment"]')?.checked),
      simplifiedProposal: Boolean(panel.querySelector('[name="simplified"]')?.checked)
    });
  }

  function collectAdvanced(panel, lead) {
    const value = (name) => panel.querySelector(`[name="${name}"]`)?.value;
    Object.assign(lead, {
      reparcelment: value('rfbMode'), rfbCustomEntryRateOverride: value('rfbCustomEntry'),
      rfbTermOverride: value('rfbTerm'), rfbMinInstallmentOverride: value('rfbMinimum'),
      pgfnEntryRateOverride: value('pgfnEntryRate'), pgfnEntryMonthsOverride: value('pgfnEntryMonths'),
      pgfnDiscountOverride: value('pgfnDiscount'), pgfnTermOverride: value('pgfnTerm'),
      pgfnPrevTermOverride: value('pgfnSocialTerm'), pgfnMinInstallmentOverride: value('pgfnMinimum'),
      rfbMigrationEntryRate: value('migrationEntryRate'), rfbMigrationEntryMonths: value('migrationEntryMonths'),
      rfbMigrationDiscount: value('migrationDiscount'), rfbMigrationTerm: value('migrationTerm'),
      tisDiscountOverride: value('tisDiscount'), tisTermOverride: value('tisTerm'),
      guaranteeMode: value('guaranteeModel'), guaranteeBaseOverride: value('guaranteeBase'),
      guaranteeCostPctOverride: value('guaranteeCostRate'), guaranteeEntryPctOverride: value('guaranteeEntryRate'),
      guaranteeInstallmentsOverride: value('guaranteeMonths'), guaranteeAdditionalCosts: value('guaranteeAdditionalCosts')
    });
  }

  function updateAutomaticText(lead, field, memoryField, value) {
    const current = text(lead[field]);
    const previousAutomatic = text(lead[memoryField]);
    if (!current || current === previousAutomatic) lead[field] = value;
    lead[memoryField] = value;
  }

  function syncAutomaticFronts(lead, fronts) {
    const previousAutomatic = new Set(Array.isArray(lead.autoSelectedFronts) ? lead.autoSelectedFronts : []);
    const manual = (Array.isArray(lead.selectedFronts) ? lead.selectedFronts : []).filter((item) => !previousAutomatic.has(item));
    lead.autoSelectedFronts = [...fronts];
    lead.selectedFronts = [...new Set([...manual, ...fronts])];
  }

  function registerSnapshotNote(lead, state, diagnostic, now) {
    lead.notes = Array.isArray(lead.notes) ? lead.notes : [];
    const scenarios = diagnostic.selectedScenarioNames.join('; ') || 'nenhum cenário selecionado';
    const signature = `diagnostic-snapshot|${state.selections.join(',')}|${diagnostic.potentialReduction}`;
    const recent = [...lead.notes].reverse().find((note) => note._signature === signature && Date.now() - new Date(note.createdAt || 0).getTime() < 5000);
    if (recent) return;
    lead.notes.push({
      id: `note_${Date.now().toString(36)}`,
      date: now.slice(0, 10),
      title: 'Diagnóstico e simulação estratégica registrados',
      body: `${diagnostic.summary} Cenários levados ao relatório: ${scenarios}. Próximo passo: ${diagnostic.nextStep}`,
      tags: ['simulação', 'estratégia', 'relatório'],
      pinned: true,
      automatic: true,
      createdAt: now,
      updatedAt: now,
      _signature: signature
    });
  }

  function persist(ctx, snapshot = false) {
    const state = stateFromLead(ctx.lead);
    const output = calculate(state);
    const potential = selectedReduction(state, output);
    const now = new Date().toISOString();
    const ratings = Engine.calculateRiskRatings(ctx.lead);
    const simulations = Engine.reportRows({ lead: ctx.lead, state, output, selections: state.selections });
    const diagnostic = Engine.buildDiagnostic({
      lead: ctx.lead,
      state,
      output,
      selections: state.selections,
      rows: simulations,
      ratings,
      inactionRate: ctx.db.settings?.pricing?.inactionAnnualRate ?? 12
    });
    const reportConfig = { ...(ctx.lead.reportConfig || {}) };
    ['showExecutive', 'showCurrent', 'showInaction', 'showTarget', 'showStrategy', 'showFronts', 'showPlan', 'showNextSteps'].forEach((key) => {
      if (reportConfig[key] === undefined) reportConfig[key] = true;
    });
    ['showRT', 'showFinancial', 'showFiscal', 'showCollection', 'showSimulations', 'showReduction'].forEach((key) => { reportConfig[key] = true; });
    if (!text(reportConfig.conclusion) || text(reportConfig.conclusion) === text(ctx.lead.autoReportConclusion)) {
      reportConfig.conclusion = diagnostic.conclusion;
    }
    updateAutomaticText(ctx.lead, 'manualStrategyTitle', 'autoStrategyTitle', diagnostic.title);
    updateAutomaticText(ctx.lead, 'manualStrategySummary', 'autoStrategySummary', diagnostic.summary);
    updateAutomaticText(ctx.lead, 'manualPlan', 'autoStrategyPlan', diagnostic.plan.join('\n'));
    syncAutomaticFronts(ctx.lead, diagnostic.fronts);
    Object.assign(ctx.lead, {
      strategicCombinedReduction: output.strategicReduction,
      potentialReduction: potential,
      reportStrategicStatement: `Com a estratégia certa, o potencial de redução é de ${brl(potential)}`,
      reportPotentialReduction: potential,
      reportSelectedScenarios: simulations.filter((item) => item.id !== 'strategic_total'),
      selectedScenarioId: state.selections.length ? `strategic:${state.selections.join('+')}` : '',
      simulations,
      ratings,
      diagnosticFinal: diagnostic,
      reportConfig,
      autoReportConclusion: diagnostic.conclusion,
      updatedAt: now,
      lastMovementAt: now
    });
    if (snapshot) {
      const savedSimulation = {
        id: `strategic_${Date.now().toString(36)}`,
        title: `Simulação estratégica — ${new Date().toLocaleDateString('pt-BR')}`,
        summary: ctx.lead.reportStrategicStatement,
        totalDebt: output.totalDebt,
        strategicReduction: output.strategicReduction,
        reportPotentialReduction: potential,
        reportSelections: state.selections,
        rfb: output.rfb,
        pgfn: output.pgfn,
        migration: output.migration,
        tis: output.tis,
        guarantee: output.guarantee,
        simulations,
        ratings,
        diagnostic,
        createdAt: now
      };
      ctx.lead.lastSimulation = savedSimulation;
      ctx.lead.simulationHistory = Array.isArray(ctx.lead.simulationHistory) ? ctx.lead.simulationHistory : [];
      ctx.lead.simulationHistory.unshift(savedSimulation);
      ctx.lead.simulationHistory = ctx.lead.simulationHistory.slice(0, 20);
      registerSnapshotNote(ctx.lead, state, diagnostic, now);
    }
    localStorage.setItem(ctx.key, JSON.stringify(ctx.db));
    window.dispatchEvent(new CustomEvent('radar:case-updated', { detail: { leadId: ctx.lead.id, source: 'simulations' } }));
    document.dispatchEvent(new CustomEvent('radar:lead-updated', { detail: { leadId: ctx.lead.id, source: 'simulations' } }));
  }

  function toast(panel, message) {
    const node = panel.querySelector('.rsc-toast');
    if (!node) return;
    node.textContent = message;
    node.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove('show'), 2200);
  }

  function bind(panel, ctx) {
    panel.addEventListener('click', (event) => {
      const tab = event.target.closest('[data-tab]');
      if (tab) {
        activeTab = tab.dataset.tab;
        panel.querySelectorAll('[data-tab]').forEach((node) => node.classList.toggle('active', node === tab));
        panel.querySelectorAll('[data-panel]').forEach((node) => node.classList.toggle('active', node.dataset.panel === activeTab));
        return;
      }
      if (event.target.closest('[data-toggle-tis]')) {
        showTis = !showTis;
        if (showTis) activeTab = 'tis';
        render(panel, ctx);
        return;
      }
      const report = event.target.closest('[data-report]');
      if (report) {
        const state = stateFromLead(ctx.lead);
        const id = report.dataset.report;
        ctx.lead.reportScenarioSelections = state.selections.includes(id)
          ? state.selections.filter((item) => item !== id)
          : [...state.selections, id];
        persist(ctx);
        render(panel, ctx);
        toast(panel, ctx.lead.reportScenarioSelections.includes(id) ? 'Cenário incluído no relatório.' : 'Cenário removido do relatório.');
        return;
      }
      if (event.target.closest('[data-recalculate]')) {
        collectDebts(panel, ctx.lead);
        persist(ctx);
        render(panel, ctx);
        toast(panel, 'Simulação atualizada e salva no caso.');
        return;
      }
      if (event.target.closest('[data-save-advanced]')) {
        collectAdvanced(panel, ctx.lead);
        persist(ctx);
        render(panel, ctx);
        toast(panel, 'Parâmetros avançados aplicados.');
        return;
      }
      if (event.target.closest('[data-close-modal]')) {
        panel.querySelector('[data-modal]')?.classList.remove('show');
        const checkbox = panel.querySelector('#rsc-advanced');
        if (checkbox) checkbox.checked = false;
        return;
      }
      if (event.target.closest('[data-save-snapshot]')) {
        collectDebts(panel, ctx.lead);
        if (!stateFromLead(ctx.lead).selections.length) {
          toast(panel, 'Inclua ao menos um cenário no relatório antes de registrar a fotografia.');
          return;
        }
        persist(ctx, true);
        render(panel, ctx);
        toast(panel, 'Fotografia registrada no Caderno.');
      }
    });
    panel.addEventListener('change', (event) => {
      if (event.target.matches('#rsc-advanced')) {
        panel.querySelector('[data-modal]')?.classList.toggle('show', event.target.checked);
        return;
      }
      if (event.target.closest('.rsc-inputs')) {
        collectDebts(panel, ctx.lead);
        persist(ctx);
      }
    });
  }

  function anchor() {
    const paymentFlow = document.querySelector('section.radar-payment-flow');
    if (paymentFlow) return paymentFlow;
    const heading = [...document.querySelectorAll('h2,h3,strong,summary')].find((node) => /Ajustar premissas avançadas|Parâmetros técnicos adicionais|Entrada parcelada e saldo/i.test(node.textContent || ''));
    return heading?.closest('section,article,.card,.panel,div') || null;
  }

  function hideLegacy(panel) {
    document.querySelector('section.radar-payment-flow')?.setAttribute('hidden', '');
    ['Cenários Automáticos', 'Comparativo das simulações'].forEach((label) => {
      document.querySelectorAll('h1,h2,h3').forEach((heading) => {
        if (text(heading.textContent) !== label) return;
        const branch = heading.closest('section,article,.card,.panel');
        if (branch && !branch.contains(panel)) branch.setAttribute('hidden', '');
      });
    });
  }

  function renameNavigation() {
    document.querySelectorAll('button,a,[role="tab"]').forEach((node) => {
      if (text(node.textContent) === 'Cenários') node.textContent = 'Simulações';
    });
  }

  function patchCadernoCompatibility() {
    if (window.RadarExt) window.RadarExt.totalDebt = (lead) => Engine.leadDebt(lead).total;
  }

  function mount() {
    scheduled = false;
    renameNavigation();
    patchCadernoCompatibility();
    const ctx = context();
    const target = anchor();
    if (!ctx || !target?.parentElement) return;
    CASE_KEYS.forEach((key) => localStorage.setItem(key, text(ctx.lead.id)));
    let panel = document.getElementById(ID);
    if (panel && currentLeadId && currentLeadId !== text(ctx.lead.id)) {
      panel.remove();
      panel = null;
    }
    if (!panel) {
      panel = document.createElement('section');
      panel.id = ID;
      target.parentElement.insertBefore(panel, target);
      bind(panel, ctx);
    }
    if (currentLeadId !== text(ctx.lead.id) || !panel.innerHTML) {
      currentLeadId = text(ctx.lead.id);
      activeTab = number(text(ctx.lead.rfbDebt) !== '' ? ctx.lead.rfbDebt : ctx.lead.rfbTotal) ? 'rfb' : 'pgfn';
      showTis = false;
      render(panel, ctx);
    }
    hideLegacy(panel);
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(mount);
  }

  document.addEventListener('click', (event) => {
    const target = event.target.closest('button,a,[role="tab"]');
    if (target && ['Cenários', 'Simulações'].includes(text(target.textContent))) {
      setTimeout(schedule, 60);
      setTimeout(schedule, 220);
    }
  }, true);
  window.addEventListener('radar:cloud-synced', () => setTimeout(schedule, 80));
  window.addEventListener('load', () => setTimeout(schedule, 700));
  document.addEventListener('DOMContentLoaded', () => setTimeout(schedule, 250), { once: true });
  setTimeout(schedule, 1200);
  [500, 1200, 2500].forEach((delay) => setTimeout(patchCadernoCompatibility, delay));

  window.RadarStrategicCalculator = { mount: schedule, getContext: context, calculate };
  window.RadarSimulationsConsolidation = { reconcile: schedule };
})();
