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

const riskLead = {
  rfbDebt: 400000,
  pgfnSimple: 500000,
  pgfnPrev: 100000,
  pgfnTrib: 150000,
  pgfnOther: 50000,
  revenueMonthly: 120000,
  b2bShare: 80,
  marginLevel: 'baixa',
  receivableDays: 45,
  taxCashDependence: 'alta',
  priceFlexibility: 'baixa',
  longContracts: 'sim',
  taxBenefits: 'sim',
  erpReadiness: 'baixa',
  accountingReadiness: 'parcial',
  splitReadiness: 'baixa',
  cashReserve: 'depende_parcelamento',
  workingCapital: 'pressionado',
  cashPressure: 'elevada',
  canSupportEntry: 'parcial',
  impediment: true,
  omissions: true,
  capag: 'D',
  cadastralStatus: 'ativa',
  certificateNeed: 'alta',
  execution: true,
  citation: true,
  block: true,
  processCount: 4,
  problemRecognition: 'alto',
  documentWillingness: 'alto',
  intentToSolve: 'alto',
  decisionMaker: 'sim',
  decisionHorizon: 'ate_7',
  lastMovementAt: '2026-07-16',
  stage: 'estrategia',
  overrides: {}
};
assert.equal(engine.leadDebt(riskLead).total, 1200000, 'deve incluir também a natureza tributária da PGFN');
const ratings = engine.calculateRiskRatings(riskLead, new Date('2026-07-16T12:00:00Z'));
for (const key of ['rt', 'financial', 'fiscal', 'collection', 'need', 'closing', 'opportunity']) {
  assert.ok(ratings[key] >= 0 && ratings[key] <= 100, `${key} deve ser persistido entre 0 e 100`);
}
assert.ok(ratings.fiscal >= 55);
assert.ok(ratings.collection >= 55);

const reportOutput = {
  totalDebt: 1200000,
  rfb: engine.calculateRfb({ debt: 400000, mode: 'nenhum', totalTerm: 60, minimum: 500 }),
  pgfn,
  migration,
  tis: afterMigration,
  guarantee
};
const rows = engine.reportRows({
  output: reportOutput,
  state: { pgfnEntryMonths: 12 },
  selections: ['migration', 'pgfn']
});
assert.deepEqual(rows.slice(0, 2).map((row) => row.id), ['migration', 'pgfn']);
assert.equal(rows.at(-1).id, 'strategic_total');
assert.equal(rows.at(-1).reduction, 525000);

const rowsWithoutGuarantee = engine.reportRows({
  output: reportOutput,
  state: { pgfnEntryMonths: 12 },
  selections: ['guarantee']
});
assert.equal(rowsWithoutGuarantee.length, 0, 'garantia deve ficar exclusivamente no construtor de propostas');

const diagnostic = engine.buildDiagnostic({
  lead: riskLead,
  output: reportOutput,
  state: { pgfnEntryMonths: 12 },
  selections: ['migration', 'pgfn'],
  rows,
  ratings,
  inactionRate: 12
});
assert.equal(diagnostic.potentialReduction, 525000);
assert.equal(diagnostic.ratings.fiscal, ratings.fiscal);
assert.match(diagnostic.summary, /Os indicadores apontam necessidade estratégica/);
assert.match(diagnostic.summary, /Risco de/);
assert.doesNotMatch(diagnostic.summary, /RT-Score|Financial Rate|Fiscal Rate|Collection Rate/);
assert.equal(diagnostic.ratingLabels.rt, 'Risco de exposição à Reforma Tributária');
assert.match(diagnostic.conclusion, /formalizar a contratação do escopo técnico/);
assert.ok(diagnostic.fronts.includes('Migração RFB para PGFN'));

console.log(`strategic-calculator-engine ${engine.VERSION}: PASS`);
