(() => {
  'use strict';

  const STYLE_ID = 'radar-case-contact-ui-style';
  const CURRENT_KEYS = ['radar_current_case_id', 'radar_current_lead_id', 'radar_estrategico_current_case_id'];
  let mountFrame = 0;
  let saveTimer = 0;

  const text = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .radar-required-mark{color:#b4233c;font-weight:900}
      .radar-contact-help{display:block;margin-top:5px;color:#647b8e;font-size:10px;line-height:1.4}
      .radar-timeline-panel .radar-timeline-toggle{border:1px solid #cddde7;border-radius:9px;background:#edf5f9;color:#0a557e;padding:8px 11px;font:800 11px/1 Inter,Arial,sans-serif;cursor:pointer;white-space:nowrap}
      .radar-timeline-panel:not(.is-open) .note-tools,
      .radar-timeline-panel:not(.is-open) .timeline{display:none!important}
      .radar-timeline-panel:not(.is-open){align-self:start}
      .radar-analysis-collapsible>.radar-section-content{display:none!important}
      .radar-analysis-collapsible.is-open>.radar-section-content{display:block!important}
      .radar-analysis-collapsible>.subhead{cursor:pointer;user-select:none}
      .radar-analysis-toggle{margin-left:auto;border:1px solid #cddde7;border-radius:9px;background:#edf5f9;color:#0a557e;padding:8px 11px;font:800 10px/1 Inter,Arial,sans-serif;cursor:pointer;white-space:nowrap}
      @media(max-width:760px){.radar-timeline-panel .panel-head{align-items:flex-start}.radar-timeline-panel .radar-timeline-toggle{margin-top:8px}}
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
    const base = readDatabase();
    if (!base) return null;
    for (const storageKey of CURRENT_KEYS) {
      const id = String(localStorage.getItem(storageKey) || '').replace(/^"|"$/g, '');
      const lead = base.db.leads.find((item) => String(item.id || '') === id);
      if (lead) return { ...base, lead };
    }
    return null;
  }

  function persistContact(field, value) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const ctx = currentContext();
      if (!ctx?.lead) return;
      const normalized = text(value);
      if (field === 'contactName') {
        ctx.lead.contactName = normalized;
        ctx.lead.companyResponsibleName = normalized;
      } else {
        ctx.lead.phone = normalized;
        ctx.lead.contactPhone = normalized;
        ctx.lead.companyResponsibleWhatsapp = normalized;
      }
      ctx.lead.updatedAt = new Date().toISOString();
      localStorage.setItem(ctx.key, JSON.stringify(ctx.db));
      window.dispatchEvent(new CustomEvent('radar:case-updated', {
        detail: { leadId: ctx.lead.id, source: 'decision-maker-contact' }
      }));
    }, 250);
  }

  function requiredLabel(label, title) {
    const caption = label?.querySelector(':scope > span');
    if (!caption || caption.dataset.radarRequiredLabel === title) return;
    caption.dataset.radarRequiredLabel = title;
    caption.innerHTML = `${title} <b class="radar-required-mark" aria-hidden="true">*</b>`;
  }

  function enhanceDecisionMakerFields() {
    const nameInput = document.querySelector('[data-case-field="contactName"]');
    if (!nameInput) return;
    const nameLabel = nameInput.closest('label');
    requiredLabel(nameLabel, 'Nome do decisor');
    nameInput.required = true;
    nameInput.autocomplete = 'name';
    nameInput.placeholder = 'Nome de quem decide pela empresa';
    nameInput.setAttribute('aria-required', 'true');
    if (!nameInput.dataset.radarDecisionContact) {
      nameInput.dataset.radarDecisionContact = 'name';
      nameInput.addEventListener('input', () => persistContact('contactName', nameInput.value));
    }

    let phoneInput = document.querySelector('[data-case-field="phone"]');
    if (!phoneInput) {
      const ctx = currentContext();
      const phoneLabel = document.createElement('label');
      phoneLabel.className = nameLabel?.className || '';
      phoneLabel.dataset.radarDecisionPhone = '1';
      phoneLabel.innerHTML = `<span>Telefone do decisor <b class="radar-required-mark" aria-hidden="true">*</b></span><input data-case-field="phone" type="tel" inputmode="tel" autocomplete="tel" required aria-required="true" placeholder="Ex.: (51) 99999-9999"><small class="radar-contact-help">Obrigatório para o envio pelo WhatsApp.</small>`;
      nameLabel?.insertAdjacentElement('afterend', phoneLabel);
      phoneInput = phoneLabel.querySelector('input');
      phoneInput.value = text(ctx?.lead?.phone || ctx?.lead?.contactPhone || ctx?.lead?.companyResponsibleWhatsapp);
    } else {
      requiredLabel(phoneInput.closest('label'), 'Telefone do decisor');
      phoneInput.required = true;
      phoneInput.setAttribute('aria-required', 'true');
    }

    if (phoneInput && !phoneInput.dataset.radarDecisionContact) {
      phoneInput.dataset.radarDecisionContact = 'phone';
      phoneInput.addEventListener('input', () => persistContact('phone', phoneInput.value));
    }
  }

  function collapseTimeline() {
    const heading = [...document.querySelectorAll('.note-list h2, .note-list h3')]
      .find((node) => text(node.textContent) === 'Linha do tempo');
    const panel = heading?.closest('.note-list');
    if (!panel || panel.dataset.radarTimelineReady) return;
    panel.dataset.radarTimelineReady = '1';
    panel.classList.add('radar-timeline-panel');
    panel.classList.remove('is-open');

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'radar-timeline-toggle';
    button.setAttribute('aria-expanded', 'false');
    button.textContent = 'Ver linha do tempo';
    button.addEventListener('click', () => {
      const open = panel.classList.toggle('is-open');
      button.setAttribute('aria-expanded', String(open));
      button.textContent = open ? 'Recolher linha do tempo' : 'Ver linha do tempo';
    });
    panel.querySelector('.panel-head')?.appendChild(button);
  }

  function collapseAnalysisSections() {
    const activeAnalysis = [...document.querySelectorAll('button,a,[role="tab"]')]
      .find((node) => text(node.textContent) === 'Análise acompanhada' && (
        node.classList.contains('active') || node.classList.contains('is-active') || node.getAttribute('aria-selected') === 'true'
      ));
    if (!activeAnalysis) return;

    const titles = new Set(['Reforma Tributária', 'Passivo Fiscal', 'Cobrança, Execução e Exposição']);
    document.querySelectorAll('section.panel.form-panel').forEach((panel) => {
      const subhead = panel.querySelector(':scope > .subhead');
      const heading = subhead?.querySelector('h3');
      if (!subhead || !titles.has(text(heading?.textContent)) || panel.dataset.radarAnalysisReady) return;

      panel.dataset.radarAnalysisReady = '1';
      panel.classList.add('radar-analysis-collapsible');
      const content = document.createElement('div');
      content.className = 'radar-section-content';
      while (subhead.nextSibling) content.appendChild(subhead.nextSibling);
      panel.appendChild(content);

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'radar-analysis-toggle';
      button.setAttribute('aria-expanded', 'false');
      button.textContent = 'Abrir';
      const toggle = () => {
        const open = panel.classList.toggle('is-open');
        button.setAttribute('aria-expanded', String(open));
        button.textContent = open ? 'Recolher' : 'Abrir';
      };
      button.addEventListener('click', (event) => { event.stopPropagation(); toggle(); });
      subhead.addEventListener('click', (event) => { if (!event.target.closest('button')) toggle(); });
      subhead.appendChild(button);
    });
  }

  function mount() {
    installStyle();
    enhanceDecisionMakerFields();
    collapseTimeline();
    collapseAnalysisSections();
  }

  function scheduleMount() {
    cancelAnimationFrame(mountFrame);
    mountFrame = requestAnimationFrame(mount);
  }

  const app = document.getElementById('app');
  if (app) new MutationObserver(scheduleMount).observe(app, { childList: true, subtree: true });
  window.addEventListener('radar:cloud-data-updated', scheduleMount);
  window.addEventListener('radar:cloud-synced', scheduleMount);
  window.addEventListener('load', scheduleMount);
  scheduleMount();
})();
