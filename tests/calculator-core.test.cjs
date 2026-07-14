'use strict';
const assert = require('node:assert/strict');
const core = require('../cloud/calculator-core.js');

const ordinary = core.calculateRfb({ debt: 100000, mode: 'nenhum', totalTerm: 60, minimum: 500 });
assert.equal(ordinary.entry, 0);
assert.equal(ordinary.balance, 100000);
assert.equal(ordinary.months, 60);

const first = core.calculateRfb({ debt: 100000, mode: 'primeiro', totalTerm: 60, minimum: 500 });
assert.equal(first.entryRate, 10);
assert.equal(first.entry, 10000);
assert.equal(first.balance, 90000);
assert.equal(first.months, 59);

const repeated = core.calculateRfb({ debt: 100000, mode: 'segundo_ou_mais', totalTerm: 60, minimum: 500 });
assert.equal(repeated.entryRate, 20);
assert.equal(repeated.entry, 20000);
assert.equal(repeated.balance, 80000);

const pgfn = core.calculatePgfn({
  simple: 1115000,
  prev: 0,
  other: 0,
  mode: 'parametrizada',
  entryRate: 6,
  entryMonths: 12,
  discount: 0,
  totalTerm: 145,
  prevTotalTerm: 60,
  minimum: 100
});
assert.equal(pgfn.entry, 66900);
assert.equal(pgfn.entryInstallment, 5575);
assert.equal(pgfn.balanceMonths, 133);
assert.equal(pgfn.projectedTotalMonths, 145);

const mixed = core.calculatePgfn({
  simple: 1000000,
  prev: 300000,
  other: 200000,
  mode: 'tis',
  entryRate: 6,
  entryMonths: 12,
  discount: 50,
  totalTerm: 145,
  prevTotalTerm: 60,
  minimum: 100
});
assert.equal(mixed.mixedNature, true);
assert.ok(mixed.prev.months <= 48, 'previdenciário deve respeitar 60 meses totais menos entrada');
assert.ok(mixed.simple.months <= 133);
assert.equal(mixed.projectedTotalMonths, 145);

const small = core.calculatePgfn({
  simple: 50000,
  prev: 0,
  other: 0,
  mode: 'pequeno_valor',
  entryRate: 5,
  entryMonths: 5,
  discount: 50,
  totalTerm: 60,
  prevTotalTerm: 60,
  minimum: 100,
  smallValueLimit: 60000
});
assert.equal(small.withinSmallValueReference, true);
assert.equal(small.entry, 2500);
assert.equal(small.entryInstallment, 500);

console.log(`calculator-core ${core.VERSION}: PASS`);
