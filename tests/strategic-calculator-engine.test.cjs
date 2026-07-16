'use strict';

const assert = require('node:assert/strict');
const loadedEngine = require('../cloud/strategic-calculator-engine.js');
const engine = loadedEngine.number ? loadedEngine : globalThis.RadarStrategicCalculatorEngine;

assert.equal(engine.number('R$ 150.000,00'), 150000);
assert.equal(engine.number('150000'), 150000);
assert.equal(engine.number('150,00'), 150);

const ordinary = engine.calculateRfb({ debt: 100000, mode: 'nenhum', totalTerm: 60, minimum: 500 });
assert.equal(ordinary.entry, 0);
assert.equal(ordinary.months, 60);
assert.equal(ordinary.installment, 1666.67);

const repeated = engine.calculateRfb({ debt: 100000, mode: 'segundo_ou_mais', totalTerm: 60, minimum: 500 });
assert.equal(repeated.entry, 20000);
assert.equal(repeated.balance, 80000);
assert.equal(repeated.months, 59);

const pgfn = engine.calculatePgfn({
  simple: 400000,
  socialSecurity: 200000,
  tax: 300000,
  other: 100000,
  entryRate: 6,
  entryMonths: 12,
  discountRate: 35,
  simpleTerm: 145,
  socialSecurityTerm: 60,
  taxTerm: 145,
  otherTerm: 145,
  minimum: 100
});
assert.equal(pgfn.debt, 1000000);
assert.equal(pgfn.reduction, 350000);
assert.equal(pgfn.negotiatedBalance, 650000);
assert.equal(pgfn.entry, 39000);
assert.equal(pgfn.natures.socialSecurity.projectedTotalMonths, 60);
assert.equal(pgfn.natures.simple.projectedTotalMonths, 145);

const migration = engine.calculateMigration({
  debt: 500000,
  entryRate: 6,
  entryMonths: 12,
  discountRate: 35,
  totalTerm: 145,
  minimum: 100
});
assert.equal(migration.reduction, 175000);
assert.equal(migration.negotiatedBalance, 325000);
assert.equal(migration.entry, 19500);

const threshold = engine.calculateTis({ pgfnDebt: 1000000, rfbDebt: 0, discountRate: 65, totalTerm: 145 });
assert.equal(threshold.eligible, false, 'R$ 1 milhão exato não deve habilitar TIS');

const afterMigration = engine.calculateTis({ pgfnDebt: 700000, rfbDebt: 400000, discountRate: 65, totalTerm: 145 });
assert.equal(afterMigration.eligible, true);
assert.equal(afterMigration.strategicEligible, true);
assert.equal(afterMigration.basis, 1100000);
assert.equal(afterMigration.reduction, 715000);
assert.equal(afterMigration.balance, 385000);
assert.equal(afterMigration.bands[0].months, 12);
assert.equal(afterMigration.bands[3].months, 109);
assert.equal(afterMigration.bands.reduce((sum, band) => sum + band.total, 0), afterMigration.balance);

const current = engine.calculateTis({ pgfnDebt: 1200000, rfbDebt: 0, discountRate: 65, totalTerm: 145 });
assert.equal(current.currentEligible, true);
assert.equal(current.strategicEligible, false);

const individual = engine.calculateTis({ pgfnDebt: 8000000, rfbDebt: 2500000, discountRate: 65, totalTerm: 145 });
assert.equal(individual.eligible, false);
assert.equal(individual.individual, true);
assert.equal(individual.basis, 10500000);

const guarantee = engine.calculateGuarantee({
  model: 'prescricao_percentual', base: 1000000, costRate: 15,
  entryRate: 5, months: 60, additionalCosts: 2800
});
assert.equal(guarantee.baseCost, 150000);
assert.equal(guarantee.entry, 7500);
assert.equal(guarantee.installment, 2375);
assert.equal(guarantee.total, 152800);

console.log(`strategic-calculator-engine ${engine.VERSION}: PASS`);
