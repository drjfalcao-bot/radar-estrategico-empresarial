const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const premium = fs.readFileSync(path.join(root, 'cloud/pdf-premium-print.js'), 'utf8');

test('release pública carrega o exportador premium depois do hotfix raster', () => {
  assert.match(index, /2026\.07\.21-cloud\.12/);
  const raster = index.indexOf('cloud/pdf-export-hotfix.js?v=20260721-cloud11');
  const premiumPosition = index.indexOf('cloud/pdf-premium-print.js?v=20260721-cloud12');
  assert.ok(raster >= 0);
  assert.ok(premiumPosition > raster);
});

test('PDF premium usa impressão nativa vetorial e não captura canvas', () => {
  assert.match(premium, /printWindow\.print\(\)/);
  assert.match(premium, /native-print-vector/);
  assert.match(premium, /delivery\.downloadElementPdf = printElementAsPremiumPdf/);
  assert.doesNotMatch(premium, /html2canvas\(/);
  assert.doesNotMatch(premium, /addImage\(/);
  assert.doesNotMatch(premium, /toDataURL\('image\/jpeg'/);
});

test('folha A4 preserva cores, tabelas e largura responsiva', () => {
  assert.match(premium, /@page \{ size: A4 portrait; margin: 9mm 8mm 11mm; \}/);
  assert.match(premium, /print-color-adjust: exact/);
  assert.match(premium, /table-layout: fixed/);
  assert.match(premium, /overflow-wrap: anywhere/);
  assert.match(premium, /width: 100% !important/);
});

test('botões passam a indicar PDF premium', () => {
  assert.match(premium, /Gerar PDF premium/);
  assert.match(premium, /texto vetorial e pesquisável/);
  assert.match(premium, /\[data-rdd-pdf\]/);
});