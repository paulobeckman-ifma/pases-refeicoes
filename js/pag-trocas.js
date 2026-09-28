// Trocas de modalidade: pedidos feitos no balcão (refeição <-> lanche) aguardando o coordenador
import { $, esc, ico, aviso, fmtDataHora, pedirTexto, TIPO } from './util.js';
import { api } from './api.js';

const SELO = { pendente: 'ambar', aprovada: 'verde', recusada: 'vermelho-suave', cancelada: '' };
const ROTULO = { pendente: 'Aguardando', aprovada: 'Aprovada', recusada: 'Recusada', cancelada: 'Cancelada' };
const tipo = (t) => `<span class="selo ${t === 'lanche' ? 'azul' : 'verde'}">${TIPO[t] || t}</span>`;

export async function render(el, { cabecalho, perfil }) {
  const admin = perfil === 'admin';
  let lista = [];
  el.innerHTML = cabecalho('Trocas de modalidade',
    'O aluno pede a troca ao atendente do balcão. A modalidade só muda depois que o coordenador aprova.') + `
    <div class="barra-filtros"><label class="campo"><span>Mostrar</span><select id="t-status">
      <option value="pendente">Aguardando decisão</option><option value="">Todos os pedidos</option>
      <option value="aprovada">Aprovados</option><option value="recusada">Recusados</option></select></label></div>
    <div class="tabela-wrap"><table class="tabela"><thead><tr><th>Pedido em</th><th>Aluno</th><th>Troca</th><th>Motivo</th><th>Situação</th><th></th></tr></thead>
    <tbody id="t-corpo"><tr><td colspan="6" class="vazio">Carregando…</td></tr></tbody></table></div>`;

  async function carregar() {
    lista = await api('trocas_listar', { p_status: $('#t-status').value || null });
    $('#t-corpo').innerHTML = lista.map((t) => `<tr>
        <td class="pequeno">${fmtDataHora(t.solicitado_em)}<br><span class="mudo">${esc(t.solicitante || '')}</span></td>
        <td>${esc(t.nome)}<br><small class="mudo">${esc(t.matricula || '')} · ${esc(t.curso || '')}</small></td>
        <td style="white-space:nowrap">${tipo(t.de)} <span class="troca-seta">→</span> ${tipo(t.para)}</td>
        <td class="pequeno">${esc(t.motivo)}</td>
        <td><span class="selo ${SELO[t.status] || ''}">${ROTULO[t.status] || t.status}</span>${t.decidido_em ? `<br><small class="mudo">${fmtDataHora(t.decidido_em)} · ${esc(t.decisor || '')}</small>` : ''}${t.resposta ? `<br><small>${esc(t.resposta)}</small>` : ''}</td>
        <td class="nao-imprimir" style="white-space:nowrap">${admin && t.status === 'pendente' ? `<button class="btn pequeno primario" data-ok="${t.id}">${ico('check')} Aprovar</button>
          <button class="btn pequeno perigo" data-nao="${t.id}">${ico('x')} Recusar</button>` : ''}</td></tr>`).join('')
      || '<tr><td colspan="6" class="vazio">Nenhum pedido.</td></tr>';
  }

  $('#t-corpo').onclick = async (e) => {
    const ok = e.target.closest('[data-ok]'), nao = e.target.closest('[data-nao]');
    if (!ok && !nao) return;
    const t = lista.find((x) => x.id === (ok || nao).dataset[ok ? 'ok' : 'nao']);
    let resposta = null;
    if (nao) {
      resposta = await pedirTexto('Recusar troca', `Motivo da recusa para ${t.nome}`, { sugestoes: ['Horário de aula não justifica a troca', 'Sem vaga na modalidade pedida'] });
      if (!resposta) return;
    }
    try {
      await api('troca_decidir', { p_id: t.id, p_aprovar: !!ok, p_resposta: resposta });
      aviso(ok ? `${t.nome} passa a ser beneficiário de ${TIPO[t.para]}.` : 'Pedido recusado.', 'ok');
      await carregar(); atualizarContador();
    } catch (err) { aviso(err.message, 'erro'); }
  };
  $('#t-status').onchange = carregar;
  await carregar();
}

export function atualizarContador() {
  api('trocas_listar', { p_status: 'pendente' }).then((l) => {
    const a = document.querySelector('[data-rota=trocas]'); if (!a) return;
    a.querySelectorAll('.contagem').forEach((x) => x.remove());
    if (l.length) a.insertAdjacentHTML('beforeend', `<span class="contagem">${l.length}</span>`);
  }).catch(() => {});
}
