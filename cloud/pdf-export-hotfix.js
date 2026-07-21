(() => {
  'use strict';

  const VERSION = '2026.07.21-cloud11';
  const LIB_ID = 'radar-html2pdf-library';
  const LIB_URL = 'https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.3/dist/html2pdf.bundle.min.js';
  const WIDTH = 900;

  const ready = () => typeof window.html2canvas === 'function' && typeof window.jspdf?.jsPDF === 'function';

  function loadLib() {
    if (ready()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const old = document.getElementById(LIB_ID);
      if (old && old.dataset.failed !== 'true') {
        old.addEventListener('load', () => ready() ? resolve() : reject(new Error('O gerador de PDF não iniciou.')), { once: true });
        old.addEventListener('error', () => reject(new Error('Não foi possível carregar o gerador de PDF.')), { once: true });
        return;
      }
      old?.remove();
      const script = document.createElement('script');
      script.id = LIB_ID;
      script.src = LIB_URL;
      script.onload = () => ready() ? resolve() : reject(new Error('O gerador de PDF não iniciou.'));
      script.onerror = () => {
        script.dataset.failed = 'true';
        reject(new Error('Não foi possível carregar o gerador de PDF.'));
      };
      document.head.appendChild(script);
    });
  }

  function installStyle() {
    if (document.getElementById('radar-pdf-a4-style')) return;
    const style = document.createElement('style');
    style.id = 'radar-pdf-a4-style';
    style.textContent = `
      .radar-pdf-a4-stage{position:fixed!important;left:0!important;top:0!important;width:${WIDTH}px!important;display:block!important;visibility:visible!important;opacity:1!important;background:#fff!important;z-index:2147483645!important;pointer-events:none!important;overflow:visible!important}
      .radar-pdf-a4-stage *{box-sizing:border-box!important}
      .radar-pdf-a4-stage button,.radar-pdf-a4-stage input,.radar-pdf-a4-stage select,.radar-pdf-a4-stage textarea,.radar-pdf-a4-stage .no-print,.radar-pdf-a4-stage [data-internal-only],.radar-pdf-a4-stage #radar-document-delivery{display:none!important}
      .radar-pdf-a4-stage .generated-document{display:block!important;visibility:visible!important;opacity:1!important;position:relative!important;width:${WIDTH}px!important;min-width:${WIDTH}px!important;max-width:${WIDTH}px!important;margin:0!important;box-shadow:none!important;transform:none!important;background:#fff!important;overflow:visible!important}
      .radar-pdf-a4-stage img,.radar-pdf-a4-stage svg,.radar-pdf-a4-stage canvas,.radar-pdf-a4-stage table{max-width:100%!important}
      .radar-pdf-a4-mask{position:fixed!important;inset:0!important;z-index:2147483646!important;display:grid!important;place-items:center!important;background:#071b33!important;color:#fff!important;font-family:Inter,Arial,sans-serif!important}
      .radar-pdf-a4-mask>div{width:min(440px,calc(100% - 40px));padding:28px;border-radius:18px;background:rgba(255,255,255,.09);text-align:center}
      .radar-pdf-a4-mask strong,.radar-pdf-a4-mask span{display:block}.radar-pdf-a4-mask span{margin-top:8px;font-size:12px;opacity:.76}
    `;
    document.head.appendChild(style);
  }

  function cloneDocument(source) {
    const clone = source.cloneNode(true);
    clone.querySelectorAll('button,input,textarea,select,.no-print,[data-internal-only],#radar-document-delivery').forEach((node) => node.remove());
    Object.assign(clone.style, {
      display: 'block', visibility: 'visible', opacity: '1', position: 'relative',
      width: `${WIDTH}px`, minWidth: `${WIDTH}px`, maxWidth: `${WIDTH}px`,
      margin: '0', boxShadow: 'none', background: '#fff', transform: 'none', overflow: 'visible'
    });
    return clone;
  }

  async function waitLayout(target) {
    if (document.fonts?.ready) {
      try { await document.fonts.ready; } catch (_) {}
    }
    await Promise.all([...target.querySelectorAll('img')].map((img) => img.complete ? null : new Promise((done) => {
      img.addEventListener('load', done, { once: true });
      img.addEventListener('error', done, { once: true });
      setTimeout(done, 2000);
    })));
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    const width = Math.ceil(Math.max(target.scrollWidth, target.getBoundingClientRect().width));
    const height = Math.ceil(Math.max(target.scrollHeight, target.getBoundingClientRect().height));
    if (width < 300 || height < 120 || String(target.textContent || '').trim().length < 80) {
      throw new Error('O relatório não terminou de montar.');
    }
    return { width, height };
  }

  function scaleFor(width, height) {
    const dimension = 30000 / Math.max(width, height);
    const pixels = Math.sqrt(90000000 / Math.max(width * height, 1));
    return Math.max(0.78, Math.min(1.15, dimension, pixels));
  }

  async function capture(target, size, scale) {
    return window.html2canvas(target, {
      scale, useCORS: true, allowTaint: false, backgroundColor: '#fff', logging: false,
      scrollX: 0, scrollY: 0, width: size.width, height: size.height,
      windowWidth: Math.max(1200, size.width + 80),
      windowHeight: Math.max(1200, Math.min(30000, size.height + 80)),
      imageTimeout: 12000, removeContainer: true
    });
  }

  function rowInk(ctx, width, y) {
    const data = ctx.getImageData(0, Math.max(0, Math.min(ctx.canvas.height - 1, y)), width, 1).data;
    let dark = 0;
    let total = 0;
    const step = Math.max(5, Math.floor(width / 220));
    for (let x = 0; x < width; x += step) {
      const i = x * 4;
      total += 1;
      if (data[i + 3] > 20 && (data[i] + data[i + 1] + data[i + 2]) / 3 < 245) dark += 1;
    }
    return dark / Math.max(total, 1);
  }

  function pageEnd(canvas, start, ideal) {
    if (ideal >= canvas.height) return canvas.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    let best = ideal;
    let score = 2;
    const from = Math.max(start + 200, ideal - 240);
    for (let y = ideal + 24; y >= from; y -= 4) {
      const current = rowInk(ctx, canvas.width, y) + Math.abs(ideal - y) / (ideal - start) * 0.05;
      if (current < score) {
        score = current;
        best = y;
      }
      if (current < 0.01 && y <= ideal) break;
    }
    return Math.max(start + 100, best);
  }

  function makePdf(canvas) {
    const Pdf = window.jspdf.jsPDF;
    const pdf = new Pdf({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    const marginX = 8;
    const top = 9;
    const contentWidth = 194;
    const contentHeight = 278;
    const pxPerMm = canvas.width / contentWidth;
    const pagePx = contentHeight * pxPerMm;
    const pages = [];
    let start = 0;

    while (start < canvas.height) {
      const end = pageEnd(canvas, start, Math.min(canvas.height, Math.round(start + pagePx)));
      if (end <= start) break;
      pages.push([start, end]);
      start = end;
    }

    pages.forEach(([from, to], index) => {
      if (index) pdf.addPage('a4', 'portrait');
      const part = document.createElement('canvas');
      part.width = canvas.width;
      part.height = to - from;
      const ctx = part.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, part.width, part.height);
      ctx.drawImage(canvas, 0, from, canvas.width, part.height, 0, 0, part.width, part.height);
      pdf.addImage(part.toDataURL('image/jpeg', 0.96), 'JPEG', marginX, top, contentWidth, part.height / pxPerMm, undefined, 'FAST');
      pdf.setFontSize(7);
      pdf.setTextColor(130);
      pdf.text(`${index + 1}/${pages.length}`, 202, 292, { align: 'right' });
      part.width = part.height = 1;
    });

    const blob = pdf.output('blob');
    if (!(blob instanceof Blob) || blob.size < 3000) throw new Error('O PDF foi gerado sem conteúdo.');
    return blob;
  }

  function save(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  async function downloadElementPdf(source, filename) {
    if (!source) throw new Error('Não foi possível preparar o conteúdo do PDF.');
    installStyle();
    await loadLib();

    const stage = document.createElement('div');
    stage.className = 'radar-pdf-a4-stage';
    const target = cloneDocument(source);
    stage.appendChild(target);
    const mask = document.createElement('div');
    mask.className = 'radar-pdf-a4-mask';
    mask.innerHTML = '<div><strong>Preparando o PDF</strong><span>Paginação A4 sem alterar a formatação do relatório.</span></div>';
    document.body.append(stage, mask);

    try {
      const size = await waitLayout(target);
      const initial = scaleFor(size.width, size.height);
      let canvas;
      try {
        canvas = await capture(target, size, initial);
      } catch (error) {
        console.warn('[PDF A4] repetindo captura em resolução reduzida.', error);
        canvas = await capture(target, size, Math.max(0.7, Math.min(0.86, initial * 0.75)));
      }
      const blob = makePdf(canvas);
      canvas.width = canvas.height = 1;
      save(blob, filename);
      return { blob, filename, version: VERSION };
    } finally {
      mask.remove();
      stage.remove();
    }
  }

  function patch() {
    const delivery = window.RadarDocumentDelivery || {};
    if (!delivery.__originalDownloadElementPdf && typeof delivery.downloadElementPdf === 'function') {
      delivery.__originalDownloadElementPdf = delivery.downloadElementPdf;
    }
    delivery.downloadElementPdf = downloadElementPdf;
    delivery.__pdfExportHotfixVersion = VERSION;
    window.RadarDocumentDelivery = delivery;
  }

  patch();
  window.addEventListener('load', patch);
})();