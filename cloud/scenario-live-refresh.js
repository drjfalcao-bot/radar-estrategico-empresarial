(() => {
  'use strict';

  const APPLIED_FLAG = 'radar_scenario_applied_at';

  function text(node) {
    return String(node?.textContent || '').trim();
  }

  function activeCaseTab() {
    const labels = new Set(['Perfil', 'Análise acompanhada', 'Cenários', 'Simulações', 'Estratégia', 'Caderno']);
    const candidates = [...document.querySelectorAll('button, a, [role="tab"]')]
      .filter((node) => labels.has(text(node)));
    return candidates.find((node) =>
      node.classList.contains('active') ||
      node.classList.contains('is-active') ||
      node.getAttribute('aria-selected') === 'true'
    ) || candidates.find((node) => ['Cenários', 'Simulações'].includes(text(node))) || null;
  }

  function notifyCaseUpdated(leadId) {
    const detail = { leadId, source: 'simulation-workspace', updatedAt: new Date().toISOString() };
    window.dispatchEvent(new CustomEvent('radar:lead-updated', { detail }));
    window.dispatchEvent(new CustomEvent('radar:case-updated', { detail }));
    document.dispatchEvent(new CustomEvent('radar:lead-updated', { detail }));
    document.dispatchEvent(new CustomEvent('radar:case-updated', { detail }));

    try {
      const ctx = window.RadarScenarioLite?.getContext?.();
      if (ctx?.key) {
        window.dispatchEvent(new StorageEvent('storage', {
          key: ctx.key,
          newValue: localStorage.getItem(ctx.key),
          storageArea: localStorage
        }));
      }
    } catch (_) {}
  }

  function refreshVisibleCase() {
    const ctx = window.RadarScenarioLite?.getContext?.();
    const leadId = ctx?.lead?.id || ctx?.l?.id || '';
    notifyCaseUpdated(leadId);
    sessionStorage.setItem(APPLIED_FLAG, String(Date.now()));

    const tab = activeCaseTab();
    if (tab && !['Cenários', 'Simulações'].includes(text(tab))) tab.click();

    setTimeout(() => {
      window.RadarScenarioLite?.mount?.();
      const status = document.querySelector('#radar-scenario-lite [data-status]');
      if (status) status.textContent = 'Simulação registrada. O Caderno recebeu a fotografia atual.';
    }, 160);
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('#radar-scenario-lite [data-apply]');
    if (!button) return;
    setTimeout(refreshVisibleCase, 60);
  }, true);
})();