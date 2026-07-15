'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

function parseMoney(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const raw = String(value ?? '').trim();
  if (!raw) return 0;
  const normalized = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '')
    : raw.replace(/[^0-9.-]/g, '');
  return Number(normalized) || 0;
}

const cases = [
  [150000, 150000],
  ['150000', 150000],
  ['150000,00', 150000],
  ['150.000,00', 150000],
  ['R$ 150.000,00', 150000],
  [984321.63, 984321.63],
  ['984321.63', 984321.63],
  [563794.66, 563794.66],
  ['1.548.116,29', 1548116.29],
  ['', 0],
  [null, 0]
];

for (const [input, expected] of cases) {
  assert.equal(parseMoney(input), expected, `Falha ao interpretar ${String(input)}`);
}

const loader = fs.readFileSync('v3-loader.js', 'utf8');
assert.match(loader, /typeof v === 'number'/);
assert.match(loader, /raw\.includes\(','\)/);
assert.match(loader, /RadarPatchMoneyParser/);
assert.doesNotMatch(loader, /const num = v => Number\(String\(v \?\? ''\)\.replace/);

console.log('money-parser: PASS');
