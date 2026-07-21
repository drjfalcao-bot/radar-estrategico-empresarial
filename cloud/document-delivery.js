(() => {
  'use strict';

  const PANEL_ID = 'radar-document-delivery';
  const STYLE_ID = 'radar-document-delivery-style';
  const BUCKET = 'client-documents';
  const SIGNED_URL_SECONDS = 60 * 60 * 24 * 7;
  const CURRENT_KEYS = ['radar_current_case_id', 'radar_current_lead_id', 'radar_estrategico_current_case_id'];
  const PDF_LIB_ID = 'radar-pdfmake-library';
  // pdfMake escreve texto, linhas e tabelas diretamente no PDF. Diferentemente
  // do html2pdf, ele não converte a página em PNG antes do download.
  const PDF_LIB_URL = 'https://cdn.jsdelivr.net/npm/pdfmake@0.2.10/build/pdfmake.min.js';
  const PDF_FONTS_ID = 'radar-pdfmake-fonts';
  const PDF_FONTS_URL = 'https://cdn.jsdelivr.net/npm/pdfmake@0.2.10/build/vfs_fonts.js';

  let mountFrame = 0;
  let saveTimer = 0;
  let pdfLibraryPromise = null;

  const text = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
  const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));
  const digits = (value) => String(value ?? '').replace(/\D/g, '');

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${PANEL_ID}{margin-top:18px;border:1px solid #d8e4ec;border-radius:18px;background:#fff;padding:22px;box-shadow:0 10px 34px rgba(7,27,51,.06);font-family:Inter,Arial,sans-serif;color:#0b2540}
      #${PANEL_ID} .rdd-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:18px}
      #${PANEL_ID} .rdd-kicker{display:block;color:#0877b7;font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;margin-bottom:5px}
      #${PANEL_ID} h3{margin:0;font-size:20px;line-height:1.2}
      #${PANEL_ID} .rdd-head p{margin:7px 0 0;color:#60758a;font-size:12px;line-height:1.55;max-width:720px}
      #${PANEL_ID} .rdd-badge{border-radius:999px;background:#edf7fc;color:#075b89;font-size:10px;font-weight:800;padding:7px 10px;white-space:nowrap}
      #${PANEL_ID} .rdd-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px}
      #${PANEL_ID} label{display:grid;gap:6px;color:#38546b;font-size:11px;font-weight:800}
      #${PANEL_ID} label.rdd-wide{grid-column:1/-1}
      #${PANEL_ID} input,#${PANEL_ID} select,#${PANEL_ID} textarea{width:100%;box-sizing:border-box;border:1px solid #cddbe5;border-radius:10px;background:#fff;padding:11px 12px;color:#0b2540;font:inherit;font-size:13px;outline:none}
      #${PANEL_ID} textarea{min-height:78px;resize:vertical;line-height:1.45}
      #${PANEL_ID} input:focus,#${PANEL_ID} select:focus,#${PANEL_ID} textarea:focus{border-color:#159bd7;box-shadow:0 0 0 3px rgba(21,155,215,.12)}
      #${PANEL_ID} input[aria-invalid="true"]{border-color:#b4233c;background:#fff8f9;box-shadow:0 0 0 3px rgba(180,35,60,.1)}
      #${PANEL_ID} .rdd-required{color:#b4233c;font-weight:900}
      #${PANEL_ID} .rdd-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}
      #${PANEL_ID} button{border:0;border-radius:10px;padding:11px 16px;font:inherit;font-size:12px;font-weight:800;cursor:pointer}
      #${PANEL_ID} button[data-rdd-pdf]{background:#eaf2f7;color:#0b4c72}
      #${PANEL_ID} button[data-rdd-whatsapp]{background:#087f5b;color:#fff}
      #${PANEL_ID} button:disabled{opacity:.55;cursor:wait}
      #${PANEL_ID} .rdd-status{margin:13px 0 0;padding:10px 12px;border-radius:10px;background:#f4f7fa;color:#4b6275;font-size:11px;line-height:1.45}
      #${PANEL_ID} .rdd-status.success{background:#eaf8ef;color:#17653a}
      #${PANEL_ID} .rdd-status.error{background:#fff0f2;color:#9f1731}
      #${PANEL_ID} .rdd-status.warning{background:#fff7df;color:#765700}
      @media(max-width:760px){#${PANEL_ID} .rdd-grid{grid-template-columns:1fr}#${PANEL_ID} label.rdd-wide{grid-column:auto}#${PANEL_ID} .rdd-head{display:block}#${PANEL_ID} .rdd-badge{display:inline-block;margin-top:10px}}
      @media print{#${PANEL_ID}{display:none!important}}
    `;
    document.head.appendChild(style);
  }

  function readDatabase() {
    const keys = [];
    if (window.RadarCloud?.dbKey) keys.push(window.RadarCloud.dbKey);
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key && !keys.includes(key)) keys.push(key);
    }
    for (const key of keys) {
      try {
        const db = JSON.parse(localStorage.getItem(key) || 'null');
        if (db && Array.isArray(db.leads) && db.settings) return { key, db };
      } catch (_) {}
    }
    return null;
  }

  function currentContext() {
    const strategic = window.RadarStrategicCalculator?.getContext?.();
    if (strategic?.key && strategic?.db && (strategic?.lead || strategic?.l)) {
      return { key: strategic.key, db: strategic.db, lead: strategic.lead || strategic.l };
    }
    const scenario = window.RadarScenarioLite?.getContext?.();
    if (scenario?.key && scenario?.db && (scenario?.lead || scenario?.l)) {
      return { key: scenario.key, db: scenario.db, lead: scenario.lead || scenario.l };
    }

    const base = readDatabase();
    if (!base) return null;
    for (const storageKey of CURRENT_KEYS) {
      const id = String(localStorage.getItem(storageKey) || '').replace(/^"|"$/g, '');
      const lead = base.db.leads.find((item) => String(item.id) === id);
      if (lead) return { ...base, lead };
    }
    return null;
  }

  function tabNodes() {
    return [...document.querySelectorAll('button, a, [role="tab"]')];
  }

  function notebookActive() {
    const notebook = tabNodes().find((node) => text(node.textContent) === 'Caderno');
    if (!notebook) return false;
    return notebook.classList.contains('active') || notebook.classList.contains('is-active') || notebook.getAttribute('aria-selected') === 'true';
  }

  function leafNodes(pattern) {
    return [...document.querySelectorAll('h1,h2,h3,h4,strong,span,p,div')]
      .filter((node) => node.children.length === 0 && pattern.test(text(node.textContent)));
  }

  function notebookHost() {
    const anchor = leafNodes(/Composição financeira|Montagem da proposta|Gerador de Proposta Financeira|Relatório Estratégico Empresarial/i)[0];
    if (anchor) {
      const block = anchor.closest('section, article, .panel, .card, .stack');
      if (block?.parentElement && block.parentElement !== document.body) return block.parentElement;
    }

    const notebook = tabNodes().find((node) => text(node.textContent) === 'Caderno');
    if (!notebook) return null;
    let current = notebook.parentElement;
    for (let depth = 0; depth < 8 && current; depth += 1, current = current.parentElement) {
      const next = current.nextElementSibling;
      if (next && text(next.textContent).length > 200) return next;
    }
    return document.querySelector('.case-content, .case-body, main .stack, main');
  }

  function defaultMessage(lead, responsibleName = '') {
    const greeting = responsibleName ? `Olá, ${responsibleName}.` : 'Olá.';
    const company = lead?.companyName ? ` da ${lead.companyName}` : '';
    return `${greeting} Segue o documento estratégico${company}. O link ficará disponível por 7 dias.`;
  }

  function buildPanel(ctx) {
    const lead = ctx.lead;
    const responsibleName = lead.companyResponsibleName || lead.responsibleName || lead.contactName || lead.decisionMakerName || '';
    const whatsapp = lead.companyResponsibleWhatsapp || lead.whatsapp || lead.contactPhone || lead.phone || '';
    const message = lead.documentDeliveryMessage || defaultMessage(lead, responsibleName);
    const panel = document.createElement('section');
    panel.id = PANEL_ID;
    panel.dataset.leadId = String(lead.id || '');
    panel.innerHTML = `
      <div class="rdd-head">
        <div><span class="rdd-kicker">Entrega ao cliente</span><h3>PDF e envio pelo WhatsApp</h3><p>Gere o documento final do Caderno e envie ao responsável da empresa por link privado temporário.</p></div>
        <span class="rdd-badge">Link válido por 7 dias</span>
      </div>
      <div class="rdd-grid">
        <label><span>Nome do decisor <b class="rdd-required">*</b></span><input name="rddResponsible" value="${esc(responsibleName)}" placeholder="Nome de quem decide pela empresa" required aria-required="true"></label>
        <label><span>Telefone do decisor <b class="rdd-required">*</b></span><input name="rddWhatsapp" value="${esc(whatsapp)}" inputmode="tel" placeholder="Ex.: 51 99999-9999" required aria-required="true"></label>
        <label><span>Documento</span><select name="rddDocument"><option value="report">Relatório do caso</option><option value="proposal">Proposta financeira</option></select></label>
        <label><span>Empresa</span><input value="${esc(lead.companyName || 'Empresa não identificada')}" disabled></label>
        <label class="rdd-wide"><span>Mensagem do WhatsApp</span><textarea name="rddMessage">${esc(message)}</textarea></label>
      </div>
      <div class="rdd-actions"><button type="button" data-rdd-pdf>Gerar PDF</button><button type="button" data-rdd-whatsapp>Enviar pelo WhatsApp</button></div>
      <p class="rdd-status" data-rdd-status>Preencha o contato, escolha o documento e gere a versão final.</p>
    `;
    bindPanel(panel);
    return panel;
  }

  function setStatus(panel, message, type = '') {
    const target = panel.querySelector('[data-rdd-status]');
    if (!target) return;
    target.className = `rdd-status${type ? ` ${type}` : ''}`;
    target.textContent = message;
  }

  function persistPanel(panel) {
    const ctx = currentContext();
    if (!ctx?.lead || String(ctx.lead.id || '') !== String(panel.dataset.leadId || '')) return;
    const responsibleName = text(panel.querySelector('[name="rddResponsible"]')?.value);
    const whatsapp = text(panel.querySelector('[name="rddWhatsapp"]')?.value);
    const message = String(panel.querySelector('[name="rddMessage"]')?.value || '').trim();
    Object.assign(ctx.lead, {
      contactName: responsibleName,
      phone: whatsapp,
      contactPhone: whatsapp,
      companyResponsibleName: responsibleName,
      companyResponsibleWhatsapp: whatsapp,
      documentDeliveryMessage: message,
      updatedAt: new Date().toISOString()
    });
    localStorage.setItem(ctx.key, JSON.stringify(ctx.db));
  }

  function schedulePersist(panel) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => persistPanel(panel), 350);
  }

  function normalizeWhatsapp(value) {
    let phone = digits(value).replace(/^0+/, '');
    if ((phone.length === 10 || phone.length === 11) && !phone.startsWith('55')) phone = `55${phone}`;
    if (!/^55\d{10,11}$/.test(phone)) throw new Error('Informe um WhatsApp brasileiro com DDD.');
    return phone;
  }

  function documentPatterns(type) {
    return type === 'proposal'
      ? [/PROPOSTA DE ATUAÇÃO ESTRATÉGICA/i, /PROPOSTA FINANCEIRA/i, /PROPOSTA COMERCIAL/i]
      : [/RELATÓRIO ESTRATÉGICO EMPRESARIAL/i, /RELATÓRIO DO CASO/i, /PARECER ESTRATÉGICO/i, /DIAGNÓSTICO ESTRATÉGICO/i];
  }

  function cleanDocumentAncestor(titleNode) {
    const candidates = [];
    let current = titleNode;
    for (let depth = 0; depth < 9 && current; depth += 1, current = current.parentElement) {
      if (current === document.body || current.id === 'app') break;
      const length = text(current.textContent).length;
      const controls = current.querySelectorAll?.('input,textarea,select')?.length || 0;
      if (length >= 280 && controls === 0) {
        const priority = current.matches('article, .document-preview, .report-preview, .proposal-preview, .paper, .print-sheet') ? 0 : 1;
        candidates.push({ node: current, priority, length });
      }
    }
    candidates.sort((a, b) => a.priority - b.priority || a.length - b.length);
    return candidates[0]?.node || null;
  }

  function findDocument(type) {
    const patterns = documentPatterns(type);
    const titles = [...document.querySelectorAll('h1,h2,h3,h4,strong,p,div')]
      .filter((node) => node.children.length === 0 && patterns.some((pattern) => pattern.test(text(node.textContent))));
    for (const title of titles) {
      const documentNode = cleanDocumentAncestor(title);
      if (documentNode && !documentNode.closest(`#${PANEL_ID}`)) return documentNode;
    }

    const printPattern = type === 'proposal' ? /Imprimir proposta/i : /Imprimir relatório/i;
    const printButton = [...document.querySelectorAll('button,a')].find((node) => printPattern.test(text(node.textContent)));
    if (printButton) {
      const block = printButton.closest('section,article,.panel,.card');
      if (block && text(block.textContent).length > 280) return block;
    }
    return null;
  }

  function documentFromHtml(html) {
    const template = document.createElement('template');
    template.innerHTML = String(html || '').trim();
    return template.content.firstElementChild || null;
  }

  function storedDocument(type, lead) {
    if (type === 'proposal' && window.RadarNotebookCommercialHub?.buildProposalDocument) {
      return documentFromHtml(window.RadarNotebookCommercialHub.buildProposalDocument(lead));
    }
    if (type !== 'report' || !window.RadarDocumentBuilder?.buildReport) return null;
    const defaults = {
      title: 'Relatório Estratégico Empresarial',
      showExecutive: true, showCompanyProfile: true,
      showRT: true, showFinancial: true, showFiscal: true, showCollection: true, showNeed: false,
      showCurrent: true, showInaction: true, showTarget: true,
      showSimulations: true, showReduction: true, showStrategy: true,
      showFronts: true, showPlan: true, showNextSteps: true, conclusion: ''
    };
    return documentFromHtml(window.RadarDocumentBuilder.buildReport(lead, { ...defaults, ...(lead.reportConfig || {}) }));
  }

  function latestStoredLead(lead) {
    const base = readDatabase();
    if (!base?.db?.leads?.length) return lead;
    const current = base.db.leads.find((item) => String(item.id || '') === String(lead?.id || ''));
    return current || lead;
  }

  function printableClone(source) {
    const clone = source.cloneNode(true);
    clone.querySelectorAll('button,input,textarea,select,.no-print,[data-internal-only],#radar-document-delivery').forEach((node) => node.remove());
    clone.querySelectorAll('label').forEach((label) => {
      if (!text(label.textContent)) label.remove();
    });
    clone.style.display = 'block';
    clone.style.width = '100%';
    clone.style.maxWidth = 'none';
    clone.style.margin = '0';
    clone.style.boxShadow = 'none';
    clone.style.background = '#fff';
    return clone;
  }

  function loadScript(id, src, ready) {
    if (ready()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      let script = document.getElementById(id);
      if (script?.dataset.failed === 'true') {
        script.remove();
        script = null;
      }
      const finish = () => ready()
        ? resolve()
        : reject(new Error('O gerador de PDF foi carregado, mas não iniciou corretamente.'));
      const fail = () => {
        if (script) script.dataset.failed = 'true';
        reject(new Error('Não foi possível carregar o gerador de PDF.'));
      };
      if (script) {
        script.addEventListener('load', finish, { once: true });
        script.addEventListener('error', fail, { once: true });
        return;
      }
      script = document.createElement('script');
      script.id = id;
      script.src = src;
      script.onload = finish;
      script.onerror = fail;
      document.head.appendChild(script);
    });
  }

  function loadPdfLibrary() {
    const pdfReady = () => typeof window.pdfMake?.createPdf === 'function';
    const fontsReady = () => pdfReady() && window.pdfMake.vfs && Object.keys(window.pdfMake.vfs).length > 0;
    if (fontsReady()) return Promise.resolve(window.pdfMake);
    if (pdfLibraryPromise) return pdfLibraryPromise;
    pdfLibraryPromise = (async () => {
      await loadScript(PDF_LIB_ID, PDF_LIB_URL, pdfReady);
      await loadScript(PDF_FONTS_ID, PDF_FONTS_URL, fontsReady);
      if (!fontsReady()) throw new Error('Não foi possível carregar as fontes do PDF.');
      return window.pdfMake;
    })().catch((error) => {
      pdfLibraryPromise = null;
      throw error;
    });
    return pdfLibraryPromise;
  }

  function slug(value) {
    return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70) || 'empresa';
  }

  function documentFilename(type, lead) {
    const prefix = type === 'proposal' ? 'proposta' : 'relatorio';
    return `${prefix}-${slug(lead.companyName || 'empresa')}-${new Date().toISOString().slice(0, 10)}.pdf`;
  }

  const PDF_COLORS = {
    navy: '#092f52', blue: '#159bd7', green: '#14885e', red: '#b43a32', amber: '#a9650c',
    ink: '#163b4a', body: '#46616d', muted: '#71868d', line: '#d9e5e8', pale: '#f4f8f9',
    bluePale: '#edf6fb', greenPale: '#edf9f4', redPale: '#fff5f3', amberPale: '#fff8e8', white: '#ffffff'
  };

  function pdfSafe(value) {
    return String(value ?? '')
      .replace(/[\u2010-\u2015\u2212]/g, '-')
      .replace(/[\u2192\u2794\u27f6]/g, ' para ')
      .replace(/[\u00a0\u202f]/g, ' ')
      .replace(/[\u200b-\u200d\ufeff]/g, '');
  }
  function nodeText(node) { return text(pdfSafe(node?.textContent)); }
  function children(node) { return [...(node?.children || [])]; }
  function pdfText(value, options = {}) {
    return { text: text(pdfSafe(value)), fontSize: 9, color: PDF_COLORS.body, lineHeight: 1.28, ...options };
  }

  function richRuns(node) {
    const runs = [];
    const walk = (current, marks = {}) => {
      if (current.nodeType === 3) {
        const value = pdfSafe(current.nodeValue).replace(/\s+/g, ' ');
        if (value) runs.push({ text: value, ...marks });
        return;
      }
      if (current.nodeType !== 1) return;
      const tag = current.tagName.toLowerCase();
      if (['script', 'style', 'svg', 'button', 'input', 'textarea', 'select'].includes(tag)) return;
      if (tag === 'br') {
        runs.push({ text: '\n', ...marks });
        return;
      }
      const next = { ...marks };
      if (tag === 'strong' || tag === 'b') next.bold = true;
      if (tag === 'em' || tag === 'i') next.italics = true;
      if (tag === 'small') next.fontSize = 7.3;
      [...current.childNodes].forEach((child) => walk(child, next));
    };
    walk(node);
    if (!runs.length) return nodeText(node);
    runs[0].text = runs[0].text.replace(/^\s+/, '');
    runs[runs.length - 1].text = runs[runs.length - 1].text.replace(/\s+$/, '');
    return runs.filter((run) => run.text);
  }

  function richText(node, options = {}) {
    return { text: richRuns(node), fontSize: 9, color: PDF_COLORS.body, lineHeight: 1.32, ...options };
  }

  function noBorderLayout(padding = 3) {
    return {
      hLineWidth: () => 0, vLineWidth: () => 0,
      paddingLeft: () => padding, paddingRight: () => padding,
      paddingTop: () => padding, paddingBottom: () => padding
    };
  }

  function borderedLayout(color = PDF_COLORS.line, padding = 8) {
    return {
      hLineWidth: () => 0.7, vLineWidth: () => 0.7,
      hLineColor: () => color, vLineColor: () => color,
      paddingLeft: () => padding, paddingRight: () => padding,
      paddingTop: () => padding, paddingBottom: () => padding
    };
  }

  function nestedCard(stack, options = {}) {
    const border = options.border || PDF_COLORS.line;
    return {
      table: { widths: ['*'], body: [[{ stack, fillColor: options.fill || PDF_COLORS.white, margin: options.margin || [7, 6, 7, 6] }]] },
      layout: borderedLayout(border, 0),
      unbreakable: options.unbreakable !== false
    };
  }

  function chunkRows(items, columns, factory) {
    const rows = [];
    for (let index = 0; index < items.length; index += columns) {
      const row = items.slice(index, index + columns).map(factory);
      while (row.length < columns) row.push({ text: '', border: [false, false, false, false] });
      rows.push(row);
    }
    return rows;
  }

  function grid(items, columns, factory, margin = [0, 4, 0, 12]) {
    if (!items.length) return null;
    return {
      table: { widths: Array(columns).fill('*'), body: chunkRows(items, columns, factory) },
      layout: noBorderLayout(3),
      margin
    };
  }

  function coverBlock(header) {
    const titleNode = header.querySelector('h1') || header.querySelector('h2');
    const kickerNode = header.querySelector('h1')?.parentElement?.querySelector('span') || header.querySelector('span');
    const subtitleNode = header.querySelector('h1')?.parentElement?.querySelector('p') || header.querySelector('p');
    const brand = nodeText(header.querySelector('.doc-brand,.rsc-pdf-mark')) || 'RE';
    let subtitle = nodeText(subtitleNode);
    if (!subtitle) {
      const groups = children(header).filter((node) => nodeText(node) && !node.contains(titleNode));
      const company = groups[groups.length - 1];
      subtitle = children(company).filter((node) => node.tagName !== 'SMALL').map(nodeText).filter(Boolean).join(' · ') || nodeText(company);
    }
    return {
      table: {
        widths: [52, '*'],
        body: [[
          { text: brand, color: PDF_COLORS.white, bold: true, fontSize: 15, alignment: 'center', fillColor: PDF_COLORS.blue, margin: [0, 14, 0, 14] },
          { stack: [
            pdfText(nodeText(kickerNode) || 'Radar Estratégico Empresarial', { color: '#8ed8ff', fontSize: 7.5, bold: true, characterSpacing: 1.2, margin: [0, 0, 0, 4] }),
            pdfText(nodeText(titleNode) || 'Documento Estratégico', { color: PDF_COLORS.white, fontSize: 21, bold: true, lineHeight: 1.05, margin: [0, 0, 0, 5] }),
            pdfText(subtitle, { color: '#d7e8f5', fontSize: 8.5 })
          ], fillColor: PDF_COLORS.navy, margin: [12, 8, 12, 8] }
        ]]
      },
      layout: noBorderLayout(0),
      margin: [0, 0, 0, 22],
      unbreakable: true
    };
  }

  function sectionHeading(host) {
    const titleNode = host.matches('h1,h2,h3,h4') ? host : host.querySelector('h1,h2,h3,h4');
    if (!titleNode) return null;
    const kicker = host === titleNode ? '' : nodeText(host.querySelector('span'));
    const badge = host === titleNode ? '' : nodeText(host.querySelector('b'));
    return {
      table: { widths: ['*', 'auto'], body: [[
        { stack: [
          ...(kicker ? [pdfText(kicker, { color: PDF_COLORS.green, fontSize: 6.8, bold: true, characterSpacing: 1, margin: [0, 0, 0, 2] })] : []),
          pdfText(nodeText(titleNode), { style: 'sectionTitle' })
        ], border: [false, false, false, true], borderColor: PDF_COLORS.line, margin: [0, 0, 0, 5] },
        { text: badge, color: PDF_COLORS.green, fontSize: 7, bold: true, alignment: 'right', border: [false, false, false, true], borderColor: PDF_COLORS.line, margin: [8, 7, 0, 5] }
      ]] },
      layout: noBorderLayout(0),
      margin: [0, 0, 0, 6]
    };
  }

  function fieldCell(node) {
    const label = node.querySelector('span,dt,small');
    const value = node.querySelector('strong,b,dd') || node;
    return nestedCard([
      pdfText(nodeText(label), { style: 'label', margin: [0, 0, 0, 3] }),
      richText(value, { style: 'fieldValue' })
    ], { fill: '#fbfdfd', margin: [6, 5, 6, 5] });
  }

  function fieldGrid(node, columns = 2) {
    return grid(children(node).filter((item) => nodeText(item)), columns, fieldCell);
  }

  function cardPalette(node) {
    if (node.matches('.target,.benefit,.strategic,.featured')) return { fill: PDF_COLORS.greenPale, border: '#a9ddcf', accent: PDF_COLORS.green };
    if (node.matches('.inaction,.danger')) return { fill: PDF_COLORS.redPale, border: '#efcac5', accent: PDF_COLORS.red };
    if (node.matches('.current,.impeded')) return { fill: PDF_COLORS.amberPale, border: '#efd7a9', accent: PDF_COLORS.amber };
    return { fill: '#fbfdfd', border: PDF_COLORS.line, accent: PDF_COLORS.blue };
  }

  function definitionRows(node) {
    const rows = children(node).filter((item) => nodeText(item)).map((item) => {
      const key = item.querySelector('dt,span');
      const value = item.querySelector('dd,strong,b');
      return [
        pdfText(nodeText(key), { color: PDF_COLORS.muted, fontSize: 7.3 }),
        richText(value || item, { color: PDF_COLORS.ink, fontSize: 8, bold: true, alignment: 'right' })
      ];
    });
    if (!rows.length) return null;
    return { table: { widths: ['*', 'auto'], body: rows }, layout: {
      hLineWidth: (index) => index ? 0.5 : 0, vLineWidth: () => 0,
      hLineColor: () => PDF_COLORS.line,
      paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 4, paddingBottom: () => 4
    }, margin: [0, 4, 0, 0] };
  }

  function cardCell(node) {
    const palette = cardPalette(node);
    const direct = children(node);
    const header = direct.find((item) => item.tagName === 'HEADER');
    const kicker = header?.querySelector('span') || direct.find((item) => item.matches('span,.rsc-pdf-tag'));
    const note = header?.querySelector('small');
    const title = direct.find((item) => item.matches('h3,h4')) || direct.find((item) => item.matches('strong,b'));
    const paragraphs = direct.filter((item) => item.tagName === 'P');
    const detail = direct.find((item) => item.tagName === 'DL');
    const fieldSet = direct.find((item) => item.matches('.ext-compare-values,.rsc-pdf-fields'));
    const stack = [];
    if (kicker) stack.push(pdfText(nodeText(kicker), { color: palette.accent, fontSize: 6.8, bold: true, characterSpacing: 0.7, margin: [0, 0, 0, 4] }));
    if (note) stack.push(pdfText(nodeText(note), { color: PDF_COLORS.muted, fontSize: 6.6, alignment: 'right', margin: [0, -11, 0, 4] }));
    if (title) stack.push(richText(title, { color: PDF_COLORS.ink, fontSize: 12.5, bold: true, lineHeight: 1.08, margin: [0, 0, 0, 5] }));
    paragraphs.forEach((paragraph) => stack.push(richText(paragraph, { fontSize: 7.7, color: PDF_COLORS.body, margin: [0, 0, 0, 4] })));
    const details = detail ? definitionRows(detail) : null;
    if (details) stack.push(details);
    const fields = fieldSet ? fieldGrid(fieldSet, 2) : null;
    if (fields) stack.push(fields);
    if (!stack.length) stack.push(richText(node));
    return nestedCard(stack, { fill: palette.fill, border: palette.border, margin: [7, 6, 7, 6] });
  }

  function cardGrid(node) {
    const items = children(node).filter((item) => nodeText(item));
    const columns = node.matches('.nch-investment-comparison,.rsc-pdf-comparison,.ext-compare-values') ? 2 : Math.min(4, Math.max(1, items.length));
    return grid(items, columns, cardCell);
  }

  function tableCell(cell, header, compact) {
    const stack = [];
    const direct = children(cell);
    const structured = direct.filter((item) => item.matches('strong,b,small,p'));
    if (structured.length) {
      structured.forEach((item) => stack.push(richText(item, {
        color: header ? '#315260' : item.matches('small') ? PDF_COLORS.muted : PDF_COLORS.ink,
        fontSize: item.matches('small') ? 6.3 : compact ? 6.8 : 7.6,
        bold: header || item.matches('strong,b'),
        margin: [0, 0, 0, item.matches('small') ? 0 : 2]
      })));
    } else {
      stack.push(richText(cell, { color: header ? '#315260' : PDF_COLORS.ink, fontSize: compact ? 6.8 : 7.6, bold: header }));
    }
    return { stack, fillColor: header ? '#eaf3f5' : undefined, margin: [2, 2, 2, 2] };
  }

  function pdfTable(table) {
    const rowNodes = [...table.querySelectorAll('tr')];
    if (!rowNodes.length) return null;
    const columns = Math.max(...rowNodes.map((row) => children(row).length));
    const compact = columns >= 5;
    const rows = rowNodes.map((row, rowIndex) => children(row).map((cell) => tableCell(cell, cell.tagName === 'TH' || (rowIndex === 0 && !!table.querySelector('thead')), compact)));
    return {
      table: {
        headerRows: table.querySelector('thead') ? 1 : 0,
        widths: Array(columns).fill('*'),
        body: rows,
        dontBreakRows: true,
        keepWithHeaderRows: 1
      },
      layout: {
        hLineWidth: () => 0.6, vLineWidth: () => 0.6,
        hLineColor: () => PDF_COLORS.line, vLineColor: () => PDF_COLORS.line,
        fillColor: (rowIndex) => rowIndex > 0 && rowIndex % 2 === 0 ? '#fbfdfd' : null,
        paddingLeft: () => 4, paddingRight: () => 4, paddingTop: () => 5, paddingBottom: () => 5
      },
      margin: [0, 4, 0, 13]
    };
  }

  function calloutBlock(node) {
    const dark = node.matches('.doc-highlight');
    const warning = node.matches('.rsc-pdf-individual');
    const fill = dark ? PDF_COLORS.navy : warning ? PDF_COLORS.amberPale : PDF_COLORS.bluePale;
    const color = dark ? PDF_COLORS.white : warning ? '#5c401a' : PDF_COLORS.ink;
    const stack = [];
    const title = node.querySelector('h3,h4,strong');
    if (title) stack.push(richText(title, { color, fontSize: 11.5, bold: true, margin: [0, 0, 0, 5] }));
    children(node).filter((item) => item.matches('p,small') && item !== title).forEach((item) => stack.push(richText(item, { color: dark ? '#d9eaf5' : PDF_COLORS.body, fontSize: 8, margin: [0, 0, 0, 3] })));
    if (!stack.length) stack.push(richText(node, { color }));
    return nestedCard(stack, { fill, border: dark ? PDF_COLORS.navy : warning ? '#efd7a9' : '#cfe1e7', margin: [10, 8, 10, 8] });
  }

  function listBlock(node) {
    const ordered = node.tagName === 'OL';
    const items = children(node).filter((item) => item.tagName === 'LI').map((item) => ({ text: richRuns(item), margin: [0, 2, 0, 2] }));
    return { [ordered ? 'ol' : 'ul']: items, color: PDF_COLORS.body, fontSize: 8.5, lineHeight: 1.3, margin: [10, 2, 0, 10] };
  }

  function chipsBlock(node) {
    const items = children(node).filter((item) => nodeText(item));
    return grid(items, Math.min(4, Math.max(1, items.length)), (item) => ({
      text: nodeText(item), color: '#075b95', bold: true, fontSize: 7.2, alignment: 'center', fillColor: '#eaf4fb', margin: [4, 5, 4, 5]
    }), [0, 2, 0, 11]);
  }

  function serviceRows(node) {
    const items = children(node).filter((item) => nodeText(item));
    const rows = items.map((item) => {
      const price = item.querySelector(':scope > b,:scope > strong') || item.querySelector('b') || children(item).find((child) => child.matches('strong'));
      const title = item.querySelector('h3,strong');
      const description = item.querySelector('p,small');
      const left = { stack: [
        richText(title || item, { color: PDF_COLORS.ink, fontSize: 8.2, bold: true, margin: [0, 0, 0, description ? 2 : 0] }),
        ...(description ? [richText(description, { color: PDF_COLORS.muted, fontSize: 6.8 })] : [])
      ] };
      return [left, pdfText(nodeText(price), { color: PDF_COLORS.green, fontSize: 8.2, bold: true, alignment: 'right' })];
    });
    return {
      table: { widths: ['*', 'auto'], body: rows, dontBreakRows: true },
      layout: {
        hLineWidth: (index) => index ? 0.5 : 0, vLineWidth: () => 0,
        hLineColor: () => PDF_COLORS.line,
        fillColor: (rowIndex) => rowIndex % 2 === 0 ? PDF_COLORS.pale : PDF_COLORS.white,
        paddingLeft: () => 8, paddingRight: () => 8, paddingTop: () => 7, paddingBottom: () => 7
      },
      margin: [0, 3, 0, 12]
    };
  }

  function totalBlock(node) {
    const label = node.querySelector('span,small');
    const value = node.querySelector('strong,b');
    return {
      table: { widths: ['*', 'auto'], body: [[
        pdfText(nodeText(label), { color: '#cfe4ef', fontSize: 8, bold: true, margin: [4, 4, 4, 4] }),
        pdfText(nodeText(value), { color: PDF_COLORS.white, fontSize: 14, bold: true, alignment: 'right', margin: [4, 0, 4, 0] })
      ]] },
      layout: { ...noBorderLayout(7), fillColor: () => PDF_COLORS.navy },
      margin: [0, 4, 0, 12],
      unbreakable: true
    };
  }

  function signatureBlock(node) {
    const strong = node.querySelector('strong');
    const spans = children(node).filter((item) => item.tagName === 'SPAN');
    return {
      stack: [
        { canvas: [{ type: 'line', x1: 120, y1: 0, x2: 325, y2: 0, lineWidth: 0.7, lineColor: '#8ca0b0' }], margin: [0, 0, 0, 4] },
        pdfText(nodeText(strong), { color: PDF_COLORS.ink, fontSize: 8.5, bold: true, alignment: 'center', margin: [0, 0, 0, 2] }),
        pdfText(spans.map(nodeText).filter(Boolean).join(' · '), { color: PDF_COLORS.muted, fontSize: 6.7, alignment: 'center' })
      ],
      margin: [0, 0, 0, 0],
      unbreakable: true
    };
  }

  function sectionBlock(section) {
    const direct = children(section);
    const headingHost = direct.find((item) => item.matches('h1,h2,.rsc-pdf-section-head'));
    const stack = [];
    const heading = headingHost ? sectionHeading(headingHost) : null;
    if (heading) stack.push(heading);
    direct.filter((item) => item !== headingHost).forEach((item) => stack.push(...convertNode(item)));
    if (!stack.length) return [];
    return [{ stack, margin: [0, 0, 0, 9] }];
  }

  function genericBlock(node) {
    const direct = children(node).filter((item) => nodeText(item));
    if (!direct.length) return nodeText(node) ? [richText(node, { margin: [0, 1, 0, 6] })] : [];
    return direct.flatMap((item) => convertNode(item));
  }

  function convertNode(node) {
    if (!node || node.nodeType !== 1 || node.matches('.no-print,[data-internal-only],[aria-hidden="true"],button,input,textarea,select,script,style')) return [];
    const tag = node.tagName.toLowerCase();
    if (!nodeText(node) && tag !== 'hr') return [];
    if (node.matches('.doc-cover,.rsc-pdf-cover') || (tag === 'header' && node.closest('.proposal-preview'))) return [coverBlock(node)];
    if (node.matches('.doc-grid,.rsc-pdf-fields,.ext-compare-values')) return [fieldGrid(node, 2)].filter(Boolean);
    if (node.matches('.doc-ratings,.rsc-pdf-kpis')) return [grid(children(node).filter((item) => nodeText(item)), Math.min(4, Math.max(1, children(node).length)), cardCell)].filter(Boolean);
    if (node.matches('.doc-scenarios,.rsc-pdf-comparison,.ext-comparison-grid,.nch-investment-comparison')) return [cardGrid(node)].filter(Boolean);
    if (node.matches('.doc-table-wrap,.rsc-pdf-table-wrap')) return [pdfTable(node.querySelector('table'))].filter(Boolean);
    if (tag === 'table') return [pdfTable(node)].filter(Boolean);
    if (node.matches('.doc-highlight,.rsc-pdf-disclaimer,.rsc-pdf-individual,.ext-comparison-reading')) return [calloutBlock(node)];
    if (node.matches('.doc-chips')) return [chipsBlock(node)].filter(Boolean);
    if (node.matches('.proposal-services,.nch-preview-services,.nch-report-financial-services,.nch-preview-payments')) return [serviceRows(node)].filter(Boolean);
    if (node.matches('.proposal-grand-total')) return [totalBlock(node)];
    if (node.matches('.rsc-pdf-inline-summary')) return [chipsBlock(node)].filter(Boolean);
    if (node.matches('.doc-signature')) return [signatureBlock(node)];
    if (tag === 'ol' || tag === 'ul') return [listBlock(node)];
    if (tag === 'section') return sectionBlock(node);
    if (/^h[1-6]$/.test(tag)) return [pdfText(nodeText(node), { color: PDF_COLORS.ink, fontSize: tag === 'h3' ? 10.5 : 9.5, bold: true, margin: [0, 7, 0, 5] })];
    if (tag === 'p') return [richText(node, { margin: [0, 1, 0, 7] })];
    if (tag === 'small') return [richText(node, { color: PDF_COLORS.muted, fontSize: 7, margin: [0, 1, 0, 5] })];
    if (tag === 'footer') return [pdfText(nodeText(node), { color: PDF_COLORS.muted, fontSize: 7, alignment: 'center', lineHeight: 1.35, margin: [0, 14, 0, 2] })];
    if (tag === 'dl') return [definitionRows(node)].filter(Boolean);
    return genericBlock(node);
  }

  function documentContent(root) {
    const content = [];
    children(root).forEach((node) => {
      if (node.tagName === 'MAIN') children(node).forEach((child) => content.push(...convertNode(child)));
      else content.push(...convertNode(node));
    });
    return content.filter(Boolean);
  }

  function pdfDocumentFromSource(source) {
    const clone = printableClone(source);
    const root = clone.matches('.generated-document,.proposal-preview')
      ? clone
      : clone.querySelector('.generated-document,.proposal-preview') || clone;
    if (text(root.textContent).length < 80) throw new Error('O relatório não terminou de montar. Atualize a prévia e tente gerar novamente.');
    const content = documentContent(root);
    if (!content.length) throw new Error('O relatório não terminou de montar. Atualize a prévia e tente gerar novamente.');
    const title = nodeText(root.querySelector('h1,h2')) || 'Relatório Estratégico Empresarial';
    return {
      pageSize: 'A4',
      pageMargins: [34, 32, 34, 32],
      info: { title, author: 'Radar Estratégico Empresarial', subject: 'Documento estratégico' },
      defaultStyle: { font: 'Roboto', fontSize: 9, color: PDF_COLORS.body },
      styles: {
        sectionTitle: { fontSize: 12.5, bold: true, color: PDF_COLORS.ink, lineHeight: 1.05 },
        label: { fontSize: 6.8, bold: true, color: PDF_COLORS.muted, characterSpacing: 0.5 },
        fieldValue: { fontSize: 8.3, bold: true, color: PDF_COLORS.ink }
      },
      header: (page) => page > 1 ? { text: 'RADAR ESTRATÉGICO EMPRESARIAL', alignment: 'right', margin: [0, 16, 36, 0], color: PDF_COLORS.muted, fontSize: 6.5, bold: true, characterSpacing: 0.7 } : '',
      footer: (page, pages) => ({ text: `Documento estratégico · Página ${page} de ${pages}`, alignment: 'center', margin: [0, 0, 0, 15], color: PDF_COLORS.muted, fontSize: 6.5 }),
      pageBreakBefore: (currentNode, followingNodesOnPage) => currentNode.style === 'sectionTitle' && followingNodesOnPage.length === 0,
      content
    };
  }

  async function createPdfFromSource(source, filename) {
    if (!source) throw new Error('Não foi possível preparar o conteúdo do PDF.');
    await loadPdfLibrary();
    const definition = pdfDocumentFromSource(source);
    const blob = await new Promise((resolve, reject) => {
      try { window.pdfMake.createPdf(definition).getBlob(resolve); } catch (error) { reject(error); }
    });
    if (!(blob instanceof Blob) || blob.size < 1500) throw new Error('O PDF foi gerado sem conteúdo. Atualize a prévia e tente novamente.');
    return { blob, filename };
  }

  async function createPdf(type, lead) {
    const currentLead = latestStoredLead(lead);
    // O documento salvo é a fonte principal. A busca visual fica apenas como compatibilidade.
    // Assim, cards antigos ou prévias abertas não substituem a composição atual do Caderno.
    const source = storedDocument(type, currentLead) || findDocument(type);
    if (!source) throw new Error(type === 'proposal' ? 'Atualize a proposta no Caderno antes de gerar o PDF.' : 'Construa ou atualize o relatório no Caderno antes de gerar o PDF.');
    const filename = documentFilename(type, currentLead);
    return createPdfFromSource(source, filename);
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  async function downloadElementPdf(source, filename) {
    const pdf = await createPdfFromSource(source, filename);
    downloadBlob(pdf.blob, pdf.filename);
    return pdf;
  }

  async function uploadPdf(blob, filename, lead) {
    const supabase = window.RadarCloud?.supabase;
    if (!supabase) throw new Error('A conexão com o armazenamento não está disponível.');
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) throw new Error('A sessão expirou. Entre novamente no sistema.');
    const safeLead = slug(lead.id || lead.companyName || 'caso');
    const path = `${userData.user.id}/${safeLead}/${Date.now()}-${filename}`;
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, blob, {
      cacheControl: '3600',
      contentType: 'application/pdf',
      upsert: false
    });
    if (uploadError) throw uploadError;
    const { data: signed, error: signedError } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS);
    if (signedError || !signed?.signedUrl) throw signedError || new Error('Não foi possível criar o link temporário.');
    return { path, signedUrl: signed.signedUrl, userId: userData.user.id };
  }

  function registerDelivery(ctx, details) {
    const history = Array.isArray(ctx.lead.documentDeliveries) ? ctx.lead.documentDeliveries : [];
    history.unshift({
      id: `delivery_${Date.now().toString(36)}`,
      documentType: details.type,
      filename: details.filename,
      responsibleName: details.responsibleName,
      whatsapp: details.whatsapp,
      storagePath: details.storagePath || '',
      deliveryMode: details.mode,
      createdAt: new Date().toISOString()
    });
    ctx.lead.documentDeliveries = history.slice(0, 30);
    ctx.lead.updatedAt = new Date().toISOString();
    localStorage.setItem(ctx.key, JSON.stringify(ctx.db));
    window.dispatchEvent(new CustomEvent('radar:case-updated', { detail: { leadId: ctx.lead.id, source: 'document-delivery' } }));
  }

  function panelData(panel) {
    return {
      type: panel.querySelector('[name="rddDocument"]')?.value || 'report',
      responsibleName: text(panel.querySelector('[name="rddResponsible"]')?.value),
      whatsappInput: text(panel.querySelector('[name="rddWhatsapp"]')?.value),
      message: String(panel.querySelector('[name="rddMessage"]')?.value || '').trim()
    };
  }

  function validateDecisionMakerContact(panel, data) {
    const nameInput = panel.querySelector('[name="rddResponsible"]');
    const phoneInput = panel.querySelector('[name="rddWhatsapp"]');
    const missingName = !data.responsibleName;
    const missingPhone = !digits(data.whatsappInput);
    nameInput?.setAttribute('aria-invalid', String(missingName));
    phoneInput?.setAttribute('aria-invalid', String(missingPhone));
    if (!missingName && !missingPhone) return true;
    setStatus(panel, 'Envio do whatsapp requer contato do decisor', 'error');
    (missingName ? nameInput : phoneInput)?.focus();
    return false;
  }

  async function handlePdf(panel, button) {
    const ctx = currentContext();
    if (!ctx?.lead) return setStatus(panel, 'Não foi possível identificar o caso atual.', 'error');
    persistPanel(panel);
    button.disabled = true;
    setStatus(panel, 'Gerando o PDF...', 'warning');
    try {
      const data = panelData(panel);
      const pdf = await createPdf(data.type, ctx.lead);
      downloadBlob(pdf.blob, pdf.filename);
      registerDelivery(ctx, { ...data, filename: pdf.filename, whatsapp: digits(data.whatsappInput), mode: 'download' });
      setStatus(panel, 'PDF gerado e baixado.', 'success');
    } catch (error) {
      console.error('[Document delivery PDF]', error);
      setStatus(panel, error?.message || 'Não foi possível gerar o PDF.', 'error');
    } finally {
      button.disabled = false;
    }
  }

  async function handleWhatsapp(panel, button) {
    const ctx = currentContext();
    if (!ctx?.lead) return setStatus(panel, 'Não foi possível identificar o caso atual.', 'error');
    persistPanel(panel);
    const data = panelData(panel);
    if (!validateDecisionMakerContact(panel, data)) return;
    const popup = window.open('about:blank', '_blank');
    button.disabled = true;
    setStatus(panel, 'Gerando o PDF e preparando o link privado...', 'warning');
    try {
      const whatsapp = normalizeWhatsapp(data.whatsappInput);
      const pdf = await createPdf(data.type, ctx.lead);
      const uploaded = await uploadPdf(pdf.blob, pdf.filename, ctx.lead);
      const label = data.type === 'proposal' ? 'proposta financeira' : 'relatório do caso';
      const baseMessage = data.message || defaultMessage(ctx.lead, data.responsibleName);
      const message = `${baseMessage}\n\n${label}: ${uploaded.signedUrl}`;
      const url = `https://wa.me/${whatsapp}?text=${encodeURIComponent(message)}`;
      registerDelivery(ctx, {
        ...data,
        filename: pdf.filename,
        whatsapp,
        storagePath: uploaded.path,
        mode: 'whatsapp'
      });
      if (popup) popup.location.href = url;
      else window.location.href = url;
      setStatus(panel, 'PDF enviado ao armazenamento e conversa do WhatsApp aberta.', 'success');
    } catch (error) {
      if (popup && !popup.closed) popup.close();
      console.error('[Document delivery WhatsApp]', error);
      setStatus(panel, error?.message || 'Não foi possível preparar o envio pelo WhatsApp.', 'error');
    } finally {
      button.disabled = false;
    }
  }

  function bindPanel(panel) {
    panel.addEventListener('input', (event) => {
      event.target?.removeAttribute?.('aria-invalid');
      schedulePersist(panel);
    });
    panel.addEventListener('change', () => schedulePersist(panel));
    panel.querySelector('[data-rdd-pdf]')?.addEventListener('click', (event) => handlePdf(panel, event.currentTarget));
    panel.querySelector('[data-rdd-whatsapp]')?.addEventListener('click', (event) => handleWhatsapp(panel, event.currentTarget));
  }

  function mount() {
    installStyle();
    const existing = document.getElementById(PANEL_ID);
    if (!notebookActive()) {
      existing?.remove();
      return;
    }
    const ctx = currentContext();
    const host = notebookHost();
    if (!ctx?.lead || !host) return;
    if (existing && existing.dataset.leadId === String(ctx.lead.id || '')) return;
    existing?.remove();
    host.appendChild(buildPanel(ctx));
  }

  function scheduleMount() {
    cancelAnimationFrame(mountFrame);
    mountFrame = requestAnimationFrame(mount);
  }

  document.addEventListener('click', (event) => {
    const tab = event.target.closest('button,a,[role="tab"]');
    if (text(tab?.textContent) === 'Caderno') {
      setTimeout(scheduleMount, 60);
      setTimeout(scheduleMount, 220);
    }
  }, true);

  const app = document.getElementById('app');
  if (app) new MutationObserver(scheduleMount).observe(app, { childList: true, subtree: true });
  window.RadarDocumentDelivery = {
    ...(window.RadarDocumentDelivery || {}),
    buildPdfDefinition: pdfDocumentFromSource,
    downloadElementPdf
  };
  window.addEventListener('radar:cloud-synced', scheduleMount);
  window.addEventListener('radar:case-updated', scheduleMount);
  window.addEventListener('load', scheduleMount);
  scheduleMount();
})();
