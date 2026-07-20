window.RADAR_SUPABASE_CONFIG = Object.freeze({
  enabled: true,
  url: ['https://obwvtfqfbifyugfssnat','supabase','co'].join('.'),
  anonKey: ['sb','publishable','YlXa5pr0lkrhMOSAqSikhg','ewiy5Lwl'].join('_'),

  // Administrador principal do ambiente.
  adminEmail: 'dr.jfalcao@gmail.com',

  // Migra os casos locais para o primeiro administrador aprovado.
  migrateLocalLeadsForAdmin: true,

  // Intervalo de sincronização do navegador com o banco.
  syncIntervalMs: 1800,

  // Atualiza a lista autorizada de leads sem exigir novo login.
  cloudRefreshIntervalMs: 5000
});
