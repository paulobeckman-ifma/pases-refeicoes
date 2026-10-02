// Trocas: refeições em que o aluno escolheu no balcão a opção diferente do cadastro (tecla 1/2 antes do ENTER)
// e os padrões por aluno, para o coordenador decidir se muda o cadastro em definitivo.
import { $, esc, ico, aviso, fmtData, pedirTexto, baixarCsv, turmaDe, TIPO } from './util.js';
import { api } from './api.js';
import * as D from './dados.js';

const tipo = (t) => `<span class="selo ${t === 'lanche' ? 'azul' : 'verde'}">${TIPO[t] || t || '?'}</span>`;
const outra = (t) => (t === 'lanche' ? 'refeicao' : 'lanche');

export async function render(el, { cabecalho, perfil }) {
  const admin = perfil === 'admin';
  const [alunos, cfg] = await Promise.all([D.alunos(), D.config()]);
  const A = D.mapa(alunos);
  let periodo = null, regs = [], aba = 'padroes', padroes = [];

  el.innerHTML = cabecalho('Trocas',
    'No balcão o aluno pode trocar a opção do dia (1 = almoço, 2 = lanche) antes do ENTER. Aqui ficam essas trocas e quem troca com frequência.',
    `<button class="btn" id="t-csv">${ico('baixar')} Exportar CSV</button>`) + `
    <div class="barra-filtros">
      <div class="linha-flex" id="t-periodo"></div>
      <label class="campo"><span>Padrão: mínimo de trocas</span><input type="number" id="t-min" min="1" max="60" value="3" style="width:90px"></label>
      <label class="campo"><span>e % dos registros do aluno</span><input type="number" id="t-pct" min="1" max="100" value="50" style="width:90px"></label>
    </div>
    <div class="kpis" id="t-kpis"></div>
    <div class="abas"><button data-aba="padroes" class="ativo">Padrões por aluno</button><button data-aba="lista">Registros trocados</button></div>
    <div id="t-corpo"></div>`;

  async function carregar() {
    $('#t-corpo').innerHTML = '<div class="vazio">Carregando…</div>';
    regs = (await api('refeicoes_listar', { p_ini: periodo.ini, p_fim: periodo.fim })).filter((r) => !r.ex);
    calcular();
  }

  function calcular() {
    const min = Math.max(1, Number($('#t-min').value) || 3), pct = Math.min(100, Math.max(1, Number($('#t-pct').value) || 50));
    const por = new Map();
    for (const r of regs) {
      let p = por.get(r.a); if (!p) por.set(r.a, (p = { a: r.a, total: 0, trocas: 0, ultima: null, para: { refeicao: 0, lanche: 0 } }));
      p.total++;
      if (r.tr) { p.trocas++; p.para[r.tp || 'refeicao']++; if (!p.ultima || r.dt > p.ultima) p.ultima = r.dt; }
    }
    padroes = [...por.values()].filter((p) => p.trocas).map((p) => {
      const al = A.get(p.a) || {};
      const atual = al.modalidade || 'refeicao', pref = p.para[outra(atual)] >= p.para[atual] ? outra(atual) : atual;
      const perc = Math.round((100 * p.trocas) / p.total);
      return { ...p, al, atual, pref, perc, padrao: p.trocas >= min && perc >= pct && pref !== atual };
    }).sort((x, y) => (y.padrao - x.padrao) || (y.trocas - x.trocas) || (y.perc - x.perc));
    const trocadas = regs.filter((r) => r.tr);
    $('#t-kpis').innerHTML = `
      <div class="kpi"><span>Registros no período</span><b>${regs.length}</b><small>${esc(periodo.rotulo)}</small></div>
      <div class="kpi kpi-aviso"><span>Com troca</span><b>${trocadas.length}</b><small>${regs.length ? Math.round((100 * trocadas.length) / regs.length) : 0}% do total</small></div>
      <div class="kpi"><span>Almoço → lanche</span><b>${trocadas.filter((r) => r.tp === 'lanche').length}</b><small>cadastro almoço, comeu lanche</small></div>
      <div class="kpi"><span>Lanche → almoço</span><b>${trocadas.filter((r) => r.tp !== 'lanche').length}</b><small>cadastro lanche, comeu almoço</small></div>
      <div class="kpi kpi-alerta"><span>Padrão identificado</span><b>${padroes.filter((p) => p.padrao).length}</b><small>${min}+ trocas e ${pct}%+ dos registros</small></div>`;
    desenhar();
  }

  function desenhar() {
    el.querySelectorAll('.abas button').forEach((b) => b.classList.toggle('ativo', b.dataset.aba === aba));
    if (aba === 'padroes') {
      $('#t-corpo').innerHTML = `<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Aluno</th><th>Turma / curso</th><th>Cadastro</th><th>Trocas</th><th>Na maioria come</th><th>Última troca</th><th></th></tr></thead><tbody>
        ${padroes.map((p) => `<tr${p.padrao ? ' style="background:var(--ambar-claro)"' : ''}>
          <td>${esc(p.al.nome || '?')}<br><small class="mudo">${esc(p.al.matricula || '')}</small>${p.padrao ? ' <span class="selo ambar">padrão</span>' : ''}</td>
          <td class="pequeno"><b>${esc(turmaDe(p.al.matricula))}</b><br>${esc(p.al.curso || '')}</td>
          <td>${tipo(p.atual)}</td>
          <td class="num"><b>${p.trocas}</b> de ${p.total} <span class="mudo">(${p.perc}%)</span></td>
          <td>${tipo(p.pref)}</td>
          <td class="num">${p.ultima ? fmtData(p.ultima) : ''}</td>
          <td class="nao-imprimir">${admin && p.pref !== p.atual ? `<button class="btn pequeno ${p.padrao ? 'primario' : ''}" data-mudar="${p.a}" data-para="${p.pref}">${ico('atualizar')} Mudar cadastro para ${TIPO[p.pref]}</button>` : ''}</td></tr>`).join('')
        || '<tr><td colspan="7" class="vazio">Nenhuma troca no período.</td></tr>'}</tbody></table></div>
        <p class="pequeno mudo">"Padrão" = aluno que trocou pelo menos o mínimo de vezes e em pelo menos a porcentagem indicada dos registros dele no período. ${admin ? 'Mudar o cadastro vale a partir do próximo registro; as trocas anteriores continuam no histórico.' : 'Só o administrador pode mudar o cadastro.'}</p>`;
    } else {
      const lista = regs.filter((r) => r.tr).reverse();
      $('#t-corpo').innerHTML = `<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Data</th><th>Hora</th><th>Aluno</th><th>Turma / curso</th><th>Cadastro</th><th>Comeu</th><th>Atendente</th></tr></thead><tbody>
        ${lista.map((r) => { const a = A.get(r.a) || {}; return `<tr><td class="num">${fmtData(r.dt)}</td><td class="num">${r.h.slice(0, 5)}</td>
          <td>${esc(a.nome || '?')}<br><small class="mudo">${esc(a.matricula || '')}</small></td>
          <td class="pequeno"><b>${esc(turmaDe(a.matricula))}</b><br>${esc(a.curso || '')}</td>
          <td>${tipo(r.mc)}</td><td>${tipo(r.tp)}</td><td class="pequeno">${esc(r.op || '')}</td></tr>`; }).join('')
        || '<tr><td colspan="7" class="vazio">Nenhum registro trocado no período.</td></tr>'}</tbody></table></div>`;
    }
  }

  el.querySelector('.abas').onclick = (e) => { const b = e.target.closest('[data-aba]'); if (b) { aba = b.dataset.aba; desenhar(); } };
  $('#t-min').onchange = calcular; $('#t-pct').onchange = calcular;
  $('#t-corpo').onclick = async (e) => {
    const b = e.target.closest('[data-mudar]'); if (!b) return;
    const p = padroes.find((x) => x.a === b.dataset.mudar), para = b.dataset.para;
    const motivo = await pedirTexto('Mudar modalidade do cadastro', `${p.al.nome}: ${TIPO[p.atual]} → ${TIPO[para]}. Motivo (fica na auditoria)`,
      { minimo: 3, valor: `Trocou ${p.trocas} de ${p.total} registros (${p.perc}%) em ${periodo.rotulo}` });
    if (!motivo) return;
    try {
      await api('aluno_modalidade_definir', { p_aluno_id: p.a, p_modalidade: para, p_motivo: motivo });
      aviso(`${p.al.nome} agora é beneficiário de ${TIPO[para]}.`, 'ok');
      p.al.modalidade = para; await D.alunos(true).then((l) => { const n = D.mapa(l); n.forEach((v, k) => A.set(k, v)); });
      calcular();
    } catch (err) { aviso(err.message, 'erro'); }
  };
  $('#t-csv').onclick = () => {
    if (aba === 'padroes') baixarCsv(`pases_trocas_padroes_${periodo.ini}_a_${periodo.fim}`,
      ['aluno', 'matricula', 'turma', 'curso', 'cadastro', 'trocas', 'refeicoes', 'percentual', 'na_maioria_come', 'padrao', 'ultima_troca'],
      padroes.map((p) => [p.al.nome, p.al.matricula, turmaDe(p.al.matricula), p.al.curso, TIPO[p.atual], p.trocas, p.total, p.perc, TIPO[p.pref], p.padrao ? 'sim' : '', p.ultima ? fmtData(p.ultima) : '']));
    else baixarCsv(`pases_trocas_${periodo.ini}_a_${periodo.fim}`, ['data', 'hora', 'aluno', 'matricula', 'turma', 'curso', 'cadastro', 'comeu', 'atendente'],
      regs.filter((r) => r.tr).map((r) => { const a = A.get(r.a) || {}; return [fmtData(r.dt), r.h, a.nome, a.matricula, turmaDe(a.matricula), a.curso, TIPO[r.mc], TIPO[r.tp], r.op]; }));
  };
  D.seletorPeriodo($('#t-periodo'), cfg, (p) => { periodo = p; carregar(); }, 'mes');
}

// o menu não mostra mais contador (não há pedidos para decidir)
export function atualizarContador() {}
