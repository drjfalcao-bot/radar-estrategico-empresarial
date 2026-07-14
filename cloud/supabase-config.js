window.RADAR_SUPABASE_CONFIG = Object.freeze({
  // Ative somente depois de executar supabase/schema.sql no projeto.
  enabled: false,
  url: '',
  anonKey: '',

  // Administrador principal do ambiente.
  adminEmail: 'dr.jfalcao@gmail.com',

  // Migra os casos locais para o primeiro administrador aprovado.
  migrateLocalLeadsForAdmin: true,

  // Intervalo de sincronização do navegador com o banco.
  syncIntervalMs: 1800
});