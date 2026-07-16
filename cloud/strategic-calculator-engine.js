(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.RadarStrategicCalculatorEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = '2026.07.16-premium.4';

  function number(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const raw = String(value ?? '').trim();
    if (!raw) return 0;
    const normalized = raw.includes(',')
      ? raw.replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '')
      : raw.replace(/[^0-9.-]/g, '');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  const round2 = (value) => Math.round((number(value) + Number.EPSILON) * 100) / 100;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, number(value)));
  const integer = (value, fallback) => {
    const parsed = Math.round(number(value));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };

  const riskBand = (value) => number(value) >= 75 ? 'Crítico' : number(value) >= 55 ? 'Elevado' : number(value) >= 30 ? 'Atenção' : 'Controlado';
  const valueMap = (value, map, fallback = 50) => map[value] ?? fallback;

  function leadDebt(lead) {
    const rfb = Math.max(0, number(String(lead?.rfbDebt ?? '').trim() !== '' ? lead.rfbDebt : lead?.rfbTotal));
    const pgfn = ['pgfnSimple', 'pgfnPrev', 'pgfnTrib', 'pgfnOther'].reduce((sum, key) => sum + Math.max(0, number(lead?.[key])), 0);
    return { rfb: round2(rfb), pgfn: round2(pgfn), total: round2(rfb + pgfn) };
  }

  function daysSince(value, now = new Date()) {
    if (!value) return 0;
    const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
    const current = new Date(`${now.toISOString().slice(0, 10)}T12:00:00`);
    if (!Number.isFinite(date.getTime())) return 0;
    return Math.max(0, Math.floor((current - date) / 86400000));
  }

  function calculateRiskRatings(lead, now = new Date()) {
    const debt = leadDebt(lead).total;
    const rt = clamp(
      number(lead?.b2bShare) * 0.14 +
      valueMap(lead?.marginLevel, { baixa: 82, media: 52, alta: 28 }) * 0.14 +
      clamp(number(lead?.receivableDays) * 1.3, 10, 95) * 0.12 +
      valueMap(lead?.taxCashDependence, { baixa: 25, moderada: 55, alta: 85 }) * 0.16 +
      valueMap(lead?.priceFlexibility, { alta: 25, media: 55, baixa: 85 }) * 0.12 +
      valueMap(lead?.longContracts, { sim: 78, nao: 30, nao_sei: 55 }) * 0.08 +
      valueMap(lead?.taxBenefits, { sim: 72, nao: 32, nao_sei: 50 }) * 0.06 +
      valueMap(lead?.erpReadiness, { boa: 22, parcial: 55, baixa: 85 }) * 0.07 +
      valueMap(lead?.accountingReadiness, { boa: 22, parcial: 55, baixa: 85 }) * 0.05 +
      valueMap(lead?.splitReadiness, { boa: 20, parcial: 55, baixa: 88 }) * 0.06,
      0, 100
    );
    const revenue = number(lead?.revenueMonthly) || ({
      ate_100: 75000, ate_500: 300000, ate_2m: 1200000, ate_10m: 5500000, acima_10m: 12000000
    }[lead?.revenueBand] || 0);
    const debtPressure = revenue ? clamp((debt / (revenue * 12)) * 100, 0, 100) : (debt ? 65 : 20);
    const financial = clamp(
      debtPressure * 0.28 +
      valueMap(lead?.cashReserve, { disponivel: 18, parcial: 48, depende_parcelamento: 70, sem_reserva: 92, nao_informado: 55 }) * 0.24 +
      valueMap(lead?.workingCapital, { forte: 18, moderado: 48, pressionado: 76, critico: 94 }) * 0.18 +
      valueMap(lead?.cashPressure, { baixa: 20, moderada: 48, elevada: 76, critica: 94 }) * 0.18 +
      valueMap(lead?.canSupportEntry, { sim: 20, parcial: 50, nao: 88, nao_sei: 58 }) * 0.12,
      0, 100
    );
    const fiscal = clamp(
      (debt ? Math.min(90, 20 + Math.log10(Math.max(debt, 1)) * 8) : 12) * 0.28 +
      (lead?.impediment ? 88 : 28) * 0.16 +
      (lead?.omissions ? 80 : 25) * 0.12 +
      valueMap(lead?.capag, { A: 35, B: 40, C: 58, D: 78, nao_sei: 55 }) * 0.12 +
      valueMap(lead?.cadastralStatus, { ativa: 20, inapta: 82, suspensa: 72, baixada: 88 }) * 0.16 +
      valueMap(lead?.certificateNeed, { baixa: 28, media: 55, alta: 82 }) * 0.08 +
      (lead?.installmentActive ? 45 : 60) * 0.08,
      0, 100
    );
    let collection = 10;
    if (lead?.execution) collection += 20;
    if (lead?.citation) collection += 16;
    if (lead?.block) collection += 24;
    if (lead?.seizure) collection += 20;
    if (lead?.expropriation) collection += 30;
    if (number(lead?.processCount) > 3) collection += 8;
    if (number(lead?.processCount) > 10) collection += 8;
    if (lead?.exposedAssets) collection += 7;
    if (lead?.priorBlocks) collection += 7;
    if (lead?.guarantee) collection -= 8;
    collection = clamp(collection, 0, 100);
    const need = clamp(rt * 0.20 + financial * 0.22 + fiscal * 0.25 + collection * 0.33, 0, 100);
    let closing = 15;
    closing += valueMap(lead?.problemRecognition, { baixo: 0, medio: 10, alto: 20 }, 10);
    closing += valueMap(lead?.documentWillingness, { baixo: 0, medio: 8, alto: 16 }, 8);
    closing += valueMap(lead?.intentToSolve, { baixo: 0, medio: 12, alto: 24 }, 12);
    closing += valueMap(lead?.decisionMaker, { sim: 15, nao: 0, nao_sei: 6 }, 6);
    closing += valueMap(lead?.cashReserve, { disponivel: 12, parcial: 8, depende_parcelamento: 4, sem_reserva: -10, nao_informado: 0 }, 0);
    closing += valueMap(lead?.canSupportEntry, { sim: 8, parcial: 4, nao: -8, nao_sei: 0 }, 0);
    closing += valueMap(lead?.decisionHorizon, { ate_7: 10, ate_30: 7, ate_90: 3, sem_prazo: -3, nao_informado: 0 }, 0);
    closing += Math.round(need * 0.12);
    const inactive = daysSince(lead?.lastMovementAt, now);
    if (inactive > 21) closing -= 20;
    else if (inactive > 14) closing -= 12;
    else if (inactive > 7) closing -= 6;
    if (lead?.stage === 'proposta') closing += 8;
    if (lead?.stage === 'negociacao') closing += 12;
    if (lead?.stage === 'assinatura') closing += 18;
    if (lead?.stage === 'ganho') closing = 100;
    if (lead?.stage === 'perdido') closing = 0;
    if (String(lead?.overrides?.closingScore ?? '').trim() !== '') closing = clamp(lead.overrides.closingScore, 0, 100);
    closing = clamp(closing, 0, 100);
    const opportunity = String(lead?.overrides?.opportunityScore ?? '').trim() !== ''
      ? clamp(lead.overrides.opportunityScore, 0, 100)
      : clamp(need * 0.7 + closing * 0.3, 0, 100);
    return {
      rt: Math.round(rt), financial: Math.round(financial), fiscal: Math.round(fiscal),
      collection: Math.round(collection), need: Math.round(need),
      closing: Math.round(closing), opportunity: Math.round(opportunity)
    };
  }

  function reportRows(input) {
    const output = input?.output || {};
    const selected = new Set(input?.selections || []);
    const rows = [];
    if (selected.has('rfb') && output.rfb?.debt) rows.push({
      id: 'rfb', source: 'strategic-calculator', name: 'Receita Federal — cenário convencional',
      original: round2(output.rfb.debt), entry: round2(output.rfb.entry), reduction: 0,
      installment: round2(output.rfb.installment), term: `${output.rfb.months} parcelas`,
      note: 'Parcelamento ou reparcelamento sem redução projetada.'
    });
    if (selected.has('migration') && output.migration?.debt) rows.push({
      id: 'migration', source: 'strategic-calculator', name: 'RFB — ação estratégica de migração',
      original: round2(output.migration.debt), entry: round2(output.migration.entry),
      reduction: round2(output.migration.reduction), installment: round2(output.migration.phaseTwoInstallment),
      term: `${output.migration.entryMonths} parcelas de entrada + ${output.migration.balanceMonths} do saldo`,
      note: 'Cenário condicionado à migração, inscrição e elegibilidade na PGFN.'
    });
    if (selected.has('pgfn') && output.pgfn?.debt) rows.push({
      id: 'pgfn', source: 'strategic-calculator', name: 'PGFN — transação por natureza',
      original: round2(output.pgfn.debt), entry: round2(output.pgfn.entry),
      reduction: round2(output.pgfn.reduction), installment: round2(output.pgfn.phaseTwoInstallment),
      term: `${input?.state?.pgfnEntryMonths || 12} parcelas de entrada + saldo por natureza`,
      note: 'Prazos separados para débitos previdenciários e demais naturezas.'
    });
    if (selected.has('tis') && output.tis?.eligible) rows.push({
      id: 'tis', source: 'strategic-calculator', name: 'TIS — negociação individual simplificada',
      original: round2(output.tis.basis), entry: 0, reduction: round2(output.tis.reduction),
      installment: round2(output.tis.bands?.[0]?.installment), term: `${output.tis.totalTerm} meses em faixas escalonadas`,
      note: output.tis.strategicEligible ? 'Cenário condicionado à migração da Receita para a PGFN.' : 'Cenário calculado sobre o passivo PGFN atual.'
    });
    const potential = selected.has('tis') ? number(output.tis?.reduction) : rows.reduce((sum, row) => sum + number(row.reduction), 0);
    const highest = Math.max(0, ...rows.map((row) => number(row.reduction)));
    if (potential > highest + 0.01) rows.push({
      id: 'strategic_total', source: 'strategic-calculator', name: 'Resultado estratégico consolidado',
      original: round2(output.totalDebt), entry: round2(rows.reduce((sum, row) => sum + number(row.entry), 0)),
      reduction: round2(potential), installment: 0, term: 'Composição dos cenários selecionados',
      note: `Com a estratégia certa, o potencial de redução é de ${round2(potential).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.`
    });
    return rows;
  }

  function buildDiagnostic(input) {
    const lead = input?.lead || {};
    const ratings = input?.ratings || calculateRiskRatings(lead);
    const output = input?.output || {};
    const selections = input?.selections || [];
    const rows = input?.rows || reportRows(input);
    const potentialReduction = selections.includes('tis')
      ? number(output.tis?.reduction)
      : rows.filter((row) => row.id !== 'strategic_total').reduce((sum, row) => sum + number(row.reduction), 0);
    const inactionRate = clamp(input?.inactionRate ?? 12, 0, 100);
    const currentDebt = number(output.totalDebt) || leadDebt(lead).total;
    const inactionTotal = round2(currentDebt * (1 + inactionRate / 100));
    const money = (value) => round2(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const selectedNames = rows.filter((row) => row.id !== 'strategic_total').map((row) => row.name);
    let title = 'Diagnóstico e organização estratégica do passivo';
    if (selections.includes('tis')) title = 'Regularização com enquadramento potencial em TIS';
    else if (selections.includes('migration')) title = 'Migração do passivo da Receita e negociação estratégica na PGFN';
    else if (selections.includes('pgfn')) title = 'Transação do passivo inscrito com estruturação financeira';
    const ordered = [
      ['Risco de cobrança e execução', ratings.collection],
      ['Risco fiscal e de regularidade', ratings.fiscal],
      ['Risco de comprometimento de caixa', ratings.financial],
      ['Risco de exposição à Reforma Tributária', ratings.rt]
    ].sort((a, b) => b[1] - a[1]);
    const mainRisk = ordered[0];
    const reductionText = potentialReduction > 0
      ? `Os cenários selecionados indicam potencial estimado de redução de ${money(potentialReduction)}, reduzindo o saldo projetado para ${money(Math.max(0, currentDebt - potentialReduction))}.`
      : 'Os cenários selecionados priorizam organização do fluxo, previsibilidade e adequação do pagamento, sem redução financeira confirmada nesta etapa.';
    const summary = `Os indicadores apontam necessidade estratégica ${riskBand(ratings.need).toLowerCase()}, com maior atenção em ${mainRisk[0]} (${mainRisk[1]}/100 — ${riskBand(mainRisk[1])}). O passivo atualmente informado é de ${money(currentDebt)} e, sem atuação, a exposição nominal projetada alcança ${money(inactionTotal)}. ${reductionText} A estratégia indicada é ${title.toLowerCase()}, condicionada à validação documental e à elegibilidade aplicável.`;
    const fronts = [];
    if (ratings.rt >= 55) fronts.push('Adequação à Reforma Tributária', 'Revisão de caixa, preço e contratos');
    if (currentDebt > 0) fronts.push('Mapeamento e gestão do passivo');
    if (selections.includes('migration')) fronts.push('Migração RFB para PGFN');
    if (selections.includes('pgfn')) fronts.push('Transação PGFN por natureza');
    if (selections.includes('tis')) fronts.push('Validação e estruturação da TIS');
    if (ratings.collection >= 55) fronts.push('Acompanhamento da cobrança e estratégia defensiva');
    if (ratings.financial >= 55) fronts.push('Estruturação compatível com o caixa');
    const plan = [
      'Confirmar os débitos, processos, documentos e premissas utilizados no diagnóstico.',
      'Validar a elegibilidade e as restrições de cada cenário selecionado.',
      'Definir a ordem de implementação, o fluxo de entrada e o cronograma de atuação.',
      'Formalizar o escopo técnico da estratégia recomendada e iniciar as medidas aprovadas.',
      'Acompanhar a negociação até a implementação e revisar o cenário sempre que houver atualização.'
    ];
    const conclusion = `O diagnóstico demonstra que a manutenção do cenário atual preserva riscos e pode elevar a exposição financeira. A estratégia recomendada cria uma rota objetiva para organizar o passivo${potentialReduction > 0 ? ` e buscar redução potencial de ${money(potentialReduction)}` : ''}. Para transformar a projeção em resultado, a próxima etapa é formalizar a contratação do escopo técnico, validar a documentação e iniciar a implementação das medidas selecionadas.`;
    return {
      generatedAt: new Date().toISOString(), ratings,
      ratingLabels: {
        rt: 'Risco de exposição à Reforma Tributária',
        financial: 'Risco de comprometimento de caixa',
        fiscal: 'Risco fiscal e de regularidade',
        collection: 'Risco de cobrança e execução',
        need: 'Nível de necessidade estratégica',
        opportunity: 'Potencial da oportunidade',
        closing: 'Probabilidade de fechamento'
      },
      ratingBands: Object.fromEntries(Object.entries(ratings).map(([key, value]) => [key, riskBand(value)])),
      currentDebt: round2(currentDebt), inactionRate: round2(inactionRate), inactionTotal,
      selectedScenarios: selections, selectedScenarioNames: selectedNames,
      potentialReduction: round2(potentialReduction), projectedBalance: round2(Math.max(0, currentDebt - potentialReduction)),
      title, summary, fronts: [...new Set(fronts)], plan, conclusion,
      nextStep: 'Formalizar o escopo técnico e iniciar a validação documental da estratégia selecionada.'
    };
  }

  function minimumAdjusted(principal, months, minimum) {
    const amount = Math.max(0, number(principal));
    if (!amount) return { months: 0, installment: 0 };
    let term = Math.max(1, integer(months, 1));
    const floor = Math.max(0, number(minimum));
    let installment = amount / term;
    if (floor && installment < floor) {
      term = Math.max(1, Math.floor(amount / floor));
      installment = amount / term;
    }
    return { months: term, installment: round2(installment) };
  }

  function calculateRfb(input) {
    const debt = Math.max(0, number(input?.debt));
    const mode = input?.mode || 'nenhum';
    const rates = { nenhum: 0, primeiro: 10, segundo_ou_mais: 20 };
    const entryRate = mode === 'personalizado'
      ? clamp(input?.customEntryRate, 0, 100)
      : (rates[mode] ?? 0);
    const totalTerm = Math.max(1, integer(input?.totalTerm, 60));
    const entry = debt * entryRate / 100;
    const balance = Math.max(0, debt - entry);
    const requestedMonths = Math.max(1, totalTerm - (entry > 0 ? 1 : 0));
    const adjusted = minimumAdjusted(balance, requestedMonths, input?.minimum);

    return {
      debt: round2(debt),
      mode,
      entryRate: round2(entryRate),
      entry: round2(entry),
      balance: round2(balance),
      months: adjusted.months,
      installment: adjusted.installment,
      totalProjectedMonths: entry > 0 ? adjusted.months + 1 : adjusted.months,
      reduction: 0,
    };
  }

  function calculateNature(debtValue, parameters) {
    const debt = Math.max(0, number(debtValue));
    const discountRate = clamp(parameters?.discountRate, 0, 70);
    const entryRate = clamp(parameters?.entryRate, 0, 100);
    const entryMonths = Math.max(1, integer(parameters?.entryMonths, 12));
    const totalTerm = Math.max(entryMonths + 1, integer(parameters?.totalTerm, 145));
    const reduction = debt * discountRate / 100;
    const negotiatedBalance = Math.max(0, debt - reduction);
    const entry = negotiatedBalance * entryRate / 100;
    const entryInstallment = entry / entryMonths;
    const phaseTwoBalance = Math.max(0, negotiatedBalance - entry);
    const requestedBalanceMonths = Math.max(1, totalTerm - entryMonths);
    const adjusted = minimumAdjusted(phaseTwoBalance, requestedBalanceMonths, parameters?.minimum);

    return {
      debt: round2(debt),
      discountRate: round2(discountRate),
      reduction: round2(reduction),
      negotiatedBalance: round2(negotiatedBalance),
      entryRate: round2(entryRate),
      entry: round2(entry),
      entryMonths,
      entryInstallment: round2(entryInstallment),
      phaseTwoBalance: round2(phaseTwoBalance),
      balanceMonths: adjusted.months,
      phaseTwoInstallment: adjusted.installment,
      projectedTotalMonths: entryMonths + adjusted.months,
    };
  }

  function calculatePgfn(input) {
    const common = {
      discountRate: input?.discountRate ?? 35,
      entryRate: input?.entryRate ?? 6,
      entryMonths: input?.entryMonths ?? 12,
      minimum: input?.minimum ?? 100,
    };
    const simple = calculateNature(input?.simple, { ...common, totalTerm: input?.simpleTerm ?? 145 });
    const socialSecurity = calculateNature(input?.socialSecurity, { ...common, totalTerm: input?.socialSecurityTerm ?? 60 });
    const tax = calculateNature(input?.tax, { ...common, totalTerm: input?.taxTerm ?? 145 });
    const other = calculateNature(input?.other, { ...common, totalTerm: input?.otherTerm ?? 145 });
    const natures = { simple, socialSecurity, tax, other };
    const values = Object.values(natures);

    return {
      natures,
      debt: round2(values.reduce((sum, item) => sum + item.debt, 0)),
      reduction: round2(values.reduce((sum, item) => sum + item.reduction, 0)),
      negotiatedBalance: round2(values.reduce((sum, item) => sum + item.negotiatedBalance, 0)),
      entry: round2(values.reduce((sum, item) => sum + item.entry, 0)),
      entryInstallment: round2(values.reduce((sum, item) => sum + item.entryInstallment, 0)),
      phaseTwoInstallment: round2(values.reduce((sum, item) => sum + item.phaseTwoInstallment, 0)),
    };
  }

  function calculateMigration(input) {
    return calculateNature(input?.debt, {
      discountRate: input?.discountRate ?? 35,
      entryRate: input?.entryRate ?? 6,
      entryMonths: input?.entryMonths ?? 12,
      totalTerm: input?.totalTerm ?? 145,
      minimum: input?.minimum ?? 100,
    });
  }

  function calculateTis(input) {
    const pgfnDebt = Math.max(0, number(input?.pgfnDebt));
    const rfbDebt = Math.max(0, number(input?.rfbDebt));
    const combined = pgfnDebt + rfbDebt;
    const currentEligible = pgfnDebt > 1000000 && pgfnDebt < 10000000;
    const strategicEligible = !currentEligible && rfbDebt > 0 && combined > 1000000 && combined < 10000000;
    const individual = pgfnDebt >= 10000000 || combined >= 10000000;
    const eligible = !individual && (currentEligible || strategicEligible);
    const basis = individual ? combined : (currentEligible ? pgfnDebt : (strategicEligible ? combined : pgfnDebt));
    const discountRate = clamp(input?.discountRate ?? 65, 0, 70);
    const totalTerm = Math.max(37, integer(input?.totalTerm, 145));
    const reduction = basis * discountRate / 100;
    const balance = Math.max(0, basis - reduction);
    const remainingMonths = Math.max(1, totalTerm - 36);
    const bands = [
      { label: '1ª à 12ª', share: 3, months: 12, total: balance * 0.03 },
      { label: '13ª à 24ª', share: 4, months: 12, total: balance * 0.04 },
      { label: '25ª à 36ª', share: 5, months: 12, total: balance * 0.05 },
      { label: `37ª à ${totalTerm}ª`, share: 88, months: remainingMonths, total: balance * 0.88 },
    ].map((band) => ({ ...band, total: round2(band.total), installment: round2(band.total / band.months) }));

    return {
      eligible,
      currentEligible,
      strategicEligible,
      individual,
      basis: round2(basis),
      discountRate: round2(discountRate),
      reduction: round2(reduction),
      balance: round2(balance),
      totalTerm,
      bands,
    };
  }

  function calculateGuarantee(input) {
    const model = input?.model || 'prescricao_percentual';
    const operationBase = Math.max(0, number(input?.base));
    const costRate = clamp(input?.costRate ?? 15, 0, 100);
    const entryRate = clamp(input?.entryRate ?? 5, 0, 100);
    const maximumMonths = model === 'contrato_impedido' ? 24 : 60;
    const months = Math.max(1, Math.min(maximumMonths, integer(input?.months, maximumMonths)));
    const baseCost = model === 'prescricao_percentual' ? operationBase * costRate / 100 : operationBase;
    const entry = baseCost * entryRate / 100;
    const additionalCosts = Math.max(0, number(input?.additionalCosts));
    return {
      model,
      operationBase: round2(operationBase),
      baseCost: round2(baseCost),
      entry: round2(entry),
      months,
      installment: round2(Math.max(0, baseCost - entry) / months),
      additionalCosts: round2(additionalCosts),
      total: round2(baseCost + additionalCosts),
    };
  }

  return {
    VERSION,
    number,
    round2,
    clamp,
    riskBand,
    leadDebt,
    calculateRiskRatings,
    reportRows,
    buildDiagnostic,
    calculateRfb,
    calculateNature,
    calculatePgfn,
    calculateMigration,
    calculateTis,
    calculateGuarantee,
  };
});
