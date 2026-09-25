// PASES Refeições · roteador, login e estrutura do painel
import { $, $$, esc, ico, aviso, CFG } from './util.js';
import { rpc, api, sessao, relogio, traduzir } from './api.js';
import { montarBalcao } from './kiosk.js';

export const VERSAO = '1.3.0';
const raiz = $('#app');
let desmontar = null;

const ROTAS = {
  painel:        { titulo: 'Painel', icone: 'casa', perfis: ['admin', 'consulta'], carregar: () => import('./pag-painel.js') },
  balcao:        { titulo: 'Balcão', icone: 'balcao', perfis: ['admin', 'operador'], balcao: true },
  registros:     { titulo: 'Registros', icone: 'lista', perfis: ['admin', 'consulta', 'operador'], carregar: () => import('./pag-registros.js') },
  relatorios:    { titulo: 'Relatórios', icone: 'grafico', perfis: ['admin', 'consulta'], carregar: () => import('./pag-relatorios.js') },
  alunos:        { titulo: 'Alunos', icone: 'usuarios', perfis: ['admin', 'consulta'], carregar: () => import('./pag-alunos.js') },
  faces:         { titulo: 'Validar rostos', icone: 'rosto', perfis: ['admin'], carregar: () => import('./pag-faces.js') },
  usuarios:      { titulo: 'Usuários', icone: 'chave', perfis: ['admin'], carregar: () => import('./pag-usuarios.js') },
  configuracoes: { titulo: 'Configurações', icone: 'config', perfis: ['admin', 'consulta'], carregar: () => import('./pag-config.js') },
  auditoria:     { titulo: 'Auditoria', icone: 'historico', perfis: ['admin'], carregar: () => import('./pag-auditoria.js') },
  conta:         { titulo: 'Minha conta', icone: 'usuario', perfis: ['admin', 'operador', 'consulta'], semMenu: ['operador'], carregar: null }
};
const inicial = () => (sessao.perfil === 'operador' ? 'balcao' : 'painel');

// ------------------------------------------------------------------ login
function telaLogin(msg = '') {
  raiz.innerHTML = `<div class="tela-login"><form class="login-cartao" autocomplete="on">
      <img src="assets/logo-ifma.png" alt="IFMA Campus Imperatriz">
      <h1>PASES Refeições</h1><p>Programa de Alimentação Estudantil</p>
      <label class="campo"><span>Usuário</span><input type="text" name="login" autocomplete="username" required autocapitalize="off"></label>
      <label class="campo"><span>Senha</span><input type="password" name="senha" autocomplete="current-password" required></label>
      <div class="caixa erro-caixa ${msg ? '' : 'oculto'}" data-erro>${esc(msg)}</div>
      <button class="btn primario" style="justify-content:center;padding:11px">Entrar</button>
      <small class="mudo" style="text-align:center">${esc(CFG.INSTITUICAO)} · v${VERSAO}</small>
    </form></div>`;
  const f = $('form', raiz);
  $('input[name=login]', f).focus();
  f.onsubmit = async (e) => {
    e.preventDefault();
    const b = $('button', f); b.disabled = true;
    try {
      const r = await rpc('login', { p_login: f.login.value.trim(), p_senha: f.senha.value, p_dispositivo: navigator.userAgent.slice(0, 180) });
      if (r.erro) throw new Error(traduzir(r.erro));
      sessao.salvar(r.token, r.usuario); relogio.ajustar(r.servidor);
      location.hash = r.usuario.deve_trocar_senha ? '#/conta' : '#/' + inicial();
      navegar();
    } catch (err) {
      const box = $('[data-erro]', f); box.textContent = err.message; box.classList.remove('oculto');
    } finally { b.disabled = false; }
  };
}

// ------------------------------------------------------------------ estrutura
function shell(rota) {
  const u = sessao.usuario;
  raiz.innerHTML = `<div class="shell">
    <aside class="lateral" id="lateral">
      <div class="marca"><img src="assets/simbolo-ifma.png" alt=""><div><b>PASES</b><small>Refeições · Imperatriz</small></div></div>
      <nav class="nav">${Object.entries(ROTAS).filter(([, r]) => r.perfis.includes(u.perfil) && !(r.semMenu || []).includes(u.perfil)).map(([id, r]) =>
        `<a href="#/${id}" class="${id === rota ? 'ativo' : ''}" data-rota="${id}">${ico(r.icone)}<span>${r.titulo}</span></a>`).join('')}</nav>
      <div class="usuario-box"><b>${esc(u.nome)}</b><span class="mudo">${esc(u.login)} · ${esc(u.perfil)}</span><br>
        <a href="#" id="sair" class="btn fantasma pequeno" style="padding-left:0;margin-top:6px">${ico('sair')} Sair</a></div>
    </aside>
    <main class="conteudo" id="conteudo"></main></div>`;
  $('#sair').onclick = (e) => { e.preventDefault(); sair(); };
  $$('.nav a').forEach((a) => (a.onclick = () => $('#lateral').classList.remove('aberta')));
  if (u.perfil === 'admin' && !u.deve_trocar_senha) {
    api('faces_listar', { p_pendentes: true }).then((l) => {
      const a = $('[data-rota=faces]'); if (a) { a.querySelectorAll('.contagem').forEach((x) => x.remove()); if (l.length) a.insertAdjacentHTML('beforeend', `<span class="contagem">${l.length}</span>`); }
    }).catch(() => {});
  }
  return $('#conteudo');
}

