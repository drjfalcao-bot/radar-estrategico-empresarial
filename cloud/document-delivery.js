(() => {
  'use strict';

  const PANEL_ID = 'radar-document-delivery';
  const STYLE_ID = 'radar-document-delivery-style';
  const BUCKET = 'client-documents';
  const SIGNED_URL_SECONDS = 60 * 60 * 24 * 7;
  const CURRENT_KEYS = ['radar_current_case_id', 'radar_current_lead_id', 'radar_estrategico_current_case_id'];
  const PDF_LIB_ID = 'radar-html2pdf-library';
  const PDF_LIB_URL = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
  const PDF_LIB_INTEGRITY = 'sha512-GsLlZN/3F2ErC5ifS5QtgpiJtWd43JWSuIgh7mbzZ8zBps+dvLusV+eNQATqgA/HdeKFVgA5v3S/cIrLF7QnIg==';

  let mountFrame = 0;
  let saveTimer = 0;

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
      #${PANEL_ID} .rdd-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}
      #${PANEL_ID} button{border:0;border-radius:10px;padding:11px 16px;font:inherit;font-size:12px;font-weight:800;cursor:pointer}
      #${PANEL_ID} button[data-rdd-pdf]{background:#eaf2f7;color:#0b4c72}
      #${PANEL_ID} button[data-rdd-whatsapp]{background:#087f5b;color:#fff}
      #${PANEL_ID} button:disabled{opacity:.55;cursor:wait}
      #${PANEL_ID} .rdd-status{margin:13px 0 0;padding:10px 12px;border-radius:10px;background:#f4f7fa;color:#4b6275;font-size:11px;line-height:1.45}
      #${PANEL_ID} .rdd-status.success{background:#eaf8ef;color:#17653a}
      #${PANEL_ID} .rdd-status.error{background:#fff0f2;color:#9f1731}
      #${PANEL_ID} .rdd-status.warning{background:#fff7df;color:#765700}
      .radar-pdf-stage{position:fixed!important;left:-100000px!important;top:0!important;width:794px!important;min-height:1123px!important;background:#fff!important;color:#0b2540!important;padding:28px!important;box-sizing:border-box!important;z-index:-1!important}
      .radar-pdf-stage *{box-sizing:border-box}
      .radar-pdf-stage button,.radar-pdf-stage input,.radar-pdf-stage select,.radar-pdf-stage textarea,.radar-pdf-stage .no-print,.radar-pdf-stage #${PANEL_ID}{display:none!important}
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
    const responsibleName = lead.companyResponsibleName || lead.responsibleName || lead.contactName || lead.decisionMaker || '';
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
        <label><span>Responsável da empresa</span><input name="rddResponsible" value="${esc(responsibleName)}" placeholder="Nome do contato"></label>
        <label><span>WhatsApp do responsável</span><input name="rddWhatsapp" value="${esc(whatsapp)}" inputmode="tel" placeholder="Ex.: 51 99999-9999"></label>
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

  function loadPdfLibrary() {
    if (window.html2pdf) return Promise.resolve(window.html2pdf);
    return new Promise((resolve, reject) => {
      const existing = document.getElementById(PDF_LIB_ID);
      if (existing) {
        existing.addEventListener('load', () => resolve(window.html2pdf), { once: true });
        existing.addEventListener('error', () => reject(new Error('Não foi possível carregar o gerador de PDF.')), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.id = PDF_LIB_ID;
      script.src = PDF_LIB_URL;
      script.integrity = PDF_LIB_INTEGRITY;
      script.crossOrigin = 'anonymous';
      script.referrerPolicy = 'no-referrer';
      script.onload = () => resolve(window.html2pdf);
      script.onerror = () => reject(new Error('Não foi possível carregar o gerador de PDF.'));
      document.head.appendChild(script);
    });
  }

  function slug(value) {
    return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70) || 'empresa';
  }

  function documentFilename(type, lead) {
    const prefix = type === 'proposal' ? 'proposta' : 'relatorio';
    return `${prefix}-${slug(lead.companyName || 'empresa')}-${new Date().toISOString().slice(0, 10)}.pdf`;
  }

  async function createPdf(type, lead) {
    const source = findDocument(type) || storedDocument(type, lead);
    if (!source) throw new Error(type === 'proposal' ? 'Atualize a proposta no Caderno antes de gerar o PDF.' : 'Construa ou atualize o relatório no Caderno antes de gerar o PDF.');
    await loadPdfLibrary();
    const filename = documentFilename(type, lead);
    const stage = document.createElement('div');
    stage.className = 'radar-pdf-stage';
    stage.appendChild(printableClone(source));
    document.body.appendChild(stage);
    try {
      const options = {
        margin: [9, 8, 9, 8],
        filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false, windowWidth: 980 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'], avoid: ['article', 'section', '.panel', 'table', 'tr'] }
      };
      const blob = await window.html2pdf().set(options).from(stage).toPdf().outputPdf('blob');
      return { blob, filename };
    } finally {
      stage.remove();
    }
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
    const popup = window.open('about:blank', '_blank');
    button.disabled = true;
    setStatus(panel, 'Gerando o PDF e preparando o link privado...', 'warning');
    try {
      const data = panelData(panel);
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
    panel.addEventListener('input', () => schedulePersist(panel));
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
  window.addEventListener('radar:cloud-synced', scheduleMount);
  window.addEventListener('radar:case-updated', scheduleMount);
  window.addEventListener('load', scheduleMount);
  scheduleMount();
})();
