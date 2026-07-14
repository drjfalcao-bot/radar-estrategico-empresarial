window.RADAR_SUPABASE_CONFIG = Object.freeze({
  // Ative somente depois de executar supabase/schema.sql no projeto.
  enabled: false,
  url: '',
  anonKey: '',

  // Migra os casos locais para o primeiro administrador aprovado.
  migrateLocalLeadsForAdmin: true,

  // Intervalo de sincronização do navegador com o banco.
  syncIntervalMs: 1800
});
