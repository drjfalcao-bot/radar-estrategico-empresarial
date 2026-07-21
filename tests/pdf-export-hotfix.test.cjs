const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const hotfix = fs.readFileSync(path.join(root, 'cloud/pdf-export-hotfix.js'), 'utf8');

test('release pública carrega o exportador A4 depois do entregador de documentos', () => {
  assert.match(index, /2026\.07\.21-cloud\.11/);
  const deliveryPosition = index.indexOf('cloud/document-delivery.js?v=20260721-cloud9');
  const hotfixPosition = index.indexOf('cloud/pdf-export-hotfix.js?v=20260721-cloud11');
  assert.ok(deliveryPosition >= 0);
  assert.ok(hotfixPosition > deliveryPosition);
});

test('exportador preserva a largura original do relatório sem forçar grades', () => {
  assert.match(hotfix, /const WIDTH = 900/);
  assert.match(hotfix, /width:\$\{WIDTH\}px/);
  assert.doesNotMatch(hotfix, /doc-ratings\{grid-template-columns/);
  assert.doesNotMatch(hotfix, /doc-scenarios.*grid-template-columns/);
});

test('exportador pagina o canvas em folhas A4 sem corte horizontal', () => {
  assert.match(hotfix, /function makePdf\(canvas\)/);
  assert.match(hotfix, /const contentWidth = 194/);
  assert.match(hotfix, /pdf\.addPage\('a4', 'portrait'\)/);
  assert.match(hotfix, /ctx\.drawImage\(canvas, 0, from/);
  assert.match(hotfix, /function pageEnd\(canvas, start, ideal\)/);
});

test('exportador continua protegendo a captura e substitui o download público', () => {
  assert.match(hotfix, /radar-pdf-a4-mask/);
  assert.doesNotMatch(hotfix, /left:-100000px/);
  assert.match(hotfix, /delivery\.downloadElementPdf = downloadElementPdf/);
  assert.match(hotfix, /__pdfExportHotfixVersion = VERSION/);
});
