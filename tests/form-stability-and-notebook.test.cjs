const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const loader = fs.readFileSync(path.join(root, 'v3-loader.js'), 'utf8');
const notebook = fs.readFileSync(path.join(root, 'cloud/notebook-commercial-hub.js'), 'utf8');
const calculator = fs.readFileSync(path.join(root, 'cloud/strategic-calculator.js'), 'utf8');

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

test('Caderno oferece geração rápida no topo sem substituir os editores', () => {
  assert.match(notebook, /data-nch-quick-report/);
  assert.match(notebook, /Gerar relatório agora/);
  assert.match(notebook, /Usa a composição salva neste momento/);
});

test('resumo automático usa o saldo após migração no card com estratégia', () => {
  assert.match(calculator, /strategy\.querySelector\('h3'\)\.textContent = brl\(output\.strategicBalance\)/);
  assert.match(calculator, /Saldo após migração e negociação/);
  assert.match(calculator, /Migração RFB → PGFN/);
  assert.doesNotMatch(calculator, /strategy\.querySelector\('h3'\)\.textContent = brl\(output\.totalDebt\)/);
});

test('proposta permite salvar e voltar diretamente às Simulações', () => {
  assert.match(notebook, /data-go-simulations/);
  assert.match(notebook, /Salvar e voltar às Simulações/);
  assert.match(notebook, /saveProposal\(ctx, body\);\s*goToSimulations\(node\)/);
  assert.match(notebook, /\['Cenários', 'Simulações'\]\.includes/);
});

test('relatório sincroniza o comparativo selecionado antes de abrir', () => {
  assert.match(calculator, /function syncReportData\(\)/);
  assert.match(calculator, /syncReportData[\s\S]*persist\(ctx\)/);
  assert.match(notebook, /RadarStrategicCalculator\?\.syncReportData\?\.\(\)/);
  assert.match(calculator, /reportSelectedScenarios: simulations\.filter/);
  assert.match(calculator, /reportComparison: \{/);
  assert.match(notebook, /data-full-calculator-comparison/);
  assert.match(notebook, /Comparativo completo da Receita Federal/);
  assert.match(notebook, /Parcelamento ordinário/);
  assert.match(notebook, /Migração para a PGFN/);
});

test('proposta compara investimento e desconto e pode ser incorporada ao relatório', () => {
  assert.match(notebook, /Investimento aplicado/);
  assert.match(notebook, /Desconto atingível/);
  assert.doesNotMatch(notebook, /Investimento indicado/);
  assert.match(notebook, /data-incorporate-proposal/);
  assert.match(notebook, /Salvar e incorporar ao Relatório do Caso/);
  assert.match(notebook, /caseReportFinancialSnapshot/);
  assert.match(notebook, /data-case-financial-summary/);
});

test('construtor do relatório permite montar e incluir custos no parecer', () => {
  assert.match(notebook, /name="showCosts"/);
  assert.match(notebook, /Custos e proposta de atuação/);
  assert.match(notebook, /data-nch-edit-report-costs/);
  assert.match(notebook, /Montar custos/);
  assert.match(notebook, /reportShowsCosts/);
  assert.match(notebook, /caseReportFinancialHtml\(lead, config\)/);
});

test('PDF do construtor usa o relatório completo com a composição financeira', () => {
  assert.match(notebook, /data-report-print/);
  assert.match(notebook, /downloadReportFromBuilder/);
  assert.match(notebook, /RadarDocumentDelivery\?\.downloadElementPdf/);
  assert.match(notebook, /Relatorio_Estrategico_/);
});
