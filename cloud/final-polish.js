(() => {
  'use strict';

  const VERSION = '2026.07.14-final.1';
  const STYLE_ID = 'radar-final-polish-style';
  const QUALITY_ID = 'radar-case-quality';
  let timer = null;

  const text = (value) => String(value ?? '').trim();
  const present = (value) => {
    if (typeof value === 'boolean') return true;
    if (typeof value === 'number') return Number.isFinite(value) && value > 0;
    return Boolean(text(value)) && !['nao_informado', 'nao_sei', 'desconhecido'].includes(text(value));
  };
  const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${QUALITY_ID}{margin:0 0 16px;border:1px solid #d5e5ee;border-radius:15px;background:#fff;padding:15px 17px;display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:14px;align-items:center}
      #${QUALITY_ID} .rq-score{width:58px;height:58px;border-radius:50%;display:grid;place-items:center;background:conic-gradient(#1685bd var(--rq),#e8f0f4 0);position:relative}
      #${QUALITY_ID} .rq-score:before{content:'';position:absolute;inset:6px;border-radius:50%;background:#fff}
      #${QUALITY_ID} .rq-score strong{position:relative;color:#0a4267;font-size:13px}
      #${QUALITY_ID} .rq-copy strong{display:block;color:#0b2d49;font-size:13px}
      #${QUALITY_ID} .rq-copy span{display:block;margin-top:3px;color:#60778a;font-size:11px;line-height:1.4}
      #${QUALITY_ID} .rq-tags{display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end}
      #${QUALITY_ID} .rq-tag{border-radius:999px;background:#f0f5f8;color:#48677c;padding:6px 9px;font-size:9px;font-weight:800}
      #${QUALITY_ID} .rq-tag.ok{background:#eaf8ef;color:#1a6b40}
      .radar-final-toast{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:99999;max-width:min(620px,calc(100vw - 30px));padding:12px 15px;border-radius:12px;background:#082946;color:#fff;box-shadow:0 14px 40px rgba(0,0,0,.25);font:600 12px/1.45 Inter,Arial,sans-serif}
      .radar-final-toast.error{background:#8b1830}
      html[data-radar-release] body:after{content:attr(data-radar-release);position:fixed;right:8px;bottom:6px;z-index:2;font:700 8px Inter,Arial,sans-serif;color:#7b8e9d;opacity:.55;pointer-events:none}
      @media(max-width:760px){#${QUALITY_ID}{grid-template-columns:auto 1fr}#${QUALITY_ID} .rq-tags{grid-column:1/-1;justify-content:flex-start}}
    `;
    document.head.appendChild(style);
  }

  function formatCnpj(value) {
    const digits = String(value || '').replace(/\D/g, '').slice(0, 14);
    return digits
      .replace(/^(\d{2})(\d)/, '$1.$2')
      .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1/$2')
      .replace(/(\d{4})(\d)/, '$1-$2');
  }

  function formatPhone(value) {
    const digits = String(value || '').replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 10) return digits.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2');
    return digits.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2');
  }

  function enhanceInputs() {
    document.querySelectorAll('label').forEach((label) => {
      const labelText = label.textContent?.toLowerCase() || '';
      const input = label.querySelector('input');
      if (!input || input.dataset.radarEnhanced) return;
      if (labelText.includes('cnpj')) {
        input.inputMode = 'numeric';
        input.maxLength = 18;
        input.addEventListener('input', () => { input.value = formatCnpj(input.value); });
        input.dataset.radarEnhanced = 'cnpj';
      } else if (labelText.includes('telefone') || labelText.includes('whatsapp')) {
        input.inputMode = 'tel';
        input.maxLength = 15;
        input.addEventListener('input', () => { input.value = formatPhone(input.value); });
        input.dataset.radarEnhanced = 'phone';
      }
    });
  }

  function qualityItems(lead) {
    const pgfn = Number(lead.pgfnSimple || 0) + Number(lead.pgfnPrev || 0) + Number(lead.pgfnOther || 0);
    const debtKnown = Number(lead.rfbDebt || 0) > 0 || pgfn > 0;
    return [
      ['Empresa', lead.companyName],
      ['CNPJ', String(lead.cnpj || '').replace(/\D/g, '').length === 14],
      ['Atividade', lead.activity || lead.segment],
      ['Regime', lead.taxRegime],
      ['Faturamento', Number(lead.revenueMonthly || 0) > 0 || present(lead.revenueBand)],
      ['Funcionários', Number(lead.employees || 0) >= 0 && String(lead.employees ?? '') !== ''],
      ['Momento empresarial', lead.businessPhase],
      ['Objetivo', lead.businessGoal || lead.posture],
      ['Caixa', lead.cashReserve],
      ['Capital de giro', lead.workingCapital],
      ['Decisor', lead.decisionMaker],
      ['Reconhecimento', lead.problemRecognition],
      ['Documentos', lead.documentWillingness || lead.documentation],
      ['Passivo', debtKnown],
      ['CAPAG', lead.capag],
      ['Próxima ação', lead.nextAction || lead.nextActionDate]
    ];
  }

  function renderQuality() {
    const ctx = window.RadarFinalWorkbench?.getContext?.();
    const head = document.querySelector('.case-head');
    if (!ctx || !head) {
      document.getElementById(QUALITY_ID)?.remove();
      return;
    }
    const items = qualityItems(ctx.lead);
    const completed = items.filter(([, value]) => present(value)).length;
    const score = Math.round(completed / items.length * 100);
    const missing = items.filter(([, value]) => !present(value)).map(([label]) => label);
    let panel = document.getElementById(QUALITY_ID);
    if (!panel) {
      panel = document.createElement('section');
      panel.id = QUALITY_ID;
      head.insertAdjacentElement('afterend', panel);
    }
    panel.style.setProperty('--rq', `${score * 3.6}deg`);
    panel.innerHTML = `<div class="rq-score"><strong>${score}%</strong></div><div class="rq-copy"><strong>Qualidade dos dados do caso</strong><span>${missing.length ? `Ainda faltam: ${esc(missing.slice(0, 6).join(', '))}${missing.length > 6 ? '…' : ''}.` : 'Dados essenciais preenchidos para análise, relatório e proposta.'}</span></div><div class="rq-tags"><span class="rq-tag ${score >= 80 ? 'ok' : ''}">${completed}/${items.length} campos</span><span class="rq-tag">Release final</span></div>`;
  }

  function toast(message, type = '') {
    document.querySelector('.radar-final-toast')?.remove();
    const node = document.createElement('div');
    node.className = `radar-final-toast ${type}`;
    node.textContent = message;
    document.body.appendChild(node);
    setTimeout(() => node.remove(), 4200);
  }

  function relabelLegacy() {
    [...document.querySelectorAll('summary')].forEach((summary) => {
      if (summary.textContent?.includes('Ajustar premissas avançadas')) summary.textContent = 'Parâmetros técnicos adicionais';
    });
  }

  function run() {
    clearTimeout(timer);
    injectStyle();
    document.documentElement.dataset.radarRelease = VERSION;
    document.body?.setAttribute('data-radar-release', `Radar ${VERSION}`);
    enhanceInputs();
    relabelLegacy();
    renderQuality();
  }

  new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(run, 180);
  }).observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener('radar:cloud-synced', run);
  window.addEventListener('radar:calculator-workbench-saved', () => {
    run();
    toast('Cenário salvo e sincronização agendada.');
  });
  window.addEventListener('error', (event) => {
    const message = event?.message || '';
    if (!message || message.includes('ResizeObserver')) return;
    console.error('[Radar Final]', event.error || message);
  });

  window.RadarFinalPolish = { VERSION, run, toast };
  run();
})();
