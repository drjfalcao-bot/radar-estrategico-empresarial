(() => {
  'use strict';

  const VERSION = '20260714-calc2';
  const PARTS = ['./cloud/calc-v2-00.b64', './cloud/calc-v2-01.b64'];

  async function fetchJoined() {
    const values = await Promise.all(PARTS.map(async (path) => {
      const response = await fetch(`${path}?v=${VERSION}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Falha ao carregar ${path}: ${response.status}`);
      return (await response.text()).trim();
    }));
    return values.join('');
  }

  function base64ToBytes(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  async function gunzip(base64) {
    if (!('DecompressionStream' in window)) throw new Error('Navegador sem suporte à descompressão da calculadora.');
    const stream = new Blob([base64ToBytes(base64)]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).text();
  }

  async function boot() {
    if (document.getElementById('radar-calculator-v2-code')) return;
    const code = await gunzip(await fetchJoined());
    const script = document.createElement('script');
    script.id = 'radar-calculator-v2-code';
    script.textContent = `${code}\n//# sourceURL=radar-calculator-v2.js`;
    document.body.appendChild(script);
  }

  boot().catch((error) => console.error('[Radar calculator V2]', error));
})();
