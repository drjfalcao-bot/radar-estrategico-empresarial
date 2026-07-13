(() => {
  const STORAGE_KEYS = ['radar_estrategico_v2', 'radar_estrategico_empresarial_v1'];

  function migrateStoredData() {
    STORAGE_KEYS.forEach((key) => {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return;
        const data = JSON.parse(raw);
        if (Array.isArray(data?.leads)) {
          data.leads.forEach((lead) => {
            delete lead.successRate;
          });
          localStorage.setItem(key, JSON.stringify(data));
        }
      } catch {
        // Mantém o sistema funcionando mesmo com dados locais antigos ou inválidos.
      }
    });
  }

  function cleanCommercialContent() {
    document.querySelectorAll('[data-field="successRate"]').forEach((element) => {
      const container = element.closest('.term, label, .field, div');
      if (container) container.remove();
    });

    document.querySelectorAll('.commercial').forEach((section) => {
      if (section.dataset.cleanedCommercial === 'true') return;
      section.dataset.cleanedCommercial = 'true';
      section.innerHTML = `
        <h4>Condição comercial</h4>
        <p>A condição comercial será definida separadamente, conforme o escopo aprovado para o caso.</p>
      `;
    });

    const replacements = [
      [/Êxito sobre benefício econômico/gi, 'Condição comercial'],
      [/êxito de\s*20%\s*sobre o benefício econômico efetivamente obtido/gi, 'condição comercial definida conforme o escopo aprovado'],
      [/êxito de\s*20%/gi, 'condição comercial'],
      [/benefício econômico efetivamente obtido/gi, 'escopo efetivamente aprovado'],
      [/remuneração vinculada ao resultado/gi, 'condição comercial definida separadamente']
    ];

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);

    nodes.forEach((node) => {
      let text = node.nodeValue || '';
      const original = text;
      replacements.forEach(([pattern, replacement]) => {
        text = text.replace(pattern, replacement);
      });
      if (text !== original) node.nodeValue = text;
    });
  }

  migrateStoredData();

  const observer = new MutationObserver(cleanCommercialContent);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', cleanCommercialContent);
  } else {
    cleanCommercialContent();
  }
})();
