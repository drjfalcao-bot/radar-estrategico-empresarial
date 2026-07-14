(() => {
  'use strict';

  const VERSION = '20260714-ext3';
  const STYLE_PATH = './v3/ext-style.b64';
  const SCRIPT_GROUPS = [
    ['./v3/ext-core.b64'],
    ['./v3/ext-strategy-00.b64', './v3/ext-strategy-01.b64'],
    [
      './v3/ext-doc2-00.b64', './v3/ext-doc2-01.b64', './v3/ext-doc2-02.b64', './v3/ext-doc2-03.b64', './v3/ext-doc2-04.b64',
      './v3/ext-doc2-05.b64', './v3/ext-doc2-06.b64', './v3/ext-doc2-07.b64', './v3/ext-doc2-08.b64', './v3/ext-doc2-09.b64'
    ],
    ['./v3/ext-calendar.b64'],
    ['./v3/ext-comparison.b64']
  ];

  async function fetchText(path) {
    const response = await fetch(`${path}?v=${VERSION}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Falha ao carregar ${path}: ${response.status}`);
    return (await response.text()).trim();
  }

  async function fetchJoined(paths) {
    const parts = await Promise.all(paths.map(fetchText));
    return parts.join('');
  }

  function base64ToBytes(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  async function gunzip(base64) {
    if (!('DecompressionStream' in window)) throw new Error('Navegador sem suporte à descompressão das extensões.');
    const stream = new Blob([base64ToBytes(base64)]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).text();
  }

  async function waitForMain() {
    const started = Date.now();
    while (!document.getElementById('radar-v3-app') && Date.now() - started < 12000) {
      await new Promise(resolve => setTimeout(resolve, 80));
    }
    if (!document.getElementById('radar-v3-app')) throw new Error('O motor principal não terminou de carregar.');
  }

  function injectScript(code, name) {
    const script = document.createElement('script');
    script.dataset.radarExtension = name;
    script.textContent = `${code}\n//# sourceURL=${name}.js`;
    document.body.appendChild(script);
  }

  async function boot() {
    const [styleBase64, ...scriptBase64] = await Promise.all([
      fetchText(STYLE_PATH),
      ...SCRIPT_GROUPS.map(fetchJoined)
    ]);
    const [css, ...scripts] = await Promise.all([
      gunzip(styleBase64),
      ...scriptBase64.map(gunzip)
    ]);

    await waitForMain();

    const style = document.createElement('style');
    style.id = 'radar-v3-extension-style';
    style.textContent = css;
    document.head.appendChild(style);
    window.__V3_CSS__ = `${window.__V3_CSS__ || ''}\n${css}`;

    scripts.forEach((code, index) => injectScript(code, `radar-v3-extension-${index + 1}`));
    document.documentElement.dataset.radarExtensions = 'ready';
  }

  boot().catch(error => {
    console.error('[Radar V3 extensions]', error);
    document.documentElement.dataset.radarExtensions = 'error';
  });
})();
