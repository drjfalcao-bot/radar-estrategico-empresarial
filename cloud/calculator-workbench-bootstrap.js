(() => {
  'use strict';

  const SCRIPT_ID = 'radar-calculator-workbench-runtime';
  const VERSION = '20260714-workbench3';
  let loaded = false;
  let attempts = 0;

  function screenReady() {
    const hasAdvanced = [...document.querySelectorAll('summary')]
      .some((item) => item.textContent?.includes('Ajustar premissas avançadas'));
    const hasComparison = [...document.querySelectorAll('h2')]
      .some((item) => item.textContent?.includes('Comparativo das simulações'));
    return hasAdvanced || hasComparison;
  }

  function loadWorkbench() {
    if (loaded || document.getElementById(SCRIPT_ID)) return;
    if (!screenReady()) return;

    loaded = true;
    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = `./cloud/calculator-workbench.js?v=${VERSION}`;
    script.async = false;
    script.onload = () => {
      document.documentElement.dataset.radarWorkbench = 'loaded';
      window.dispatchEvent(new CustomEvent('radar:workbench-loaded'));
    };
    script.onerror = () => {
      loaded = false;
      script.remove();
      console.error('[Radar] Falha ao carregar o simulador visível.');
    };
    document.body.appendChild(script);
  }

  const observer = new MutationObserver(loadWorkbench);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  const interval = setInterval(() => {
    attempts += 1;
    loadWorkbench();
    if (loaded || attempts >= 120) clearInterval(interval);
  }, 500);

  window.addEventListener('load', loadWorkbench);
  window.addEventListener('radar:cloud-synced', loadWorkbench);
  document.addEventListener('click', loadWorkbench, true);
  loadWorkbench();
})();
