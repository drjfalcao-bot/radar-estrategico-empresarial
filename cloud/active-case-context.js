(() => {
  'use strict';

  const CURRENT_KEYS = [
    'radar_current_case_id',
    'radar_current_lead_id',
    'radar_estrategico_current_case_id'
  ];

  const digits = (value) => String(value ?? '').replace(/\D/g, '');

  function databaseContext() {
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

  function pageIdentity() {
    const header = document.querySelector('.case-head');
    const source = header?.textContent || document.querySelector('main')?.textContent || '';
    const cnpj = digits(source.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/)?.[0] || '');
    const title = header?.querySelector('h1')?.textContent?.trim() || '';
    return { cnpj, title };
  }

  function resolveVisibleLead() {
    const context = databaseContext();
    if (!context) return null;
    const identity = pageIdentity();

    let lead = null;
    if (identity.cnpj) {
      lead = context.db.leads.find((item) => digits(item.cnpj) === identity.cnpj) || null;
    }
    if (!lead && identity.title && !/^nova empresa$/i.test(identity.title)) {
      lead = context.db.leads.find((item) => String(item.companyName || '').trim() === identity.title) || null;
    }
    return lead ? { ...context, lead } : null;
  }

  function syncActiveCase() {
    const context = resolveVisibleLead();
    if (!context?.lead?.id) return false;
    CURRENT_KEYS.forEach((key) => localStorage.setItem(key, String(context.lead.id)));
    window.RadarActiveCase = {
      id: String(context.lead.id),
      cnpj: String(context.lead.cnpj || ''),
      companyName: String(context.lead.companyName || '')
    };
    window.RadarScenarioLite?.mount?.();
    return true;
  }

  document.addEventListener('click', (event) => {
    const target = event.target.closest('button,a');
    if (target?.textContent?.trim() === 'Cenários') {
      syncActiveCase();
      setTimeout(syncActiveCase, 80);
    }
  }, true);

  window.addEventListener('radar:cloud-synced', syncActiveCase);
  window.addEventListener('load', () => setTimeout(syncActiveCase, 700));
  setTimeout(syncActiveCase, 1100);

  window.RadarActiveCaseContext = { sync: syncActiveCase };
})();