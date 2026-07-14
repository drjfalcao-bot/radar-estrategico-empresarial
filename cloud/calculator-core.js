(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.RadarCalculatorCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = '2026.07.14-final.1';

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

  const integer = (value, fallback = 0) => {
    const parsed = Math.round(number(value));
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const clamp = (value, min, max) => Math.max(min, Math.min(max, number(value)));
  const round2 = (value) => Math.round((number(value) + Number.EPSILON) * 100) / 100;

  function minAdjusted(principal, months, minimum) {
    const amount = Math.max(0, number(principal));
    if (!amount) return { months: 0, installment: 0 };
    let term = Math.max(1, integer(months, 1));
    let installment = amount / term;
    const floor = Math.max(0, number(minimum));
    if (floor > 0 && installment < floor) {
      term = Math.max(1, Math.floor(amount / floor));
      installment = amount / term;
    }
    return { months: term, installment: round2(installment) };
  }

  function rfbEntryRate(mode, customRate = 0) {
    if (mode === 'primeiro') return 10;
    if (mode === 'segundo_ou_mais') return 20;
    if (mode === 'personalizado') return clamp(customRate, 0, 100);
    return 0;
  }

  function calculateRfb(input = {}) {
    const debt = Math.max(0, number(input.debt));
    const mode = input.mode || 'nenhum';
    const entryRate = rfbEntryRate(mode, input.customEntryRate);
    const totalTerm = Math.max(1, integer(input.totalTerm, 60));
    const entry = debt * entryRate / 100;
    const balance = Math.max(0, debt - entry);
    const balanceMonthsRequested = Math.max(1, totalTerm - (entryRate > 0 ? 1 : 0));
    const adjusted = minAdjusted(balance, balanceMonthsRequested, input.minimum);
    return {
      debt: round2(debt),
      mode,
      entryRate: round2(entryRate),
      entry: round2(entry),
      balance: round2(balance),
      months: adjusted.months,
      installment: adjusted.installment,
      totalProjectedMonths: entryRate > 0 ? 1 + adjusted.months : adjusted.months
    };
  }

  function capagDiscount(capag, favored, settings = {}) {
    const map = {
      A: number(settings.pgfnDiscountA),
      B: number(settings.pgfnDiscountB),
      C: number(settings.pgfnDiscountC),
      D: favored ? number(settings.pgfnDiscountDFavored) : number(settings.pgfnDiscountDGeneral),
      nao_sei: number(settings.pgfnDiscountC)
    };
    return clamp(map[capag || 'nao_sei'] ?? 0, 0, 70);
  }

  function modalityDefaults(mode, context = {}) {
    const settings = context.settings || {};
    const favored = Boolean(context.favored);
    const onlyPrev = Boolean(context.onlyPrev);
    const baseDiscount = capagDiscount(context.capag, favored, settings);
    const common = {
      entryRate: number(settings.pgfnEntryRate || 6),
      entryMonths: favored ? integer(settings.pgfnEntryMonthsFavored || 12, 12) : integer(settings.pgfnEntryMonthsGeneral || 6, 6),
      discount: baseDiscount,
      totalTerm: onlyPrev ? 60 : (favored ? integer(settings.pgfnTermFavored || 145, 145) : integer(settings.pgfnTermGeneral || 120, 120)),
      prevTotalTerm: 60,
      minimum: number(settings.pgfnMinInstallment || 100),
      smallValueLimit: number(settings.smallValueLimit || 60000)
    };
    if (mode === 'tis') return {
      ...common,
      entryRate: number(settings.tisEntryRate || common.entryRate),
      entryMonths: integer(settings.tisEntryMonths || 12, 12),
      discount: number(settings.tisDiscount || common.discount),
      totalTerm: integer(settings.tisTotalTerm || 120, 120)
    };
    if (mode === 'pequeno_valor') return {
      ...common,
      entryRate: number(settings.smallValueEntryRate || 5),
      entryMonths: integer(settings.smallValueEntryMonths || 5, 5),
      discount: number(settings.smallValueDiscount || 50),
      totalTerm: integer(settings.smallValueTotalTerm || 60, 60)
    };
    if (mode === 'manual') return { ...common };
    return common;
  }

  function calculateNature(debt, input, totalTerm) {
    const amount = Math.max(0, number(debt));
    if (!amount) return {
      debt: 0, entry: 0, baseAfterEntry: 0, reduction: 0, balance: 0, months: 0, installment: 0
    };
    const entry = amount * input.entryRate / 100;
    const baseAfterEntry = Math.max(0, amount - entry);
    const reduction = baseAfterEntry * input.discount / 100;
    const balance = Math.max(0, baseAfterEntry - reduction);
    const requested = Math.max(1, integer(totalTerm, 1) - input.entryMonths);
    const adjusted = minAdjusted(balance, requested, input.minimum);
    return {
      debt: round2(amount),
      entry: round2(entry),
      baseAfterEntry: round2(baseAfterEntry),
      reduction: round2(reduction),
      balance: round2(balance),
      months: adjusted.months,
      installment: adjusted.installment
    };
  }

  function calculatePgfn(input = {}) {
    const entryRate = clamp(input.entryRate, 0, 100);
    const entryMonths = Math.max(1, integer(input.entryMonths, 1));
    const discount = clamp(input.discount, 0, 70);
    const totalTerm = Math.max(entryMonths + 1, integer(input.totalTerm, 120));
    const prevTotalTerm = Math.max(entryMonths + 1, integer(input.prevTotalTerm, 60));
    const minimum = Math.max(0, number(input.minimum));
    const common = { entryRate, entryMonths, discount, minimum };

    const simple = calculateNature(input.simple, common, totalTerm);
    const other = calculateNature(input.other, common, totalTerm);
    const prev = calculateNature(input.prev, common, Math.min(prevTotalTerm, 60));
    const debt = simple.debt + other.debt + prev.debt;
    const entry = simple.entry + other.entry + prev.entry;
    const reduction = simple.reduction + other.reduction + prev.reduction;
    const balance = simple.balance + other.balance + prev.balance;
    const phaseTwoInstallment = simple.installment + other.installment + prev.installment;
    const balanceMonths = Math.max(simple.months, other.months, prev.months);
    const projectedTotalMonths = debt > 0 ? entryMonths + balanceMonths : 0;
    const smallValueLimit = Math.max(0, number(input.smallValueLimit));

    return {
      mode: input.mode || 'parametrizada',
      entryRate: round2(entryRate),
      entryMonths,
      discount: round2(discount),
      totalTerm,
      prevTotalTerm: Math.min(prevTotalTerm, 60),
      minimum: round2(minimum),
      debt: round2(debt),
      entry: round2(entry),
      entryInstallment: round2(entryMonths ? entry / entryMonths : 0),
      reduction: round2(reduction),
      balance: round2(balance),
      phaseTwoInstallment: round2(phaseTwoInstallment),
      balanceMonths,
      projectedTotalMonths,
      simple,
      other,
      prev,
      mixedNature: prev.debt > 0 && (simple.debt + other.debt) > 0,
      smallValueLimit: round2(smallValueLimit),
      withinSmallValueReference: smallValueLimit > 0 && debt > 0 && debt <= smallValueLimit
    };
  }

  function validateScenario(rfb, pgfn) {
    const warnings = [];
    if (pgfn.entryRate > 20) warnings.push('Entrada PGFN acima de 20%: confirme a premissa utilizada.');
    if (pgfn.discount > 70) warnings.push('Redução acima do limite gerencial configurado.');
    if (pgfn.prev.debt > 0 && pgfn.prevTotalTerm > 60) warnings.push('Prazo previdenciário deve ser validado separadamente.');
    if (pgfn.mode === 'pequeno_valor' && !pgfn.withinSmallValueReference) warnings.push('O valor supera a referência de pequeno valor informada; valide o enquadramento.');
    if (rfb.entryRate > 0 && rfb.entry <= 0) warnings.push('Reparcelamento marcado sem entrada calculada.');
    return warnings;
  }

  return {
    VERSION,
    number,
    integer,
    clamp,
    round2,
    minAdjusted,
    rfbEntryRate,
    calculateRfb,
    modalityDefaults,
    calculatePgfn,
    validateScenario
  };
});
