(() => {
  'use strict';

  const VERSION = '2026.07.21-cloud10';
  const STYLE_ID = 'radar-pdf-export-hotfix-style';
  const PDF_LIB_ID = 'radar-html2pdf-library';
  const PDF_LIB_URL = 'https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.3/dist/html2pdf.bundle.min.js';

  const text = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .radar-pdf-hotfix-stage{position:fixed!important;left:0!important;top:0!important;width:900px!important;min-height:1123px!important;display:block!important;visibility:visible!important;opacity:1!important;background:#fff!important;color:#0b2540!important;padding:0!important;margin:0!important;box-sizing:border-box!important;z-index:2147483645!important;pointer-events:none!important;overflow:visible!important;transform:none!important}
      .radar-pdf-hotfix-stage *{box-sizing:border-box}
      .radar-pdf-hotfix-stage button,.radar-pdf-hotfix-stage input,.radar-pdf-hotfix-stage select,.radar-pdf-hotfix-stage textarea,.radar-pdf-hotfix-stage .no-print,.radar-pdf-hotfix-stage [data-internal-only],.radar-pdf-hotfix-stage #radar-document-delivery{display:none!important}
      .radar-pdf-hotfix-stage .generated-document{display:block!important;visibility:visible!important;opacity:1!important;position:relative!important;width:900px!important;max-width:900px!important;margin:0!important;box-shadow:none!important;transform:none!important;background:#fff!important}
      .radar-pdf-hotfix-stage .doc-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}
      .radar-pdf-hotfix-stage .doc-ratings{grid-template-columns:repeat(4,minmax(0,1fr))!important}
      .radar-pdf-hotfix-stage .doc-scenarios,.radar-pdf-hotfix-stage .ext-comparison-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important}
      .radar-pdf-hotfix-stage .doc-section{break-inside:auto!important;page-break-inside:auto!important}
      .radar-pdf-hotfix-stage .doc-section>h2{break-after:avoid!important;page-break-after:avoid!important}
      .radar-pdf-hotfix-stage .doc-grid>div,.radar-pdf-hotfix-stage .doc-ratings>article,.radar-pdf-hotfix-stage .doc-scenario,.radar-pdf-hotfix-stage .doc-highlight,.radar-pdf-hotfix-stage tr{break-inside:avoid!important;page-break-inside:avoid!important}
      .radar-pdf-hotfix-mask{position:fixed!important;inset:0!important;z-index:2147483646!important;display:grid!important;place-items:center!important;background:#071b33!important;color:#fff!important;font-family:Inter,Arial,sans-serif!important}
      .radar-pdf-hotfix-mask>div{width:min(440px,calc(100% - 40px));padding:28px;border:1px solid rgba(255,255,255,.16);border-radius:18px;background:rgba(255,255,255,.08);box-shadow:0 24px 80px rgba(0,0,0,.25);text-align:center}
      .radar-pdf-hotfix-mask strong{display:block;font-size:18px;margin-bottom:8px}
      .radar-pdf-hotfix-mask span{display:block;font-size:12px;line-height:1.55;opacity:.76}
    `;
    document.head.appendChild(style);
  }

  function loadPdfLibrary() {
    if (typeof window.html2pdf === 'function') return Promise.resolve(window.html2pdf);
    return new Promise((resolve, reject) => {
      const existing = document.getElementById(PDF_LIB_ID);
      if (existing) {
        if (existing.dataset.failed === 'true') existing.remove();
        else {
          existing.addEventListener('load', () => resolve(window.html2pdf), { once: true });
          existing.addEventListener('error', () => reject(new Error('Não foi possível carregar o gerador de PDF.')), { once: true });
          return;
        }
      }
      const script = document.createElement('script');
      script.id = PDF_LIB_ID;
      script.src = PDF_LIB_URL;
      script.onload = () => {
        if (typeof window.html2pdf !== 'function') {
          script.dataset.failed = 'true';
          reject(new Error('O gerador de PDF foi carregado, mas não iniciou corretamente.'));
          return;
        }
        resolve(window.html2pdf);
      };
      script.onerror = () => {
        script.dataset.failed = 'true';
        reject(new Error('Não foi possível carregar o gerador de PDF.'));
      };
      document.head.appendChild(script);
    });
  }

  function printableClone(source) {
    const clone = source.cloneNode(true);
    clone.querySelectorAll('button,input,textarea,select,.no-print,[data-internal-only],#radar-document-delivery').forEach((node) => node.remove());
    clone.querySelectorAll('label').forEach((label) => {
      if (!text(label.textContent)) label.remove();
    });
    Object.assign(clone.style, {
      display: 'block', visibility: 'visible', opacity: '1', position: 'relative',
      width: '900px', maxWidth: '900px', margin: '0', boxShadow: 'none',
      background: '#fff', transform: 'none'
    });
    return clone;
  }

  async function waitForLayout(stage, target) {
    if (document.fonts?.ready) {
      try { await document.fonts.ready; } catch (_) {}
    }
    const images = [...target.querySelectorAll('img')];
    await Promise.all(images.map((image) => {
      if (image.complete) return Promise.resolve();
      return new Promise((resolve) => {
        image.addEventListener('load', resolve, { once: true });
        image.addEventListener('error', resolve, { once: true });
        setTimeout(resolve, 2500);
      });
    }));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const bounds = target.getBoundingClientRect();
    const height = Math.max(bounds.height, target.scrollHeight, stage.scrollHeight);
    const width = Math.max(bounds.width, target.scrollWidth);
    if (text(target.textContent).length < 80 || width < 300 || height < 120) {
      throw new Error('O relatório não terminou de montar. Atualize a prévia e tente novamente.');
    }
    return { width, height };
  }

  function safeCanvasScale(width, height) {
    const maxDimension = 28000;
    const maxPixels = 96000000;
    const byHeight = maxDimension / Math.max(height, 1);
    const byWidth = maxDimension / Math.max(width, 1);
    const byPixels = Math.sqrt(maxPixels / Math.max(width * height, 1));
    return Math.max(0.72, Math.min(1.65, byHeight, byWidth, byPixels));
  }

  function pdfOptions(filename, scale, dimensions) {
    return {
      margin: [9, 8, 9, 8],
      filename,
      image: { type: 'jpeg', quality: 0.94 },
      html2canvas: {
        scale,
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#ffffff',
        logging: false,
        scrollX: 0,
        scrollY: 0,
        windowWidth: Math.max(1200, Math.ceil(dimensions.width + 40)),
        windowHeight: Math.max(1200, Math.min(30000, Math.ceil(dimensions.height + 40))),
        imageTimeout: 15000,
        removeContainer: true
      },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait', compress: true },
      pagebreak: {
        mode: ['css', 'legacy'],
        avoid: ['tr', '.doc-grid > div', '.doc-ratings > article', '.doc-scenario', '.doc-highlight', '.proposal-services > article', '.nch-preview-payments > article', '.rsc-pdf-card', '.rsc-pdf-kpi']
      }
    };
  }

  async function renderBlob(target, filename, scale, dimensions) {
    const worker = window.html2pdf().set(pdfOptions(filename, scale, dimensions)).from(target).toPdf();
    const pdf = await worker.get('pdf');
    const blob = pdf?.output?.('blob');
    if (!(blob instanceof Blob) || blob.size < 2500) {
      throw new Error('O PDF foi gerado sem conteúdo.');
    }
    return blob;
  }

  function createMask() {
    const mask = document.createElement('div');
    mask.className = 'radar-pdf-hotfix-mask';
    mask.innerHTML = '<div><strong>Preparando o PDF</strong><span>O sistema está ajustando o relatório para o limite de renderização do navegador.</span></div>';
    return mask;
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  async function downloadElementPdf(source, filename) {
    if (!source) throw new Error('Não foi possível preparar o conteúdo do PDF.');
    installStyle();
    await loadPdfLibrary();

    const stage = document.createElement('div');
    stage.className = 'radar-pdf-hotfix-stage';
    const target = printableClone(source);
    stage.appendChild(target);
    const mask = createMask();
    document.body.appendChild(stage);
    document.body.appendChild(mask);

    try {
      const dimensions = await waitForLayout(stage, target);
      const initialScale = safeCanvasScale(dimensions.width, dimensions.height);
      let blob;
      try {
        blob = await renderBlob(target, filename, initialScale, dimensions);
      } catch (firstError) {
        console.warn('[PDF export hotfix] primeira tentativa falhou; repetindo em escala reduzida.', firstError);
        const retryScale = Math.max(0.68, Math.min(0.92, initialScale * 0.7));
        blob = await renderBlob(target, filename, retryScale, dimensions);
      }
      downloadBlob(blob, filename);
      return { blob, filename, version: VERSION };
    } catch (error) {
      console.error('[PDF export hotfix]', error);
      throw new Error(error?.message || 'Não foi possível gerar o PDF. Tente novamente.');
    } finally {
      mask.remove();
      stage.remove();
    }
  }

  function patchDelivery() {
    const delivery = window.RadarDocumentDelivery || {};
    if (!delivery.__originalDownloadElementPdf && typeof delivery.downloadElementPdf === 'function') {
      delivery.__originalDownloadElementPdf = delivery.downloadElementPdf;
    }
    delivery.downloadElementPdf = downloadElementPdf;
    delivery.__pdfExportHotfixVersion = VERSION;
    window.RadarDocumentDelivery = delivery;
  }

  patchDelivery();
  window.addEventListener('load', patchDelivery);
})();
