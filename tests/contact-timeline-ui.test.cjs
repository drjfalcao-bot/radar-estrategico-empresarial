const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const contactUi = fs.readFileSync(path.join(root, 'cloud/case-contact-ui.js'), 'utf8');
const delivery = fs.readFileSync(path.join(root, 'cloud/document-delivery.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

test('linha do tempo inicia recolhida e mantém controle de abertura', () => {
  assert.match(contactUi, /panel\.classList\.remove\('is-open'\)/);
  assert.match(contactUi, /aria-expanded', 'false'/);
  assert.match(contactUi, /Ver linha do tempo/);
  assert.match(contactUi, /Recolher linha do tempo/);
});

test('ficha exige nome e telefone do decisor e persiste os dois campos', () => {
  assert.match(contactUi, /Nome do decisor/);
  assert.match(contactUi, /Telefone do decisor/);
  assert.match(contactUi, /nameInput\.required = true/);
  assert.match(contactUi, /phoneInput\.required = true/);
  assert.match(contactUi, /companyResponsibleName = normalized/);
  assert.match(contactUi, /companyResponsibleWhatsapp = normalized/);
});

test('WhatsApp bloqueia envio sem contato completo do decisor', () => {
  assert.match(delivery, /validateDecisionMakerContact\(panel, data\)/);
  assert.match(delivery, /Envio do whatsapp requer contato do decisor/);
  assert.doesNotMatch(delivery, /lead\.contactName \|\| lead\.decisionMaker \|\|/);
});

test('release pública carrega o módulo de contato e recolhimento', () => {
  assert.match(index, /2026\.07\.21-cloud\.2/);
  assert.match(index, /cloud\/case-contact-ui\.js\?v=20260721-cloud2/);
});
