(() => {
  'use strict';

  async function load() {
    const paths = [
      './cloud/calculator-v3-00.b64?v=20260714-calc3',
      './cloud/calculator-v3-01.b64?v=20260714-calc3'
    ];

    const parts = await Promise.all(paths.map(async (path) => {
      const response = await fetch(path, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Falha ao carregar ${path}`);
      return (await response.text()).replace(/\s+/g, '');
    }));

    const binary = atob(parts.join(''));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    const source = await new Response(stream).text();
    new Function(`${source}\n//# sourceURL=calculator-v3.js`)();
  }

  load().catch((error) => console.error('[Radar Calculator V3]', error));
})();
