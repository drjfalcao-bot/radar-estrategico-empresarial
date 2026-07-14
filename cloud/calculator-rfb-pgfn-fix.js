(() => {
  'use strict';

  const MARK = 'radar-calculator-fix-v1';
  let scheduled = false;

  const num = (value) => {
    const parsed = Number(String(value ?? '').replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, num(value)));
  const brl = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(num(value));
  const pct = (value) => `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(num(value))}%`;
  const text = (value) => String(value ?? '');
  const esc = (value) => text(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

  function findDatabases() {
    const found = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key) continue;
      try {
        const db = JSON.parse(localStorage.getItem(key) || 'null');
        if (db && Array.isArray(db.leads) && db.settings) found.push({ key, db });
      } catch (_) {}
    }
    return found;
  }

  function pageIdentity() {
    const title = document.querySelector('.case-head h1')?.textContent?.trim() || '';
    const subtitle = document.querySelector('.case-head p')?.textContent || '';
    const cnpj = subtitle.match(/\d{2}\.?\d{3}\.?\d{3}\/\d{4}-?\d{2}/)?.[0] || '';
    return { title, cnpj: cnpj.replace(/\D/g, '') };
  }

  function resolveContext() {
    const identity = pageIdentity();
    if (!identity.title) return null;
    for (const item of findDatabases()) {
      const lead = item.db.leads.find((candidate) => {
        const candidateCnpj = text(candidate.cnpj).replace(/\D/g, '');
        return (identity.cnpj && candidateCnpj === identity.cnpj) || text(candidate.companyName).trim() === identity.title;
      });
      if (lead) return { ...item, lead };
    }
    return null;
  }

  function saveContext(context, changes) {
    Object.assign(context.lead, changes, {
      updatedAt: new Date().toISOString(),
      lastMovementAt: new Date().toISOString()
    });
    localStorage.setItem(context.key, JSON.stringify(context.db));
  }

  function favored(lead) {
    return ['simples', 'mei', 'me_epp', 'pf'].includes(lead.taxRegime) || lead.profile === 'me_epp';
  }

  function minAdjusted(principal, months, minimum) {
    if (principal <= 0) return { months: 0, installment: 0 };
    let term = Math.max(1, Math.floor(months));
    let installment = principal / term;
    if (minimum > 0 && installment < minimum) {
      term = Math.max(1, Math.floor(principal / minimum));
      installment = principal / term;
    }
    return { months: term, installment };
  }

  function calculate(context) {
    const lead = context.lead;
    const settings = context.db.settings?.pricing || {};
    const debtRfb = num(lead.rfbDebt);
    const debtPgfn = num(lead.pgfnSimple) + num(lead.pgfnPrev) + num(lead.pgfnOther);
    const isFavored = favored(lead);

    const reparcelment = lead.reparcelment || 'nenhum';
    const rfbEntryRate = reparcelment === 'primeiro' ? 10 : reparcelment === 'segundo_ou_mais' ? 20 : 0;
    const rfbEntry = debtRfb * rfbEntryRate / 100;
    const rfbBalance = Math.max(0, debtRfb - rfbEntry);
    const rfbMinimum = text(lead.rfbMinInstallmentOverride).trim() !== '' ? Math.max(0, num(lead.rfbMinInstallmentOverride)) : num(settings.rfbMinPJ || 500);
    const rfbAdjusted = minAdjusted(rfbBalance, rfbEntryRate > 0 ? 59 : 60, rfbMinimum);

    const autoDiscount = ({
      A: num(settings.pgfnDiscountA),
      B: num(settings.pgfnDiscountB),
      C: num(settings.pgfnDiscountC),
      D: isFavored ? num(settings.pgfnDiscountDFavored) : num(settings.pgfnDiscountDGeneral),
      nao_sei: num(settings.pgfnDiscountC)
    })[lead.capag || 'nao_sei'] ?? num(settings.pgfnDiscountC);

    const pgfnEntryRate = text(lead.pgfnEntryRateOverride).trim() !== '' ? clamp(lead.pgfnEntryRateOverride) : clamp(settings.pgfnEntryRate || 6);
    const pgfnEntryMonths = Math.max(1, Math.floor(text(lead.pgfnEntryMonthsOverride).trim() !== '' ? num(lead.pgfnEntryMonthsOverride) : (isFavored ? num(settings.pgfnEntryMonthsFavored || 12) : num(settings.pgfnEntryMonthsGeneral || 6))));
    const pgfnDiscount = text(lead.pgfnDiscountOverride).trim() !== '' ? clamp(lead.pgfnDiscountOverride) : clamp(autoDiscount);
    const pgfnAutoTerm = num(lead.pgfnPrev) > 0 && num(lead.pgfnSimple) + num(lead.pgfnOther) === 0 ? 60 : 145;
    const pgfnTotalTerm = Math.max(pgfnEntryMonths + 1, Math.floor(text(lead.pgfnTermOverride).trim() !== '' ? num(lead.pgfnTermOverride) : pgfnAutoTerm));
    const pgfnMinimum = text(lead.pgfnMinInstallmentOverride).trim() !== '' ? Math.max(0, num(lead.pgfnMinInstallmentOverride)) : num(settings.pgfnMinInstallment || 100);
    const pgfnEntry = debtPgfn * pgfnEntryRate / 100;
    const pgfnEntryInstallment = pgfnEntryMonths ? pgfnEntry / pgfnEntryMonths : pgfnEntry;
    const pgfnBase = Math.max(0, debtPgfn - pgfnEntry);
    const pgfnReduction = pgfnBase * pgfnDiscount / 100;
    const pgfnBalance = Math.max(0, pgfnBase - pgfnReduction);
    const pgfnAdjusted = minAdjusted(pgfnBalance, pgfnTotalTerm - pgfnEntryMonths, pgfnMinimum);

    const migrationEntry = debtRfb * pgfnEntryRate / 100;
    const migrationEntryInstallment = pgfnEntryMonths ? migrationEntry / pgfnEntryMonths : migrationEntry;
    const migrationBase = Math.max(0, debtRfb - migrationEntry);
    const migrationReduction = migrationBase * pgfnDiscount / 100;
    const migrationBalance = Math.max(0, migrationBase - migrationReduction);
    const migrationAdjusted = minAdjusted(migrationBalance, pgfnTotalTerm - pgfnEntryMonths, pgfnMinimum);

    return {
      debtRfb,
      debtPgfn,
      rfb: {
        reparcelment,
        entryRate: rfbEntryRate,
        entry: rfbEntry,
        balance: rfbBalance,
        months: rfbAdjusted.months,
        installment: rfbAdjusted.installment,
        name: reparcelment === 'primeiro' ? 'Receita — primeiro reparcelamento' : reparcelment === 'segundo_ou_mais' ? 'Receita — segundo reparcelamento ou posterior' : 'Receita — parcelamento ordinário'
      },
      pgfn: {
        entryRate: pgfnEntryRate,
        entryMonths: pgfnEntryMonths,
        entry: pgfnEntry,
        entryInstallment: pgfnEntryInstallment,
        discount: pgfnDiscount,
        reduction: pgfnReduction,
        balance: pgfnBalance,
        months: pgfnAdjusted.months,
        installment: pgfnAdjusted.installment,
        totalMonths: pgfnEntryMonths + pgfnAdjusted.months
      },
      migration: {
        entryRate: pgfnEntryRate,
        entryMonths: pgfnEntryMonths,
        entry: migrationEntry,
        entryInstallment: migrationEntryInstallment,
        discount: pgfnDiscount,
        reduction: migrationReduction,
        balance: migrationBalance,
        months: migrationAdjusted.months,
        installment: migrationAdjusted.installment,
        totalMonths: pgfnEntryMonths + migrationAdjusted.months
      },
      defaults: {
        pgfnEntryRate: num(settings.pgfnEntryRate || 6),
        pgfnEntryMonths: isFavored ? num(settings.pgfnEntryMonthsFavored || 12) : num(settings.pgfnEntryMonthsGeneral || 6),
        pgfnTerm: pgfnAutoTerm,
        pgfnMinimum: num(settings.pgfnMinInstallment || 100),
        rfbMinimum: num(settings.rfbMinPJ || 500)
      }
    };
  }

  function fieldHtml(label, field, value, placeholder, help, attrs = '') {
    return `<label class="field radar-inline-field"><span>${esc(label)}</span><input ${attrs} data-radar-calc-field="${field}" value="${esc(value ?? '')}" placeholder="${esc(placeholder || '')}">${help ? `<small>${esc(help)}</small>` : ''}</label>`;
  }

  function bindInputs(container, context) {
    container.querySelectorAll('[data-radar-calc-field]').forEach((input) => {
      if (input.dataset.bound === '1') return;
      input.dataset.bound = '1';
      input.addEventListener('change', () => {
        const value = input.type === 'number' ? input.value : input.value;
        saveContext(context, { [input.dataset.radarCalcField]: value });
        schedule();
      });
    });
  }

  function injectReparcelmentFlag(context) {
    const panels = [...document.querySelectorAll('.panel.form-panel')];
    const panel = panels.find((item) => item.querySelector('h3')?.textContent?.trim() === 'Passivo Fiscal');
    const grid = panel?.querySelector('.form-grid');
    if (!grid || grid.querySelector('[data-radar-calc-field="reparcelment"]') || grid.querySelector('[data-case-field="reparcelment"]')) return;

    const label = document.createElement('label');
    label.className = 'field radar-inline-field radar-rfb-flag';
    label.innerHTML = `<span>Reparcelamento na Receita</span><select data-radar-calc-field="reparcelment"><option value="nenhum">Não — parcelamento ordinário</option><option value="primeiro">Sim — primeiro reparcelamento (entrada de 10%)</option><option value="segundo_ou_mais">Sim — segundo ou posterior (entrada de 20%)</option></select><small>A entrada será calculada sobre o débito consolidado e exibida em valor.</small>`;
    label.querySelector('select').value = context.lead.reparcelment || 'nenhum';
    grid.appendChild(label);
    bindInputs(label, context);
  }

  function tableSection() {
    return [...document.querySelectorAll('section.panel')].find((section) => section.querySelector('h2')?.textContent?.includes('Comparativo das simulações'));
  }

  function updateRow(row, scenario, type, lead) {
    const cells = row?.querySelectorAll('td');
    if (!cells || cells.length < 6) return;

    if (type === 'rfb') {
      cells[0].innerHTML = `<strong>${esc(scenario.name)}</strong>`;
      cells[1].textContent = brl(scenario.original);
      cells[2].innerHTML = scenario.entry > 0
        ? `<strong>${brl(scenario.entry)}</strong><small>${pct(scenario.entryRate)} do débito consolidado</small>`
        : '—';
      cells[3].textContent = brl(0);
      cells[4].innerHTML = scenario.entry > 0
        ? `<strong>Entrada:</strong> 1x de ${brl(scenario.entry)}<br><strong>Saldo:</strong> ${scenario.months}x de ${brl(scenario.installment)}`
        : `${scenario.months}x de ${brl(scenario.installment)}`;
      cells[5].textContent = scenario.entry > 0
        ? `Entrada mínima de ${pct(scenario.entryRate)} (${brl(scenario.entry)}) considerada na formalização do reparcelamento. Saldo estimado de ${brl(scenario.balance)}.`
        : 'Projeção nominal, sem desconto, sujeita à atualização aplicável.';
      return;
    }

    cells[1].textContent = brl(scenario.original);
    cells[2].innerHTML = scenario.entry > 0
      ? `<strong>${scenario.entryMonths}x de ${brl(scenario.entryInstallment)}</strong><small>Total: ${brl(scenario.entry)} · ${pct(scenario.entryRate)}</small>`
      : '—';
    cells[3].textContent = brl(scenario.reduction);
    cells[4].innerHTML = `<strong>Fase 1:</strong> ${scenario.entryMonths}x de ${brl(scenario.entryInstallment)}<br><strong>Fase 2:</strong> ${scenario.months}x de ${brl(scenario.installment)}`;
    cells[5].textContent = type === 'pgfn'
      ? (lead.impediment
        ? `Há impedimento informado. A projeção mostra a entrada em ${scenario.entryMonths} parcelas e o saldo em ${scenario.months} parcelas apenas para comparação, condicionada à superação da restrição e à elegibilidade.`
        : `Entrada parcelada em ${scenario.entryMonths} prestações; depois, saldo estimado em ${scenario.months} prestações. Premissas condicionadas à modalidade, CAPAG, elegibilidade e validação dos débitos.`)
      : `Cenário potencial com entrada em ${scenario.entryMonths} prestações e saldo em ${scenario.months} prestações. A migração depende de inscrição, elegibilidade e modalidade disponível.`;
  }

  function updateComparison(context, calc) {
    const section = tableSection();
    if (!section) return;
    section.querySelectorAll('tbody tr').forEach((row) => {
      const name = row.querySelector('td')?.textContent || '';
      if (name.includes('Receita')) updateRow(row, { ...calc.rfb, original: calc.debtRfb }, 'rfb', context.lead);
      else if (name.includes('PGFN')) updateRow(row, { ...calc.pgfn, original: calc.debtPgfn }, 'pgfn', context.lead);
      else if (name.toLowerCase().includes('migração')) updateRow(row, { ...calc.migration, original: calc.debtRfb }, 'migration', context.lead);
    });
  }

  function updateScenarioCards(context, calc) {
    const current = [...document.querySelectorAll('.scenario-card.current')].find((card) => card.querySelector('span')?.textContent?.trim() === 'Cenário atual');
    const currentList = current?.querySelector('ul');
    if (currentList) {
      currentList.innerHTML = `
        <li>Receita: ${calc.rfb.entry > 0 ? `entrada de <strong>${brl(calc.rfb.entry)}</strong> (${pct(calc.rfb.entryRate)}) + ` : ''}${calc.rfb.months}x de ${brl(calc.rfb.installment)}</li>
        <li>PGFN — fase 1: <strong>${calc.pgfn.entryMonths}x de ${brl(calc.pgfn.entryInstallment)}</strong></li>
        <li>PGFN — fase 2: ${calc.pgfn.months}x de ${brl(calc.pgfn.installment)}</li>
        <li>Risco de cobrança preservado conforme os dados da análise</li>`;
    }

    const strategy = [...document.querySelectorAll('.scenario-card.strategy')].find((card) => card.querySelector('span')?.textContent?.trim() === 'Com estratégia');
    const strategyList = strategy?.querySelector('ul');
    if (strategyList) {
      const lines = [];
      if (calc.debtRfb > 0 && calc.rfb.entry > 0) lines.push(`<li>Receita — entrada: <strong>${brl(calc.rfb.entry)}</strong> (${pct(calc.rfb.entryRate)})</li>`);
      if (calc.debtPgfn > 0) {
        lines.push(`<li>PGFN — fase 1: <strong>${calc.pgfn.entryMonths}x de ${brl(calc.pgfn.entryInstallment)}</strong></li>`);
        lines.push(`<li>PGFN — fase 2: ${calc.pgfn.months}x de ${brl(calc.pgfn.installment)}</li>`);
        lines.push(`<li>Redução potencial estimada: ${brl(calc.pgfn.reduction)}</li>`);
      } else if (calc.debtRfb > 0) {
        lines.push(`<li>Saldo Receita: ${calc.rfb.months}x de ${brl(calc.rfb.installment)}</li>`);
        lines.push('<li>Sem desconto no parcelamento ordinário/reparcelamento</li>');
      }
      strategyList.innerHTML = lines.join('');
    }
  }

  function advancedPanel(context, calc) {
    const oldPanel = [...document.querySelectorAll('section.panel.details')].find((section) => section.querySelector('summary')?.textContent?.includes('Ajustar premissas avançadas'));
    if (!oldPanel) return;

    oldPanel.dataset.radarAdvanced = '1';
    oldPanel.innerHTML = `<details><summary>Ajustar premissas avançadas deste caso</summary><p>Estes campos alteram somente esta empresa. Deixe vazio para usar os parâmetros globais.</p><div class="form-grid radar-advanced-grid">
      <label class="field radar-inline-field"><span>Reparcelamento na Receita</span><select data-radar-calc-field="reparcelment"><option value="nenhum">Parcelamento ordinário — sem entrada extraordinária</option><option value="primeiro">Primeiro reparcelamento — entrada de 10%</option><option value="segundo_ou_mais">Segundo ou posterior — entrada de 20%</option></select><small>A entrada aparece em percentual e valor no comparativo.</small></label>
      ${fieldHtml('Entrada PGFN (%)', 'pgfnEntryRateOverride', context.lead.pgfnEntryRateOverride ?? '', `Padrão: ${calc.defaults.pgfnEntryRate}`, 'Percentual total da entrada.', 'type="number" min="0" max="100" step="0.1"')}
      ${fieldHtml('Parcelas da entrada PGFN', 'pgfnEntryMonthsOverride', context.lead.pgfnEntryMonthsOverride ?? '', `Padrão: ${calc.defaults.pgfnEntryMonths}`, 'Ex.: 6 ou 12 prestações.', 'type="number" min="1" max="24" step="1"')}
      ${fieldHtml('Desconto estimado (%)', 'pgfnDiscountOverride', context.lead.pgfnDiscountOverride ?? '', 'Automático pela CAPAG', 'Premissa gerencial sujeita à elegibilidade.', 'type="number" min="0" max="100" step="0.1"')}
      ${fieldHtml('Prazo total PGFN', 'pgfnTermOverride', context.lead.pgfnTermOverride ?? '', `Padrão: ${calc.defaults.pgfnTerm}`, 'Inclui as parcelas da entrada.', 'type="number" min="2" max="240" step="1"')}
      ${fieldHtml('Parcela mínima PGFN', 'pgfnMinInstallmentOverride', context.lead.pgfnMinInstallmentOverride ?? '', `Padrão: ${brl(calc.defaults.pgfnMinimum)}`, '', 'type="number" min="0" step="0.01"')}
      ${fieldHtml('Parcela mínima Receita', 'rfbMinInstallmentOverride', context.lead.rfbMinInstallmentOverride ?? '', `Padrão: ${brl(calc.defaults.rfbMinimum)}`, '', 'type="number" min="0" step="0.01"')}
    </div><div class="form-actions"><button class="btn secondary" type="button" data-radar-reset-calculator>Restaurar padrões deste caso</button></div></details>`;

    const select = oldPanel.querySelector('[data-radar-calc-field="reparcelment"]');
    if (select) select.value = context.lead.reparcelment || 'nenhum';
    bindInputs(oldPanel, context);
    oldPanel.querySelector('[data-radar-reset-calculator]')?.addEventListener('click', () => {
      saveContext(context, {
        reparcelment: 'nenhum',
        pgfnEntryRateOverride: '',
        pgfnEntryMonthsOverride: '',
        pgfnDiscountOverride: '',
        pgfnTermOverride: '',
        pgfnMinInstallmentOverride: '',
        rfbMinInstallmentOverride: ''
      });
      schedule();
    });
  }

  function paymentFlow(context, calc) {
    const details = document.querySelector('section.panel.details[data-radar-advanced="1"]');
    if (!details || calc.debtPgfn <= 0) return;
    let panel = document.querySelector('[data-radar-payment-flow]');
    if (!panel) {
      panel = document.createElement('section');
      panel.className = 'panel radar-payment-flow';
      panel.dataset.radarPaymentFlow = '1';
      details.parentElement?.insertBefore(panel, details);
    }
    panel.innerHTML = `<div class="panel-head"><div><div class="eyebrow">Fluxo de pagamento PGFN</div><h2>Entrada parcelada e saldo em fases separadas</h2></div><span class="badge">${calc.pgfn.totalMonths} meses projetados</span></div><div class="radar-phase-grid"><article><span>Fase 1 — entrada</span><strong>${calc.pgfn.entryMonths}x de ${brl(calc.pgfn.entryInstallment)}</strong><small>Total: ${brl(calc.pgfn.entry)} · ${pct(calc.pgfn.entryRate)}</small></article><article><span>Fase 2 — saldo</span><strong>${calc.pgfn.months}x de ${brl(calc.pgfn.installment)}</strong><small>Saldo após redução estimada: ${brl(calc.pgfn.balance)}</small></article></div><p class="radar-flow-note">A quantidade de parcelas da entrada, o percentual, o desconto e o prazo total podem ser ajustados logo abaixo para aproximar a simulação da modalidade efetivamente aplicável.</p>`;
  }

  function injectStyles() {
    if (document.getElementById(MARK)) return;
    const style = document.createElement('style');
    style.id = MARK;
    style.textContent = `
      .scenario-entry-cell strong,.scenario-entry-cell small{display:block}.scenario-entry-cell small{margin-top:4px;color:#60758a;font-size:11px}
      .radar-rfb-flag{border-left:3px solid #0a7bb7;padding-left:12px}
      .radar-payment-flow{border:1px solid #9fd6ef;background:linear-gradient(180deg,#f8fdff,#fff)}
      .radar-phase-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.radar-phase-grid article{border:1px solid #d7e7f0;border-radius:14px;padding:18px;background:#fff}.radar-phase-grid span,.radar-phase-grid small{display:block;color:#60758a}.radar-phase-grid strong{display:block;font-size:22px;color:#0b4e78;margin:8px 0}.radar-flow-note{margin:14px 0 0;color:#526b7d;font-size:12px}
      .radar-advanced-grid{margin-top:18px}.radar-inline-field select{width:100%}
      @media(max-width:760px){.radar-phase-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function apply() {
    scheduled = false;
    injectStyles();
    const context = resolveContext();
    if (!context) return;
    const calc = calculate(context);
    injectReparcelmentFlag(context);
    updateComparison(context, calc);
    updateScenarioCards(context, calc);
    advancedPanel(context, calc);
    paymentFlow(context, calc);
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(apply, 80);
  }

  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('storage', schedule);
  document.addEventListener('click', schedule, true);
  schedule();
})();