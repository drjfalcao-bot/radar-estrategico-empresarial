(() => {
  'use strict';

  const VERSION = '2026.07.21-cloud12';
  const text = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));

  function currentLead() {
    return window.RadarStrategicCalculator?.getContext?.()?.lead
      || window.RadarExt?.currentLead?.()
      || null;
  }

  function styleMarkup() {
    return [...document.querySelectorAll('link[rel="stylesheet"], style')].map((node) => {
      if (node.tagName === 'LINK') {
        const href = node.getAttribute('href');
        if (!href) return '';
        return `<link rel="stylesheet" href="${esc(new URL(href, document.baseURI).href)}">`;
      }
      return node.outerHTML;
    }).join('\n');
  }

  function printableClone(source) {
    const clone = source.cloneNode(true);
    clone.querySelectorAll('button,input,textarea,select,.no-print,[data-internal-only],#radar-document-delivery').forEach((node) => node.remove());

    const sourceCanvases = [...source.querySelectorAll('canvas')];
    const cloneCanvases = [...clone.querySelectorAll('canvas')];
    cloneCanvases.forEach((canvas, index) => {
      const original = sourceCanvases[index];
      if (!original) return;
      try {
        const image = document.createElement('img');
        image.src = original.toDataURL('image/png');
        image.alt = original.getAttribute('aria-label') || '';
        image.style.maxWidth = '100%';
        canvas.replaceWith(image);
      } catch (_) {
        canvas.remove();
      }
    });

    clone.removeAttribute('style');
    clone.style.display = 'block';
    clone.style.visibility = 'visible';
    clone.style.opacity = '1';
    clone.style.width = '100%';
    clone.style.maxWidth = 'none';
    clone.style.minWidth = '0';
    clone.style.margin = '0';
    clone.style.boxShadow = 'none';
    clone.style.transform = 'none';
    clone.style.background = '#fff';
    clone.style.overflow = 'visible';
    return clone;
  }

  function printCss() {
    return `
      @page { size: A4 portrait; margin: 9mm 8mm 11mm; }
      html, body { margin: 0 !important; padding: 0 !important; width: auto !important; min-width: 0 !important; background: #fff !important; }
      body { font-family: Inter, Arial, sans-serif !important; color: #0b2540 !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      #radar-premium-print-root { width: 100% !important; min-width: 0 !important; overflow: visible !important; }
      #radar-premium-print-root, #radar-premium-print-root * { box-sizing: border-box !important; }
      #radar-premium-print-root .generated-document,
      #radar-premium-print-root .report,
      #radar-premium-print-root .proposal-preview,
      #radar-premium-print-root .report-preview,
      #radar-premium-print-root .document-preview {
        display: block !important;
        position: relative !important;
        width: 100% !important;
        min-width: 0 !important;
        max-width: none !important;
        height: auto !important;
        margin: 0 !important;
        padding-left: 0 !important;
        padding-right: 0 !important;
        box-shadow: none !important;
        transform: none !important;
        overflow: visible !important;
        background: #fff !important;
      }
      #radar-premium-print-root main,
      #radar-premium-print-root section,
      #radar-premium-print-root article,
      #radar-premium-print-root div { min-width: 0 !important; max-width: 100%; }
      #radar-premium-print-root img,
      #radar-premium-print-root svg,
      #radar-premium-print-root canvas { max-width: 100% !important; height: auto !important; }
      #radar-premium-print-root table { width: 100% !important; max-width: 100% !important; table-layout: fixed !important; border-collapse: collapse !important; }
      #radar-premium-print-root th,
      #radar-premium-print-root td { white-space: normal !important; overflow-wrap: anywhere !important; word-break: normal !important; }
      #radar-premium-print-root pre,
      #radar-premium-print-root p,
      #radar-premium-print-root li,
      #radar-premium-print-root dd { white-space: normal !important; overflow-wrap: anywhere !important; }
      #radar-premium-print-root .doc-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
      #radar-premium-print-root .doc-ratings { grid-template-columns: repeat(4, minmax(0, 1fr)) !important; }
      #radar-premium-print-root .doc-scenarios,
      #radar-premium-print-root .ext-comparison-grid,
      #radar-premium-print-root .nch-comparison-kpis { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; }
      #radar-premium-print-root .nch-comparison-columns,
      #radar-premium-print-root .nch-comparison-totals { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
      #radar-premium-print-root h1,
      #radar-premium-print-root h2,
      #radar-premium-print-root h3,
      #radar-premium-print-root h4 { break-after: avoid-page !important; page-break-after: avoid !important; }
      #radar-premium-print-root thead { display: table-header-group !important; }
      #radar-premium-print-root tfoot { display: table-footer-group !important; }
      #radar-premium-print-root tr,
      #radar-premium-print-root .doc-grid > *,
      #radar-premium-print-root .doc-ratings > *,
      #radar-premium-print-root .doc-scenarios > *,
      #radar-premium-print-root .doc-scenario,
      #radar-premium-print-root .doc-highlight,
      #radar-premium-print-root .nch-comparison-kpis > *,
      #radar-premium-print-root .nch-comparison-columns > *,
      #radar-premium-print-root .nch-comparison-totals > *,
      #radar-premium-print-root .proposal-services > *,
      #radar-premium-print-root .nch-preview-payments > *,
      #radar-premium-print-root .signature,
      #radar-premium-print-root [data-signature] {
        break-inside: avoid-page !important;
        page-break-inside: avoid !important;
      }
      #radar-premium-print-root .doc-section { break-inside: auto !important; page-break-inside: auto !important; }
      #radar-premium-print-root button,
      #radar-premium-print-root input,
      #radar-premium-print-root textarea,
      #radar-premium-print-root select,
      #radar-premium-print-root .no-print,
      #radar-premium-print-root [data-internal-only] { display: none !important; }
    `;
  }

  function documentHtml(source, filename) {
    const clone = printableClone(source);
    const title = text(filename || 'Relatorio Estrategico').replace(/\.pdf$/i, '') || 'Relatorio Estrategico';
    return `<!doctype html>
      <html lang="pt-BR">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <base href="${esc(document.baseURI)}">
          <title>${esc(title)}</title>
          ${styleMarkup()}
          <style>${printCss()}</style>
        </head>
        <body><main id="radar-premium-print-root">${clone.outerHTML}</main></body>
      </html>`;
  }

  async function waitPrintReady(printWindow) {
    const doc = printWindow.document;
    const links = [...doc.querySelectorAll('link[rel="stylesheet"]')];
    await Promise.all(links.map((link) => link.sheet ? null : new Promise((resolve) => {
      link.addEventListener('load', resolve, { once: true });
      link.addEventListener('error', resolve, { once: true });
      setTimeout(resolve, 3000);
    })));
    if (doc.fonts?.ready) {
      try { await doc.fonts.ready; } catch (_) {}
    }
    await Promise.all([...doc.images].map((image) => image.complete ? null : new Promise((resolve) => {
      image.addEventListener('load', resolve, { once: true });
      image.addEventListener('error', resolve, { once: true });
      setTimeout(resolve, 3000);
    })));
    await new Promise((resolve) => printWindow.requestAnimationFrame(() => printWindow.requestAnimationFrame(resolve)));
  }

  async function printElementAsPremiumPdf(source, filename) {
    if (!source) throw new Error('Não foi possível preparar o relatório para impressão.');
    const printWindow = window.open('', '_blank', 'width=1100,height=900');
    if (!printWindow) throw new Error('O navegador bloqueou a janela do PDF. Autorize pop-ups para este site.');

    try {
      printWindow.document.open();
      printWindow.document.write(documentHtml(source, filename));
      printWindow.document.close();
      await waitPrintReady(printWindow);
      printWindow.onafterprint = () => setTimeout(() => printWindow.close(), 150);
      printWindow.focus();
      printWindow.print();
      return { filename, version: VERSION, mode: 'native-print-vector' };
    } catch (error) {
      try { printWindow.close(); } catch (_) {}
      throw error;
    }
  }

  function elementFromHtml(html) {
    const template = document.createElement('template');
    template.innerHTML = String(html || '').trim();
    return template.content.firstElementChild;
  }

  function filenameFor(type, lead) {
    const company = text(lead?.companyName || 'empresa').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '_');
    return `${type === 'proposal' ? 'Proposta_Estrategica' : 'Relatorio_Estrategico'}_${company}.pdf`;
  }

  function sourceFor(type, lead) {
    if (type === 'proposal' && window.RadarNotebookCommercialHub?.buildProposalDocument) {
      return elementFromHtml(window.RadarNotebookCommercialHub.buildProposalDocument(lead));
    }
    if (type === 'report' && window.RadarDocumentBuilder?.buildReport) {
      const defaults = {
        title: 'Relatório Estratégico Empresarial',
        showExecutive: true, showCompanyProfile: true,
        showRT: true, showFinancial: true, showFiscal: true, showCollection: true, showNeed: false,
        showCurrent: true, showInaction: true, showTarget: true,
        showSimulations: true, showReduction: true, showStrategy: true,
        showFronts: true, showPlan: true, showNextSteps: true, conclusion: ''
      };
      return elementFromHtml(window.RadarDocumentBuilder.buildReport(lead, { ...defaults, ...(lead?.reportConfig || {}) }));
    }
    return null;
  }

  function patchDelivery() {
    const delivery = window.RadarDocumentDelivery || {};
    if (!delivery.__rasterDownloadElementPdf && typeof delivery.downloadElementPdf === 'function') {
      delivery.__rasterDownloadElementPdf = delivery.downloadElementPdf;
    }
    delivery.downloadElementPdf = printElementAsPremiumPdf;
    delivery.__premiumPdfVersion = VERSION;
    window.RadarDocumentDelivery = delivery;
  }

  function patchLabels() {
    document.querySelectorAll('[data-report-print], [data-rdd-pdf]').forEach((button) => {
      if (/Gerar PDF/i.test(text(button.textContent)) || button.matches('[data-report-print]')) {
        button.textContent = 'Gerar PDF premium';
        button.title = 'Abre a impressão A4 com texto vetorial e pesquisável';
      }
    });
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-rdd-pdf]');
    if (!button) return;
    const panel = button.closest('#radar-document-delivery');
    const lead = currentLead();
    if (!panel || !lead) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    const type = panel.querySelector('[name="rddDocument"]')?.value || 'report';
    const source = sourceFor(type, lead);
    if (!source) {
      window.RadarExt?.toast?.('Atualize o documento no Caderno antes de gerar o PDF.', 'warn');
      return;
    }
    button.disabled = true;
    printElementAsPremiumPdf(source, filenameFor(type, lead))
      .catch((error) => {
        console.error('[PDF premium]', error);
        window.RadarExt?.toast?.(error?.message || 'Não foi possível abrir o PDF premium.', 'warn');
      })
      .finally(() => { button.disabled = false; });
  }, true);

  patchDelivery();
  patchLabels();
  new MutationObserver(() => {
    patchDelivery();
    patchLabels();
  }).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('load', () => {
    patchDelivery();
    patchLabels();
  });
})();