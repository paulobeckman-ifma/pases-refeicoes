// Usuários do sistema e perfis de acesso
import { $, esc, ico, modal, aviso, fmtDataHora } from './util.js';
import { api, sessao } from './api.js';

const PERFIS = {
  admin: 'Administrador: tudo, inclusive editar registros, alunos, usuários e configurações',
  operador: 'Balcão: apenas registra refeições (notebook da lanchonete)',
  consulta: 'Consulta: vê painel, registros, relatórios e alunos (nutricionista, assistência social, direção)'
};

export async function render(el, { cabecalho }) {
  let lista = await api('usuarios_listar');
  el.innerHTML = cabecalho('Usuários', 'Quem pode entrar no sistema e o que cada perfil pode fazer.', `<button class="btn primario" id="u-novo">${ico('mais')} Novo usuário</button>`) + `
    <div class="cartao" style="margin-bottom:16px"><dl class="dl">${Object.entries(PERFIS).map(([k, v]) => `<dt><span class="selo ${k === 'admin' ? 'verde' : k === 'operador' ? 'azul' : ''}">${k}</span></dt><dd>${esc(v)}</dd>`).join('')}</dl></div>
    <div class="tabela-wrap"><table class="tabela"><thead><tr><th>Nome</th><th>Login</th><th>Perfil</th><th>Situação</th><th>Último acesso</th></tr></thead><tbody id="u-corpo"></tbody></table></div>`;
  const desenhar = () => {
    $('#u-corpo').innerHTML = lista.map((u) => `<tr class="clicavel" data-id="${u.id}"><td>${esc(u.nome)}${u.id === sessao.usuario.id ? ' <small class="mudo">(você)</small>' : ''}</td><td>${esc(u.login)}</td>
      <td><span class="selo ${u.perfil === 'admin' ? 'verde' : u.perfil === 'operador' ? 'azul' : ''}">${u.perfil}</span></td>
      <td>${u.ativo ? 'ativo' : '<span class="selo">desativado</span>'}${u.deve_trocar_senha ? ' <small class="mudo">troca de senha pendente</small>' : ''}</td>
      <td class="pequeno">${u.ultimo_acesso ? fmtDataHora(u.ultimo_acesso) : '<span class="mudo">nunca</span>'}</td></tr>`).join('');
  };
  function editar(u) {
    const novo = !u;
    u = u || { perfil: 'consulta', ativo: true };
    modal({
      titulo: novo ? 'Novo usuário' : `Editar ${u.nome}`,
      corpo: `<form class="grade" style="grid-template-columns:1fr 1fr" data-f>
        <label class="campo" style="grid-column:1/-1"><span>Nome</span><input type="text" name="nome" value="${esc(u.nome || '')}" required placeholder="Ex.: Maria Silva (Nutricionista)"></label>
        <label class="campo"><span>Login</span><input type="text" name="login" value="${esc(u.login || '')}" ${novo ? '' : 'disabled'} placeholder="ex.: nutricionista" autocapitalize="off"></label>
        <label class="campo"><span>Perfil</span><select name="perfil">${Object.keys(PERFIS).map((p) => `<option value="${p}" ${u.perfil === p ? 'selected' : ''}>${p}</option>`).join('')}</select></label>
        <label class="campo" style="grid-column:1/-1"><span>${novo ? 'Senha inicial' : 'Nova senha (deixe em branco para manter)'}</span><input type="text" name="senha" autocomplete="off" placeholder="mínimo 6 caracteres"></label>
        ${novo ? '' : `<label class="check"><input type="checkbox" name="ativo" ${u.ativo ? 'checked' : ''}> Ativo</label>`}
        </form><div class="caixa info pequeno">Ao criar ou redefinir a senha, o usuário será obrigado a trocá-la no primeiro acesso.</div>`,
      botoes: [{ texto: 'Cancelar' }, { texto: 'Salvar', classe: 'primario', acao: async (fechar, el) => {
        const f = $('[data-f]', el);
        const dados = { id: u.id, nome: f.nome.value.trim(), login: f.login.value.trim().toLowerCase(), perfil: f.perfil.value, senha: f.senha.value, ativo: novo ? true : f.ativo.checked };
        try { await api('usuario_salvar', { p_dados: dados }); aviso('Usuário salvo.', 'ok'); lista = await api('usuarios_listar'); desenhar(); fechar(); } catch (e) { aviso(e.message, 'erro'); }
        return false;
      } }]
    });
  }
  $('#u-novo').onclick = () => editar(null);
  $('#u-corpo').onclick = (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) editar(lista.find((u) => u.id === tr.dataset.id)); };
  desenhar();
}
