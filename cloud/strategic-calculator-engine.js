(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.RadarStrategicCalculatorEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = '2026.07.16-premium.1';

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
    calculateRfb,
    calculateNature,
    calculatePgfn,
    calculateMigration,
    calculateTis,
    calculateGuarantee,
  };
});
