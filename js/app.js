// PASES Refeições · roteador, login e estrutura do painel
import { $, $$, esc, ico, aviso, CFG } from './util.js';
import { rpc, api, sessao, relogio, traduzir } from './api.js';
import { montarBalcao } from './kiosk.js';

export const VERSAO = '1.13.0';
const raiz = $('#app');
let desmontar = null;

// ícone do módulo Financeiro (moeda), no mesmo traço dos demais
const ICO_MOEDA = '<svg class="" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M15 9.2A3.2 2.2 0 0 0 12 8c-1.7 0-3 .9-3 2s1.3 2 3 2 3 .9 3 2-1.3 2-3 2a3.2 2.2 0 0 1-3-1.2M12 6v2m0 8v2"/></svg>';

const ROTAS = {
  painel: { titulo: 'Painel', icone: 'casa', perfis: ['admin', 'consulta'], carregar: () => import('./pag-painel.js') },
  balcao: { titulo: 'Balcão', icone: 'balcao', perfis: ['admin', 'operador'], balcao: true },
  registros: { titulo: 'Registros', icone: 'lista', perfis: ['admin', 'consulta', 'operador'], carregar: () => import('./pag-registros.js') },
  relatorios: { titulo: 'Relatórios', icone: 'grafico', perfis: ['admin', 'consulta', 'operador'], carregar: () => import('./pag-relatorios.js') },
  financeiro: { titulo: 'Financeiro', icone: 'moeda', svg: ICO_MOEDA, perfis: ['admin'], carregar: () => import('./pag-financeiro.js') },
  alunos: { titulo: 'Alunos', icone: 'usuarios', perfis: ['admin', 'consulta', 'operador'], carregar: () => import('./pag-alunos.js') },
  trocas: { titulo: 'Trocas', icone: 'atualizar', perfis: ['admin', 'consulta'], carregar: () => import('./pag-trocas.js') },
  faces: { titulo: 'Validar rostos', icone: 'rosto', perfis: ['admin'], carregar: () => import('./pag-faces.js') },
  usuarios: { titulo: 'Usuários', icone: 'chave', perfis: ['admin'], carregar: () => import('./pag-usuarios.js') },
  configuracoes: { titulo: 'Configurações', icone: 'config', perfis: ['admin', 'consulta', 'operador'], carregar: () => import('./pag-config.js') },
  auditoria: { titulo: 'Auditoria', icone: 'historico', perfis: ['admin'], carregar: () => import('./pag-auditoria.js') },
  conta: { titulo: 'Minha conta', icone: 'usuario', perfis: ['admin', 'operador', 'consulta'], carregar: null }
};
const inicial = () => (sessao.perfil === 'operador' ? 'registros' : 'painel');

// ------------------------------------------------------------------ celular e tema
// O balcão depende de webcam, teclado numérico e segunda tela: fica fora do menu no celular.
const celular = () => matchMedia('(max-width: 860px)').matches || (matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 700);
const temaSalvo = () => { try { return localStorage.getItem('pases_tema'); } catch { return null; } };
const temaAtual = () => temaSalvo() || (matchMedia('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro');
function aplicarTema(t = temaAtual()) {
  document.documentElement.dataset.tema = t;
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', t === 'escuro' ? '#101613' : '#f4f6f5');
}
const ICO_SOL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const ICO_LUA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z"/></svg>';
const rotTema = () => (temaAtual() === 'escuro' ? `${ICO_SOL} Modo claro` : `${ICO_LUA} Modo escuro`);
const botaoTema = (estilo = '') => `<button type="button" class="btn fantasma pequeno" data-tema-btn style="${estilo}">${rotTema()}</button>`;
aplicarTema();
// se o navegador ainda estiver com a página antiga guardada, garante a folha de estilos desta versão
{ const l = document.querySelector('link[rel=stylesheet][href*="css/app.css"]'); if (l && !l.getAttribute('href').includes(VERSAO)) l.setAttribute('href', `css/app.css?v=${VERSAO}`); }
document.addEventListener('click', (e) => {
  if (!e.target.closest('[data-tema-btn]')) return;
  const t = temaAtual() === 'escuro' ? 'claro' : 'escuro';
  try { localStorage.setItem('pases_tema', t); } catch { /* sem armazenamento */ }
  aplicarTema(t); $$('[data-tema-btn]').forEach((b) => (b.innerHTML = rotTema()));
});
// sem escolha gravada, acompanha o tema do aparelho
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (!temaSalvo()) { aplicarTema(); $$('[data-tema-btn]').forEach((b) => (b.innerHTML = rotTema())); } });

