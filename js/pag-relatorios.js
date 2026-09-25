// Relatórios: resumo, por aluno (frequência e ausências), por curso, por dia e por horário
import { $, $$, esc, ico, baixarCsv, fmtData, fmtDataCurta, DIAS_SEMANA, DIAS_CURTO, diaSemanaNum, addDias, fmtPct, pct, fmtNum, normalizar, debounce, modal, turmaDe, fmtCpf, TIPO } from './util.js';
import { api } from './api.js';
import * as D from './dados.js';
import { barras } from './graficos.js';

const METODO = { facial: 'Facial', cpf: 'CPF', manual: 'Manual' };

export async function render(el, { cabecalho, perfil }) {
  const [alunos, cfg] = await Promise.all([D.alunos(), D.config()]);
  const A = D.mapa(alunos);
  const cursos = [...new Set(alunos.map((a) => a.curso).filter(Boolean))].sort();
  const niveis = [...new Set(alunos.map((a) => a.nivel).filter(Boolean))].sort();
  const turmas = [...new Set(alunos.map((a) => turmaDe(a.matricula)).filter(Boolean))].sort();
  let periodo = null, bruto = [], R = [], aba = sessionStorage.getItem('pases_rel_aba') || 'resumo';
  let ordem = { chave: 'total', desc: true };

  el.innerHTML = cabecalho('Relatórios', 'Resumos por período, aluno, curso, dia e horário. Exporte em CSV (abre no Excel) ou imprima.',
    `<label class="check" title="Acrescenta à impressão a lista de todos os registros do período filtrado"><input type="checkbox" id="rel-det"> Incluir registros detalhados na impressão</label><button class="btn" id="rel-imp">${ico('imprimir')} Imprimir</button><button class="btn" id="rel-csv">${ico('baixar')} Exportar CSV desta aba</button>`) + `
    <div class="barra-filtros">
      <div class="linha-flex" id="rel-periodo"></div>
      <label class="campo"><span>Tipo</span><select id="rel-tipo"><option value="">Refeição e lanche</option><option value="refeicao">Só refeição</option><option value="lanche">Só lanche</option></select></label>
      <label class="campo"><span>Turma</span><select id="rel-turma"><option value="">Todas</option>${turmas.map((t) => `<option>${esc(t)}</option>`).join('')}</select></label>
      <label class="campo"><span>Curso</span><select id="rel-curso"><option value="">Todos</option>${cursos.map((c) => `<option>${esc(c)}</option>`).join('')}</select></label>
      <label class="campo"><span>Nível</span><select id="rel-nivel"><option value="">Todos</option>${niveis.map((c) => `<option>${esc(c)}</option>`).join('')}</select></label>
      <label class="campo"><span>Método</span><select id="rel-metodo"><option value="">Todos</option><option value="facial">Facial</option><option value="cpf">CPF</option><option value="manual">Manual</option></select></label>
      <label class="campo"><span>Dias da semana</span><select id="rel-dias"><option value="">Todos</option><option value="uteis">Só dias úteis (seg a sex)</option></select></label>
    </div>
    <div class="so-impressao"><h2 id="rel-titulo-imp"></h2></div>
    <div class="abas" id="rel-abas">
      ${[['resumo', 'Resumo'], ['aluno', 'Por aluno'], ['turma', 'Por turma'], ['curso', 'Por curso'], ['dia', 'Por dia'], ['horario', 'Por horário'], ['ocorrencias', 'Ocorrências']]
        .map(([k, t]) => `<button data-aba="${k}" class="${k === aba ? 'ativo' : ''}">${t}</button>`).join('')}
    </div>
    <div id="rel-corpo"><div class="vazio">Carregando…</div></div>
    <div id="rel-detalhe" class="so-impressao"></div>`;

  async function carregar() {
    $('#rel-corpo').innerHTML = '<div class="vazio">Carregando…</div>';
    bruto = await api('refeicoes_listar', { p_ini: periodo.ini, p_fim: periodo.fim });
    aplicarFiltros();
  }
  function alunosFiltrados() {
    const c = $('#rel-curso').value, n = $('#rel-nivel').value, t = $('#rel-turma').value;
    return alunos.filter((a) => (!c || a.curso === c) && (!n || a.nivel === n) && (!t || turmaDe(a.matricula) === t));
  }
  function aplicarFiltros() {
    const ids = new Set(alunosFiltrados().map((a) => a.id)), met = $('#rel-metodo').value, uteis = $('#rel-dias').value === 'uteis', tipo = $('#rel-tipo').value;
    R = bruto.filter((r) => ids.has(r.a) && (!met || r.m === met) && (!uteis || diaSemanaNum(r.dt) <= 5) && (!tipo || (r.tp || 'refeicao') === tipo));
    const filtros = [tipo && TIPO[tipo], $('#rel-turma').value && `turma ${$('#rel-turma').value}`, $('#rel-curso').value, $('#rel-nivel').value].filter(Boolean).join(' · ');
    $('#rel-titulo-imp').textContent = `PASES Refeições · ${periodo.rotulo} (${fmtData(periodo.ini)} a ${fmtData(periodo.fim)})${filtros ? ' · ' + filtros : ''}`;
    desenhar();
  }
  const diasFuncionamento = () => [...new Set(R.map((r) => r.dt))].sort();

  // ---------------------------------------------------------------- tabelas por aba (reaproveitadas no CSV)
  function tabelaAluno() {
    const dias = diasFuncionamento().length;
    const base = alunosFiltrados().filter((a) => a.ativo || R.some((r) => r.a === a.id));
    return base.map((a) => {
      const rs = R.filter((r) => r.a === a.id);
      return { id: a.id, nome: a.nome, matricula: a.matricula || '', turma: turmaDe(a.matricula), curso: a.curso || '', ativo: a.ativo, total: rs.length,
        refeicao: rs.filter((r) => r.tp !== 'lanche').length, lanche: rs.filter((r) => r.tp === 'lanche').length,
        freq: dias ? pct(rs.length, dias) : 0, fora: rs.filter((r) => !r.dh).length, semfoto: rs.filter((r) => r.fs === 'sem_foto').length,
        facial: rs.filter((r) => r.m === 'facial').length, ultima: rs.length ? rs[rs.length - 1].dt : '' };
    });
  }
  function tabelaGrupo(chave, vazio) {
    const porCurso = new Map();
    alunosFiltrados().forEach((a) => { const k = chave(a) || vazio; if (!porCurso.has(k)) porCurso.set(k, { curso: k, ativos: 0, atendidos: new Set(), total: 0, refeicao: 0, lanche: 0, fora: 0, semfoto: 0 }); if (a.ativo) porCurso.get(k).ativos++; });
    R.forEach((r) => { const a = A.get(r.a); const k = (a && chave(a)) || vazio; const c = porCurso.get(k); if (!c) return; c.total++; c[r.tp === 'lanche' ? 'lanche' : 'refeicao']++; c.atendidos.add(r.a); if (!r.dh) c.fora++; if (r.fs === 'sem_foto') c.semfoto++; });
    return [...porCurso.values()].map((c) => ({ ...c, atendidos: c.atendidos.size, media: c.atendidos.size ? (c.total / c.atendidos.size) : 0 })).sort((a, b) => b.total - a.total);
  }
  const tabelaCurso = () => tabelaGrupo((a) => a.curso, '(sem curso)');
  const tabelaTurma = () => tabelaGrupo((a) => turmaDe(a.matricula), '(sem turma)').sort((a, b) => a.curso.localeCompare(b.curso));
  function tabelaDia() {
    const out = []; let d = periodo.ini;
    while (d <= periodo.fim) {
      const rs = R.filter((r) => r.dt === d);
      if (rs.length || diaSemanaNum(d) <= 5) out.push({ data: d, dia: DIAS_SEMANA[diaSemanaNum(d)], total: rs.length, refeicao: rs.filter((r) => r.tp !== 'lanche').length, lanche: rs.filter((r) => r.tp === 'lanche').length, fora: rs.filter((r) => !r.dh).length,
        semfoto: rs.filter((r) => r.fs === 'sem_foto').length, facial: rs.filter((r) => r.m === 'facial').length, cpf: rs.filter((r) => r.m === 'cpf').length,
        manual: rs.filter((r) => r.m === 'manual').length, primeiro: rs[0]?.h.slice(0, 5) || '', ultimo: rs[rs.length - 1]?.h.slice(0, 5) || '' });
      d = addDias(d, 1);
    }
    return out;
  }
  function tabelaHorario() {
    const hm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    const mins = R.map((r) => { const [h, m] = r.h.split(':').map(Number); return h * 60 + m; });
    const ini = Math.min(10 * 60 + 30, ...mins.map((m) => Math.floor(m / 15) * 15)), fim = Math.max(14 * 60 + 15, ...mins);
    const out = [];
    for (let m = ini; m <= fim; m += 15) {
      const n = mins.filter((x) => x >= m && x < m + 15).length;
      out.push({ faixa: `${hm(m)}–${hm(m + 15)}`, inicio: hm(m), total: n, fora: hm(m + 14) < cfg.horario_inicio || hm(m) > cfg.horario_fim });
    }
    return out;
  }
  function ocorrencias() {
    return R.filter((r) => r.fs === 'sem_foto' || !r.dh || r.m === 'manual' || r.x || r.obs).reverse();
  }

  // ---------------------------------------------------------------- desenho
  function desenhar() {
    $$('#rel-abas button').forEach((b) => b.classList.toggle('ativo', b.dataset.aba === aba));
    const c = $('#rel-corpo');
    if (aba === 'resumo') c.innerHTML = resumo();
    else if (aba === 'aluno') { c.innerHTML = `<div class="barra-filtros"><label class="campo" style="min-width:240px"><span>Buscar</span><input type="search" id="rel-busca" placeholder="Nome ou matrícula"></label>
        <label class="campo"><span>Mostrar</span><select id="rel-mostrar"><option value="">Todos os ativos e atendidos</option><option value="zero">Só quem NÃO compareceu</option><option value="baixa">Frequência abaixo de 50%</option><option value="alta">Frequência de 80% ou mais</option></select></label></div><div id="rel-tab-aluno"></div>`;
      $('#rel-busca').oninput = debounce(desenharAlunos, 200); $('#rel-mostrar').onchange = desenharAlunos; desenharAlunos(); }
    else if (aba === 'curso' || aba === 'turma') c.innerHTML = tabelaHtml([aba === 'curso' ? 'Curso' : 'Turma', 'Ativos', 'Atendidos', 'Registros', 'Refeição', 'Lanche', 'Média por aluno atendido', 'Refeição fora do horário', 'Sem foto'],
      (aba === 'curso' ? tabelaCurso() : tabelaTurma()).map((x) => [esc(x.curso), x.ativos, `${x.atendidos} <small class="mudo">(${fmtPct(x.atendidos, x.ativos)})</small>`, `<b>${x.total}</b>`, x.refeicao, x.lanche, x.media.toFixed(1).replace('.', ','), x.fora, x.semfoto]), [1, 2, 3, 4, 5, 6, 7, 8]);
    else if (aba === 'dia') {
      const t = tabelaDia();
      c.innerHTML = `<div class="cartao" style="margin-bottom:16px"><h2>Atendimentos por dia</h2>${barras(t.map((x) => ({ r: fmtDataCurta(x.data), v: x.total, dica: `${DIAS_CURTO[diaSemanaNum(x.data)]} ${fmtData(x.data)}: ${x.total}` })), { titulo: 'Atendimentos por dia' })}</div>` +
        tabelaHtml(['Data', 'Dia', 'Registros', 'Refeição', 'Lanche', 'Facial', 'CPF', 'Manual', 'Fora do horário', 'Sem foto', 'Primeiro', 'Último'],
          t.map((x) => [fmtData(x.data), x.dia, `<b>${x.total}</b>`, x.refeicao, x.lanche, x.facial, x.cpf, x.manual, x.fora, x.semfoto ? `<span class="selo vermelho">${x.semfoto}</span>` : 0, x.primeiro, x.ultimo]), [2, 3, 4, 5, 6, 7, 8, 9]);
    } else if (aba === 'horario') {
      const t = tabelaHorario();
      c.innerHTML = `<div class="cartao" style="margin-bottom:16px"><h2>Distribuição por horário (faixas de 15 minutos)</h2>${barras(t.map((x) => ({ r: x.inicio, v: x.total, classe: x.fora ? 'fora' : '', dica: `${x.faixa}: ${x.total}` })), { titulo: 'Por horário' })}
        <div class="legenda"><span><i style="background:var(--verde)"></i>dentro do horário (${esc(cfg.horario_inicio)}–${esc(cfg.horario_fim)})</span><span><i style="background:#e0a33a"></i>fora do horário</span></div></div>` +
        tabelaHtml(['Faixa', 'Refeições', '% do período', 'Situação'], t.filter((x) => x.total).map((x) => [x.faixa, x.total, fmtPct(x.total, R.length), x.fora ? '<span class="selo ambar">fora do horário</span>' : '<span class="selo verde">dentro</span>']), [1, 2]);
    } else if (aba === 'ocorrencias') {
      const t = ocorrencias();
      c.innerHTML = `<p class="mudo" style="margin-top:0">Registros sem foto, fora do horário, manuais, extras ou com observação.</p>` +
        tabelaHtml(['Data', 'Hora', 'Aluno', 'Ocorrência', 'Detalhe'], t.map((r) => { const a = A.get(r.a) || {};
          const oc = [r.fs === 'sem_foto' ? '<span class="selo vermelho">sem foto</span>' : '', !r.dh ? '<span class="selo ambar">fora do horário</span>' : '', r.m === 'manual' ? '<span class="selo azul">manual</span>' : '', r.x ? '<span class="selo azul">extra</span>' : '', r.obs ? '<span class="selo ambar">observação</span>' : ''].join(' ');
          return [fmtData(r.dt), r.h.slice(0, 5), `${esc(a.nome || '')}<br><small class="mudo">${esc(a.matricula || '')}</small>`, oc, esc([r.j, r.obs].filter(Boolean).join(' · '))]; }), [], (i) => (t[i].fs === 'sem_foto' ? 'sem-foto' : ''));
    }
  }

  function resumo() {
    const dias = diasFuncionamento(), ativosN = alunosFiltrados().filter((a) => a.ativo).length;
    const atendidos = new Set(R.map((r) => r.a)).size, fora = R.filter((r) => !r.dh).length, sf = R.filter((r) => r.fs === 'sem_foto').length;
    const fac = R.filter((r) => r.m === 'facial').length, man = R.filter((r) => r.m === 'manual').length;
    const porSemana = [1, 2, 3, 4, 5, 6, 7].map((w) => { const ds = dias.filter((d) => diaSemanaNum(d) === w).length; const n = R.filter((r) => diaSemanaNum(r.dt) === w).length;
      return { r: DIAS_CURTO[w], v: ds ? Math.round(n / ds) : 0, dica: `${DIAS_SEMANA[w]}: média de ${ds ? (n / ds).toFixed(1) : 0} por dia (${ds} dia(s))` }; }).filter((x, i) => i < 5 || x.v);
    const pd = tabelaDia();
    return `<div class="kpis">
        <div class="kpi"><span>Registros</span><b>${fmtNum(R.length)}</b><small>${R.filter((r) => r.tp !== 'lanche').length} refeição · ${R.filter((r) => r.tp === 'lanche').length} lanche · ${dias.length} dia(s)</small></div>
        <div class="kpi"><span>Média por dia</span><b>${dias.length ? (R.length / dias.length).toFixed(1).replace('.', ',') : 0}</b><small>nos dias com atendimento</small></div>
        <div class="kpi"><span>Alunos atendidos</span><b>${atendidos}</b><small>${fmtPct(atendidos, ativosN)} dos ${ativosN} ativos</small></div>
        <div class="kpi ${fora ? 'kpi-aviso' : ''}"><span>Refeição fora do horário</span><b>${fora}</b><small>${fmtPct(fora, R.length)} · janela ${esc(cfg.horario_inicio)}–${esc(cfg.horario_fim)}</small></div>
        <div class="kpi ${sf ? 'kpi-alerta' : ''}"><span>Sem foto</span><b>${sf}</b><small>${fmtPct(sf, R.length)} dos registros</small></div>
        <div class="kpi"><span>Reconhecimento facial</span><b>${fmtPct(fac, R.length)}</b><small>${fac} facial · ${R.length - fac - man} CPF · ${man} manual</small></div>
      </div>
      <div class="duas-col">
        <div class="cartao"><h2>Atendimentos por dia</h2>${barras(pd.map((x) => ({ r: fmtDataCurta(x.data), v: x.total, dica: `${DIAS_CURTO[diaSemanaNum(x.data)]} ${fmtData(x.data)}: ${x.total}` })), { titulo: 'Atendimentos por dia' })}</div>
        <div class="cartao"><h2>Média por dia da semana</h2>${barras(porSemana, { titulo: 'Média por dia da semana' })}</div>
      </div>
      <div class="cartao"><h2>Distribuição por horário</h2>${barras(tabelaHorario().map((x) => ({ r: x.inicio, v: x.total, classe: x.fora ? 'fora' : '', dica: `${x.faixa}: ${x.total}` })), { titulo: 'Por horário', altura: 180 })}
        <div class="legenda"><span><i style="background:var(--verde)"></i>dentro do horário</span><span><i style="background:#e0a33a"></i>fora do horário</span></div></div>`;
  }

  function desenharAlunos() {
    const q = normalizar($('#rel-busca')?.value || ''), mostrar = $('#rel-mostrar')?.value || '';
    let t = tabelaAluno().filter((x) => !q || normalizar(`${x.nome} ${x.matricula}`).includes(q));
    if (mostrar === 'zero') t = t.filter((x) => !x.total && x.ativo);
    if (mostrar === 'baixa') t = t.filter((x) => x.freq < 50 && x.ativo);
    if (mostrar === 'alta') t = t.filter((x) => x.freq >= 80);
    const k = ordem.chave; t.sort((a, b) => (typeof a[k] === 'string' ? a[k].localeCompare(b[k]) : a[k] - b[k]) * (ordem.desc ? -1 : 1));
    const dias = diasFuncionamento().length;
    $('#rel-tab-aluno').innerHTML = `<p class="mudo pequeno" style="margin-top:0">${t.length} aluno(s). Frequência = refeições ÷ ${dias} dia(s) com atendimento no período.</p>` +
      tabelaHtml([['nome', 'Aluno'], ['turma', 'Turma'], ['total', 'Registros'], ['refeicao', 'Refeição'], ['lanche', 'Lanche'], ['freq', 'Frequência'], ['fora', 'Fora do horário'], ['semfoto', 'Sem foto'], ['facial', 'Facial'], ['ultima', 'Última']],
        t.map((x) => [`${esc(x.nome)}${x.ativo ? '' : ' <span class="selo">inativo</span>'}<br><small class="mudo">${esc(x.matricula)}</small>`, `<b class="pequeno">${esc(x.turma)}</b><br><span class="pequeno mudo">${esc(x.curso)}</span>`,
          `<b>${x.total}</b>`, x.refeicao, x.lanche, `<div style="display:flex;align-items:center;gap:8px;justify-content:flex-end"><span style="display:inline-block;width:60px;height:6px;border-radius:3px;background:#eef1f0;overflow:hidden"><span style="display:block;height:100%;width:${Math.min(100, x.freq)}%;background:${x.freq < 50 ? '#e0a33a' : 'var(--verde)'}"></span></span>${String(x.freq).replace('.', ',')}%</div>`,
          x.fora, x.semfoto ? `<span class="selo vermelho">${x.semfoto}</span>` : 0, x.facial, x.ultima ? fmtData(x.ultima) : '<span class="mudo">nunca</span>']), [2, 3, 4, 5, 6, 7, 8], null, t.map((x) => x.id));
    $$('#rel-tab-aluno th[data-ord]').forEach((th) => (th.onclick = () => { ordem = { chave: th.dataset.ord, desc: ordem.chave === th.dataset.ord ? !ordem.desc : true }; desenharAlunos(); }));
    $$('#rel-tab-aluno tr[data-id]').forEach((tr) => (tr.onclick = () => historico(tr.dataset.id)));
  }

  function historico(id) {
    const a = A.get(id), rs = R.filter((r) => r.a === id);
    modal({ titulo: `${a.nome} · ${periodo.rotulo}`, largo: true, corpo: `<p class="mudo" style="margin:0">${esc(a.matricula || '')} · ${esc(a.curso || '')} · ${rs.length} refeição(ões) no período</p>` +
      tabelaHtml(['Data', 'Dia', 'Hora', 'Tipo', 'Método', 'Foto', 'Horário'], rs.slice().reverse().map((r) => [fmtData(r.dt), DIAS_SEMANA[diaSemanaNum(r.dt)], r.h.slice(0, 5), TIPO[r.tp || 'refeicao'], METODO[r.m],
        r.fs === 'sem_foto' ? `<span class="selo vermelho">sem foto</span> <small>${esc(r.j || '')}</small>` : 'ok', r.tp === 'lanche' ? 'livre' : r.dh ? 'dentro' : '<span class="selo ambar">fora</span>']), []) });
  }

  function tabelaHtml(cols, linhas, numericas = [], classeLinha = null, ids = null) {
    if (!linhas.length) return '<div class="vazio">Sem dados para este filtro.</div>';
    const th = cols.map((c, i) => Array.isArray(c) ? `<th data-ord="${c[0]}" class="${numericas.includes(i) ? 'num' : ''}">${c[1]}${ordem.chave === c[0] ? (ordem.desc ? ' ▼' : ' ▲') : ''}</th>` : `<th class="${numericas.includes(i) ? 'num' : ''}">${c}</th>`).join('');
    return `<div class="tabela-wrap"><table class="tabela"><thead><tr>${th}</tr></thead><tbody>${linhas.map((l, i) =>
      `<tr class="${classeLinha ? classeLinha(i) : ''} ${ids ? 'clicavel' : ''}" ${ids ? `data-id="${ids[i]}"` : ''}>${l.map((v, j) => `<td class="${numericas.includes(j) ? 'num' : ''}">${v}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }

  function exportar() {
    const nome = `pases_${aba}_${periodo.ini}_a_${periodo.fim}`;
    if (aba === 'aluno' || aba === 'resumo') baixarCsv(nome, ['aluno', 'matricula', 'turma', 'curso', 'ativo', 'registros', 'refeicao', 'lanche', 'frequencia_%', 'fora_do_horario', 'sem_foto', 'facial', 'ultima'],
      tabelaAluno().sort((a, b) => a.nome.localeCompare(b.nome)).map((x) => [x.nome, x.matricula, x.turma, x.curso, x.ativo ? 'sim' : 'não', x.total, x.refeicao, x.lanche, String(x.freq).replace('.', ','), x.fora, x.semfoto, x.facial, fmtData(x.ultima)]));
    else if (aba === 'curso' || aba === 'turma') baixarCsv(nome, [aba, 'ativos', 'atendidos', 'registros', 'refeicao', 'lanche', 'media_por_atendido', 'refeicao_fora_do_horario', 'sem_foto'],
      (aba === 'curso' ? tabelaCurso() : tabelaTurma()).map((x) => [x.curso, x.ativos, x.atendidos, x.total, x.refeicao, x.lanche, x.media.toFixed(2).replace('.', ','), x.fora, x.semfoto]));
    else if (aba === 'dia') baixarCsv(nome, ['data', 'dia', 'registros', 'refeicao', 'lanche', 'facial', 'cpf', 'manual', 'fora_do_horario', 'sem_foto', 'primeiro', 'ultimo'],
      tabelaDia().map((x) => [fmtData(x.data), x.dia, x.total, x.refeicao, x.lanche, x.facial, x.cpf, x.manual, x.fora, x.semfoto, x.primeiro, x.ultimo]));
    else if (aba === 'horario') baixarCsv(nome, ['faixa', 'refeicoes', 'fora_do_horario'], tabelaHorario().map((x) => [x.faixa, x.total, x.fora ? 'sim' : 'não']));
    else baixarCsv(nome, ['data', 'hora', 'aluno', 'matricula', 'sem_foto', 'justificativa', 'fora_do_horario', 'manual', 'extra', 'observacao'],
      ocorrencias().map((r) => { const a = A.get(r.a) || {}; return [fmtData(r.dt), r.h, a.nome, a.matricula, r.fs === 'sem_foto' ? 'sim' : '', r.j, r.dh ? '' : 'sim', r.m === 'manual' ? 'sim' : '', r.x ? 'sim' : '', r.obs]; }));
  }

  D.seletorPeriodo($('#rel-periodo'), cfg, (p) => { periodo = p; carregar(); }, 'mes');
  ['#rel-curso', '#rel-nivel', '#rel-metodo', '#rel-dias', '#rel-tipo', '#rel-turma'].forEach((s) => ($(s).onchange = aplicarFiltros));
  $('#rel-abas').onclick = (e) => { const b = e.target.closest('[data-aba]'); if (b) { aba = b.dataset.aba; sessionStorage.setItem('pases_rel_aba', aba); desenhar(); } };
  $('#rel-csv').onclick = exportar;
  // Lista detalhada (só na impressão, se marcada): data, hora, tipo, aluno, matrícula, CPF, turma
  function detalhada() {
    const box = $('#rel-detalhe');
    if (!$('#rel-det').checked) { box.innerHTML = ''; return; }
    const linhas = R.slice().sort((a, b) => (a.dt + a.h).localeCompare(b.dt + b.h));
    box.innerHTML = `<h2 style="margin-top:18px">Registros detalhados (${linhas.length})</h2>` +
      tabelaHtml(['Data', 'Hora', 'Tipo', 'Aluno', 'Matrícula', 'CPF', 'Turma', 'Horário'], linhas.map((r) => { const a = A.get(r.a) || {};
        return [fmtData(r.dt), r.h.slice(0, 5), TIPO[r.tp || 'refeicao'], esc(a.nome || ''), esc(a.matricula || ''), esc(perfil === 'admin' ? fmtCpf(a.cpf || '') : (a.cpf || '')),
          esc(turmaDe(a.matricula)), r.tp === 'lanche' ? 'livre' : r.dh ? 'dentro' : 'fora']; }), []);
  }
  $('#rel-imp').onclick = () => { detalhada(); setTimeout(() => window.print(), 50); };
  window.addEventListener('afterprint', () => { $('#rel-detalhe') && ($('#rel-detalhe').innerHTML = ''); }, { once: false });
}
