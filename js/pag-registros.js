// Registros de refeição: consulta, filtros, detalhes, edição e exclusão (admin)
import { $, $$, esc, ico, modal, aviso, confirmar, pedirTexto, baixarCsv, fmtData, fmtDataHora, normalizar, debounce, uuid, hojeISO, horaDe, turmaDe, TIPO } from './util.js';
import { api, foto } from './api.js';
import * as D from './dados.js';

const POR_PAGINA = 100;
const METODO = { facial: 'Facial', cpf: 'CPF', manual: 'Manual' };

export async function render(el, { cabecalho, perfil }) {
  const admin = perfil === 'admin';
  const [alunos, cfg] = await Promise.all([D.alunos(), D.config()]);
  let A = D.mapa(alunos);
  const cursos = [...new Set(alunos.map((a) => a.curso).filter(Boolean))].sort();
  const turmas = [...new Set(alunos.map((a) => turmaDe(a.matricula)).filter(Boolean))].sort();
  let periodo = null, lista = [], filtrada = [], pagina = 0;

  el.innerHTML = cabecalho('Registros', 'Cada linha é uma refeição ou lanche registrado. Linhas vermelhas foram registradas sem foto.',
    `${admin ? `<button class="btn" id="r-novo">${ico('mais')} Registro manual</button>` : ''}<button class="btn" id="r-csv">${ico('baixar')} Exportar CSV</button>`) + `
    <div class="barra-filtros">
      <div class="linha-flex" id="r-periodo"></div>
      <label class="campo" style="min-width:220px"><span>Buscar aluno</span><input type="search" id="r-busca" placeholder="Nome ou matrícula"></label>
      <label class="campo"><span>Tipo</span><select id="r-tipo"><option value="">Refeição e lanche</option><option value="refeicao">Só refeição</option><option value="lanche">Só lanche</option></select></label>
      <label class="campo"><span>Turma</span><select id="r-turma"><option value="">Todas</option>${turmas.map((t) => `<option>${esc(t)}</option>`).join('')}</select></label>
      <label class="campo"><span>Curso</span><select id="r-curso"><option value="">Todos</option>${cursos.map((c) => `<option>${esc(c)}</option>`).join('')}</select></label>
      <label class="campo"><span>Método</span><select id="r-metodo"><option value="">Todos</option><option value="facial">Facial</option><option value="cpf">CPF</option><option value="manual">Manual</option></select></label>
      <div class="linha-flex" style="padding-bottom:8px">
        <label class="check"><input type="checkbox" id="r-semfoto"> Só sem foto</label>
        <label class="check"><input type="checkbox" id="r-fora"> Só fora do horário</label>
        <label class="check"><input type="checkbox" id="r-excl"> Incluir excluídos</label>
      </div>
    </div>
    <div id="r-resumo" class="linha-flex pequeno mudo" style="margin-bottom:8px"></div>
    <div class="tabela-wrap"><table class="tabela"><thead><tr><th>Data</th><th>Hora</th><th>Tipo</th><th>Aluno</th><th>Turma / curso</th><th>Método</th><th>Foto</th><th>Horário</th><th>Atendente</th></tr></thead>
      <tbody id="r-corpo"><tr><td colspan="9" class="vazio">Carregando…</td></tr></tbody></table></div>
    <div class="paginacao" id="r-pag"></div>`;

  async function carregar() {
    $('#r-corpo').innerHTML = '<tr><td colspan="9" class="vazio">Carregando…</td></tr>';
    lista = await api('refeicoes_listar', { p_ini: periodo.ini, p_fim: periodo.fim, p_incluir_excluidos: $('#r-excl').checked });
    filtrar();
  }
  function filtrar() {
    const q = normalizar($('#r-busca').value.trim()), curso = $('#r-curso').value, met = $('#r-metodo').value, tipo = $('#r-tipo').value, turma = $('#r-turma').value;
    const sf = $('#r-semfoto').checked, fo = $('#r-fora').checked;
    filtrada = lista.filter((r) => {
      const a = A.get(r.a) || {};
      if (q && !normalizar(`${a.nome} ${a.matricula}`).includes(q)) return false;
      if (curso && a.curso !== curso) return false;
      if (turma && turmaDe(a.matricula) !== turma) return false;
      if (tipo && (r.tp || 'refeicao') !== tipo) return false;
      if (met && r.m !== met) return false;
      if (sf && r.fs !== 'sem_foto') return false;
      if (fo && r.dh) return false;
      return true;
    }).reverse();
    pagina = 0; desenhar();
  }
  function desenhar() {
    const ativos = filtrada.filter((r) => !r.ex);
    $('#r-resumo').innerHTML = `<b>${ativos.length}</b> registro(s) (${ativos.filter((r) => r.tp !== 'lanche').length} refeição · ${ativos.filter((r) => r.tp === 'lanche').length} lanche) · ${new Set(ativos.map((r) => r.a)).size} aluno(s) · ${ativos.filter((r) => r.fs === 'sem_foto').length} sem foto · ${ativos.filter((r) => !r.dh).length} fora do horário · ${esc(periodo.rotulo)}`;
    const pg = filtrada.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA);
    $('#r-corpo').innerHTML = pg.map((r) => {
      const a = A.get(r.a) || {};
      return `<tr class="clicavel ${r.ex ? 'excluido' : r.fs === 'sem_foto' ? 'sem-foto' : ''}" data-id="${r.id}">
        <td class="num">${fmtData(r.dt)}</td><td class="num">${r.h.slice(0, 5)}</td>
        <td>${r.tp === 'lanche' ? '<span class="selo azul">Lanche</span>' : '<span class="selo verde">Refeição</span>'}</td>
        <td>${esc(a.nome || '?')}<br><small class="mudo">${esc(a.matricula || '')}</small>${r.x ? ' <span class="selo azul">extra</span>' : ''}${r.obs ? ` <span class="selo ambar" title="${esc(r.obs)}">obs.</span>` : ''}</td>
        <td class="pequeno"><b>${esc(turmaDe(a.matricula))}</b><br>${esc(a.curso || '')}</td><td>${METODO[r.m]}</td>
        <td>${r.fs === 'sem_foto' ? `<span class="selo vermelho">${ico('semcamera')} SEM FOTO</span><br><small>${esc(r.j || '')}</small>` : r.fs === 'pendente' ? '<span class="selo">enviando</span>' : `<span class="selo verde">${ico('camera')} ok</span>`}</td>
        <td>${r.tp === 'lanche' ? '<span class="mudo pequeno">livre</span>' : r.dh ? '<span class="selo verde">dentro</span>' : `<span class="selo ambar">${ico('relogio')} fora</span>`}</td>
        <td class="pequeno">${esc(r.op || '')}${r.off ? '<br><small class="mudo">enviado depois (offline)</small>' : ''}</td></tr>`;
    }).join('') || '<tr><td colspan="9" class="vazio">Nenhum registro encontrado.</td></tr>';
    const tot = Math.ceil(filtrada.length / POR_PAGINA);
    $('#r-pag').innerHTML = tot > 1 ? `Página ${pagina + 1} de ${tot} <button class="btn pequeno" data-p="-1" ${pagina ? '' : 'disabled'}>Anterior</button><button class="btn pequeno" data-p="1" ${pagina < tot - 1 ? '' : 'disabled'}>Próxima</button>` : '';
  }

  // ---------------------------------------------------------------- detalhe
  async function detalhe(r) {
    const a = A.get(r.a) || {};
    const m = modal({
      titulo: `${a.nome || 'Aluno'} · ${fmtData(r.dt)} ${r.h.slice(0, 5)}`, largo: true,
      corpo: `<div class="fotos-par">
          <div class="foto-box" data-cad>Carregando…<span class="rotulo">Cadastro</span></div>
          <div class="foto-box ${r.fs === 'sem_foto' ? 'sem' : ''}" data-agora>${r.fs === 'sem_foto' ? 'SEM FOTO' : r.fs === 'pendente' ? 'Foto ainda sendo enviada pelo balcão' : 'Carregando…'}<span class="rotulo">No registro</span></div></div>
        ${r.ex ? `<div class="caixa erro-caixa"><b>Registro excluído.</b> Motivo: ${esc(r.exm || '')}</div>` : ''}
        ${r.fs === 'sem_foto' ? `<div class="caixa erro-caixa"><b>Sem foto.</b> Justificativa: ${esc(r.j || '')}</div>` : ''}
        ${r.obs ? `<div class="caixa aviso-caixa"><b>Observação:</b> ${esc(r.obs)}</div>` : ''}
        <dl class="dl"><dt>Aluno</dt><dd>${esc(a.nome || '')} · ${esc(a.matricula || '')}</dd><dt>Curso</dt><dd>${esc(a.curso || '')}</dd>
          <dt>Tipo</dt><dd>${TIPO[r.tp || 'refeicao']}</dd>
          <dt>Data e hora</dt><dd>${fmtData(r.dt)} às ${esc(r.h)} ${r.tp === 'lanche' ? '' : r.dh ? '<span class="selo verde">dentro do horário</span>' : '<span class="selo ambar">fora do horário</span>'}</dd>
          <dt>Identificação</dt><dd>${METODO[r.m]}${r.d != null ? ` (distância facial ${Number(r.d).toFixed(3)})` : ''}</dd>
          <dt>Atendente</dt><dd>${esc(r.op || '')}</dd><dt>Recebido pelo servidor</dt><dd>${fmtDataHora(r.rc)}${r.off ? ' · registrado sem internet e enviado depois' : ''}</dd>
          ${r.x ? '<dt>Refeição extra</dt><dd>Sim (liberada por administrador)</dd>' : ''}<dt>Código</dt><dd class="pequeno mudo">${r.id}</dd></dl>`,
      botoes: admin ? [
        r.ex ? { texto: `${ico('atualizar')} Restaurar`, acao: async () => { await api('refeicao_restaurar', { p_id: r.id }); aviso('Registro restaurado.', 'ok'); carregar(); } }
          : { texto: `${ico('lixo')} Excluir`, classe: 'perigo', acao: async (fechar) => {
            const motivo = await pedirTexto('Excluir registro', 'Motivo da exclusão (fica na auditoria)');
            if (!motivo) return false;
            try { await api('refeicao_excluir', { p_id: r.id, p_motivo: motivo }); aviso('Registro excluído.', 'ok'); fechar(); carregar(); } catch (e) { aviso(e.message, 'erro'); }
            return false;
          } },
        { texto: `${ico('editar')} Editar`, classe: 'primario', acao: (fechar) => { fechar(); editar(r); return false; } }
      ] : []
    });
    const f = await foto(a.foto_base_id || a.foto_suap_id).catch(() => null);
    const g = r.f ? await foto(r.f).catch(() => null) : null;
    const cad = $('[data-cad]', m.el), ag = $('[data-agora]', m.el);
    if (cad) cad.innerHTML = (f ? `<img src="${f}" alt="">` : 'Sem foto de cadastro') + '<span class="rotulo">Cadastro</span>';
    if (ag && r.f) ag.innerHTML = (g ? `<img src="${g}" alt="">` : 'Não foi possível carregar a foto') + '<span class="rotulo">No registro</span>';
  }

  function seletorAluno(valorId = '') {
    const a = A.get(valorId);
    return `<label class="campo"><span>Aluno</span><input type="text" list="dl-alunos" data-aluno value="${a ? esc(`${a.nome} · ${a.matricula || ''}`) : ''}" placeholder="Digite o nome ou a matrícula">
      <datalist id="dl-alunos">${alunos.map((x) => `<option value="${esc(`${x.nome} · ${x.matricula || ''}`)}">`).join('')}</datalist></label>`;
  }
  const idDoSeletor = (el) => { const v = $('[data-aluno]', el).value; const x = alunos.find((a) => `${a.nome} · ${a.matricula || ''}` === v); return x?.id || null; };
  const paraISO = (v) => `${v}:00-03:00`;

  function editar(r) {
    modal({
      titulo: 'Editar registro', corpo: `${seletorAluno(r.a)}
        <label class="campo"><span>Tipo</span><select data-tp><option value="refeicao" ${r.tp !== 'lanche' ? 'selected' : ''}>Refeição</option><option value="lanche" ${r.tp === 'lanche' ? 'selected' : ''}>Lanche</option></select></label>
        <label class="campo"><span>Data e hora</span><input type="datetime-local" data-dh value="${r.dt}T${r.h.slice(0, 5)}"></label>
        ${r.fs === 'sem_foto' ? `<label class="campo"><span>Justificativa (sem foto)</span><textarea data-j>${esc(r.j || '')}</textarea></label>` : ''}
        <label class="campo"><span>Observação</span><textarea data-o>${esc(r.obs || '')}</textarea></label>
        <label class="check"><input type="checkbox" data-x ${r.x ? 'checked' : ''}> Registro extra (segundo no mesmo dia)</label>
        <div class="caixa info pequeno">Todas as alterações ficam registradas na auditoria, com o valor anterior.</div>`,
      botoes: [{ texto: 'Cancelar' }, { texto: 'Salvar', classe: 'primario', acao: async (fechar, el) => {
        const aid = idDoSeletor(el); if (!aid) { aviso('Escolha um aluno da lista.', 'erro'); return false; }
        const dados = { aluno_id: aid, tipo: $('[data-tp]', el).value, registrado_em: paraISO($('[data-dh]', el).value), observacao: $('[data-o]', el).value, extra: $('[data-x]', el).checked };
        if ($('[data-j]', el)) dados.justificativa = $('[data-j]', el).value;
        try { await api('refeicao_editar', { p_id: r.id, p_dados: dados }); aviso('Registro atualizado.', 'ok'); fechar(); carregar(); } catch (e) { aviso(e.message, 'erro'); }
        return false;
      } }]
    });
  }

  function novoManual() {
    const agora = `${hojeISO()}T${horaDe()}`;
    modal({
      titulo: 'Registro manual', corpo: `<div class="caixa aviso-caixa pequeno">Use quando o balcão não pôde ser usado. O registro fica marcado como <b>manual e sem foto</b> e exige justificativa.</div>
        ${seletorAluno()}
        <label class="campo"><span>Tipo</span><select data-tp><option value="refeicao">Refeição</option><option value="lanche">Lanche</option></select></label>
        <label class="campo"><span>Data e hora</span><input type="datetime-local" data-dh value="${agora}"></label>
        <label class="campo"><span>Justificativa</span><textarea data-j placeholder="Ex.: notebook do balcão sem energia; lista em papel assinada"></textarea></label>
        <label class="check"><input type="checkbox" data-x> Registro extra (o aluno já tem refeição ou lanche nesse dia)</label>`,
      botoes: [{ texto: 'Cancelar' }, { texto: 'Registrar', classe: 'primario', acao: async (fechar, el) => {
        const aid = idDoSeletor(el); if (!aid) { aviso('Escolha um aluno da lista.', 'erro'); return false; }
        try {
          const r = await api('registrar_refeicao', { p_id: uuid(), p_aluno_id: aid, p_registrado_em: paraISO($('[data-dh]', el).value),
            p_metodo: 'manual', p_tem_foto: false, p_justificativa: $('[data-j]', el).value, p_extra: $('[data-x]', el).checked, p_tipo: $('[data-tp]', el).value });
          if (r.status === 'ok') { aviso(`Registrado: ${r.nome} às ${r.hora}.`, 'ok'); fechar(); carregar(); }
          else if (r.status === 'duplicado') aviso(`Já existe ${r.tipo === 'lanche' ? 'lanche' : 'refeição'} nesse dia às ${r.hora}. Marque "registro extra" se for o caso.`, 'erro');
          else if (r.status === 'justificativa_obrigatoria') aviso('Escreva a justificativa (mínimo 5 caracteres).', 'erro');
          else aviso(r.status, 'erro');
        } catch (e) { aviso(e.message, 'erro'); }
        return false;
      } }]
    });
  }

  // ---------------------------------------------------------------- eventos
  D.seletorPeriodo($('#r-periodo'), cfg, (p) => { periodo = p; carregar(); }, 'hoje');
  $('#r-busca').oninput = debounce(filtrar, 200);
  ['#r-curso', '#r-metodo', '#r-tipo', '#r-turma', '#r-semfoto', '#r-fora'].forEach((s) => ($(s).onchange = filtrar));
  $('#r-excl').onchange = carregar;
  $('#r-corpo').onclick = (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) detalhe(filtrada.find((r) => r.id === tr.dataset.id)); };
  $('#r-pag').onclick = (e) => { const b = e.target.closest('[data-p]'); if (b) { pagina += Number(b.dataset.p); desenhar(); } };
  if (admin) $('#r-novo').onclick = novoManual;
  $('#r-csv').onclick = () => baixarCsv(`pases_registros_${periodo.ini}_a_${periodo.fim}`,
    ['data', 'hora', 'tipo', 'aluno', 'matricula', 'turma', 'curso', 'metodo', 'foto', 'justificativa_sem_foto', 'dentro_do_horario', 'extra', 'atendente', 'offline', 'observacao', 'excluido', 'motivo_exclusao', 'id'],
    filtrada.map((r) => { const a = A.get(r.a) || {}; return [fmtData(r.dt), r.h, TIPO[r.tp || 'refeicao'], a.nome, a.matricula, turmaDe(a.matricula), a.curso, METODO[r.m], r.fs === 'sem_foto' ? 'SEM FOTO' : r.fs, r.j, r.dh ? 'sim' : 'não', r.x ? 'sim' : '', r.op, r.off ? 'sim' : '', r.obs, r.ex ? 'sim' : '', r.exm, r.id]; }));
}
