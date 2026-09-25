/*
 * PASES Refeições · configuração da instalação
 * Preencha os três endereços abaixo (veja LEIAME.md, passos 1 a 3).
 */
window.PASES_CONFIG = {
  // Supabase > Project Settings > API
  SUPABASE_URL: 'https://nzufjqjihsuwumrqgyig.supabase.co',
  SUPABASE_KEY: 'sb_publishable_ygYcXqj-PQcywGuBOOHGgA_pVvsXzmE',          // "anon" ou "publishable" (nunca a service_role)

  // Apps Script > Implantar > URL do app da Web (termina em /exec)
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbzVAF1NQsR63Wc-WTFfHJRiTLviUDPLl1l-EeFL6ICRisJVwjRldkjqVpYwR9mX9X60ZA/exec',

  // Reconhecimento facial (arquivos já incluídos no projeto; funcionam sem internet)
  FACE_API_URL: 'vendor/face-api/face-api.js',
  FACE_MODELOS_URL: 'vendor/face-api/model/',

  INSTITUICAO: 'IFMA · Campus Imperatriz',
  FUSO: 'America/Fortaleza'
};

// Teste local (python3 ferramentas/servidor_teste.py): usa o servidor de teste automaticamente.
if (['localhost', '127.0.0.1'].includes(location.hostname) && !location.search.includes('producao')) {
  window.PASES_CONFIG.SUPABASE_URL = location.origin;
  window.PASES_CONFIG.SUPABASE_KEY = 'teste-local';
  window.PASES_CONFIG.APPS_SCRIPT_URL = location.origin + '/gas';
}
