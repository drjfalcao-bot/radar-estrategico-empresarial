(() => {
  'use strict';

  const PANEL_ID = 'radar-calculator-workbench';
  const STYLE_ID = 'radar-calculator-workbench-style';
  const CURRENT_CASE_KEYS = ['radar_current_case_id', 'radar_current_lead_id', 'radar_estrategico_current_case_id'];
  let renderTimer = null;
  let mutationLock = false;

  const text = (value) => String(value ?? '');
  const number = (value) => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const raw = text(value).trim();
    if (!raw) return 0;
    const normalized = raw.includes(',')
      ? raw.replace(/\./g, '').replace(',', '.')
      : raw.replace(/[^0-9.-]/g, '');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, number(value)));
  const integer = (value, fallback = 0) => {
    const parsed = Math.round(number(value));
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const brl = (value) => new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2
  }).format(number(value));
  const pct = (value) => `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(number(value))}%`;
  const esc = (value) => text(value).replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));

  function findDatabase() {
    const preferredKey = window.RadarCloud?.dbKey;
    if (preferredKey) {
      try {
        const db = JSON.parse(localStorage.getItem(preferredKey) || 'null');
        if (db && Array.isArray(db.leads) && db.settings) return { key: preferredKey, db };
      } catch (_) {}
    }

    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key) continue;
      try {
        const db = JSON.parse(localStorage.getItem(key) || 'null');
        if (db && Array.isArray(db.leads) && db.settings) return { key, db };
      } catch (_) {}
    }
    return null;
  }

  function currentCaseId() {
    for (const key of CURRENT_CASE_KEYS) {
      const value = localStorage.getItem(key);
      if (value) return value.replace(/^"|"$/g, '');
    }
    return '';
  }

  function parseMoneyFromCell(value) {
    const match = text(value).match(/R\$\s*([\d.]+(?:,\d{1,2})?)/i);
    return match ? number(match[1]) : 0;
  }

  function visibleOriginals() {
    const result = { rfb: 0, pgfn: 0 };
    const section = [...document.querySelectorAll('section.panel')].find((item) =>
      item.querySelector('h2')?.textContent?.includes('Comparativo das simulações')
    );
    if (!section) return result;
    section.querySelectorAll('tbody tr').forEach((row) => {
      const cells = row.querySelectorAll('td');
      if (cells.length < 2) return;
      const label = cells[0].textContent || '';
      const original = parseMoneyFromCell(cells[1].textContent || '');
      if (label.includes('Receita')) result.rfb = original;
      if (label.includes('PGFN') && !label.toLowerCase().includes('migração')) result.pgfn = original;
    });
    return result;
  }

  function pageIdentity() {
    const title = document.querySelector('.case-head h1')?.textContent?.trim() || '';
    const subtitle = document.querySelector('.case-head p')?.textContent || '';
    const cnpj = (subtitle.match(/\d{2}\.?\d{3}\.?\d{3}\/\d{4}-?\d{2}/)?.[0] || '').replace(/\D/g, '');
    return { title, cnpj };
  }

  function resolveLead(database) {
    const id = currentCaseId();
    if (id) {
      const byId = database.db.leads.find((lead) => text(lead.id) === id);
      if (byId) return byId;
    }

    const identity = pageIdentity();
    if (identity.cnpj) {
      const byCnpj = database.db.leads.find((lead) => text(lead.cnpj).replace(/\D/g, '') === identity.cnpj);
      if (byCnpj) return byCnpj;
    }
    if (identity.title) {
      const byTitle = database.db.leads.find((lead) => text(lead.companyName).trim() === identity.title);
      if (byTitle) return byTitle;
    }

    const visible = visibleOriginals();
    const candidates = database.db.leads.filter((lead) => {
      const rfb = number(lead.rfbDebt);
      const pgfn = number(lead.pgfnSimple) + number(lead.pgfnPrev) + number(lead.pgfnOther);
      return (!visible.rfb || Math.abs(rfb - visible.rfb) < 0.01)
        && (!visible.pgfn || Math.abs(pgfn - visible.pgfn) < 0.01);
    });
    return candidates.sort((a, b) => new Date(b.updatedAt || b.lastMovementAt || 0) - new Date(a.updatedAt || a.lastMovementAt || 0))[0] || null;
  }

  function context() {
    const database = findDatabase();
    if (!database) return null;
    const lead = resolveLead(database);
    return lead ? { ...database, lead } : null;
  }

  function settingsOf(ctx) {
    return ctx.db.settings?.pricing || {};
  }

  function isFavored(lead) {
    return ['simples', 'mei', 'me_epp', 'pf'].includes(lead.taxRegime) || lead.profile === 'me_epp';
  }

  function automaticPgfn(lead, settings) {
    const favored = isFavored(lead);
    const capagDiscount = {
      A: number(settings.pgfnDiscountA),
      B: number(settings.pgfnDiscountB),
      C: number(settings.pgfnDiscountC),
      D: favored ? number(settings.pgfnDiscountDFavored) : number(settings.pgfnDiscountDGeneral),
      nao_sei: number(settings.pgfnDiscountC)
    };
    const onlyPrev = number(lead.pgfnPrev) > 0 && number(lead.pgfnSimple) + number(lead.pgfnOther) === 0;
    return {
      entryRate: number(settings.pgfnEntryRate || 6),
      entryMonths: favored ? integer(settings.pgfnEntryMonthsFavored || 12, 12) : integer(settings.pgfnEntryMonthsGeneral || 6, 6),
      discount: number(capagDiscount[lead.capag || 'nao_sei'] ?? settings.pgfnDiscountC ?? 0),
      totalTerm: onlyPrev ? 60 : 145,
      minimum: number(settings.pgfnMinInstallment || 100)
    };
  }

  function stateFrom(ctx, panel = null) {
    const lead = ctx.lead;
    const settings = settingsOf(ctx);
    const automatic = automaticPgfn(lead, settings);
    const read = (name, fallback) => {
      const input = panel?.querySelector(`[name="${name}"]`);
      return input ? input.value : fallback;
    };
    return {
      reparcelment: read('rfb-reparcelment', lead.reparcelment || 'nenhum'),
      rfbMinimum: number(read('rfb-minimum', text(lead.rfbMinInstallmentOverride).trim() !== '' ? lead.rfbMinInstallmentOverride : (settings.rfbMinPJ || 500))),
      pgfnEntryRate: clamp(read('pgfn-entry-rate', text(lead.pgfnEntryRateOverride).trim() !== '' ? lead.pgfnEntryRateOverride : automatic.entryRate), 0, 100),
      pgfnEntryMonths: Math.max(1, integer(read('pgfn-entry-months', text(lead.pgfnEntryMonthsOverride).trim() !== '' ? lead.pgfnEntryMonthsOverride : automatic.entryMonths), automatic.entryMonths)),
      pgfnDiscount: clamp(read('pgfn-discount', text(lead.pgfnDiscountOverride).trim() !== '' ? lead.pgfnDiscountOverride : automatic.discount), 0, 100),
      pgfnTotalTerm: Math.max(2, integer(read('pgfn-total-term', text(lead.pgfnTermOverride).trim() !== '' ? lead.pgfnTermOverride : automatic.totalTerm), automatic.totalTerm)),
      pgfnMinimum: number(read('pgfn-minimum', text(lead.pgfnMinInstallmentOverride).trim() !== '' ? lead.pgfnMinInstallmentOverride : automatic.minimum)),
      automatic
    };
  }

  function minAdjusted(principal, months, minimum) {
    if (principal <= 0) return { months: 0, installment: 0 };
    let term = Math.max(1, integer(months, 1));
    let installment = principal / term;
    if (minimum > 0 && installment < minimum) {
      term = Math.max(1, Math.floor(principal / minimum));
      installment = principal / term;
    }
    return { months: term, installment };
  }

  function calculate(ctx, state) {
    const lead = ctx.lead;
    const rfbDebt = number(lead.rfbDebt);
    const pgfnSimple = number(lead.pgfnSimple);
    const pgfnPrev = number(lead.pgfnPrev);
    const pgfnOther = number(lead.pgfnOther);
    const pgfnDebt = pgfnSimple + pgfnPrev + pgfnOther;

    const rfbEntryRate = state.reparcelment === 'primeiro' ? 10 : state.reparcelment === 'segundo_ou_mais' ? 20 : 0;
    const rfbEntry = rfbDebt * rfbEntryRate / 100;
    const rfbBalance = Math.max(0, rfbDebt - rfbEntry);
    const rfbTerm = rfbEntryRate > 0 ? 59 : 60;
    const rfbAdjusted = minAdjusted(rfbBalance, rfbTerm, state.rfbMinimum);

    const pgfnEntry = pgfnDebt * state.pgfnEntryRate / 100;
    const pgfnEntryInstallment = state.pgfnEntryMonths ? pgfnEntry / state.pgfnEntryMonths : 0;
    const pgfnBase = Math.max(0, pgfnDebt - pgfnEntry);
    const pgfnReduction = pgfnBase * state.pgfnDiscount / 100;
    const pgfnBalance = Math.max(0, pgfnBase - pgfnReduction);
    const balanceMonthsRequested = Math.max(1, state.pgfnTotalTerm - state.pgfnEntryMonths);
    const pgfnAdjusted = minAdjusted(pgfnBalance, balanceMonthsRequested, state.pgfnMinimum);

    return {
      rfbDebt,
      pgfnDebt,
      pgfnPrev,
      pgfnMixedNature: pgfnPrev > 0 && (pgfnSimple + pgfnOther) > 0,
      rfb: {
        entryRate: rfbEntryRate,
        entry: rfbEntry,
        balance: rfbBalance,
        months: rfbAdjusted.months,
        installment: rfbAdjusted.installment
      },
      pgfn: {
        entry: pgfnEntry,
        entryInstallment: pgfnEntryInstallment,
        reduction: pgfnReduction,
        balance: pgfnBalance,
        months: pgfnAdjusted.months,
        installment: pgfnAdjusted.installment,
        projectedTotalMonths: state.pgfnEntryMonths + pgfnAdjusted.months
      }
    };
  }

  function save(ctx, changes) {
    Object.assign(ctx.lead, changes, {
      updatedAt: new Date().toISOString(),
      lastMovementAt: new Date().toISOString()
    });
    localStorage.setItem(ctx.key, JSON.stringify(ctx.db));
    window.dispatchEvent(new CustomEvent('radar:calculator-workbench-saved', { detail: { leadId: ctx.lead.id } }));
    const pulse = document.createElement('i');
    pulse.hidden = true;
    document.body.appendChild(pulse);
    pulse.remove();
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${PANEL_ID}{border:1px solid #c8deeb;background:linear-gradient(180deg,#f8fcff 0%,#fff 100%);overflow:hidden}
      #${PANEL_ID} .calcwb-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:18px}
      #${PANEL_ID} .calcwb-kicker{font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#087bb6}
      #${PANEL_ID} .calcwb-head h2{margin:4px 0 5px;font-size:23px;color:#082946}
      #${PANEL_ID} .calcwb-head p{margin:0;color:#60778b;font-size:13px}
      #${PANEL_ID} .calcwb-badge{white-space:nowrap;border-radius:999px;background:#e9f5fb;color:#076a9e;padding:8px 12px;font-size:11px;font-weight:800}
      #${PANEL_ID} .calcwb-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
      #${PANEL_ID} .calcwb-card{border:1px solid #d7e5ee;border-radius:16px;background:#fff;padding:18px;min-width:0}
      #${PANEL_ID} .calcwb-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px}
      #${PANEL_ID} .calcwb-card h3{margin:0;color:#0b2d49;font-size:17px}
      #${PANEL_ID} .calcwb-card-head small{color:#6a8193}
      #${PANEL_ID} .calcwb-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
      #${PANEL_ID} .calcwb-field{display:grid;gap:6px;min-width:0}
      #${PANEL_ID} .calcwb-field.wide{grid-column:1/-1}
      #${PANEL_ID} .calcwb-field>span{font-size:11px;font-weight:800;color:#294c67;text-transform:uppercase;letter-spacing:.04em}
      #${PANEL_ID} .calcwb-field input,#${PANEL_ID} .calcwb-field select{width:100%;box-sizing:border-box;border:1px solid #cfdde7;border-radius:10px;background:#fff;padding:11px 12px;font:inherit;color:#0b2d49}
      #${PANEL_ID} .calcwb-range-row{display:grid;grid-template-columns:minmax(0,1fr) 88px;gap:9px;align-items:center}
      #${PANEL_ID} input[type=range]{padding:0;border:0;accent-color:#0b82bd}
      #${PANEL_ID} .calcwb-output{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-top:14px}
      #${PANEL_ID} .calcwb-metric{border-radius:11px;background:#f3f8fb;padding:11px 12px;min-width:0}
      #${PANEL_ID} .calcwb-metric span{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#688093;font-weight:800}
      #${PANEL_ID} .calcwb-metric strong{display:block;margin-top:5px;color:#0a4267;font-size:15px;word-break:break-word}
      #${PANEL_ID} .calcwb-phase{grid-column:1/-1;border-left:4px solid #1587bd;background:#eaf6fc}
      #${PANEL_ID} .calcwb-note{margin:12px 0 0;padding:10px 12px;border-radius:10px;background:#fff8df;color:#745a00;font-size:11px;line-height:1.45}
      #${PANEL_ID} .calcwb-actions{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-top:18px;padding-top:16px;border-top:1px solid #dce8ef}
      #${PANEL_ID} .calcwb-actions-group{display:flex;gap:9px;flex-wrap:wrap}
      #${PANEL_ID} .calcwb-btn{border:0;border-radius:10px;padding:11px 15px;font-weight:800;cursor:pointer;font-size:12px}
      #${PANEL_ID} .calcwb-btn.primary{background:#076fa8;color:#fff}
      #${PANEL_ID} .calcwb-btn.secondary{background:#eaf2f7;color:#174b6c}
      #${PANEL_ID} .calcwb-status{font-size:12px;color:#587184;align-self:center}
      #${PANEL_ID} .calcwb-status.saved{color:#187345;font-weight:800}
      @media(max-width:900px){#${PANEL_ID} .calcwb-grid{grid-template-columns:1fr}}
      @media(max-width:620px){#${PANEL_ID} .calcwb-fields,#${PANEL_ID} .calcwb-output{grid-template-columns:1fr}#${PANEL_ID} .calcwb-field.wide,#${PANEL_ID} .calcwb-phase{grid-column:auto}#${PANEL_ID} .calcwb-head{display:block}#${PANEL_ID} .calcwb-badge{display:inline-block;margin-top:10px}}
    `;
    document.head.appendChild(style);
  }

  function rangeField({ label, name, value, min, max, step = 1, suffix = '' }) {
    return `<label class="calcwb-field"><span>${esc(label)}</span><div class="calcwb-range-row"><input type="range" name="${esc(name)}-range" min="${min}" max="${max}" step="${step}" value="${esc(value)}" data-pair="${esc(name)}"><input type="number" name="${esc(name)}" min="${min}" max="${max}" step="${step}" value="${esc(value)}" data-suffix="${esc(suffix)}"></div></label>`;
  }

  function panelHtml(ctx, state, calc) {
    const lead = ctx.lead;
    const rfbTypeLabel = state.reparcelment === 'primeiro'
      ? 'Primeiro reparcelamento — 10%'
      : state.reparcelment === 'segundo_ou_mais'
        ? 'Segundo ou posterior — 20%'
        : 'Parcelamento ordinário';
    const pgfnPhaseOne = `${state.pgfnEntryMonths}x de ${brl(calc.pgfn.entryInstallment)}`;
    const pgfnPhaseTwo = `${calc.pgfn.months}x de ${brl(calc.pgfn.installment)}`;

    return `
      <div class="calcwb-head">
        <div><div class="calcwb-kicker">Simulador de regularização</div><h2>Ajuste o cenário sem sair da análise</h2><p>O motor sugere as premissas; você mantém controle sobre a forma de pagamento utilizada na apresentação.</p></div>
        <span class="calcwb-badge">Premissas salvas por empresa</span>
      </div>
      <div class="calcwb-grid">
        <article class="calcwb-card">
          <div class="calcwb-card-head"><div><h3>Receita Federal</h3><small>Parcelamento e reparcelamento</small></div><strong>${brl(calc.rfbDebt)}</strong></div>
          <div class="calcwb-fields">
            <label class="calcwb-field wide"><span>Modalidade</span><select name="rfb-reparcelment">
              <option value="nenhum" ${state.reparcelment === 'nenhum' ? 'selected' : ''}>Parcelamento ordinário — sem entrada extraordinária</option>
              <option value="primeiro" ${state.reparcelment === 'primeiro' ? 'selected' : ''}>Primeiro reparcelamento — entrada de 10%</option>
              <option value="segundo_ou_mais" ${state.reparcelment === 'segundo_ou_mais' ? 'selected' : ''}>Segundo ou posterior — entrada de 20%</option>
            </select></label>
            <label class="calcwb-field"><span>Parcela mínima</span><input type="number" name="rfb-minimum" min="0" step="0.01" value="${esc(state.rfbMinimum)}"></label>
            <label class="calcwb-field"><span>Prazo de referência</span><input value="${calc.rfb.entryRate > 0 ? 'Entrada + até 59 parcelas' : 'Até 60 parcelas'}" disabled></label>
          </div>
          <div class="calcwb-output">
            <div class="calcwb-metric"><span>Regra aplicada</span><strong>${esc(rfbTypeLabel)}</strong></div>
            <div class="calcwb-metric"><span>Entrada</span><strong>${brl(calc.rfb.entry)}</strong></div>
            <div class="calcwb-metric"><span>Saldo após entrada</span><strong>${brl(calc.rfb.balance)}</strong></div>
            <div class="calcwb-metric"><span>Saldo parcelado</span><strong>${calc.rfb.months}x de ${brl(calc.rfb.installment)}</strong></div>
          </div>
        </article>

        <article class="calcwb-card">
          <div class="calcwb-card-head"><div><h3>PGFN</h3><small>Entrada parcelada + saldo</small></div><strong>${brl(calc.pgfnDebt)}</strong></div>
          <div class="calcwb-fields">
            ${rangeField({ label: 'Entrada (%)', name: 'pgfn-entry-rate', value: state.pgfnEntryRate, min: 0, max: 20, step: .1 })}
            ${rangeField({ label: 'Parcelas da entrada', name: 'pgfn-entry-months', value: state.pgfnEntryMonths, min: 1, max: 24, step: 1 })}
            ${rangeField({ label: 'Redução estimada (%)', name: 'pgfn-discount', value: state.pgfnDiscount, min: 0, max: 70, step: .1 })}
            ${rangeField({ label: 'Prazo total (meses)', name: 'pgfn-total-term', value: state.pgfnTotalTerm, min: 2, max: 180, step: 1 })}
            <label class="calcwb-field"><span>Parcela mínima</span><input type="number" name="pgfn-minimum" min="0" step="0.01" value="${esc(state.pgfnMinimum)}"></label>
            <label class="calcwb-field"><span>CAPAG informada</span><input value="${esc(lead.capag || 'Não informada')}" disabled></label>
          </div>
          <div class="calcwb-output">
            <div class="calcwb-metric calcwb-phase"><span>Fase 1 — entrada</span><strong>${pgfnPhaseOne}</strong><small>Total ${brl(calc.pgfn.entry)} · ${pct(state.pgfnEntryRate)}</small></div>
            <div class="calcwb-metric calcwb-phase"><span>Fase 2 — saldo</span><strong>${pgfnPhaseTwo}</strong><small>Saldo após redução: ${brl(calc.pgfn.balance)}</small></div>
            <div class="calcwb-metric"><span>Redução projetada</span><strong>${brl(calc.pgfn.reduction)}</strong></div>
            <div class="calcwb-metric"><span>Prazo projetado</span><strong>${calc.pgfn.projectedTotalMonths} meses</strong></div>
          </div>
          ${lead.impediment ? '<p class="calcwb-note"><strong>Impedimento informado.</strong> O cenário deve ser tratado como condicionado e pode exigir plano alternativo até a superação da restrição.</p>' : ''}
          ${calc.pgfnMixedNature ? '<p class="calcwb-note"><strong>Naturezas mistas.</strong> A projeção consolidada é gerencial. Débitos previdenciários podem exigir prazo e fluxo separados dos demais débitos.</p>' : ''}
        </article>
      </div>
      <div class="calcwb-actions">
        <span class="calcwb-status" data-calcwb-status>Altere as premissas e aplique para atualizar cards, tabela e relatório.</span>
        <div class="calcwb-actions-group"><button type="button" class="calcwb-btn secondary" data-calcwb-reset>Usar sugestão automática</button><button type="button" class="calcwb-btn primary" data-calcwb-apply>Aplicar e recalcular</button></div>
      </div>`;
  }

  function pairRanges(panel) {
    panel.querySelectorAll('input[type="range"][data-pair]').forEach((range) => {
      const target = panel.querySelector(`[name="${range.dataset.pair}"]`);
      if (!target) return;
      range.addEventListener('input', () => {
        target.value = range.value;
        liveRefresh(panel);
      });
      target.addEventListener('input', () => {
        range.value = target.value;
        liveRefresh(panel);
      });
    });
    panel.querySelectorAll('select,input[type="number"]').forEach((input) => {
      input.addEventListener('change', () => liveRefresh(panel));
    });
  }

  function liveRefresh(panel) {
    const ctx = context();
    if (!ctx) return;
    const state = stateFrom(ctx, panel);
    const calc = calculate(ctx, state);
    const focusedName = document.activeElement?.name || '';
    panel.innerHTML = panelHtml(ctx, state, calc);
    bind(panel);
    if (focusedName) panel.querySelector(`[name="${focusedName}"]`)?.focus();
  }

  function bind(panel) {
    pairRanges(panel);
    panel.querySelector('[data-calcwb-apply]')?.addEventListener('click', () => {
      const ctx = context();
      if (!ctx) return;
      const state = stateFrom(ctx, panel);
      save(ctx, {
        reparcelment: state.reparcelment,
        pgfnEntryRateOverride: text(state.pgfnEntryRate),
        pgfnEntryMonthsOverride: text(state.pgfnEntryMonths),
        pgfnDiscountOverride: text(state.pgfnDiscount),
        pgfnTermOverride: text(state.pgfnTotalTerm),
        pgfnMinInstallmentOverride: text(state.pgfnMinimum),
        rfbMinInstallmentOverride: text(state.rfbMinimum)
      });
      const status = panel.querySelector('[data-calcwb-status]');
      if (status) {
        status.textContent = 'Premissas aplicadas. Cards e comparativos foram recalculados.';
        status.classList.add('saved');
      }
      setTimeout(() => scheduleRender(250), 180);
    });

    panel.querySelector('[data-calcwb-reset]')?.addEventListener('click', () => {
      const ctx = context();
      if (!ctx) return;
      save(ctx, {
        reparcelment: 'nenhum',
        pgfnEntryRateOverride: '',
        pgfnEntryMonthsOverride: '',
        pgfnDiscountOverride: '',
        pgfnTermOverride: '',
        pgfnMinInstallmentOverride: '',
        rfbMinInstallmentOverride: ''
      });
      scheduleRender(120);
    });
  }

  function findAnchor() {
    const advanced = [...document.querySelectorAll('section.panel.details')].find((section) =>
      section.querySelector('summary')?.textContent?.includes('Ajustar premissas avançadas')
    );
    if (advanced) return advanced;
    const payment = document.querySelector('section.radar-payment-flow');
    if (payment) return payment;
    return [...document.querySelectorAll('section.panel')].find((section) =>
      section.querySelector('h2')?.textContent?.includes('Comparativo das simulações')
    )?.nextElementSibling || null;
  }

  function render() {
    renderTimer = null;
    if (mutationLock) return;
    const ctx = context();
    const anchor = findAnchor();
    if (!ctx || !anchor) return;
    injectStyle();

    let panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = document.createElement('section');
      panel.id = PANEL_ID;
      panel.className = 'panel';
      mutationLock = true;
      anchor.parentElement?.insertBefore(panel, anchor);
      mutationLock = false;
    }

    if (panel.contains(document.activeElement)) return;
    const state = stateFrom(ctx, panel);
    const calc = calculate(ctx, state);
    mutationLock = true;
    panel.innerHTML = panelHtml(ctx, state, calc);
    bind(panel);
    mutationLock = false;
  }

  function scheduleRender(delay = 100) {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(render, delay);
  }

  new MutationObserver(() => {
    if (!mutationLock) scheduleRender(140);
  }).observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener('storage', () => scheduleRender(100));
  window.addEventListener('radar:cloud-synced', () => scheduleRender(100));
  window.addEventListener('radar:calculator-workbench-saved', () => scheduleRender(220));
  document.addEventListener('click', () => scheduleRender(180), true);
  scheduleRender(300);
})();
