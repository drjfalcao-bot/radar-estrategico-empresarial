(() => {
  'use strict';

  const VERSION = '20260715-final12-money-parser';
  const APP_PARTS = [
    './v3/app2-00.b64',
    './v3/app2-01.b64',
    './v3/app2-02.b64',
    './v3/app2-03.b64',
    './v3/app2-04.b64',
    './v3/app2-05.b64',
    './v3/app2-06.b64',
    './v3/app2-07.b64'
  ];
  const STYLE_PARTS = ['./v3/style-gz.b64'];
  const appRoot = document.getElementById('app');

  const BROKEN_NUM_PARSER = "const num = v => Number(String(v ?? '').replace(/\\./g,'').replace(',','.').replace(/[^0-9.-]/g,'')) || 0;";
  const FIXED_NUM_PARSER = `const num = v => {
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
    const raw = String(v ?? '').trim();
    if (!raw) return 0;
    const normalized = raw.includes(',')
      ? raw.replace(/\\./g,'').replace(',','.').replace(/[^0-9.-]/g,'')
      : raw.replace(/[^0-9.-]/g,'');
    return Number(normalized) || 0;
  };`;

  function patchMoneyParser(code) {
    const source = String(code || '');
    if (!source.includes(BROKEN_NUM_PARSER)) return source;
    return source.split(BROKEN_NUM_PARSER).join(FIXED_NUM_PARSER);
  }

  window.RadarPatchMoneyParser = patchMoneyParser;

  function showLoading() {
    if (!appRoot) return;
    appRoot.innerHTML = '<main style="min-height:100vh;display:grid;place-items:center;background:#071b33;color:#fff;font-family:Inter,Arial,sans-serif"><section style="text-align:center;max-width:460px;padding:32px"><div style="width:54px;height:54px;border-radius:16px;background:#1da7e9;display:grid;place-items:center;font-weight:800;margin:0 auto 18px">RE</div><h1 style="font-size:20px;margin:0 0 8px">Radar Estratégico Empresarial</h1><p style="font-size:12px;opacity:.72;margin:0">Carregando a Central de Diagnóstico e Simulação...</p></section></main>';
  }

  function showError(error) {
    console.error('[Radar V3]', error);
    if (!appRoot) return;
    appRoot.innerHTML = '<main style="min-height:100vh;display:grid;place-items:center;background:#f4f7fa;font-family:Inter,Arial,sans-serif;color:#0b2540"><section style="max-width:560px;background:#fff;border:1px solid #dbe5ed;border-radius:18px;padding:32px;box-shadow:0 18px 50px rgba(7,27,51,.12)"><h1 style="font-size:21px;margin:0 0 10px">Não foi possível carregar a nova versão</h1><p style="font-size:13px;line-height:1.6;color:#60758a">Atualize a página com <strong>Ctrl + F5</strong>. Caso a mensagem continue, abra o site em uma janela anônima para eliminar arquivos antigos do cache.</p><button onclick="location.reload()" style="border:0;border-radius:10px;padding:12px 18px;background:#0a66a3;color:#fff;font-weight:700;cursor:pointer">Recarregar</button></section></main>';
  }

  async function fetchJoined(paths) {
    const values = await Promise.all(paths.map(async (path) => {
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
    if (!('DecompressionStream' in window)) throw new Error('Navegador sem suporte à descompressão da aplicação.');
    const compressed = base64ToBytes(base64);
    const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).text();
  }

  async function boot() {
    showLoading();
    const [appBase64, styleBase64] = await Promise.all([fetchJoined(APP_PARTS), fetchJoined(STYLE_PARTS)]);
    const [rawAppCode, css] = await Promise.all([gunzip(appBase64), gunzip(styleBase64)]);
    const appCode = patchMoneyParser(rawAppCode);
    if (appCode === rawAppCode) throw new Error('O parser monetário esperado não foi encontrado no pacote V3.');
    window.__V3_CSS__ = css;
    const style = document.createElement('style');
    style.id = 'radar-v3-style';
    style.textContent = css;
    document.head.appendChild(style);
    const script = document.createElement('script');
    script.id = 'radar-v3-app';
    script.textContent = `${appCode}\n//# sourceURL=radar-v3-app.js`;
    document.body.appendChild(script);
  }

  boot().catch(showError);
})();