// ------------------------------------------------------------------ login
function telaLogin(msg = '') {
  raiz.innerHTML = `<div class="tela-login"><form class="login-cartao" autocomplete="on">
    <img src="assets/logo-ifma.png" alt="IFMA Campus Imperatriz">
    <h1>PASES</h1><p>Sistema de Gerenciamento de Refeições</p>
    <label class="campo"><span>Usuário</span><input type="text" name="login" autocomplete="username" required autocapitalize="off"></label>
    <label class="campo"><span>Senha</span><input type="password" name="senha" autocomplete="current-password" required></label>
    <div class="caixa erro-caixa ${msg ? '' : 'oculto'}" data-erro>${esc(msg)}</div>
    <button class="btn primario" style="justify-content:center;padding:11px">Entrar</button>
    <small class="mudo" style="text-align:center">${esc(CFG.INSTITUICAO)} · v${VERSAO}</small>
    ${botaoTema('align-self:center')}
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
      <div class="marca"><img src="assets/simbolo-ifma.png" alt=""><div><b>PASES</b><small>Gerenciamento de Refeições</small></div></div>
      <nav class="nav">${Object.entries(ROTAS).filter(([, r]) => r.perfis.includes(u.perfil) && !(r.semMenu || []).includes(u.perfil) && !(r.balcao && celular())).map(([id, r]) =>
        `<a href="#/${id}" class="${id === rota ? 'ativo' : ''}" data-rota="${id}">${r.svg || ico(r.icone)}<span>${r.titulo}</span></a>`).join('')}</nav>
      <div class="usuario-box"><b>${esc(u.nome)}</b><span class="mudo">${esc(u.login)} · ${esc(u.perfil)}</span><br>
        ${botaoTema('padding-left:0;margin-top:6px')}<br>
        <a href="#" id="sair" class="btn fantasma pequeno" style="padding-left:0;margin-top:2px">${ico('sair')} Sair</a></div>
    </aside>
    <main class="conteudo" id="conteudo"></main></div>`;
  $('#sair').onclick = (e) => { e.preventDefault(); sair(); };
  $$('.nav a').forEach((a) => (a.onclick = () => $('#lateral').classList.remove('aberta')));
  // no celular, tocar fora do menu fecha o menu (o botão de abrir roda depois e reabre quando é ele o tocado)
  $('#conteudo').addEventListener('click', () => $('#lateral').classList.remove('aberta'), true);
  if (u.perfil === 'admin' && !u.deve_trocar_senha) {
    api('faces_listar', { p_pendentes: true }).then((l) => {
      const a = $('[data-rota=faces]'); if (a) { a.querySelectorAll('.contagem').forEach((x) => x.remove()); if (l.length) a.insertAdjacentHTML('beforeend', `<span class="contagem">${l.length}</span>`); }
    }).catch(() => {});
    import('./pag-trocas.js').then((m) => m.atualizarContador()).catch(() => {});
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
  if (rota.balcao && celular()) { aviso('O balcão só funciona no computador (webcam e teclado numérico).', 'erro'); location.hash = '#/' + inicial(); return; }
  if (rota.balcao) {
    desmontar = montarBalcao(raiz, { aoSair: (o) => { if (sessao.perfil === 'admin') location.hash = '#/painel'; else if (o?.semLogout) location.hash = '#/registros'; else sair(); } });
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
