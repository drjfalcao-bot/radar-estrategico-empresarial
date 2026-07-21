const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const hotfix = fs.readFileSync(path.join(root, 'cloud/pdf-export-hotfix.js'), 'utf8');

test('release pública carrega o hotfix depois do entregador de documentos', () => {
  assert.match(index, /2026\.07\.21-cloud\.10/);
  const deliveryPosition = index.indexOf('cloud/document-delivery.js?v=20260721-cloud9');
  const hotfixPosition = index.indexOf('cloud/pdf-export-hotfix.js?v=20260721-cloud10');
  assert.ok(deliveryPosition >= 0);
  assert.ok(hotfixPosition > deliveryPosition);
});

test('exportador mantém o documento renderizável e protegido por máscara', () => {
  assert.match(hotfix, /z-index:2147483645/);
  assert.match(hotfix, /radar-pdf-hotfix-mask/);
  assert.doesNotMatch(hotfix, /left:-100000px/);
  assert.doesNotMatch(hotfix, /z-index:-2147483647/);
});

test('exportador reduz escala conforme o tamanho e repete a tentativa', () => {
  assert.match(hotfix, /function safeCanvasScale\(width, height\)/);
  assert.match(hotfix, /const maxDimension = 28000/);
  assert.match(hotfix, /const maxPixels = 96000000/);
  assert.match(hotfix, /initialScale \* 0\.7/);
  assert.match(hotfix, /primeira tentativa falhou; repetindo em escala reduzida/);
});

test('download público é substituído pelo exportador corrigido', () => {
  assert.match(hotfix, /delivery\.downloadElementPdf = downloadElementPdf/);
  assert.match(hotfix, /__pdfExportHotfixVersion = VERSION/);
  assert.match(hotfix, /pdf\?\.output\?\.\('blob'\)/);
});
