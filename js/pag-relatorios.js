// Relatórios: resumo, por aluno (frequência e ausências), por curso, por dia e por horário
// (o financeiro saiu daqui e virou módulo próprio: pag-financeiro.js)
import { $, $$, esc, ico, baixarCsv, fmtData, fmtDataCurta, DIAS_SEMANA, DIAS_CURTO, diaSemanaNum, addDias, diasEntre, inicioSemana, hojeISO, horaDe, MESES, fmtPct, pct, fmtNum, normalizar, debounce, modal, turmaDe, fmtCpf, TIPO } from './util.js';
import { api } from './api.js';
import * as D from './dados.js';
import { barras, colunas, barrasH, legenda } from './graficos.js';

const METODO = { facial: 'Facial', cpf: 'CPF', manual: 'Manual' };
const ABAS = [['resumo', 'Resumo'], ['aluno', 'Por aluno'], ['turma', 'Por turma'], ['curso', 'Por curso'], ['dia', 'Por dia'], ['horario', 'Por horário'], ['ocorrencias', 'Ocorrências']];

export async function render(el, { cabecalho, perfil }) {
  const [alunos, cfg] = await Promise.all([D.alunos(), D.config()]);
  const A = D.mapa(alunos);
  const cursos = [...new Set(alunos.map((a) => a.curso).filter(Boolean))].sort();
  const niveis = [...new Set(alunos.map((a) => a.nivel).filter(Boolean))].sort();
  const turmas = [...new Set(alunos.map((a) => turmaDe(a.matricula)).filter(Boolean))].sort();
  let periodo = null, bruto = [], R = [], refBruto = [], REF = [], refIni = '', aba = sessionStorage.getItem('pases_rel_aba') || 'resumo';
  if (!ABAS.some(([k]) => k === aba)) aba = 'resumo';
  let ordem = { chave: 'total', desc: true };

  el.innerHTML = cabecalho('Relatórios', 'Resumos por período, aluno, curso, dia e horário. Exporte em CSV (abre no Excel) ou imprima.',
    `<label class="check" title="Acrescenta à impressão a lista de todos os registros do período filtrado"><input type="checkbox" id="rel-det"> Incluir registros detalhados na impressão</label><button class="btn" id="rel-imp">${ico('imprimir')} Imprimir</button><button class="btn" id="rel-csv">${ico('baixar')} Exportar CSV desta aba</button>`) + `
    <div class="barra-filtros">
      <div class="linha-flex" id="rel-periodo"></div>
      <label class="campo"><span>Tipo</span><select id="rel-tipo"><option value="">Almoço e lanche</option><option value="refeicao">Só almoço</option><option value="lanche">Só lanche</option></select></label>
      <label class="campo"><span>Turma</span><select id="rel-turma"><option value="">Todas</option>${turmas.map((t) => `<option>${esc(t)}</option>`).join('')}</select></label>
      <label class="campo"><span>Curso</span><select id="rel-curso"><option value="">Todos</option>${cursos.map((c) => `<option>${esc(c)}</option>`).join('')}</select></label>
      <label class="campo"><span>Nível</span><select id="rel-nivel"><option value="">Todos</option>${niveis.map((c) => `<option>${esc(c)}</option>`).join('')}</select></label>
      <label class="campo"><span>Método</span><select id="rel-metodo"><option value="">Todos</option><option value="facial">Facial</option><option value="cpf">CPF</option><option value="manual">Manual</option></select></label>
      <label class="campo"><span>Dias da semana</span><select id="rel-dias"><option value="">Todos</option><option value="uteis">Só dias úteis (seg a sex)</option></select></label>
    </div>
    <div class="so-impressao"><h2 id="rel-titulo-imp"></h2></div>
    <div class="abas" id="rel-abas">
      ${ABAS.map(([k, t]) => `<button data-aba="${k}" class="${k === aba ? 'ativo' : ''}">${t}</button>`).join('')}
    </div>
    <div id="rel-corpo"><div class="vazio">Carregando…</div></div>
    <div id="rel-detalhe" class="so-impressao"></div>`;

  async function carregar() {
    $('#rel-corpo').innerHTML = '<div class="vazio">Carregando…</div>';
    // além do período pedido, busca os dias anteriores: servem de base para as comparações do Resumo
    const n = diasEntre(periodo.ini, periodo.fim) + 1, janela = Math.min(120, Math.max(28, n));
    refIni = addDias(periodo.ini, -janela);
    [bruto, refBruto] = await Promise.all([
      api('refeicoes_listar', { p_ini: periodo.ini, p_fim: periodo.fim }),
      api('refeicoes_listar', { p_ini: refIni, p_fim: addDias(periodo.ini, -1) }).catch(() => [])
    ]);
    aplicarFiltros();
  }
  function alunosFiltrados() {
    const c = $('#rel-curso').value, n = $('#rel-nivel').value, t = $('#rel-turma').value;
    return alunos.filter((a) => (!c || a.curso === c) && (!n || a.nivel === n) && (!t || turmaDe(a.matricula) === t));
  }
  function aplicarFiltros() {
    const ids = new Set(alunosFiltrados().map((a) => a.id)), met = $('#rel-metodo').value, uteis = $('#rel-dias').value === 'uteis', tipo = $('#rel-tipo').value;
    const passa = (r) => ids.has(r.a) && (!met || r.m === met) && (!uteis || diaSemanaNum(r.dt) <= 5) && (!tipo || (r.tp || 'refeicao') === tipo);
    R = bruto.filter(passa); REF = refBruto.filter(passa);
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
    const lanches = R.filter((r) => r.tp === 'lanche').map((r) => { const [h, m] = r.h.split(':').map(Number); return h * 60 + m; });
    const ini = Math.min(10 * 60 + 30, ...mins.map((m) => Math.floor(m / 15) * 15)), fim = Math.max(14 * 60 + 15, ...mins);
    const out = [];
    for (let m = ini; m <= fim; m += 15) {
      const n = mins.filter((x) => x >= m && x < m + 15).length, nl = lanches.filter((x) => x >= m && x < m + 15).length;
      const foraJanela = hm(m + 14) < cfg.horario_inicio || hm(m) > cfg.horario_fim;
      // lanche não tem horário: a faixa só fica "fora" se houver refeição fora da janela
      out.push({ faixa: `${hm(m)}–${hm(m + 15)}`, inicio: hm(m), total: n, lanche: nl, fora: foraJanela && n > nl, soLanche: n > 0 && n === nl });
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
    else if (aba === 'curso' || aba === 'turma') c.innerHTML = tabelaHtml([aba === 'curso' ? 'Curso' : 'Turma', 'Ativos', 'Atendidos', 'Registros', 'Almoço', 'Lanche', 'Média por aluno atendido', 'Almoço fora do horário', 'Sem foto'],
      (aba === 'curso' ? tabelaCurso() : tabelaTurma()).map((x) => [esc(x.curso), x.ativos, `${x.atendidos} <small class="mudo">(${fmtPct(x.atendidos, x.ativos)})</small>`, `<b>${x.total}</b>`, x.refeicao, x.lanche, x.media.toFixed(1).replace('.', ','), x.fora, x.semfoto]), [1, 2, 3, 4, 5, 6, 7, 8]);
    else if (aba === 'dia') {
      const t = tabelaDia();
      c.innerHTML = `<div class="cartao" style="margin-bottom:16px"><h2>Atendimentos por dia</h2>${barras(t.map((x) => ({ r: fmtDataCurta(x.data), v: x.total, dica: `${DIAS_CURTO[diaSemanaNum(x.data)]} ${fmtData(x.data)}: ${x.total}` })), { titulo: 'Atendimentos por dia' })}</div>` +
        tabelaHtml(['Data', 'Dia', 'Registros', 'Almoço', 'Lanche', 'Facial', 'CPF', 'Manual', 'Fora do horário', 'Sem foto', 'Primeiro', 'Último'],
          t.map((x) => [fmtData(x.data), x.dia, `<b>${x.total}</b>`, x.refeicao, x.lanche, x.facial, x.cpf, x.manual, x.fora, x.semfoto ? `<span class="selo vermelho">${x.semfoto}</span>` : 0, x.primeiro, x.ultimo]), [2, 3, 4, 5, 6, 7, 8, 9]);
    } else if (aba === 'horario') {
      const t = tabelaHorario();
      c.innerHTML = `<div class="cartao" style="margin-bottom:16px"><h2>Distribuição por horário (faixas de 15 minutos)</h2>${barras(t.map((x) => ({ r: x.inicio, v: x.total, classe: x.fora ? 'fora' : x.soLanche ? 'lanche' : '', dica: `${x.faixa}: ${x.total}${x.lanche ? ` (${x.lanche} lanche)` : ''}` })), { titulo: 'Por horário' })}
        <div class="legenda"><span><i style="background:var(--verde)"></i>dentro do horário (${esc(cfg.horario_inicio)}–${esc(cfg.horario_fim)})</span><span><i style="background:#e0a33a"></i>almoço fora do horário</span><span><i style="background:#3b7dd8"></i>lanche</span></div></div>` +
        tabelaHtml(['Faixa', 'Registros', 'Lanche', '% do período', 'Situação'], t.filter((x) => x.total).map((x) => [x.faixa, x.total, x.lanche, fmtPct(x.total, R.length), x.fora ? '<span class="selo ambar">almoço fora do horário</span>' : x.soLanche ? '<span class="selo azul">lanche</span>' : '<span class="selo verde">dentro</span>']), [1, 2, 3]);
    } else if (aba === 'ocorrencias') {
      const t = ocorrencias();
      c.innerHTML = `<p class="mudo" style="margin-top:0">Registros sem foto, fora do horário, manuais, extras ou com observação.</p>` +
        tabelaHtml(['Data', 'Hora', 'Aluno', 'Ocorrência', 'Detalhe'], t.map((r) => { const a = A.get(r.a) || {};
          const oc = [r.fs === 'sem_foto' ? '<span class="selo vermelho">sem foto</span>' : '', !r.dh ? '<span class="selo ambar">fora do horário</span>' : '', r.m === 'manual' ? '<span class="selo azul">manual</span>' : '', r.x ? '<span class="selo azul">extra</span>' : '', r.obs ? '<span class="selo ambar">observação</span>' : ''].join(' ');
          return [fmtData(r.dt), r.h.slice(0, 5), `${esc(a.nome || '')}<br><small class="mudo">${esc(a.matricula || '')}</small>`, oc, esc([r.j, r.obs].filter(Boolean).join(' · '))]; }), [], (i) => (t[i].fs === 'sem_foto' ? 'sem-foto' : ''));
    }
  }

  // ---------------------------------------------------------------- resumo: a análise muda conforme o tamanho do período
  const VERDE = 'var(--verde)', AZUL = '#3b7dd8', AMBAR = '#e0a33a', CINZA = '#8a9590';
  const SERIES = [{ nome: 'almoço', cor: VERDE }, { nome: 'lanche', cor: AZUL }];
  const conta = (l) => { const n = l.filter((r) => r.tp === 'lanche').length; return { t: l.length, r: l.length - n, l: n }; };
  const porData = (l) => { const m = new Map(); l.forEach((r) => { if (!m.has(r.dt)) m.set(r.dt, []); m.get(r.dt).push(r); }); return m; };
  const mediaDias = (datas, mapa) => { const n = datas.length || 1, c = datas.map((d) => conta(mapa.get(d) || [])); return { t: c.reduce((s, x) => s + x.t, 0) / n, r: c.reduce((s, x) => s + x.r, 0) / n, l: c.reduce((s, x) => s + x.l, 0) / n }; };
  const dec1 = (v) => (Math.round(v * 10) / 10).toLocaleString('pt-BR');
  const rotDia = (d) => `${DIAS_CURTO[diaSemanaNum(d)]} ${fmtDataCurta(d)}`;
  const minutos = (h) => { const [a, b] = h.split(':').map(Number); return a * 60 + b; };
  /** Variação com seta em relação a uma base: "▲ 12 (+8%)". Sem base, devolve ''. */
  function delta(atual, base, decimal = false) {
    if (base == null || !Number.isFinite(base)) return '';
    const d = atual - base; if (Math.abs(d) < (decimal ? 0.05 : 0.5)) return '= igual';
    const p = base ? ` (${d > 0 ? '+' : '−'}${Math.abs(Math.round((100 * d) / base))}%)` : '';
    return `${d > 0 ? '▲' : '▼'} ${decimal ? dec1(Math.abs(d)) : fmtNum(Math.abs(Math.round(d)))}${p}`;
  }
  const kpi = (rot, val, sub, cls = '') => `<div class="kpi ${cls}"><span>${rot}</span><b>${val}</b><small>${sub}</small></div>`;
  const cartao = (titulo, corpo, leg = '', estilo = '') => `<div class="cartao" style="${estilo}"><h2>${titulo}</h2>${corpo}${leg}</div>`;
  function cursosComparecimento() {
    const m = new Map();
    alunosFiltrados().forEach((a) => { if (!a.ativo) return; const k = a.curso || '(sem curso)'; if (!m.has(k)) m.set(k, { curso: k, ativos: 0, at: new Set() }); m.get(k).ativos++; });
    R.forEach((r) => { const a = A.get(r.a), c = a && a.ativo && m.get(a.curso || '(sem curso)'); if (c) c.at.add(r.a); });
    return [...m.values()].map((c) => ({ curso: c.curso, ativos: c.ativos, n: c.at.size, p: pct(c.at.size, c.ativos) })).sort((a, b) => b.p - a.p || b.ativos - a.ativos);
  }
  const grafCursos = (cs) => barrasH(cs.slice(0, 14).map((c) => ({ r: c.curso, v: c.p, txt: `${String(c.p).replace('.', ',')}% · ${c.n} de ${c.ativos}`, cor: c.p < 30 ? AMBAR : VERDE })), { max: 100, titulo: 'Comparecimento por curso' });
  /** Movimento por faixa de 15 min. divisor > 1 transforma em média por dia; linhaRef = média dos dias de referência. */
  function grafHorario(divisor, datasRef, refMapa, largura) {
    const t = tabelaHorario(), ref = datasRef.length ? datasRef.flatMap((d) => refMapa.get(d) || []).map((r) => minutos(r.h)) : null;
    const cats = t.map((x) => ({ r: x.inicio, dica: x.faixa, v: [x.total / divisor], cor: x.fora ? AMBAR : x.soLanche ? AZUL : VERDE }));
    const linhas = ref ? [{ nome: `média dos ${datasRef.length} dias anteriores`, cor: CINZA, tracejada: true, v: t.map((x) => { const m = minutos(x.inicio); return ref.filter((y) => y >= m && y < m + 15).length / datasRef.length; }) }] : [];
    return colunas(cats, [{ nome: divisor > 1 ? 'média por dia' : 'registros', cor: VERDE }], { linhas, rotulos: false, altura: 220, largura, titulo: 'Movimento por horário' }) +
      legenda([[VERDE, 'almoço no horário'], [AMBAR, 'almoço fora do horário'], [AZUL, 'só lanche'], ...(ref ? [[CINZA, 'média dos dias anteriores', 1]] : [])]);
  }
  function pico() { const t = tabelaHorario().filter((x) => x.total); return t.length ? t.reduce((a, b) => (b.total > a.total ? b : a)) : null; }

  function resumo() {
    if (!R.length) return '<div class="vazio">Sem registros neste período e com estes filtros.</div>';
    const hoje = hojeISO(), agora = horaDe(), nDias = diasEntre(periodo.ini, periodo.fim) + 1;
    const modo = nDias === 1 ? 'dia' : nDias <= 10 ? 'curto' : nDias <= 62 ? 'medio' : 'longo';
    const dias = diasFuncionamento(), T = conta(R), PD = porData(R), ativosL = alunosFiltrados().filter((a) => a.ativo), ativosN = ativosL.length;
    const vistos = new Set(R.map((r) => r.a)), atendidos = vistos.size, faltaram = ativosL.filter((a) => !vistos.has(a.id)).length;
    const fora = R.filter((r) => !r.dh).length, sf = R.filter((r) => r.fs === 'sem_foto').length, fac = R.filter((r) => r.m === 'facial').length, man = R.filter((r) => r.m === 'manual').length;
    const parcial = periodo.fim >= hoje && PD.has(hoje); // o dia de hoje ainda está em andamento
    const refPD = porData(REF), refDias = [...refPD.keys()].sort(), ult = refDias.slice(-10), mediaRef = ult.length ? mediaDias(ult, refPD) : null;
    const cursos = cursosComparecimento(), pk = pico(), L = []; // L = frases da "Leitura rápida"
    const cursosOk = cursos.filter((c) => c.ativos >= 5);
    const kFixos = kpi('Almoço fora do horário', fora, `${fmtPct(fora, R.length)} · janela ${esc(cfg.horario_inicio)}–${esc(cfg.horario_fim)}`, fora ? 'kpi-aviso' : '') +
      kpi('Sem foto', sf, `${fmtPct(sf, R.length)} dos registros`, sf ? 'kpi-alerta' : '') +
      kpi('Reconhecimento facial', fmtPct(fac, R.length), `${fac} facial · ${R.length - fac - man} CPF · ${man} manual`);
    let kpis = '', graficos = '';

    if (modo === 'dia') {
      // ---- um único dia: compara com o dia anterior de atendimento, com a média recente e com o mesmo dia da semana
      const dAnt = refDias[refDias.length - 1], ant = dAnt ? refPD.get(dAnt) : [], A0 = conta(ant);
      const antAteAgora = conta(ant.filter((r) => r.h.slice(0, 5) <= agora)), base = parcial ? antAteAgora : A0;
      const w = diaSemanaNum(periodo.ini), mesmos = refDias.filter((d) => diaSemanaNum(d) === w), mediaDS = mesmos.length ? mediaDias(mesmos, refPD) : null;
      const varMedia = mediaRef && mediaRef.t ? Math.round((100 * (T.t - mediaRef.t)) / mediaRef.t) : null;
      kpis = kpi('Registros', fmtNum(T.t), `${T.r} almoço · ${T.l} lanche${dAnt ? `<br>${delta(T.t, base.t)} em relação a ${rotDia(dAnt)}${parcial ? ` até ${agora}` : ''}` : ''}`) +
        (parcial && dAnt && base.t
          // dia em andamento: comparar com um dia completo distorce; compara o ritmo até o mesmo horário
          ? kpi(`Ritmo até ${agora}`, `${T.t >= base.t ? '+' : '−'}${Math.abs(Math.round((100 * (T.t - base.t)) / base.t))}%`, `em relação ao mesmo horário de ${rotDia(dAnt)}${mediaRef ? ` · um dia completo tem tido ${dec1(mediaRef.t)} em média` : ''}`)
          : kpi('Em relação à média', varMedia == null ? 'sem histórico' : `${varMedia > 0 ? '+' : varMedia < 0 ? '−' : ''}${Math.abs(varMedia)}%`, mediaRef ? `média de ${dec1(mediaRef.t)} nos últimos ${ult.length} dia(s) de atendimento` : 'ainda não há dias anteriores para comparar')) +
        kpi('Alunos atendidos', atendidos, `${fmtPct(atendidos, ativosN)} dos ${ativosN} ativos`) + kFixos;
      const cats = [{ r: parcial ? `Hoje até ${agora}` : rotDia(periodo.ini), v: [T.r, T.l] },
        ...(dAnt && parcial ? [{ r: `${rotDia(dAnt)} até ${agora}`, v: [antAteAgora.r, antAteAgora.l] }] : []),
        ...(dAnt ? [{ r: `${rotDia(dAnt)}${parcial ? ' (dia todo)' : ''}`, v: [A0.r, A0.l] }] : []),
        ...(mediaRef && ult.length > 1 ? [{ r: `Média de ${ult.length} dias`, v: [mediaRef.r, mediaRef.l] }] : []),
        ...(mediaDS ? [{ r: `Média de ${DIAS_CURTO[w]} (${mesmos.length})`, v: [mediaDS.r, mediaDS.l] }] : [])];
      graficos = `<div class="duas-col">${cartao(parcial ? 'Hoje comparado' : 'Este dia comparado', cats.length > 1 ? colunas(cats, SERIES, { titulo: 'Comparativo do dia' }) + legenda([[VERDE, 'almoço'], [AZUL, 'lanche']]) : '<div class="vazio">Ainda não há dias anteriores para comparar.</div>')}
        ${cartao('Comparecimento por curso (alunos ativos atendidos)', grafCursos(cursos))}</div>
        ${cartao('Movimento por horário (faixas de 15 minutos)', grafHorario(1, ult, refPD, 1200))}`;
      if (dAnt) L.push(parcial ? `Até ${agora} foram <b>${T.t}</b> registros; no mesmo horário de ${rotDia(dAnt)} eram <b>${antAteAgora.t}</b> (${delta(T.t, antAteAgora.t)}). Aquele dia fechou com ${A0.t}.` : `<b>${T.t}</b> registros, ${delta(T.t, A0.t)} em relação a ${rotDia(dAnt)} (${A0.t}).`);
      if (mediaRef && !parcial) L.push(`A média dos últimos ${ult.length} dia(s) de atendimento é ${dec1(mediaRef.t)}: almoço ${delta(T.r, mediaRef.r, true)}, lanche ${delta(T.l, mediaRef.l, true)}.`);
      if (mediaRef && parcial) L.push(`O dia ainda está em andamento; um dia completo tem tido em média ${dec1(mediaRef.r)} almoços e ${dec1(mediaRef.l)} lanches.`);
    } else {
      // ---- vários dias: compara com o período anterior de mesmo tamanho (semana com semana, mês com mês)
      const fechados = dias.filter((d) => d < hoje), base = fechados.length ? fechados : dias, M = mediaDias(base, PD);
      const shift = nDias <= 7 ? 7 : nDias, antIni = addDias(periodo.ini, -shift), antFim = addDias(periodo.fim, -shift);
      const ant = antIni >= refIni ? REF.filter((r) => r.dt >= antIni && r.dt <= antFim) : [], antPD = porData(ant), antDias = [...antPD.keys()], MA = antDias.length ? mediaDias(antDias, antPD) : null;
      const rotAnt = `${fmtDataCurta(antIni)} a ${fmtDataCurta(antFim)}`;
      kpis = kpi('Registros', fmtNum(T.t), `${T.r} almoço · ${T.l} lanche · ${dias.length} dia(s)${MA && !parcial ? `<br>${delta(T.t, ant.length)} em relação a ${rotAnt}` : ''}`) +
        kpi('Média por dia', dec1(M.t), `${dec1(M.r)} almoço · ${dec1(M.l)} lanche${parcial && fechados.length ? ' · sem contar hoje' : ''}${MA ? `<br>${delta(M.t, MA.t, true)} em relação a ${rotAnt}` : ''}`) +
        kpi('Alunos atendidos', atendidos, `${fmtPct(atendidos, ativosN)} dos ${ativosN} ativos · ${faltaram} não compareceram`) + kFixos;

      // por dia (períodos curtos e médios) ou por semana e por mês (períodos longos)
      const td = tabelaDia(); while (td.length && !td[0].total) td.shift(); // sem os dias vazios antes do primeiro atendimento
      let blocoTempo = '';
      if (modo === 'curto') {
        const linhas = MA ? [{ nome: `mesmo dia em ${rotAnt}`, cor: CINZA, tracejada: true, v: td.map((x) => { const l = antPD.get(addDias(x.data, -shift)); return l ? l.length : null; }) }] : [];
        blocoTempo = cartao('Atendimentos por dia', colunas(td.map((x) => ({ r: rotDia(x.data), dica: `${DIAS_SEMANA[diaSemanaNum(x.data)]} ${fmtData(x.data)}${x.data === hoje ? ' (em andamento)' : ''}`, v: [x.refeicao, x.lanche] })), SERIES, { empilhar: true, linhas, titulo: 'Atendimentos por dia' }) +
          legenda([[VERDE, 'almoço'], [AZUL, 'lanche'], ...(MA ? [[CINZA, 'total do mesmo dia no período anterior', 1]] : [])]));
      } else if (modo === 'medio') {
        const comReg = td.filter((x) => x.total && x.data < hoje), mm = td.map((x) => { if (!x.total || x.data >= hoje) return null; /* hoje, parcial, fica fora da média */ const i = comReg.indexOf(x), j = comReg.slice(Math.max(0, i - 4), i + 1); return j.reduce((s, y) => s + y.total, 0) / j.length; });
        blocoTempo = cartao('Atendimentos por dia', colunas(td.map((x) => ({ r: fmtDataCurta(x.data), dica: `${DIAS_SEMANA[diaSemanaNum(x.data)]} ${fmtData(x.data)}`, v: [x.refeicao, x.lanche] })), SERIES, { empilhar: true, rotulos: td.length <= 23, linhas: [{ nome: 'média móvel de 5 dias', cor: AMBAR, v: mm }], largura: 1200, titulo: 'Atendimentos por dia' }) +
          legenda([[VERDE, 'almoço'], [AZUL, 'lanche'], [AMBAR, 'média móvel dos últimos 5 dias de atendimento', 1]]));
      } else {
        const grupo = (chave) => { const g = new Map(); dias.forEach((d) => { const k = chave(d); if (!g.has(k)) g.set(k, []); g.get(k).push(d); }); return [...g.entries()].sort((a, b) => a[0].localeCompare(b[0])); };
        const sem = grupo(inicioSemana).map(([k, ds]) => { const m = mediaDias(ds, PD); return { r: fmtDataCurta(k), dica: `semana de ${fmtData(k)} (${ds.length} dia(s))`, v: [m.r, m.l] }; });
        const mes = grupo((d) => d.slice(0, 7)).map(([k, ds]) => { const c = conta(ds.flatMap((d) => PD.get(d))); return { r: `${MESES[+k.slice(5) - 1].slice(0, 3)}/${k.slice(2, 4)}`, dica: `${MESES[+k.slice(5) - 1]} de ${k.slice(0, 4)} (${ds.length} dia(s))`, v: [c.r, c.l] }; });
        blocoTempo = cartao('Média diária em cada semana', colunas(sem, SERIES, { empilhar: true, rotulos: sem.length <= 26, largura: 1200, titulo: 'Média diária por semana' }) + legenda([[VERDE, 'almoço'], [AZUL, 'lanche']])) +
          `<div style="height:16px"></div>` + cartao('Total por mês', colunas(mes, SERIES, { titulo: 'Total por mês' }) + legenda([[VERDE, 'almoço'], [AZUL, 'lanche']]));
      }
      // dia da semana (só faz sentido quando o período repete dias da semana)
      const ds = [1, 2, 3, 4, 5, 6, 7].map((k) => { const l = base.filter((d) => diaSemanaNum(d) === k); return { k, n: l.length, m: l.length ? mediaDias(l, PD) : null }; }).filter((x) => x.m);
      const blocoDS = modo !== 'curto' && ds.some((x) => x.n > 1) ? cartao('Média por dia da semana', colunas(ds.map((x) => ({ r: DIAS_CURTO[x.k], dica: `${DIAS_SEMANA[x.k]} (${x.n} dia(s))`, v: [x.m.r, x.m.l] })), SERIES, { titulo: 'Média por dia da semana' }) + legenda([[VERDE, 'almoço'], [AZUL, 'lanche']])) : '';
      // assiduidade: em quantos dias do período cada aluno ativo veio
      const vezes = new Map(); R.forEach((r) => vezes.set(r.a, (vezes.get(r.a) || 0) + 1));
      const fx = [['não vieram', 0, 0], ['até 25%', 0.0001, 25], ['26 a 50%', 25.0001, 50], ['51 a 75%', 50.0001, 75], ['76 a 100%', 75.0001, 1e9]].map(([r, a, b]) => ({ r, n: ativosL.filter((al) => { const p = Math.min(100, (100 * (vezes.get(al.id) || 0)) / dias.length); return p >= a && p <= b; }).length }));
      const assiduos = fx[4].n;
      const blocoAss = dias.length >= 3 ? cartao(`Assiduidade dos ${ativosN} alunos ativos (dias em que vieram ÷ ${dias.length} dias de atendimento)`, colunas(fx.map((x, i) => ({ r: x.r, v: [x.n], cor: i === 0 ? AMBAR : VERDE })), [{ nome: 'alunos', cor: VERDE }], { titulo: 'Assiduidade' })) : '';
      const blocoCur = cartao('Comparecimento por curso (alunos ativos que vieram ao menos uma vez)', grafCursos(cursos));
      const blocoHor = cartao('Movimento por horário, média por dia (faixas de 15 minutos)', grafHorario(dias.length, [], refPD, 1200));
      const pares = [blocoDS, blocoAss, blocoCur].filter(Boolean);
      graficos = (modo === 'curto' ? `<div class="duas-col">${blocoTempo}${pares.shift()}</div>` : blocoTempo + '<div style="height:16px"></div>') +
        (pares.length ? `<div class="duas-col">${pares.join('')}</div>` : '') + blocoHor;

      if (MA) L.push(`Média de <b>${dec1(M.t)}</b> atendimentos por dia, ${delta(M.t, MA.t, true)} em relação ao período anterior (${rotAnt}): almoço ${delta(M.r, MA.r, true)}, lanche ${delta(M.l, MA.l, true)}.`);
      if (base.length >= 2) { const o = base.map((d) => [d, PD.get(d).length]).sort((a, b) => b[1] - a[1]); L.push(`Dia mais cheio: <b>${rotDia(o[0][0])}</b> (${o[0][1]}). Dia mais vazio: <b>${rotDia(o[o.length - 1][0])}</b> (${o[o.length - 1][1]}).`); }
      if (blocoDS) { const o = ds.filter((x) => x.k <= 5).sort((a, b) => b.m.t - a.m.t); if (o.length >= 2) L.push(`${DIAS_SEMANA[o[0].k][0].toUpperCase() + DIAS_SEMANA[o[0].k].slice(1)} é o dia da semana mais movimentado (média de ${dec1(o[0].m.t)}) e ${DIAS_SEMANA[o[o.length - 1].k]} o mais fraco (${dec1(o[o.length - 1].m.t)}).`); }
      if (modo !== 'curto' && base.length >= 6) { const h = Math.floor(base.length / 2), a = mediaDias(base.slice(0, h), PD).t, b = mediaDias(base.slice(-h), PD).t; if (Math.abs(b - a) / (a || 1) >= 0.05) L.push(`Tendência de ${b > a ? 'alta' : 'queda'}: a média diária foi de ${dec1(a)} na primeira metade do período para ${dec1(b)} na segunda.`); }
      if (ativosN) L.push(`<b>${faltaram}</b> aluno(s) ativo(s) (${fmtPct(faltaram, ativosN)}) não compareceram nenhuma vez${blocoAss ? `; <b>${assiduos}</b> vieram em mais de 75% dos dias` : ''}. A lista está na aba "Por aluno", filtro "Só quem NÃO compareceu".`);
    }
    if (pk) L.push(`Pico de movimento entre <b>${pk.faixa}</b>, com ${modo === 'dia' ? `${pk.total} registros` : `${dec1(pk.total / dias.length)} registros por dia em média`}.`);
    if (cursosOk.length >= 2) L.push(`Maior comparecimento: <b>${esc(cursosOk[0].curso)}</b> (${String(cursosOk[0].p).replace('.', ',')}%). Menor: <b>${esc(cursosOk[cursosOk.length - 1].curso)}</b> (${String(cursosOk[cursosOk.length - 1].p).replace('.', ',')}%), entre os cursos com 5 ou mais alunos ativos.`);
    if (fora || sf) L.push(`Atenção: ${[fora && `${fora} almoço(s) fora do horário`, sf && `${sf} registro(s) sem foto`].filter(Boolean).join(' e ')}. Detalhes na aba "Ocorrências".`);

    return `<div class="kpis">${kpis}</div>
      ${L.length ? `<div class="cartao" style="margin-bottom:16px"><h2>Leitura rápida</h2><ul style="margin:8px 0 0;padding-left:20px;line-height:1.7">${L.map((x) => `<li>${x}</li>`).join('')}</ul></div>` : ''}
      ${graficos}`;
  }

  function desenharAlunos() {
    const q = normalizar($('#rel-busca')?.value || ''), mostrar = $('#rel-mostrar')?.value || '';
    let t = tabelaAluno().filter((x) => !q || normalizar(`${x.nome} ${x.matricula}`).includes(q));
    if (mostrar === 'zero') t = t.filter((x) => !x.total && x.ativo);
    if (mostrar === 'baixa') t = t.filter((x) => x.freq < 50 && x.ativo);
    if (mostrar === 'alta') t = t.filter((x) => x.freq >= 80);
    const k = ordem.chave; t.sort((a, b) => (typeof a[k] === 'string' ? a[k].localeCompare(b[k]) : a[k] - b[k]) * (ordem.desc ? -1 : 1));
    const dias = diasFuncionamento().length;
    $('#rel-tab-aluno').innerHTML = `<p class="mudo pequeno" style="margin-top:0">${t.length} aluno(s). Frequência = registros ÷ ${dias} dia(s) com atendimento no período.</p>` +
      tabelaHtml([['nome', 'Aluno'], ['turma', 'Turma'], ['total', 'Registros'], ['refeicao', 'Almoço'], ['lanche', 'Lanche'], ['freq', 'Frequência'], ['fora', 'Fora do horário'], ['semfoto', 'Sem foto'], ['facial', 'Facial'], ['ultima', 'Última']],
        t.map((x) => [`${esc(x.nome)}${x.ativo ? '' : ' <span class="selo">inativo</span>'}<br><small class="mudo">${esc(x.matricula)}</small>`, `<b class="pequeno">${esc(x.turma)}</b><br><span class="pequeno mudo">${esc(x.curso)}</span>`,
          `<b>${x.total}</b>`, x.refeicao, x.lanche, `<div style="display:flex;align-items:center;gap:8px;justify-content:flex-end"><span style="display:inline-block;width:60px;height:6px;border-radius:3px;background:var(--neutro, #eef1f0);overflow:hidden"><span style="display:block;height:100%;width:${Math.min(100, x.freq)}%;background:${x.freq < 50 ? '#e0a33a' : 'var(--verde)'}"></span></span>${String(x.freq).replace('.', ',')}%</div>`,
          x.fora, x.semfoto ? `<span class="selo vermelho">${x.semfoto}</span>` : 0, x.facial, x.ultima ? fmtData(x.ultima) : '<span class="mudo">nunca</span>']), [2, 3, 4, 5, 6, 7, 8], null, t.map((x) => x.id));
    $$('#rel-tab-aluno th[data-ord]').forEach((th) => (th.onclick = () => { ordem = { chave: th.dataset.ord, desc: ordem.chave === th.dataset.ord ? !ordem.desc : true }; desenharAlunos(); }));
    $$('#rel-tab-aluno tr[data-id]').forEach((tr) => (tr.onclick = () => historico(tr.dataset.id)));
  }

  function historico(id) {
    const a = A.get(id), rs = R.filter((r) => r.a === id);
    modal({ titulo: `${a.nome} · ${periodo.rotulo}`, largo: true, corpo: `<p class="mudo" style="margin:0">${esc(a.matricula || '')} · ${esc(a.curso || '')} · ${rs.length} registro(s) no período</p>` +
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