export function cabecalho(titulo, sub = '', acoes = '') {
  return `<div class="cabecalho"><button class="btn menu-movel" onclick="document.getElementById('lateral').classList.add('aberta')">${ico('menu')}</button>
    <div><h1>${esc(titulo)}</h1>${sub ? `<p>${sub}</p>` : ''}</div><span class="espaco"></span><div class="linha-flex nao-imprimir">${acoes}</div></div>`;
}

async function sair() {
  try { await rpc('logout', { p_token: sessao.token }); } catch { /* offline */ }
  sessao.limpar(); location.hash = ''; telaLogin();
}

// ------------------------------------------------------------------ minha conta
function paginaConta(el) {
  const u = sessao.usuario;
  el.innerHTML = cabecalho('Minha conta', `${esc(u.nome)} · ${esc(u.login)} · perfil ${esc(u.perfil)}`) + `
    <div class="cartao" style="max-width:520px">
      ${u.deve_trocar_senha ? '<div class="caixa aviso-caixa" style="margin-bottom:12px">Defina uma nova senha para continuar.</div>' : ''}
      <h2>Trocar senha</h2><form class="grade" style="grid-template-columns:1fr;margin-top:12px" id="f-senha">
        <label class="campo"><span>Senha atual</span><input type="password" name="atual" required autocomplete="current-password"></label>
        <label class="campo"><span>Nova senha (mínimo 6 caracteres)</span><input type="password" name="nova" required minlength="6" autocomplete="new-password"></label>
        <label class="campo"><span>Repita a nova senha</span><input type="password" name="rep" required autocomplete="new-password"></label>
        <div><button class="btn primario">Salvar nova senha</button></div></form></div>`;
  $('#f-senha').onsubmit = async (e) => {
    e.preventDefault(); const f = e.target;
    if (f.nova.value !== f.rep.value) return aviso('As senhas não conferem.', 'erro');
    try {
      await api('trocar_senha', { p_atual: f.atual.value, p_nova: f.nova.value });
      sessao.atualizarUsuario({ ...u, deve_trocar_senha: false });
      aviso('Senha alterada.', 'ok'); location.hash = '#/' + inicial();
    } catch (err) { aviso(err.message, 'erro'); }
  };
}

// ------------------------------------------------------------------ roteador
async function navegar() {
  if (desmontar) { try { desmontar(); } catch { /* ignore */ } desmontar = null; }
  if (!sessao.token) return telaLogin();
  let id = (location.hash.replace(/^#\/?/, '').split('?')[0]) || inicial();
  if (sessao.usuario?.deve_trocar_senha) id = 'conta';
  const rota = ROTAS[id];
  if (!rota || !rota.perfis.includes(sessao.perfil)) { location.hash = '#/' + inicial(); return; }
  if (rota.balcao) {
    desmontar = montarBalcao(raiz, { aoSair: () => { if (sessao.perfil === 'admin') location.hash = '#/painel'; else sair(); } });
    return;
  }
  const el = shell(id);
  if (id === 'conta') return paginaConta(el);
  el.innerHTML = '<div class="vazio">Carregando…</div>';
  try {
    const mod = await rota.carregar();
    const r = await mod.render(el, { cabecalho, perfil: sessao.perfil, usuario: sessao.usuario });
    if (typeof r === 'function') desmontar = r;
  } catch (e) {
    console.error(e);
    el.innerHTML = cabecalho(rota.titulo) + `<div class="caixa erro-caixa">${esc(e.message || e)}</div>`;
  }
}

window.addEventListener('hashchange', navegar);
window.addEventListener('pases:sessao-expirada', () => { sessao.limpar(); telaLogin('Sua sessão expirou. Entre novamente.'); });
window.addEventListener('pases:trocar-senha', () => {
  if (sessao.usuario) sessao.atualizarUsuario({ ...sessao.usuario, deve_trocar_senha: true });
  if (!location.hash.startsWith('#/conta')) location.hash = '#/conta';
});

// Atualiza dados da sessão ao abrir (e sincroniza o relógio)
(async () => {
  if (sessao.token) {
    try {
      const s = await rpc('sessao_info', { p_token: sessao.token }, { timeout: 8000 });
      sessao.atualizarUsuario(s.usuario); relogio.ajustar(s.servidor);
    } catch (e) { if (!e.rede) { sessao.limpar(); } }
  }
  navegar();
})();

// Guarda os arquivos do sistema no computador para abrir mesmo sem internet
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
