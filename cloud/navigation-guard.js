(() => {
  'use strict';

  const APP_ID = 'app';
  const STYLE_ID = 'radar-navigation-guard-style';
  const LEGACY_LABELS = new Set(['Estratégia', 'Relatório', 'Proposta']);
  const LEGACY_HEADINGS = [
    'Estratégia Recomendada',
    'Relatório Estratégico Empresarial',
    'Gerador de Proposta Financeira',
    'PROPOSTA DE ATUAÇÃO ESTRATÉGICA'
  ];

  let observer = null;
  let scheduled = false;
  let routing = false;

  const text = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
  const candidates = () => [...document.querySelectorAll('button, a, [role="tab"]')];

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      [data-radar-legacy-tab="true"]{display:none!important}
      html[data-radar-route-repair="true"] #app{pointer-events:none}
    `;
    document.head.appendChild(style);
  }

  function tabBar() {
    const nodes = candidates();
    const profile = nodes.find((node) => text(node.textContent) === 'Perfil');
    const notebook = nodes.find((node) => text(node.textContent) === 'Caderno');
    if (!profile || !notebook) return null;

    let current = profile.parentElement;
    for (let depth = 0; depth < 8 && current; depth += 1, current = current.parentElement) {
      if (current.contains(notebook)) return current;
    }
    return null;
  }

  function tabs(bar = tabBar()) {
    return bar ? [...bar.querySelectorAll('button, a, [role="tab"]')] : [];
  }

  function isActive(node) {
    return Boolean(node) && (
      node.classList.contains('active') ||
      node.classList.contains('is-active') ||
      node.getAttribute('aria-selected') === 'true'
    );
  }

  function notebookTab(bar = tabBar()) {
    return tabs(bar).find((node) => text(node.textContent) === 'Caderno') || null;
  }

  function activeLabel(bar = tabBar()) {
    return text(tabs(bar).find(isActive)?.textContent);
  }

  function legacyScreenVisible(bar = tabBar()) {
    if (LEGACY_LABELS.has(activeLabel(bar))) return true;
    if (activeLabel(bar) === 'Caderno') return false;

    return [...document.querySelectorAll('h1,h2,h3,strong')]
      .some((node) => LEGACY_HEADINGS.includes(text(node.textContent)));
  }

  function routeToNotebook(bar = tabBar()) {
    if (routing) return;
    const notebook = notebookTab(bar);
    if (!notebook) return;

    routing = true;
    document.documentElement.dataset.radarRouteRepair = 'true';
    notebook.click();

    setTimeout(() => {
      routing = false;
      delete document.documentElement.dataset.radarRouteRepair;
      schedule();
    }, 120);
  }

  function pruneNavigation() {
    const bar = tabBar();
    if (!bar) return;

    const legacyActive = tabs(bar).some((node) => LEGACY_LABELS.has(text(node.textContent)) && isActive(node));

    tabs(bar).forEach((node) => {
      const label = text(node.textContent);
      if (label === 'Cenários') node.textContent = 'Simulações';
      if (!LEGACY_LABELS.has(label)) return;

      node.dataset.radarLegacyTab = 'true';
      node.setAttribute('aria-hidden', 'true');
      node.setAttribute('tabindex', '-1');
      node.remove();
    });

    if (legacyActive || legacyScreenVisible(bar)) routeToNotebook(bar);
  }

  function reconcile() {
    scheduled = false;
    installStyle();
    pruneNavigation();
    window.RadarSimulationsConsolidation?.reconcile?.();
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(reconcile);
  }

  document.addEventListener('click', (event) => {
    const target = event.target.closest('button, a, [role="tab"]');
    if (!target || !LEGACY_LABELS.has(text(target.textContent))) return;

    const bar = tabBar();
    if (!bar || !bar.contains(target)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    routeToNotebook(bar);
  }, true);

  function observe() {
    const root = document.getElementById(APP_ID);
    if (!root || observer) return;

    observer = new MutationObserver(schedule);
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'aria-selected']
    });
    schedule();
  }

  installStyle();
  observe();
  document.addEventListener('DOMContentLoaded', observe, { once: true });
  window.addEventListener('load', schedule);

  window.RadarNavigationGuard = {
    reconcile: schedule,
    getTabBar: tabBar,
    goToNotebook: routeToNotebook
  };
})();
