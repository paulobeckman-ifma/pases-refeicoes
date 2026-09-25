// Validação das fotos de referência capturadas no balcão (quando o aluno se identificou pelo CPF)
import { $, $$, esc, ico, aviso, confirmar, fmtDataHora } from './util.js';
import { api, fotos } from './api.js';
import * as D from './dados.js';

export async function render(el, { cabecalho }) {
  let lista = await api('faces_listar', { p_pendentes: true });

  el.innerHTML = cabecalho('Validar rostos', 'Quando o rosto não é reconhecido, o aluno digita o CPF e a foto do balcão vira referência. Confira se é a mesma pessoa da foto do SUAP.',
    `<button class="btn" id="f-todos">${ico('check')} Aprovar todos os exibidos</button>`) + `
    <div class="caixa info" style="margin-bottom:14px">As referências já funcionam enquanto aguardam validação. Rejeitar apaga a referência e impede que outra pessoa seja reconhecida com o nome deste aluno.</div>
    <div id="f-lista" class="cards-faces"></div>`;

  async function desenhar() {
    const box = $('#f-lista');
    if (!lista.length) { box.innerHTML = '<div class="vazio" style="grid-column:1/-1">Nenhuma foto aguardando validação.</div>'; return; }
    box.innerHTML = lista.map((f) => `<div class="cartao" data-id="${f.id}" style="margin:0">
        <div class="fotos-par"><div class="foto-box" data-img="${esc(f.foto_suap_id || '')}">${f.foto_suap_id ? 'Carregando…' : 'Sem foto do SUAP'}<span class="rotulo">SUAP</span></div>
          <div class="foto-box" data-img="${esc(f.foto_id || '')}">${f.foto_id ? 'Carregando…' : 'Foto não enviada'}<span class="rotulo">Balcão</span></div></div>
        <div style="margin:10px 0"><b>${esc(f.nome)}</b><br><small class="mudo">${esc(f.matricula || '')} · ${esc(f.curso || '')} · capturada em ${fmtDataHora(f.criado_em)}</small></div>
        <div class="linha-flex"><button class="btn primario pequeno" data-ok>${ico('check')} Mesma pessoa</button><button class="btn perigo pequeno" data-nao>${ico('x')} Não é a mesma</button></div></div>`).join('');
    const ids = lista.flatMap((f) => [f.foto_suap_id, f.foto_id]).filter(Boolean);
    const urls = await fotos(ids).catch(() => ({}));
    $$('[data-img]', box).forEach((d) => { const id = d.dataset.img; if (id) d.innerHTML = (urls[id] ? `<img src="${urls[id]}" alt="">` : 'Indisponível') + d.querySelector('.rotulo').outerHTML; });
  }
  async function decidir(id, aprovar) {
    try { await api('face_validar', { p_face_id: id, p_aprovar: aprovar }); lista = lista.filter((f) => f.id !== id); $(`[data-id="${id}"]`)?.remove(); D.invalidarAlunos();
      if (!lista.length) desenhar(); } catch (e) { aviso(e.message, 'erro'); }
  }
  $('#f-lista').onclick = (e) => {
    const c = e.target.closest('[data-id]'); if (!c) return;
    if (e.target.closest('[data-ok]')) decidir(c.dataset.id, true);
    if (e.target.closest('[data-nao]')) decidir(c.dataset.id, false);
  };
  $('#f-todos').onclick = async () => {
    if (!lista.length || !(await confirmar(`Aprovar as ${lista.length} referências exibidas?`))) return;
    for (const f of [...lista]) await decidir(f.id, true);
    aviso('Referências aprovadas.', 'ok');
  };
  desenhar();
}
