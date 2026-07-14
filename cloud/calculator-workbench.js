(() => {
  'use strict';

  const core = window.RadarCalculatorCore;
  if (!core) {
    console.error('[Radar Final] calculator-core.js não foi carregado.');
    return;
  }

  const VERSION = '2026.07.14-final.1';
  const PANEL_ID = 'radar-calculator-workbench';
  const STYLE_ID = 'radar-calculator-workbench-final-style';
  const CURRENT_CASE_KEYS = ['radar_current_case_id', 'radar_current_lead_id', 'radar_estrategico_current_case_id'];
  let renderTimer = null;
  let mutationLock = false;

  const text = (value) => String(value ?? '');
  const number = core.number;
  const integer = core.integer;
  const esc = (value) => text(value).replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));
  const brl = (value) => new Intl.NumberFormat('pt-BR', {
    style: 'currency', currency: 'BRL', minimumFractionDigits: 2
  }).format(number(value));
  const pct = (value) => `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(number(value))}%`;
  const nowIso = () => new Date().toISOString();

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

  function pageIdentity() {
    const title = document.querySelector('.case-head h1')?.textContent?.trim()
      || document.querySelector('main h1')?.textContent?.trim()
      || '';
    const subtitle = document.querySelector('.case-head p')?.textContent || '';
    const cnpj = (subtitle.match(/\d{2}\.?\d{3}\.?\d{3}\/\d{4}-?\d{2}/)?.[0] || '').replace(/\D/g, '');
    return { title, cnpj };
  }

  function resolveLead(database) {
    const id = currentCaseId();
    if (id) {
      const found = database.db.leads.find((lead) => text(lead.id) === id);
      if (found) return found;
    }
    const identity = pageIdentity();
    if (identity.cnpj) {
      const found = database.db.leads.find((lead) => text(lead.cnpj).replace(/\D/g, '') === identity.cnpj);
      if (found) return found;
    }
    if (identity.title) {
      const found = database.db.leads.find((lead) => text(lead.companyName).trim() === identity.title);
      if (found) return found;
    }
    return null;
  }

  function getContext() {
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

  function pgfnDebts(lead) {
    return {
      simple: number(lead.pgfnSimple),
      prev: number(lead.pgfnPrev),
      other: number(lead.pgfnOther)
    };
  }

  function defaultContext(ctx, mode) {
    const debts = pgfnDebts(ctx.lead);
    return core.modalityDefaults(mode, {
      settings: settingsOf(ctx),
      favored: isFavored(ctx.lead),
      onlyPrev: debts.prev > 0 && debts.simple + debts.other === 0,
      capag: ctx.lead.capag || 'nao_sei'
    });
  }

  function read(panel, name, fallback) {
    const input = panel?.querySelector(`[name="${name}"]`);
    return input ? input.value : fallback;
  }

  function stateFrom(ctx, panel = null) {
    const lead = ctx.lead;
    const mode = read(panel, 'pgfn-mode', lead.pgfnModality || 'parametrizada');
    const defaults = defaultContext(ctx, mode);
    const stored = (field, fallback) => text(lead[field]).trim() !== '' ? lead[field] : fallback;
    return {
      rfbMode: read(panel, 'rfb-mode', lead.reparcelment || 'nenhum'),
      rfbCustomEntryRate: number(read(panel, 'rfb-custom-entry', stored('rfbCustomEntryRateOverride', 0))),
      rfbTotalTerm: Math.max(1, integer(read(panel, 'rfb-total-term', stored('rfbTermOverride', 60)), 60)),
      rfbMinimum: Math.max(0, number(read(panel, 'rfb-minimum', stored('rfbMinInstallmentOverride', settingsOf(ctx).rfbMinPJ || 500)))),
      pgfnMode: mode,
      pgfnEligibilityStatus: read(panel, 'pgfn-eligibility', lead.pgfnEligibilityStatus || 'nao_avaliado'),
      pgfnEntryRate: core.clamp(read(panel, 'pgfn-entry-rate', stored('pgfnEntryRateOverride', defaults.entryRate)), 0, 100),
      pgfnEntryMonths: Math.max(1, integer(read(panel, 'pgfn-entry-months', stored('pgfnEntryMonthsOverride', defaults.entryMonths)), defaults.entryMonths)),
      pgfnDiscount: core.clamp(read(panel, 'pgfn-discount', stored('pgfnDiscountOverride', defaults.discount)), 0, 70),
      pgfnTotalTerm: Math.max(2, integer(read(panel, 'pgfn-total-term', stored('pgfnTermOverride', defaults.totalTerm)), defaults.totalTerm)),
      pgfnPrevTerm: Math.max(2, Math.min(60, integer(read(panel, 'pgfn-prev-term', stored('pgfnPrevTermOverride', defaults.prevTotalTerm)), 60))),
      pgfnMinimum: Math.max(0, number(read(panel, 'pgfn-minimum', stored('pgfnMinInstallmentOverride', defaults.minimum)))),
      smallValueLimit: Math.max(0, number(read(panel, 'small-value-limit', stored('smallValueLimitOverride', defaults.smallValueLimit)))),
      modalityNote: read(panel, 'pgfn-modality-note', lead.pgfnModalityNote || ''),
      defaults
    };
  }

  function calculate(ctx, state) {
    const debts = pgfnDebts(ctx.lead);
    const rfb = core.calculateRfb({
      debt: number(ctx.lead.rfbDebt),
      mode: state.rfbMode,
      customEntryRate: state.rfbCustomEntryRate,
      totalTerm: state.rfbTotalTerm,
      minimum: state.rfbMinimum
    });
    const pgfn = core.calculatePgfn({
      ...debts,
      mode: state.pgfnMode,
      entryRate: state.pgfnEntryRate,
      entryMonths: state.pgfnEntryMonths,
      discount: state.pgfnDiscount,
      totalTerm: state.pgfnTotalTerm,
      prevTotalTerm: state.pgfnPrevTerm,
      minimum: state.pgfnMinimum,
      smallValueLimit: state.smallValueLimit
    });
    return { rfb, pgfn, warnings: core.validateScenario(rfb, pgfn) };
  }

  function modalityLabel(mode) {
    return {
      parametrizada: 'Transação parametrizada',
      tis: 'Transação Individual Simplificada — TIS',
      pequeno_valor: 'Transação de pequeno valor',
      manual: 'Cenário manual'
    }[mode] || 'Transação parametrizada';
  }

  function eligibilityLabel(status) {
    return {
      nao_avaliado: 'Não avaliado',
      possivel: 'Possivelmente elegível',
      elegivel: 'Elegível após validação',
      nao_elegivel: 'Não enquadrado'
    }[status] || 'Não avaliado';
  }

  function rfbLabel(mode, rate) {
    if (mode === 'primeiro') return 'Primeiro reparcelamento — entrada de 10%';
    if (mode === 'segundo_ou_mais') return 'Segundo ou posterior — entrada de 20%';
    if (mode === 'personalizado') return `Entrada personalizada — ${pct(rate)}`;
    return 'Parcelamento ordinário — sem entrada extraordinária';
  }

  function rangeField({ label, name, value, min, max, step = 1, help = '' }) {
    return `<label class="calcwb-field"><span>${esc(label)}</span><div class="calcwb-range-row"><input type="range" name="${esc(name)}-range" min="${min}" max="${max}" step="${step}" value="${esc(value)}" data-pair="${esc(name)}"><input type="number" name="${esc(name)}" min="${min}" max="${max}" step="${step}" value="${esc(value)}"></div>${help ? `<small>${esc(help)}</small>` : ''}</label>`;
  }

  function metric(label, value, extra = '', className = '') {
    return `<div class="calcwb-metric ${className}"><span>${esc(label)}</span><strong>${value}</strong>${extra ? `<small>${extra}</small>` : ''}</div>`;
  }

  function modalityGuidance(state, calc) {
    if (state.pgfnMode === 'tis') {
      return `<div class="calcwb-guidance"><strong>TIS selecionada.</strong><span>Use os parâmetros como proposta gerencial do caso e valide elegibilidade, documentação e limites aplicáveis antes da apresentação definitiva.</span></div>`;
    }
    if (state.pgfnMode === 'pequeno_valor') {
      const status = calc.pgfn.withinSmallValueReference ? 'Dentro da referência financeira informada.' : 'Acima da referência financeira informada.';
      return `<div class="calcwb-guidance ${calc.pgfn.withinSmallValueReference ? 'ok' : 'warn'}"><strong>Pequeno valor.</strong><span>${status} O enquadramento definitivo depende dos demais critérios da modalidade vigente.</span></div>`;
    }
    if (state.pgfnMode === 'manual') {
      return `<div class="calcwb-guidance"><strong>Cenário manual.</strong><span>Os percentuais, prazos e valores abaixo serão tratados como premissas próprias desta análise.</span></div>`;
    }
    return `<div class="calcwb-guidance"><strong>Transação parametrizada.</strong><span>Premissas sugeridas a partir do perfil, CAPAG e natureza dos débitos, sempre sujeitas à validação da modalidade disponível.</span></div>`;
  }

  function natureRows(calc) {
    const rows = [
      ['Simples Nacional', calc.pgfn.simple],
      ['Previdenciário', calc.pgfn.prev],
      ['Demais débitos', calc.pgfn.other]
    ].filter(([, item]) => item.debt > 0);
    if (!rows.length) return '';
    return `<div class="calcwb-natures"><div class="calcwb-natures-head"><strong>Separação por natureza</strong><span>Evita misturar prazos e parcelas incompatíveis</span></div><div class="calcwb-table-wrap"><table><thead><tr><th>Natureza</th><th>Valor</th><th>Entrada</th><th>Redução</th><th>Saldo / parcela</th></tr></thead><tbody>${rows.map(([label, item]) => `<tr><td>${esc(label)}</td><td>${brl(item.debt)}</td><td>${brl(item.entry)}</td><td>${brl(item.reduction)}</td><td>${item.months}x de ${brl(item.installment)}</td></tr>`).join('')}</tbody></table></div></div>`;
  }

  function panelHtml(ctx, state, calc) {
    const lead = ctx.lead;
    const pgfnLabel = modalityLabel(state.pgfnMode);
    const warnings = [...calc.warnings];
    if (lead.impediment) warnings.unshift('Impedimento informado: trate o resultado como cenário condicionado e mantenha alternativa provisória.');
    if (calc.pgfn.mixedNature) warnings.push('Há natureza previdenciária misturada: o fluxo foi separado e o prazo previdenciário ficou limitado à referência informada.');

    return `<div class="calcwb-head"><div><div class="calcwb-kicker">Simulador final de regularização</div><h2>Construa o cenário sem sair da análise</h2><p>O motor sugere. Você escolhe a modalidade, ajusta as premissas e salva o cenário efetivamente apresentado.</p></div><span class="calcwb-badge">Versão ${esc(VERSION)}</span></div>
      <div class="calcwb-grid">
        <article class="calcwb-card">
          <div class="calcwb-card-head"><div><h3>Receita Federal</h3><small>Parcelamento e reparcelamento</small></div><strong>${brl(calc.rfb.debt)}</strong></div>
          <div class="calcwb-fields">
            <label class="calcwb-field wide"><span>Modalidade</span><select name="rfb-mode"><option value="nenhum" ${state.rfbMode === 'nenhum' ? 'selected' : ''}>Parcelamento ordinário — sem entrada extraordinária</option><option value="primeiro" ${state.rfbMode === 'primeiro' ? 'selected' : ''}>Primeiro reparcelamento — entrada de 10%</option><option value="segundo_ou_mais" ${state.rfbMode === 'segundo_ou_mais' ? 'selected' : ''}>Segundo ou posterior — entrada de 20%</option><option value="personalizado" ${state.rfbMode === 'personalizado' ? 'selected' : ''}>Entrada personalizada</option></select></label>
            ${state.rfbMode === 'personalizado' ? rangeField({ label: 'Entrada personalizada (%)', name: 'rfb-custom-entry', value: state.rfbCustomEntryRate, min: 0, max: 100, step: .1 }) : ''}
            <label class="calcwb-field"><span>Prazo total de referência</span><input type="number" name="rfb-total-term" min="1" max="120" step="1" value="${esc(state.rfbTotalTerm)}"><small>Inclui a fase de entrada, quando houver.</small></label>
            <label class="calcwb-field"><span>Parcela mínima</span><input type="number" name="rfb-minimum" min="0" step="0.01" value="${esc(state.rfbMinimum)}"></label>
          </div>
          <div class="calcwb-output">${metric('Regra aplicada', esc(rfbLabel(state.rfbMode, calc.rfb.entryRate)))}${metric('Entrada', brl(calc.rfb.entry), `${pct(calc.rfb.entryRate)} do débito`)}${metric('Saldo após entrada', brl(calc.rfb.balance))}${metric('Saldo parcelado', `${calc.rfb.months}x de ${brl(calc.rfb.installment)}`, `${calc.rfb.totalProjectedMonths} meses projetados`)}</div>
        </article>
        <article class="calcwb-card">
          <div class="calcwb-card-head"><div><h3>PGFN</h3><small>Modalidades e fluxo em fases</small></div><strong>${brl(calc.pgfn.debt)}</strong></div>
          <div class="calcwb-fields">
            <label class="calcwb-field wide"><span>Modalidade simulada</span><select name="pgfn-mode" data-mode-select><option value="parametrizada" ${state.pgfnMode === 'parametrizada' ? 'selected' : ''}>Transação parametrizada</option><option value="tis" ${state.pgfnMode === 'tis' ? 'selected' : ''}>TIS — Transação Individual Simplificada</option><option value="pequeno_valor" ${state.pgfnMode === 'pequeno_valor' ? 'selected' : ''}>Transação de pequeno valor</option><option value="manual" ${state.pgfnMode === 'manual' ? 'selected' : ''}>Cenário manual</option></select></label>
            <label class="calcwb-field"><span>Elegibilidade</span><select name="pgfn-eligibility"><option value="nao_avaliado" ${state.pgfnEligibilityStatus === 'nao_avaliado' ? 'selected' : ''}>Não avaliado</option><option value="possivel" ${state.pgfnEligibilityStatus === 'possivel' ? 'selected' : ''}>Possivelmente elegível</option><option value="elegivel" ${state.pgfnEligibilityStatus === 'elegivel' ? 'selected' : ''}>Elegível após validação</option><option value="nao_elegivel" ${state.pgfnEligibilityStatus === 'nao_elegivel' ? 'selected' : ''}>Não enquadrado</option></select></label>
            <label class="calcwb-field"><span>CAPAG informada</span><input value="${esc(lead.capag || 'Não informada')}" disabled></label>
            ${rangeField({ label: 'Entrada (%)', name: 'pgfn-entry-rate', value: state.pgfnEntryRate, min: 0, max: 30, step: .1 })}
            ${rangeField({ label: 'Parcelas da entrada', name: 'pgfn-entry-months', value: state.pgfnEntryMonths, min: 1, max: 24, step: 1 })}
            ${rangeField({ label: 'Redução estimada (%)', name: 'pgfn-discount', value: state.pgfnDiscount, min: 0, max: 70, step: .1 })}
            ${rangeField({ label: 'Prazo total geral', name: 'pgfn-total-term', value: state.pgfnTotalTerm, min: 2, max: 180, step: 1 })}
            ${calc.pgfn.prev.debt > 0 ? rangeField({ label: 'Prazo previdenciário', name: 'pgfn-prev-term', value: state.pgfnPrevTerm, min: 2, max: 60, step: 1 }) : ''}
            <label class="calcwb-field"><span>Parcela mínima</span><input type="number" name="pgfn-minimum" min="0" step="0.01" value="${esc(state.pgfnMinimum)}"></label>
            ${state.pgfnMode === 'pequeno_valor' ? `<label class="calcwb-field"><span>Referência financeira de pequeno valor</span><input type="number" name="small-value-limit" min="0" step="0.01" value="${esc(state.smallValueLimit)}"><small>Parâmetro gerencial editável; não substitui a validação do edital.</small></label>` : ''}
            <label class="calcwb-field wide"><span>Observação da modalidade</span><textarea name="pgfn-modality-note" rows="2" placeholder="Registre edital, condição, ressalva ou premissa utilizada.">${esc(state.modalityNote)}</textarea></label>
          </div>
          ${modalityGuidance(state, calc)}
          <div class="calcwb-output">${metric('Modalidade', esc(pgfnLabel), eligibilityLabel(state.pgfnEligibilityStatus))}${metric('Fase 1 — entrada', `${state.pgfnEntryMonths}x de ${brl(calc.pgfn.entryInstallment)}`, `Total ${brl(calc.pgfn.entry)} · ${pct(state.pgfnEntryRate)}`, 'calcwb-phase')}${metric('Fase 2 — saldo', `${calc.pgfn.balanceMonths}x de ${brl(calc.pgfn.phaseTwoInstallment)}`, `Saldo ${brl(calc.pgfn.balance)}`, 'calcwb-phase')}${metric('Redução projetada', brl(calc.pgfn.reduction), `${pct(state.pgfnDiscount)} sobre a base após entrada`)}${metric('Prazo projetado', `${calc.pgfn.projectedTotalMonths} meses`)}</div>
          ${natureRows(calc)}
        </article>
      </div>
      ${warnings.length ? `<div class="calcwb-warnings"><strong>Pontos de validação</strong><ul>${warnings.map((item) => `<li>${esc(item)}</li>`).join('')}</ul></div>` : ''}
      <div class="calcwb-actions"><span class="calcwb-status" data-calcwb-status>Altere as premissas e clique em aplicar para atualizar o caso, o comparativo e os documentos.</span><div class="calcwb-actions-group"><button type="button" class="calcwb-btn secondary" data-calcwb-defaults>Carregar padrão da modalidade</button><button type="button" class="calcwb-btn ghost" data-calcwb-snapshot>Salvar fotografia</button><button type="button" class="calcwb-btn primary" data-calcwb-apply>Aplicar e recalcular</button></div></div>`;
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${PANEL_ID}{border:1px solid #b9d6e7;background:linear-gradient(180deg,#f7fcff 0%,#fff 100%);overflow:hidden}
      #${PANEL_ID} *{box-sizing:border-box}
      #${PANEL_ID} .calcwb-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:18px}
      #${PANEL_ID} .calcwb-kicker{font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#087bb6}
      #${PANEL_ID} .calcwb-head h2{margin:4px 0 5px;font-size:24px;color:#082946}
      #${PANEL_ID} .calcwb-head p{margin:0;color:#60778b;font-size:13px;line-height:1.5}
      #${PANEL_ID} .calcwb-badge{white-space:nowrap;border-radius:999px;background:#e9f5fb;color:#076a9e;padding:8px 12px;font-size:11px;font-weight:800}
      #${PANEL_ID} .calcwb-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
      #${PANEL_ID} .calcwb-card{border:1px solid #d7e5ee;border-radius:16px;background:#fff;padding:18px;min-width:0}
      #${PANEL_ID} .calcwb-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px}
      #${PANEL_ID} .calcwb-card h3{margin:0;color:#0b2d49;font-size:18px}
      #${PANEL_ID} .calcwb-card-head small{display:block;color:#6a8193;margin-top:3px}
      #${PANEL_ID} .calcwb-card-head>strong{color:#0b4e78;font-size:15px}
      #${PANEL_ID} .calcwb-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
      #${PANEL_ID} .calcwb-field{display:grid;gap:6px;min-width:0}
      #${PANEL_ID} .calcwb-field.wide{grid-column:1/-1}
      #${PANEL_ID} .calcwb-field>span{font-size:10px;font-weight:800;color:#294c67;text-transform:uppercase;letter-spacing:.05em}
      #${PANEL_ID} .calcwb-field>small{color:#6b8192;font-size:10px;line-height:1.35}
      #${PANEL_ID} .calcwb-field input,#${PANEL_ID} .calcwb-field select,#${PANEL_ID} .calcwb-field textarea{width:100%;border:1px solid #cfdde7;border-radius:10px;background:#fff;padding:11px 12px;font:inherit;color:#0b2d49;resize:vertical}
      #${PANEL_ID} .calcwb-field input:disabled{background:#f4f7f9;color:#62798b}
      #${PANEL_ID} .calcwb-range-row{display:grid;grid-template-columns:minmax(0,1fr) 92px;gap:9px;align-items:center}
      #${PANEL_ID} input[type=range]{padding:0;border:0;accent-color:#0b82bd}
      #${PANEL_ID} .calcwb-output{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-top:14px}
      #${PANEL_ID} .calcwb-metric{border-radius:11px;background:#f3f8fb;padding:11px 12px;min-width:0}
      #${PANEL_ID} .calcwb-metric span{display:block;font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:#688093;font-weight:800}
      #${PANEL_ID} .calcwb-metric strong{display:block;margin-top:5px;color:#0a4267;font-size:15px;word-break:break-word}
      #${PANEL_ID} .calcwb-metric small{display:block;margin-top:4px;color:#61788a;font-size:10px;line-height:1.35}
      #${PANEL_ID} .calcwb-phase{border-left:4px solid #1587bd;background:#eaf6fc}
      #${PANEL_ID} .calcwb-guidance{margin:13px 0 0;padding:11px 12px;border-radius:10px;background:#eef6fb;color:#315b75;font-size:11px;line-height:1.45}
      #${PANEL_ID} .calcwb-guidance strong,#${PANEL_ID} .calcwb-guidance span{display:block}
      #${PANEL_ID} .calcwb-guidance.ok{background:#eaf8ef;color:#1c6740}
      #${PANEL_ID} .calcwb-guidance.warn{background:#fff7df;color:#715800}
      #${PANEL_ID} .calcwb-natures{margin-top:14px;border:1px solid #dce8ef;border-radius:12px;overflow:hidden}
      #${PANEL_ID} .calcwb-natures-head{display:flex;justify-content:space-between;gap:10px;padding:10px 12px;background:#f6f9fb;font-size:11px;color:#385a70}
      #${PANEL_ID} .calcwb-table-wrap{overflow:auto}
      #${PANEL_ID} table{width:100%;border-collapse:collapse;font-size:10px}
      #${PANEL_ID} th,#${PANEL_ID} td{padding:9px 10px;border-top:1px solid #e5edf2;text-align:left;white-space:nowrap}
      #${PANEL_ID} th{color:#5d7486;text-transform:uppercase;font-size:9px}
      #${PANEL_ID} .calcwb-warnings{margin-top:14px;padding:12px 14px;border-radius:12px;background:#fff7df;color:#725900;font-size:11px}
      #${PANEL_ID} .calcwb-warnings ul{margin:7px 0 0;padding-left:18px}
      #${PANEL_ID} .calcwb-warnings li+li{margin-top:4px}
      #${PANEL_ID} .calcwb-actions{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:18px;padding-top:16px;border-top:1px solid #dce8ef}
      #${PANEL_ID} .calcwb-actions-group{display:flex;gap:9px;flex-wrap:wrap}
      #${PANEL_ID} .calcwb-btn{border:0;border-radius:10px;padding:11px 15px;font-weight:800;cursor:pointer;font-size:11px}
      #${PANEL_ID} .calcwb-btn.primary{background:#076fa8;color:#fff}
      #${PANEL_ID} .calcwb-btn.secondary{background:#eaf2f7;color:#174b6c}
      #${PANEL_ID} .calcwb-btn.ghost{background:#fff;border:1px solid #cbdbe5;color:#174b6c}
      #${PANEL_ID} .calcwb-status{font-size:11px;color:#587184;align-self:center;max-width:600px}
      #${PANEL_ID} .calcwb-status.saved{color:#187345;font-weight:800}
      @media(max-width:980px){#${PANEL_ID} .calcwb-grid{grid-template-columns:1fr}}
      @media(max-width:650px){#${PANEL_ID} .calcwb-fields,#${PANEL_ID} .calcwb-output{grid-template-columns:1fr}#${PANEL_ID} .calcwb-field.wide{grid-column:auto}#${PANEL_ID} .calcwb-head{display:block}#${PANEL_ID} .calcwb-badge{display:inline-block;margin-top:10px}#${PANEL_ID} .calcwb-range-row{grid-template-columns:minmax(0,1fr) 78px}}
    `;
    document.head.appendChild(style);
  }

  function persist(ctx, state, calc, snapshotOnly = false) {
    const timestamp = nowIso();
    const summary = [
      `Receita: entrada ${brl(calc.rfb.entry)} e saldo ${calc.rfb.months}x de ${brl(calc.rfb.installment)}.`,
      `PGFN (${modalityLabel(state.pgfnMode)}): entrada ${state.pgfnEntryMonths}x de ${brl(calc.pgfn.entryInstallment)} e saldo ${calc.pgfn.balanceMonths}x de ${brl(calc.pgfn.phaseTwoInstallment)}.`,
      `Redução potencial ${brl(calc.pgfn.reduction)}.`
    ].join(' ');
    const snapshot = {
      id: `sim_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      createdAt: timestamp,
      mode: state.pgfnMode,
      title: `${modalityLabel(state.pgfnMode)} — ${new Date().toLocaleDateString('pt-BR')}`,
      summary,
      rfb: calc.rfb,
      pgfn: calc.pgfn,
      assumptions: { ...state }
    };

    if (!snapshotOnly) {
      Object.assign(ctx.lead, {
        reparcelment: state.rfbMode,
        rfbCustomEntryRateOverride: text(state.rfbCustomEntryRate),
        rfbTermOverride: text(state.rfbTotalTerm),
        rfbMinInstallmentOverride: text(state.rfbMinimum),
        pgfnModality: state.pgfnMode,
        pgfnEligibilityStatus: state.pgfnEligibilityStatus,
        pgfnEntryRateOverride: text(state.pgfnEntryRate),
        pgfnEntryMonthsOverride: text(state.pgfnEntryMonths),
        pgfnDiscountOverride: text(state.pgfnDiscount),
        pgfnTermOverride: text(state.pgfnTotalTerm),
        pgfnPrevTermOverride: text(state.pgfnPrevTerm),
        pgfnMinInstallmentOverride: text(state.pgfnMinimum),
        smallValueLimitOverride: text(state.smallValueLimit),
        pgfnModalityNote: state.modalityNote,
        selectedScenarioId: snapshot.id,
        lastSimulation: { title: snapshot.title, summary },
        updatedAt: timestamp,
        lastMovementAt: timestamp
      });
    }

    ctx.lead.simulations = Array.isArray(ctx.lead.simulations) ? ctx.lead.simulations : [];
    ctx.lead.simulations.unshift(snapshot);
    ctx.lead.simulations = ctx.lead.simulations.slice(0, 20);
    ctx.lead.notes = Array.isArray(ctx.lead.notes) ? ctx.lead.notes : [];
    const signature = `Simulação atualizada|${summary}|simulação`;
    if (!ctx.lead.notes.some((note) => note._signature === signature)) {
      ctx.lead.notes.unshift({
        id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        title: snapshotOnly ? 'Fotografia de cenário salva' : 'Simulação de regularização atualizada',
        body: summary,
        date: new Date().toISOString().slice(0, 10),
        tags: ['simulação'],
        pinned: false,
        automatic: true,
        createdAt: timestamp,
        updatedAt: timestamp,
        _signature: signature
      });
    }
    localStorage.setItem(ctx.key, JSON.stringify(ctx.db));
    window.dispatchEvent(new CustomEvent('radar:calculator-workbench-saved', { detail: { leadId: ctx.lead.id, snapshotOnly } }));
    const pulse = document.createElement('i');
    pulse.hidden = true;
    document.body.appendChild(pulse);
    pulse.remove();
  }

  function collectState(ctx, panel) {
    return stateFrom(ctx, panel);
  }

  function renderPanel(panel, ctx, state) {
    const calc = calculate(ctx, state);
    mutationLock = true;
    panel.innerHTML = panelHtml(ctx, state, calc);
    mutationLock = false;
    bind(panel);
  }

  function setDefaultsForMode(panel, ctx, mode) {
    const defaults = defaultContext(ctx, mode);
    const values = {
      'pgfn-entry-rate': defaults.entryRate,
      'pgfn-entry-months': defaults.entryMonths,
      'pgfn-discount': defaults.discount,
      'pgfn-total-term': defaults.totalTerm,
      'pgfn-prev-term': defaults.prevTotalTerm,
      'pgfn-minimum': defaults.minimum,
      'small-value-limit': defaults.smallValueLimit
    };
    Object.entries(values).forEach(([name, value]) => {
      const input = panel.querySelector(`[name="${name}"]`);
      const range = panel.querySelector(`[name="${name}-range"]`);
      if (input) input.value = value;
      if (range) range.value = value;
    });
  }

  function bind(panel) {
    panel.querySelectorAll('input[type="range"][data-pair]').forEach((range) => {
      const input = panel.querySelector(`[name="${range.dataset.pair}"]`);
      if (!input) return;
      range.addEventListener('input', () => { input.value = range.value; preview(panel); });
      input.addEventListener('input', () => { range.value = input.value; preview(panel); });
    });

    panel.querySelector('[data-mode-select]')?.addEventListener('change', (event) => {
      const ctx = getContext();
      if (!ctx) return;
      setDefaultsForMode(panel, ctx, event.target.value);
      preview(panel);
    });

    panel.querySelectorAll('select:not([data-mode-select]),input[type="number"],textarea').forEach((input) => {
      input.addEventListener('change', () => preview(panel));
    });

    panel.querySelector('[data-calcwb-defaults]')?.addEventListener('click', () => {
      const ctx = getContext();
      if (!ctx) return;
      const mode = panel.querySelector('[name="pgfn-mode"]')?.value || 'parametrizada';
      setDefaultsForMode(panel, ctx, mode);
      preview(panel);
      setStatus(panel, 'Padrão da modalidade carregado. Revise e aplique para salvar.', false);
    });

    panel.querySelector('[data-calcwb-snapshot]')?.addEventListener('click', () => {
      const ctx = getContext();
      if (!ctx) return;
      const state = collectState(ctx, panel);
      const calc = calculate(ctx, state);
      persist(ctx, state, calc, true);
      setStatus(panel, 'Fotografia do cenário salva no caderno do caso.', true);
    });

    panel.querySelector('[data-calcwb-apply]')?.addEventListener('click', () => {
      const ctx = getContext();
      if (!ctx) return;
      const state = collectState(ctx, panel);
      const calc = calculate(ctx, state);
      persist(ctx, state, calc, false);
      setStatus(panel, 'Premissas aplicadas. O caso, o comparativo e os documentos foram atualizados.', true);
      setTimeout(() => scheduleRender(260), 200);
    });
  }

  function setStatus(panel, message, saved) {
    const target = panel.querySelector('[data-calcwb-status]');
    if (!target) return;
    target.textContent = message;
    target.classList.toggle('saved', Boolean(saved));
  }

  function preview(panel) {
    const ctx = getContext();
    if (!ctx) return;
    const state = stateFrom(ctx, panel);
    const activeName = document.activeElement?.name || '';
    const activeStart = document.activeElement?.selectionStart;
    renderPanel(panel, ctx, state);
    if (activeName) {
      const next = panel.querySelector(`[name="${activeName}"]`);
      next?.focus();
      if (typeof activeStart === 'number' && next?.setSelectionRange) {
        try { next.setSelectionRange(activeStart, activeStart); } catch (_) {}
      }
    }
  }

  function findAnchor() {
    const advanced = [...document.querySelectorAll('section.panel.details')].find((section) =>
      section.querySelector('summary')?.textContent?.includes('Ajustar premissas avançadas')
    );
    if (advanced) return advanced;
    const payment = document.querySelector('section.radar-payment-flow');
    if (payment) return payment;
    const comparison = [...document.querySelectorAll('section.panel')].find((section) =>
      section.querySelector('h2')?.textContent?.includes('Comparativo das simulações')
    );
    return comparison?.nextElementSibling || comparison || null;
  }

  function relabelLegacyPanel() {
    const summary = [...document.querySelectorAll('summary')].find((item) => item.textContent?.includes('Ajustar premissas avançadas'));
    if (summary && !summary.dataset.radarFinalRelabeled) {
      summary.dataset.radarFinalRelabeled = '1';
      summary.textContent = 'Parâmetros técnicos adicionais';
    }
  }

  function render() {
    renderTimer = null;
    if (mutationLock) return;
    const ctx = getContext();
    const anchor = findAnchor();
    if (!ctx || !anchor) return;
    injectStyle();
    relabelLegacyPanel();
    let panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = document.createElement('section');
      panel.id = PANEL_ID;
      panel.className = 'panel';
      panel.dataset.release = VERSION;
      mutationLock = true;
      anchor.parentElement?.insertBefore(panel, anchor);
      mutationLock = false;
    }
    if (panel.contains(document.activeElement)) return;
    renderPanel(panel, ctx, stateFrom(ctx, panel));
  }

  function scheduleRender(delay = 120) {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(render, delay);
  }

  new MutationObserver(() => { if (!mutationLock) scheduleRender(180); })
    .observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('storage', () => scheduleRender(120));
  window.addEventListener('radar:cloud-synced', () => scheduleRender(120));
  window.addEventListener('radar:calculator-workbench-saved', () => scheduleRender(260));
  document.addEventListener('click', () => scheduleRender(220), true);

  window.RadarFinalWorkbench = { VERSION, getContext, calculate: () => {
    const ctx = getContext();
    if (!ctx) return null;
    const state = stateFrom(ctx, document.getElementById(PANEL_ID));
    return { state, ...calculate(ctx, state) };
  }};

  scheduleRender(350);
})();
