(() => {
  'use strict';

  const PANEL_ID = 'radar-scenario-lite';
  const STYLE_ID = 'radar-simulations-consolidation-style';
  const HIDDEN_CLASS = 'radar-simulations-legacy-hidden';
  let persistTimer = null;

  const text = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
  const number = (value) => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const raw = String(value ?? '').trim();
    if (!raw) return 0;
    const normalized = raw.includes(',')
      ? raw.replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '')
      : raw.replace(/[^0-9.-]/g, '');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const brl = (value) => new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(number(value));

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .${HIDDEN_CLASS}{display:none!important}
      #${PANEL_ID} .radar-strategic-total{border:1px solid #68bb96!important;background:#eefaf4!important}
      #${PANEL_ID} .radar-strategic-total strong{color:#08734a}
      #${PANEL_ID} .radar-tis-strategic-note{margin-top:9px;padding:10px 12px;border-radius:10px;background:#eaf6ff;color:#175d84;font-size:11px;line-height:1.45}
      #${PANEL_ID} .radar-tis-strategic-note strong{display:block;margin-bottom:3px;color:#0b4f73}
      @media print{
        .${HIDDEN_CLASS}{display:none!important}
        #${PANEL_ID}{border:0!important;box-shadow:none!important;padding:0!important;background:#fff!important}
        #${PANEL_ID}>nav,#${PANEL_ID}>footer button{display:none!important}
        #${PANEL_ID} section{break-inside:avoid;page-break-inside:avoid}
      }
    `;
    document.head.appendChild(style);
  }

  function tabBar() {
    const candidates = [...document.querySelectorAll('button, a, [role="tab"]')];
    const profile = candidates.find((node) => text(node.textContent) === 'Perfil');
    const notebook = candidates.find((node) => text(node.textContent) === 'Caderno');
    if (!profile || !notebook) return null;

    let current = profile.parentElement;
    for (let depth = 0; depth < 6 && current; depth += 1, current = current.parentElement) {
      if (current.contains(notebook)) return current;
    }
    return null;
  }

  function normalizeNavigation() {
    const bar = tabBar();
    if (!bar) return null;
    bar.querySelectorAll('button, a, [role="tab"]').forEach((node) => {
      const label = text(node.textContent);
      if (label === 'Cenários') node.textContent = 'Simulações';
      if (label === 'Relatório' || label === 'Proposta') {
        node.classList.add(HIDDEN_CLASS);
        node.setAttribute('aria-hidden', 'true');
        node.setAttribute('tabindex', '-1');
      }
    });
    return bar;
  }

  function lowestCommonAncestor(first, second) {
    if (!first || !second) return null;
    const ancestors = new Set();
    let node = first;
    while (node) {
      ancestors.add(node);
      node = node.parentElement;
    }
    node = second;
    while (node) {
      if (ancestors.has(node)) return node;
      node = node.parentElement;
    }
    return null;
  }

  function directBranch(ancestor, node) {
    if (!ancestor || !node || ancestor === node) return node;
    let current = node;
    while (current?.parentElement && current.parentElement !== ancestor) current = current.parentElement;
    return current;
  }

  function hideNode(node) {
    if (!node || node.id === PANEL_ID || node.contains(document.getElementById(PANEL_ID))) return;
    node.classList.add(HIDDEN_CLASS);
    node.setAttribute('aria-hidden', 'true');
  }

  function hideLegacySimulationContent() {
    const panel = document.getElementById(PANEL_ID);
    const bar = normalizeNavigation();
    if (!panel || !bar) return;

    const common = lowestCommonAncestor(bar, panel);
    const barBranch = directBranch(common, bar);
    const panelBranch = directBranch(common, panel);

    if (common && barBranch && panelBranch && barBranch !== panelBranch) {
      const children = [...common.children];
      const start = children.indexOf(barBranch);
      const end = children.indexOf(panelBranch);
      if (start >= 0 && end > start && end - start < 30) {
        children.slice(start + 1, end).forEach(hideNode);
      }
    }

    const legacyHeadings = [
      'Cenários Automáticos',
      'Comparativo das simulações'
    ];
    document.querySelectorAll('h1,h2,h3').forEach((heading) => {
      if (!legacyHeadings.includes(text(heading.textContent))) return;
      const block = heading.closest('section, article, .card, .panel, .case-section');
      if (block && !block.contains(panel)) hideNode(block);
    });

    document.querySelectorAll('summary,h2,h3,strong').forEach((node) => {
      if (!/Ajustar premissas avançadas|Parâmetros técnicos adicionais/i.test(text(node.textContent))) return;
      const block = node.closest('details, section, article, .card, .panel');
      if (block && !block.contains(panel)) hideNode(block);
    });

    const oldFlow = document.querySelector('section.radar-payment-flow');
    if (oldFlow && !oldFlow.contains(panel)) hideNode(oldFlow);
  }

  function context() {
    return window.RadarScenarioLite?.getContext?.() || null;
  }

  function leadFrom(ctx) {
    return ctx?.l || ctx?.lead || null;
  }

  function inputValue(panel, name, fallback = 0) {
    return number(panel?.querySelector(`[name="${name}"]`)?.value ?? fallback);
  }

  function debtData(lead) {
    const rfb = number(lead?.rfbDebt || lead?.rfbTotal);
    const pgfn = number(lead?.pgfnSimple) + number(lead?.pgfnPrev) + number(lead?.pgfnTrib) + number(lead?.pgfnOther);
    return { rfb, pgfn, combined: rfb + pgfn };
  }

  function setOutput(panel, key, value) {
    const target = panel?.querySelector(`[data-o="${key}"]`);
    if (target) target.textContent = value;
  }

  function updateStrategicReduction(panel, lead) {
    const debts = debtData(lead);
    const pgfnEntryRate = inputValue(panel, 'er', 6);
    const pgfnDiscount = inputValue(panel, 'disc', 35);
    const migrationEntryRate = inputValue(panel, 'mer', 6);
    const migrationDiscount = inputValue(panel, 'md', 35);

    const pgfnReduction = debts.pgfn * Math.max(0, 1 - pgfnEntryRate / 100) * Math.max(0, pgfnDiscount / 100);
    const rfbMigrationReduction = debts.rfb * Math.max(0, 1 - migrationEntryRate / 100) * Math.max(0, migrationDiscount / 100);
    const combinedReduction = pgfnReduction + rfbMigrationReduction;

    const reductionMetric = [...panel.querySelectorAll('.k .m')]
      .find((item) => /Redução PGFN|Redução estratégica/i.test(text(item.querySelector('span')?.textContent)));
    if (reductionMetric) {
      const label = reductionMetric.querySelector('span');
      const value = reductionMetric.querySelector('strong');
      if (label) label.textContent = 'Redução estratégica potencial';
      if (value) value.textContent = brl(combinedReduction);
      let note = reductionMetric.querySelector('small');
      if (!note) {
        note = document.createElement('small');
        reductionMetric.appendChild(note);
      }
      note.textContent = 'PGFN atual + Receita em cenário de migração';
    }

    const migrationReduction = panel.querySelector('[data-o="mr"]')?.closest('.m');
    if (migrationReduction) {
      const label = migrationReduction.querySelector('span');
      if (label) label.textContent = 'Redução potencial da Receita';
    }

    const targetCard = panel.querySelector('#mig .target');
    if (targetCard) {
      let totalMetric = targetCard.querySelector('.radar-strategic-total');
      if (!totalMetric) {
        totalMetric = document.createElement('div');
        totalMetric.className = 'm radar-strategic-total';
        totalMetric.innerHTML = '<span>Redução estratégica combinada</span><strong>—</strong><small>PGFN atual + Receita após migração</small>';
        targetCard.appendChild(totalMetric);
      }
      const value = totalMetric.querySelector('strong');
      if (value) value.textContent = brl(combinedReduction);
    }

    return { pgfnReduction, rfbMigrationReduction, combinedReduction };
  }

  function updateTis(panel, lead) {
    const debts = debtData(lead);
    const currentEligible = debts.pgfn > 1000000;
    const strategicEligible = !currentEligible && debts.rfb > 0 && debts.combined > 1000000;
    const eligible = currentEligible || strategicEligible;
    const basis = currentEligible ? debts.pgfn : (strategicEligible ? debts.combined : debts.pgfn);
    const discount = Math.max(0, Math.min(70, inputValue(panel, 'td', 65)));
    const totalTerm = Math.max(37, Math.round(inputValue(panel, 'tt', 145)));
    const negotiatedBalance = basis * (1 - discount / 100);
    const remainingMonths = Math.max(1, totalTerm - 36);

    setOutput(panel, 'ts', currentEligible
      ? 'Potencialmente disponível pela base PGFN atual'
      : strategicEligible
        ? 'Potencial após migração da Receita'
        : 'Não habilitada pela premissa');
    setOutput(panel, 'ta', brl(negotiatedBalance * 0.03 / 12));
    setOutput(panel, 'tb', brl(negotiatedBalance * 0.04 / 12));
    setOutput(panel, 'tc', brl(negotiatedBalance * 0.05 / 12));
    setOutput(panel, 'tz', brl(negotiatedBalance * 0.88 / remainingMonths));
    setOutput(panel, 'tn', `${remainingMonths} parcelas`);

    const tis = panel.querySelector('#tis');
    tis?.classList.toggle('locked', !eligible);

    const rule = tis?.querySelector('.rule');
    if (rule) {
      const paragraph = rule.querySelector('p');
      if (paragraph) {
        paragraph.textContent = currentEligible
          ? `A PGFN atual soma ${brl(debts.pgfn)} e supera a premissa de R$ 1 milhão. A elegibilidade definitiva depende da modalidade aplicável.`
          : strategicEligible
            ? `A PGFN atual soma ${brl(debts.pgfn)}. Considerando a migração dos ${brl(debts.rfb)} da Receita, a base estratégica alcança ${brl(debts.combined)} e supera a premissa de R$ 1 milhão.`
            : `A base PGFN atual é ${brl(debts.pgfn)}. Mesmo considerando a Receita, o total estratégico é ${brl(debts.combined)}. A elegibilidade definitiva depende da modalidade aplicável.`;
      }
    }

    if (tis) {
      let note = tis.querySelector('.radar-tis-strategic-note');
      if (!note) {
        note = document.createElement('div');
        note.className = 'radar-tis-strategic-note';
        tis.appendChild(note);
      }
      note.innerHTML = eligible
        ? `<strong>Base utilizada na projeção: ${brl(basis)}</strong>${strategicEligible ? 'Cenário condicionado à migração do débito da Receita para a PGFN.' : 'Cenário calculado sobre a base PGFN atualmente informada.'}`
        : '<strong>TIS não projetada como cenário disponível.</strong>Mantenha a análise apenas como referência até validação da modalidade e da base elegível.';
    }

    return {
      currentEligible,
      strategicEligible,
      basis,
      discount,
      totalTerm,
      negotiatedBalance
    };
  }

  function persistDerived(ctx, strategic, tis, snapshot = false) {
    const lead = leadFrom(ctx);
    if (!ctx?.db || !ctx?.key || !lead) return;
    Object.assign(lead, {
      pgfnProjectedReduction: strategic.pgfnReduction,
      rfbMigrationReduction: strategic.rfbMigrationReduction,
      strategicCombinedReduction: strategic.combinedReduction,
      tisStrategicBasis: tis.basis,
      tisEligibilityMode: tis.currentEligible ? 'pgfn_atual' : (tis.strategicEligible ? 'apos_migracao' : 'nao_habilitada'),
      updatedAt: new Date().toISOString()
    });
    if (snapshot && lead.lastSimulation) {
      Object.assign(lead.lastSimulation, {
        pgfnProjectedReduction: strategic.pgfnReduction,
        rfbMigrationReduction: strategic.rfbMigrationReduction,
        strategicCombinedReduction: strategic.combinedReduction,
        tisStrategicBasis: tis.basis,
        tisEligibilityMode: lead.tisEligibilityMode
      });
    }
    localStorage.setItem(ctx.key, JSON.stringify(ctx.db));
    window.dispatchEvent(new CustomEvent('radar:case-updated', {
      detail: { leadId: lead.id, source: 'simulations-consolidation' }
    }));
  }

  function applyConsolidation(snapshot = false) {
    installStyle();
    normalizeNavigation();
    const panel = document.getElementById(PANEL_ID);
    const ctx = context();
    const lead = leadFrom(ctx);
    if (!panel || !ctx || !lead) return;

    hideLegacySimulationContent();
    const strategic = updateStrategicReduction(panel, lead);
    const tis = updateTis(panel, lead);

    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => persistDerived(ctx, strategic, tis, snapshot), snapshot ? 80 : 360);
  }

  document.addEventListener('click', (event) => {
    const target = event.target.closest('button, a, [role="tab"]');
    const label = text(target?.textContent);
    if (label === 'Cenários' || label === 'Simulações') {
      setTimeout(() => applyConsolidation(false), 120);
      setTimeout(() => applyConsolidation(false), 360);
    }
    if (event.target.closest(`#${PANEL_ID} [data-apply]`)) {
      setTimeout(() => applyConsolidation(true), 340);
    }
  }, true);

  document.addEventListener('input', (event) => {
    if (!event.target.closest(`#${PANEL_ID}`)) return;
    setTimeout(() => applyConsolidation(false), 0);
  }, true);

  document.addEventListener('change', (event) => {
    if (!event.target.closest(`#${PANEL_ID}`)) return;
    setTimeout(() => applyConsolidation(false), 0);
  }, true);

  window.addEventListener('radar:cloud-synced', () => setTimeout(() => applyConsolidation(false), 120));
  window.addEventListener('load', () => {
    setTimeout(() => applyConsolidation(false), 900);
    setTimeout(() => applyConsolidation(false), 1800);
  });
  setTimeout(() => applyConsolidation(false), 1300);

  window.RadarSimulationsConsolidation = { apply: applyConsolidation };
})();