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

test('análise acompanhada deixa os três blocos fechados por padrão', () => {
  assert.match(contactUi, /Reforma Tributária/);
  assert.match(contactUi, /Passivo Fiscal/);
  assert.match(contactUi, /Cobrança, Execução e Exposição/);
  assert.match(contactUi, /radar-analysis-collapsible/);
  assert.match(contactUi, /aria-expanded', 'false'/);
});

test('release pública carrega o módulo de contato e recolhimento', () => {
  assert.match(index, /2026\.07\.21-cloud\.10/);
  assert.match(index, /cloud\/case-contact-ui\.js\?v=20260721-cloud3/);
});

test('download da proposta usa o provedor já permitido pela aplicação', () => {
  assert.match(delivery, /cdn\.jsdelivr\.net\/npm\/html2pdf\.js@0\.10\.3/);
  assert.doesNotMatch(delivery, /cdnjs\.cloudflare\.com/);
  assert.match(index, /cloud\/document-delivery\.js\?v=20260721-cloud10/);
});

test('PDF é renderizado dentro da área capturável e rejeita arquivo vazio', () => {
  assert.match(delivery, /\.radar-pdf-stage\{position:fixed!important;left:0!important;top:0!important/);
  assert.doesNotMatch(delivery, /left:-100000px/);
  assert.match(delivery, /waitForPdfStage\(stage\)/);
  assert.match(delivery, /blob\.size < 5000/);
  assert.match(delivery, /O PDF foi gerado sem conteúdo/);
  assert.match(delivery, /image: \{ type: 'png', quality: 1 \}/);
  assert.match(delivery, /scale: 2\.5/);
});
