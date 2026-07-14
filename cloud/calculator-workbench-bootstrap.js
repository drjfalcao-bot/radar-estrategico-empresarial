(() => {
  'use strict';

  const VERSION = '2026.07.14-final.1';
  const ids = {
    core: 'radar-calculator-core-runtime',
    workbench: 'radar-calculator-workbench-runtime',
    polish: 'radar-final-polish-runtime'
  };
  let loading = false;
  let ready = false;
  let attempts = 0;

  function loadScript(src, id) {
    return new Promise((resolve, reject) => {
      const existing = document.getElementById(id);
      if (existing) {
        if (existing.dataset.loaded === '1') return resolve();
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }
      const script = document.createElement('script');
      script.id = id;
      script.src = src;
      script.async = false;
      script.onload = () => { script.dataset.loaded = '1'; resolve(); };
      script.onerror = () => reject(new Error(`Falha ao carregar ${src}`));
      document.body.appendChild(script);
    });
  }

  function appReady() {
    return Boolean(document.querySelector('#app main, .app-shell, .case-head, nav'));
  }

  function simulationScreenReady() {
    const hasComparison = [...document.querySelectorAll('h2')]
      .some((item) => item.textContent?.includes('Comparativo das simulações'));
    const hasAdvanced = [...document.querySelectorAll('summary')]
      .some((item) => item.textContent?.includes('premissas avançadas') || item.textContent?.includes('Parâmetros técnicos adicionais'));
    return hasComparison || hasAdvanced;
  }

  async function loadFinalRelease() {
    if (loading || ready || !appReady()) return;
    loading = true;
    try {
      await loadScript(`./cloud/calculator-core.js?v=${VERSION}`, ids.core);
      await loadScript(`./cloud/final-polish.js?v=${VERSION}`, ids.polish);
      if (simulationScreenReady()) {
        await loadScript(`./cloud/calculator-workbench.js?v=${VERSION}`, ids.workbench);
      }
      ready = true;
      document.documentElement.dataset.radarFinalRelease = VERSION;
      window.dispatchEvent(new CustomEvent('radar:final-release-loaded', { detail: { version: VERSION } }));
    } catch (error) {
      ready = false;
      console.error('[Radar Final bootstrap]', error);
    } finally {
      loading = false;
    }
  }

  async function ensureWorkbench() {
    if (!appReady()) return;
    try {
      await loadScript(`./cloud/calculator-core.js?v=${VERSION}`, ids.core);
      await loadScript(`./cloud/final-polish.js?v=${VERSION}`, ids.polish);
      if (simulationScreenReady()) {
        await loadScript(`./cloud/calculator-workbench.js?v=${VERSION}`, ids.workbench);
      }
    } catch (error) {
      console.error('[Radar Final ensure]', error);
    }
  }

  const observer = new MutationObserver(() => {
    loadFinalRelease();
    ensureWorkbench();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  const interval = setInterval(() => {
    attempts += 1;
    loadFinalRelease();
    ensureWorkbench();
    if (attempts >= 240 || (ready && document.getElementById(ids.workbench))) clearInterval(interval);
  }, 500);

  window.addEventListener('load', loadFinalRelease);
  window.addEventListener('radar:cloud-synced', ensureWorkbench);
  document.addEventListener('click', ensureWorkbench, true);
  loadFinalRelease();
})();
