(() => {
  'use strict';

  const config = window.RADAR_SUPABASE_CONFIG || { enabled: false };
  const appRoot = document.getElementById('app');
  const CLOUD_BOOT_FLAG = 'radar_cloud_hydrated_v1';
  const LOCAL_SESSION_KEYS = ['radar_session_v2', 'radar_session_v3', 'radar_estrategico_session_v3'];

  const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function loadScript(src, id) {
    return new Promise((resolve, reject) => {
      if (id && document.getElementById(id)) return resolve();
      const script = document.createElement('script');
      if (id) script.id = id;
      script.src = src;
      script.defer = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Não foi possível carregar ${src}.`));
      document.body.appendChild(script);
    });
  }

  async function bootRadar(profile = null) {
    if (profile) {
      LOCAL_SESSION_KEYS.forEach((key) => localStorage.setItem(key, JSON.stringify({
        id: profile.id,
        name: profile.full_name,
        email: profile.email,
        phone: profile.phone,
        professionalTitle: profile.professional_title,
        role: profile.role,
        cloud: true
      })));
    }

    await loadScript('./v3-loader.js?v=20260715-final12-money-parser', 'radar-main-loader');
    await loadScript('./v3-ext-loader.js?v=20260715-final12-money-parser', 'radar-extension-loader');
  }

  function renderShell(content) {
    if (!appRoot) return;
    appRoot.innerHTML = `
      <main class="cloud-auth-shell">
        <section class="cloud-auth-card">
          <div class="cloud-auth-brand"><span>RE</span><div><strong>Radar Estratégico Empresarial</strong><small>Acesso controlado</small></div></div>
          ${content}
        </section>
      </main>
      <style>
        .cloud-auth-shell{min-height:100vh;display:grid;place-items:center;padding:24px;background:linear-gradient(135deg,#071b33,#0b3154);font-family:Inter,Arial,sans-serif;color:#0b2540}
        .cloud-auth-card{width:min(520px,100%);background:#fff;border-radius:22px;padding:30px;box-shadow:0 24px 80px rgba(0,0,0,.28)}
        .cloud-auth-brand{display:flex;align-items:center;gap:12px;margin-bottom:24px}.cloud-auth-brand>span{width:48px;height:48px;border-radius:15px;background:#149fe1;color:#fff;display:grid;place-items:center;font-weight:800}.cloud-auth-brand strong{display:block}.cloud-auth-brand small{color:#6b7d8f}
        .cloud-auth-card h1{font-size:24px;margin:0 0 8px}.cloud-auth-card p{color:#60758a;line-height:1.55;font-size:14px}.cloud-auth-grid{display:grid;gap:14px;margin-top:22px}.cloud-auth-grid label{display:grid;gap:6px;font-size:13px;font-weight:700}.cloud-auth-grid input{border:1px solid #d5e0e9;border-radius:10px;padding:12px;font:inherit}.cloud-auth-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:20px}.cloud-btn{border:0;border-radius:10px;padding:12px 17px;font-weight:800;cursor:pointer}.cloud-btn.primary{background:#0a6da8;color:#fff}.cloud-btn.secondary{background:#edf4f8;color:#0b4e78}.cloud-btn.danger{background:#feecef;color:#a11d34}.cloud-link{border:0;background:none;color:#0a6da8;font-weight:800;cursor:pointer;padding:0}.cloud-note{margin-top:16px;padding:13px;border-radius:11px;background:#f3f7fa;color:#486173;font-size:13px}.cloud-status{padding:14px;border-radius:12px;margin-top:16px;font-size:13px}.cloud-status.error{background:#fff0f2;color:#9f1731}.cloud-status.success{background:#eaf8ef;color:#17653a}.cloud-status.warning{background:#fff7df;color:#7a5a00}
      </style>`;
  }

  function showLogin(message = '') {
    renderShell(`
      <div class="eyebrow">Entrada</div>
      <h1>Acesse sua área</h1>
      <p>Somente usuários aprovados conseguem acessar o sistema e visualizar suas próprias oportunidades.</p>
      ${message ? `<div class="cloud-status error">${esc(message)}</div>` : ''}
      <form id="cloud-login-form" class="cloud-auth-grid">
        <label>E-mail<input name="email" type="email" autocomplete="email" required></label>
        <label>Senha<input name="password" type="password" autocomplete="current-password" minlength="6" required></label>
        <button class="cloud-btn primary" type="submit">Entrar</button>
      </form>
      <div class="cloud-auth-actions"><span>Ainda não possui acesso?</span><button id="cloud-open-request" class="cloud-link" type="button">Solicitar acesso</button></div>
      <div id="cloud-auth-feedback"></div>`);

    document.getElementById('cloud-open-request')?.addEventListener('click', showRequestAccess);
    document.getElementById('cloud-login-form')?.addEventListener('submit', onLogin);
  }

  function showRequestAccess() {
    renderShell(`
      <div class="eyebrow">Solicitação</div>
      <h1>Peça acesso ao sistema</h1>
      <p>O cadastro será analisado pelo administrador. O acesso só será liberado após aprovação.</p>
      <form id="cloud-request-form" class="cloud-auth-grid">
        <label>Nome completo<input name="full_name" required minlength="3"></label>
        <label>Telefone<input name="phone" required minlength="8" inputmode="tel"></label>
        <label>Título profissional<input name="professional_title" required minlength="2" placeholder="Ex.: Consultor Tributário"></label>
        <label>E-mail<input name="email" type="email" autocomplete="email" required></label>
        <label>Senha<input name="password" type="password" autocomplete="new-password" minlength="6" required></label>
        <button class="cloud-btn primary" type="submit">Enviar solicitação</button>
      </form>
      <div class="cloud-auth-actions"><button id="cloud-back-login" class="cloud-link" type="button">← Voltar ao login</button></div>
      <div id="cloud-auth-feedback"></div>`);

    document.getElementById('cloud-back-login')?.addEventListener('click', () => showLogin());
    document.getElementById('cloud-request-form')?.addEventListener('submit', onRequestAccess);
  }

  function feedback(type, text) {
    const target = document.getElementById('cloud-auth-feedback');
    if (target) target.innerHTML = `<div class="cloud-status ${type}">${esc(text)}</div>`;
  }

  async function onLogin(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    feedback('warning', 'Validando acesso...');
    const { error } = await window.RadarCloud.supabase.auth.signInWithPassword({
      email: String(form.get('email') || '').trim(),
      password: String(form.get('password') || '')
    });
    if (error) return feedback('error', error.message || 'Não foi possível entrar.');
    await resolveCurrentAccess();
  }

  async function onRequestAccess(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      full_name: String(form.get('full_name') || '').trim(),
      phone: String(form.get('phone') || '').trim(),
      professional_title: String(form.get('professional_title') || '').trim(),
      email: String(form.get('email') || '').trim(),
      password: String(form.get('password') || '')
    };

    if (!payload.full_name || !payload.phone || !payload.professional_title) {
      return feedback('error', 'Preencha nome, telefone e título profissional.');
    }

    feedback('warning', 'Enviando solicitação...');
    const { data, error } = await window.RadarCloud.supabase.auth.signUp({
      email: payload.email,
      password: payload.password,
      options: {
        data: {
          full_name: payload.full_name,
          phone: payload.phone,
          professional_title: payload.professional_title
        }
      }
    });

    if (error) return feedback('error', error.message || 'Não foi possível enviar a solicitação.');

    if (!data.session) {
      return feedback('success', 'Solicitação criada. Confirme o e-mail, quando solicitado, e aguarde a aprovação do administrador.');
    }

    showPending({ full_name: payload.full_name, approval_status: 'pending' });
  }

  function showPending(profile) {
    const status = profile.approval_status;
    const map = {
      pending: ['Solicitação em análise', 'Seu cadastro foi recebido e ainda precisa ser aprovado pelo administrador.', 'warning'],
      rejected: ['Acesso não aprovado', 'A solicitação foi rejeitada. Entre em contato com o administrador para revisar o cadastro.', 'error'],
      suspended: ['Acesso suspenso', 'Este acesso foi suspenso pelo administrador.', 'error']
    };
    const [title, text, type] = map[status] || map.pending;
    renderShell(`
      <div class="eyebrow">Status do acesso</div>
      <h1>${esc(title)}</h1>
      <p>${esc(text)}</p>
      <div class="cloud-status ${type}">Usuário: ${esc(profile.full_name || profile.email || 'cadastro identificado')}</div>
      <div class="cloud-auth-actions"><button id="cloud-check-status" class="cloud-btn primary">Verificar novamente</button><button id="cloud-signout" class="cloud-btn secondary">Sair</button></div>`);
    document.getElementById('cloud-check-status')?.addEventListener('click', resolveCurrentAccess);
    document.getElementById('cloud-signout')?.addEventListener('click', async () => {
      await window.RadarCloud.supabase.auth.signOut();
      showLogin();
    });
  }

  async function getProfile(userId) {
    const { data, error } = await window.RadarCloud.supabase
      .from('profiles')
      .select('id,email,full_name,phone,professional_title,role,approval_status,requested_at')
      .eq('id', userId)
      .single();
    if (error) throw error;
    return data;
  }

  function findDatabaseKey() {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key) continue;
      try {
        const value = JSON.parse(localStorage.getItem(key));
        if (value && Array.isArray(value.leads) && value.settings) return key;
      } catch (_) {}
    }
    return null;
  }

  function readLocalDatabase(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); }
    catch (_) { return null; }
  }

  async function fetchCloudLeads() {
    const { data, error } = await window.RadarCloud.supabase
      .from('leads')
      .select('id,owner_user_id,company_name,cnpj,stage,payload,updated_at')
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async function hydrateCloudDatabase(profile) {
    const dbKey = findDatabaseKey();
    if (!dbKey) return false;

    const localDb = readLocalDatabase(dbKey);
    if (!localDb) return false;

    const cloudRows = await fetchCloudLeads();
    const cloudLeads = cloudRows.map((row) => ({
      ...(row.payload || {}),
      id: row.id,
      companyName: row.payload?.companyName || row.company_name || '',
      cnpj: row.payload?.cnpj || row.cnpj || '',
      stage: row.payload?.stage || row.stage || 'identificada',
      ownerUserId: row.owner_user_id
    }));

    const shouldMigrate = profile.role === 'admin' && config.migrateLocalLeadsForAdmin && cloudRows.length === 0 && Array.isArray(localDb.leads) && localDb.leads.length > 0;

    if (shouldMigrate) {
      localDb.leads = localDb.leads.map((lead) => ({ ...lead, ownerUserId: profile.id }));
      localStorage.setItem(dbKey, JSON.stringify(localDb));
      await pushLocalLeads(dbKey, profile, new Set());
    } else {
      localDb.leads = cloudLeads;
      localStorage.setItem(dbKey, JSON.stringify(localDb));
    }

    window.RadarCloud.dbKey = dbKey;
    window.RadarCloud.remoteIds = new Set(cloudRows.map((row) => row.id));
    return true;
  }

  async function pushLocalLeads(dbKey, profile, previousRemoteIds) {
    const localDb = readLocalDatabase(dbKey);
    if (!localDb || !Array.isArray(localDb.leads)) return;

    const rows = localDb.leads.map((lead) => {
      const ownerUserId = lead.ownerUserId || profile.id;
      const payload = { ...lead, ownerUserId };
      return {
        id: String(lead.id),
        owner_user_id: ownerUserId,
        company_name: String(lead.companyName || ''),
        cnpj: String(lead.cnpj || ''),
        stage: String(lead.stage || 'identificada'),
        payload
      };
    });

    if (rows.length) {
      const { error } = await window.RadarCloud.supabase.from('leads').upsert(rows, { onConflict: 'id' });
      if (error) throw error;
    }

    const currentIds = new Set(rows.map((row) => row.id));
    const removed = [...previousRemoteIds].filter((id) => !currentIds.has(id));
    if (removed.length) {
      const { error } = await window.RadarCloud.supabase.from('leads').delete().in('id', removed);
      if (error) throw error;
    }

    window.RadarCloud.remoteIds = currentIds;
  }

  async function ensureHydrated(profile) {
    const existingKey = findDatabaseKey();
    if (existingKey) return hydrateCloudDatabase(profile);

    sessionStorage.setItem(CLOUD_BOOT_FLAG, 'waiting-db');
    await bootRadar(profile);
    for (let attempt = 0; attempt < 80; attempt += 1) {
      await sleep(100);
      const key = findDatabaseKey();
      if (key) {
        await hydrateCloudDatabase(profile);
        sessionStorage.setItem(CLOUD_BOOT_FLAG, 'ready');
        location.reload();
        return true;
      }
    }
    throw new Error('A aplicação não criou a base local esperada.');
  }

  function startCloudSync(profile) {
    let lastSnapshot = '';
    let syncing = false;
    const interval = Math.max(900, Number(config.syncIntervalMs) || 1800);

    setInterval(async () => {
      if (syncing) return;
      const dbKey = window.RadarCloud.dbKey || findDatabaseKey();
      if (!dbKey) return;
      const db = readLocalDatabase(dbKey);
      if (!db || !Array.isArray(db.leads)) return;
      const snapshot = JSON.stringify(db.leads);
      if (snapshot === lastSnapshot) return;
      syncing = true;
      try {
        await pushLocalLeads(dbKey, profile, window.RadarCloud.remoteIds || new Set());
        lastSnapshot = snapshot;
        window.dispatchEvent(new CustomEvent('radar:cloud-synced'));
      } catch (error) {
        console.error('[Radar Cloud sync]', error);
      } finally {
        syncing = false;
      }
    }, interval);
  }

  async function loadAdminModule(profile) {
    if (profile.role !== 'admin') return;
    await loadScript('./cloud/admin-access.js?v=20260714-cloud1', 'radar-admin-access');
  }

  function interceptLogout() {
    document.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-action="logout"]');
      if (!button || !config.enabled) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      await window.RadarCloud.supabase.auth.signOut();
      LOCAL_SESSION_KEYS.forEach((key) => localStorage.removeItem(key));
      location.reload();
    }, true);
  }

  async function resolveCurrentAccess() {
    const { data: { session } } = await window.RadarCloud.supabase.auth.getSession();
    if (!session?.user) return showLogin();

    try {
      const profile = await getProfile(session.user.id);
      window.RadarCloud.user = session.user;
      window.RadarCloud.profile = profile;

      if (profile.approval_status !== 'approved') return showPending(profile);

      renderShell('<h1>Carregando sua área</h1><p>Validando permissões e sincronizando as oportunidades autorizadas.</p><div class="cloud-status warning">Aguarde alguns segundos.</div>');

      const hasDb = findDatabaseKey();
      if (!hasDb) {
        await ensureHydrated(profile);
        return;
      }

      await hydrateCloudDatabase(profile);
      await bootRadar(profile);
      startCloudSync(profile);
      interceptLogout();
      await loadAdminModule(profile);
    } catch (error) {
      console.error('[Radar Cloud access]', error);
      showLogin(error.message || 'Não foi possível validar o acesso.');
    }
  }

  async function initialize() {
    if (!config.enabled) return bootRadar();

    if (!config.url || !config.anonKey) {
      return renderShell('<h1>Configuração de acesso incompleta</h1><p>O controle de usuários foi ativado, mas a URL ou a chave pública do Supabase ainda não foi informada.</p><div class="cloud-status error">Preencha cloud/supabase-config.js.</div>');
    }

    if (!window.supabase?.createClient) {
      return renderShell('<h1>Falha ao carregar autenticação</h1><p>A biblioteca do Supabase não foi carregada.</p>');
    }

    window.RadarCloud = {
      config,
      supabase: window.supabase.createClient(config.url, config.anonKey),
      user: null,
      profile: null,
      dbKey: null,
      remoteIds: new Set(),
      refreshAccess: resolveCurrentAccess,
      fetchCloudLeads,
      pushLocalLeads
    };

    await resolveCurrentAccess();
  }

  initialize().catch((error) => {
    console.error('[Radar Cloud bootstrap]', error);
    renderShell(`<h1>Não foi possível iniciar o acesso</h1><p>${esc(error.message || error)}</p>`);
  });
})();
