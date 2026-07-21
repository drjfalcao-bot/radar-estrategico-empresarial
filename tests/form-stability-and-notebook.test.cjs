const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const loader = fs.readFileSync(path.join(root, 'v3-loader.js'), 'utf8');
const notebook = fs.readFileSync(path.join(root, 'cloud/notebook-commercial-hub.js'), 'utf8');

test('sincronização remota não reconstrói a ficha durante o preenchimento', () => {
  assert.match(loader, /state\.db = loadDB\(\)/);
  assert.match(loader, /state\.view === 'dashboard' \|\| state\.view === 'pipeline'/);
  assert.doesNotMatch(loader, /radar:cloud-data-updated'[\s\S]{0,300}\n\s*render\(\);/);
});

test('Caderno inicia estratégia, relatório e proposta recolhidos', () => {
  assert.equal((notebook.match(/<details/g) || []).length, 3);
  assert.equal((notebook.match(/<\/details>/g) || []).length, 3);
  assert.doesNotMatch(notebook, /<details[^>]*\sopen(?:\s|>)/);
  assert.match(notebook, /data-nch-strategy/);
  assert.match(notebook, /data-nch-report/);
  assert.match(notebook, /data-nch-proposal/);
});
