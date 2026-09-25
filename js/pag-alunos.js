// Alunos: cadastro, importação, fotos (SUAP e webcam) e referências faciais
import { $, $$, esc, ico, modal, aviso, confirmar, pedirTexto, fmtDataHora, baixarCsv, lerCsv, fmtData, fmtCpf, cpfValido, soDigitos, normalizar, debounce, hojeISO, addDias, MESES } from './util.js';
import { api, gas, gasConfigurado, foto, fotos, guardarFotoLocal } from './api.js';
import { abrirCamera, pararCamera, capturar, reduzirImagem, preferencias } from './camera.js';
import { carregarFace, descritorDeImagem, imagemDeDataUrl } from './face.js';
import * as D from './dados.js';

export async function render(el, { cabecalho, perfil }) {
  const admin = perfil === 'admin';
  let lista = await D.alunos(true);

  el.innerHTML = cabecalho('Alunos do PASES', 'Beneficiários cadastrados. Só alunos ativos conseguem registrar refeição no balcão.',
    admin ? `<button class="btn" id="a-novo">${ico('mais')} Novo aluno</button><button class="btn" id="a-imp">${ico('enviar')} Importar planilha</button>
      <button class="btn" id="a-suap">${ico('camera')} Fotos do SUAP</button><button class="btn" id="a-ref">${ico('rosto')} Gerar referências faciais</button>
      <button class="btn" id="a-csv">${ico('baixar')} CSV</button>` : `<button class="btn" id="a-csv">${ico('baixar')} CSV</button>`) + `
    <div class="barra-filtros">
      <label class="campo" style="min-width:260px"><span>Buscar</span><input type="search" id="a-busca" placeholder="Nome, matrícula ou CPF"></label>
      <label class="campo"><span>Mostrar</span><select id="a-filtro">
        <option value="ativos">Ativos</option><option value="">Todos</option><option value="inativos">Inativos</option><option value="cancelados">Cadastro cancelado</option>
        <option value="semcpf">Sem CPF</option><option value="semref">Sem referência facial</option><option value="semsuap">Sem foto do SUAP</option><option value="pend">Com rosto a validar</option></select></label>
    </div>
    <div id="a-resumo" class="pequeno mudo" style="margin-bottom:8px"></div>
    <div class="tabela-wrap"><table class="tabela"><thead><tr><th>Aluno</th><th>Curso</th><th>CPF</th><th>Situação</th><th>Reconhecimento</th><th class="num">Refeições</th><th>Última</th></tr></thead>
    <tbody id="a-corpo"></tbody></table></div>`;

  function filtrar() {
    const q = normalizar($('#a-busca').value.trim()), f = $('#a-filtro').value, qd = soDigitos(q);
    const t = lista.filter((a) => {
      if (q && !(normalizar(`${a.nome} ${a.matricula}`).includes(q) || (qd.length >= 3 && (a.cpf || '').includes(qd)))) return false;
      if (f === 'ativos' && !a.ativo) return false; if (f === 'inativos' && a.ativo) return false;
      if (f === 'cancelados' && !a.cancelado_em) return false;
      if (f === 'semcpf' && a.cpf) return false; if (f === 'semref' && a.faces) return false;
      if (f === 'semsuap' && a.foto_suap_id) return false; if (f === 'pend' && !a.faces_pendentes) return false;
      return true;
    });
    const at = lista.filter((a) => a.ativo);
    $('#a-resumo').innerHTML = `${t.length} exibido(s) · ${at.length} ativos · ${lista.filter((a) => a.cancelado_em).length} cancelado(s) · ${at.filter((a) => !a.cpf).length} ativos sem CPF · ${at.filter((a) => !a.faces).length} ativos sem referência facial`;
    $('#a-corpo').innerHTML = t.map((a) => {
      const fc = a.faces || {};
      return `<tr class="clicavel" data-id="${a.id}"><td>${esc(a.nome)}${a.cancelado_em ? ' <span class="selo vermelho-suave">cancelado</span>' : a.ativo ? '' : ' <span class="selo">inativo</span>'}<br><small class="mudo">${esc(a.matricula || '')}</small></td>
        <td class="pequeno">${esc(a.curso || '')}</td><td class="num pequeno">${a.cpf ? esc(admin ? fmtCpf(a.cpf) : a.cpf) : '<span class="selo vermelho-suave">sem CPF</span>'}</td>
        <td class="pequeno">${esc(a.situacao_suap || '')}</td>
        <td>${fc.suap ? '<span class="selo verde">SUAP</span> ' : ''}${fc.manual ? '<span class="selo verde">cadastro</span> ' : ''}${fc.webcam ? `<span class="selo azul">balcão ×${fc.webcam}</span> ` : ''}${a.faces_pendentes ? '<span class="selo ambar">validar</span>' : ''}${!a.faces ? '<span class="selo">sem referência</span>' : ''}</td>
        <td class="num">${a.total}</td><td class="pequeno">${a.ultima ? fmtData(a.ultima) : '<span class="mudo">nunca</span>'}</td></tr>`;
    }).join('') || '<tr><td colspan="7" class="vazio">Nenhum aluno encontrado.</td></tr>';
  }
  async function recarregar() { lista = await D.alunos(true); filtrar(); }

  // ---------------------------------------------------------------- ficha do aluno
  async function ficha(a) {
    a = a || { ativo: true };
    const novo = !a.id;
    const corpo = `
      <div class="fotos-par">
        <div><div class="foto-box" data-fsuap>${a.foto_suap_id ? 'Carregando…' : 'Sem foto do SUAP'}<span class="rotulo">SUAP</span></div></div>
        <div><div class="foto-box" data-fbase>${a.foto_base_id ? 'Carregando…' : 'Sem foto de referência'}<span class="rotulo">Referência (webcam)</span></div>
          ${admin && !novo ? `<div class="linha-flex" style="margin-top:8px"><button class="btn pequeno" data-cap>${ico('camera')} Capturar na webcam</button>
            <label class="btn pequeno">${ico('enviar')} Enviar arquivo<input type="file" accept="image/*" data-arq hidden></label>
            ${a.faces ? `<button class="btn pequeno perigo" data-apagaref>Apagar referências</button>` : ''}</div>` : ''}</div>
      </div>
      <form class="grade" data-form style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr))">
        <label class="campo" style="grid-column:1/-1"><span>Nome completo</span><input type="text" name="nome" value="${esc(a.nome || '')}" required ${admin ? '' : 'disabled'}></label>
        <label class="campo"><span>CPF</span><input type="text" name="cpf" value="${esc(admin ? fmtCpf(a.cpf || '') : a.cpf || '')}" inputmode="numeric" ${admin ? '' : 'disabled'}></label>
        <label class="campo"><span>Matrícula</span><input type="text" name="matricula" value="${esc(a.matricula || '')}" ${admin ? '' : 'disabled'}></label>
        <label class="campo"><span>Curso</span><input type="text" name="curso" value="${esc(a.curso || '')}" list="dl-cursos" ${admin ? '' : 'disabled'}>
          <datalist id="dl-cursos">${[...new Set(lista.map((x) => x.curso).filter(Boolean))].sort().map((c) => `<option value="${esc(c)}">`).join('')}</datalist></label>
        <label class="campo"><span>Nível</span><input type="text" name="nivel" value="${esc(a.nivel || '')}" list="dl-niveis" ${admin ? '' : 'disabled'}><datalist id="dl-niveis"><option value="Técnico"><option value="Graduação"></datalist></label>
        <label class="campo"><span>Situação no SUAP</span><input type="text" name="situacao_suap" value="${esc(a.situacao_suap || '')}" ${admin ? '' : 'disabled'}></label>
        <label class="campo"><span>Link da foto no SUAP</span><input type="text" name="foto_suap_url" value="${esc(a.foto_suap_url || '')}" ${admin ? '' : 'disabled'}></label>
        <label class="campo" style="grid-column:1/-1"><span>Observação</span><textarea name="observacao" ${admin ? '' : 'disabled'}>${esc(a.observacao || '')}</textarea></label>
        <label class="check"><input type="checkbox" name="ativo" ${a.ativo ? 'checked' : ''} ${admin && !a.cancelado_em ? '' : 'disabled'}> Ativo no PASES (pode registrar refeição)${a.cancelado_em ? ' · use "Reativar cadastro"' : ''}</label>
      </form>
      ${a.cancelado_em ? `<div class="caixa erro-caixa"><b>Cadastro cancelado</b> em ${fmtDataHora(a.cancelado_em)}. Motivo: ${esc(a.cancelado_motivo || '')}. O histórico de refeições foi mantido; as referências faciais foram apagadas.</div>` : ''}
      ${novo ? '' : `<div><h3 style="margin-bottom:8px">Refeições nos últimos 12 meses</h3><div data-hist class="pequeno mudo">Carregando…</div></div>`}`;
    const m = modal({
      titulo: novo ? 'Novo aluno' : a.nome, largo: true, corpo,
      botoes: admin ? [
        ...(novo ? [] : a.cancelado_em ? [
          { texto: `${ico('atualizar')} Reativar cadastro`, acao: async (fechar) => {
            if (!(await confirmar(`Reativar o cadastro de ${esc(a.nome)}? Ele volta a poder registrar no balcão.`))) return false;
            try { await api('aluno_reativar', { p_aluno_id: a.id }); aviso('Cadastro reativado.', 'ok'); fechar(); recarregar(); } catch (e) { aviso(e.message, 'erro'); }
            return false; } },
          ...(a.total ? [] : [{ texto: `${ico('lixo')} Excluir definitivamente`, classe: 'perigo', acao: async (fechar) => {
            if (!(await confirmar(`Excluir definitivamente o cadastro de ${esc(a.nome)}? Não há refeições registradas. Esta ação não pode ser desfeita.`, { perigo: true, ok: 'Excluir' }))) return false;
            try { await api('aluno_excluir', { p_aluno_id: a.id }); aviso('Cadastro excluído.', 'ok'); fechar(); recarregar(); } catch (e) { aviso(e.message, 'erro'); }
            return false; } }])
        ] : [
          { texto: `${ico('lixo')} Cancelar cadastro`, classe: 'perigo', acao: async (fechar) => {
            const motivo = await pedirTexto('Cancelar cadastro', `Motivo do cancelamento de ${a.nome} (fica na auditoria)`,
              { sugestoes: ['Saiu do programa', 'Concluiu o curso', 'Transferido', 'Evadido', 'Desistiu do benefício'] });
            if (!motivo) return false;
            try { const r = await api('aluno_cancelar', { p_aluno_id: a.id, p_motivo: motivo });
              aviso(`Cadastro cancelado.${r.referencias_apagadas ? ` ${r.referencias_apagadas} referência(s) facial(is) apagada(s).` : ''}`, 'ok'); fechar(); recarregar();
            } catch (e) { aviso(e.message, 'erro'); }
            return false; } }
        ]),
        { texto: 'Fechar' }, { texto: 'Salvar', classe: 'primario', acao: async (fechar, el) => {
        const f = $('[data-form]', el);
        const cpf = soDigitos(f.cpf.value);
        if (cpf && !cpfValido(cpf)) { aviso('CPF inválido.', 'erro'); return false; }
        const dados = { id: a.id, nome: f.nome.value, cpf, matricula: f.matricula.value, curso: f.curso.value, nivel: f.nivel.value,
          situacao_suap: f.situacao_suap.value, foto_suap_url: f.foto_suap_url.value, observacao: f.observacao.value, ativo: f.ativo.checked };
        try { await api('aluno_salvar', { p_dados: dados }); aviso('Aluno salvo.', 'ok'); fechar(); recarregar(); } catch (e) { aviso(e.message, 'erro'); }
        return false;
      } }] : []
    });
    const el2 = m.el;
    const mostrar = async (sel, id, rot) => { const u = id ? await foto(id).catch(() => null) : null; const b = $(sel, el2); if (b && id) b.innerHTML = (u ? `<img src="${u}" alt="">` : 'Não foi possível carregar') + `<span class="rotulo">${rot}</span>`; };
    mostrar('[data-fsuap]', a.foto_suap_id, 'SUAP'); mostrar('[data-fbase]', a.foto_base_id, 'Referência (webcam)');
    if (!novo) {
      api('refeicoes_listar', { p_ini: addDias(hojeISO(), -365), p_fim: hojeISO(), p_aluno_id: a.id }).then((rs) => {
        const pm = {}; rs.forEach((r) => { const k = r.dt.slice(0, 7); pm[k] = (pm[k] || 0) + 1; });
        const h = $('[data-hist]', el2); if (!h) return;
        h.innerHTML = rs.length ? `${rs.length} refeição(ões) · ${rs.filter((r) => r.fs === 'sem_foto').length} sem foto · ${rs.filter((r) => !r.dh).length} fora do horário<br>` +
          Object.entries(pm).sort().reverse().map(([k, n]) => `<span class="selo" style="margin:3px 4px 0 0">${MESES[+k.slice(5) - 1].slice(0, 3)}/${k.slice(2, 4)}: ${n}</span>`).join('') : 'Nenhuma refeição registrada.';
      }).catch(() => {});
    }
    if (!admin || novo) return;
    // A ficha continua aberta: a foto aparece no quadro "Referência" com o resultado, para o administrador conferir.
    const boxBase = () => $('[data-fbase]', el2);
    const estadoBase = (dataUrl, selo) => {
      const b = boxBase(); if (!b) return;
      b.innerHTML = `<img src="${dataUrl}" alt=""><span class="rotulo">Referência (webcam)</span>` +
        `<span class="selo ${selo.cor}" style="position:absolute;left:8px;bottom:8px">${selo.texto}</span>`;
    };
    const usarFoto = async (dataUrl, canvas) => {
      estadoBase(dataUrl, { cor: 'ambar', texto: 'Enviando…' });
      try {
        const up = await gas('upload', { tipo: 'base', nome: `base_${a.matricula || a.id}`, dados: dataUrl });
        guardarFotoLocal(up.id, dataUrl);
        await api('aluno_foto', { p_aluno_id: a.id, p_campo: 'base', p_foto_id: up.id });
        a.foto_base_id = up.id;
        estadoBase(dataUrl, { cor: 'ambar', texto: 'Foto anexada · procurando o rosto…' });
        await carregarFace();
        const r = await descritorDeImagem(canvas || await imagemDeDataUrl(dataUrl));
        if (!r) {
          estadoBase(dataUrl, { cor: 'vermelho', texto: 'Foto anexada, mas sem rosto detectado' });
          aviso('Foto anexada, mas nenhum rosto foi detectado nela. Envie outra, de frente e bem iluminada.', 'erro');
        } else {
          await api('salvar_face', { p_aluno_id: a.id, p_descriptor: r.descritor, p_origem: 'manual', p_foto_id: up.id });
          estadoBase(dataUrl, { cor: 'verde', texto: 'Foto anexada · referência facial salva' });
          aviso('Foto de referência salva.', 'ok');
        }
        recarregar();
      } catch (e) {
        estadoBase(dataUrl, { cor: 'vermelho', texto: 'Falha no envio' });
        aviso(e.message, 'erro');
      }
    };
    $('[data-cap]', el2).onclick = async () => { const r = await capturaWebcam(); if (r) usarFoto(r.dataUrl, r.canvas); };
    $('[data-arq]', el2).onchange = async (e) => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; const r = await reduzirImagem(f, 480); usarFoto(r.dataUrl, r.canvas); };
    const ap = $('[data-apagaref]', el2);
    if (ap) ap.onclick = async () => {
      if (!(await confirmar('Apagar todas as referências faciais deste aluno? Ele precisará digitar o CPF no próximo almoço para criar uma nova.', { perigo: true, ok: 'Apagar' }))) return;
      await api('faces_apagar_aluno', { p_aluno_id: a.id }); aviso('Referências apagadas.', 'ok'); m.fechar(); recarregar();
    };
  }

  function capturaWebcam() {
    let stream = null, cap = null;
    const m = modal({
      titulo: 'Capturar foto de referência', corpo: `<div class="foto-box" style="aspect-ratio:4/3;background:#000"><video data-v autoplay muted playsinline style="width:100%;height:100%;object-fit:cover;${preferencias.espelhar ? 'transform:scaleX(-1)' : ''}"></video></div>
        <div class="foto-box oculto" data-prev></div><p class="mudo pequeno" style="margin:0">Aluno de frente, rosto inteiro visível, sem boné ou óculos escuros.</p>`,
      aoAbrir: async (el) => { try { stream = await abrirCamera($('[data-v]', el)); } catch (e) { aviso(e.message, 'erro'); } },
      // 1º clique captura e mostra a prévia; 2º clique ("Usar esta foto") confirma. "Tirar outra" volta ao vídeo.
      botoes: [{ texto: 'Cancelar' }, { texto: 'Tirar outra', classe: 'oculto', fechar: false, acao: (fechar, el) => {
        cap = null; $('[data-prev]', el).classList.add('oculto'); $('[data-v]', el).parentElement.classList.remove('oculto');
        const bs = el.querySelectorAll('footer .btn'); bs[1].classList.add('oculto'); bs[2].innerHTML = `${ico('camera')} Capturar`;
        return false;
      } }, { texto: `${ico('camera')} Capturar`, classe: 'primario', acao: (fechar, el) => {
        if (cap) { fechar(cap); return false; }
        cap = capturar($('[data-v]', el), 480, 0.85); if (!cap) { aviso('Câmera sem imagem.', 'erro'); return false; }
        const p = $('[data-prev]', el); p.innerHTML = `<img src="${cap.dataUrl}" alt=""><span class="rotulo">Prévia</span>`;
        p.classList.remove('oculto'); $('[data-v]', el).parentElement.classList.add('oculto');
        const bs = el.querySelectorAll('footer .btn'); bs[1].classList.remove('oculto'); bs[2].innerHTML = 'Usar esta foto';
        return false;
      } }]
    });
    return m.promessa.finally(() => pararCamera(stream));
  }

  // ---------------------------------------------------------------- importação
  function importar() {
    modal({
      titulo: 'Importar alunos (planilha CSV)', largo: true,
      corpo: `<div class="caixa info pequeno">Use um arquivo CSV (salve a planilha como "CSV separado por ponto e vírgula"). Colunas reconhecidas:
          <b>matricula, nome, cpf, curso, nivel, situacao_suap, ativo, foto_suap_url</b>. Alunos já cadastrados são localizados pela matrícula (ou CPF) e atualizados; os demais são incluídos.</div>
        <input type="file" accept=".csv,text/csv" data-arq><div data-prev></div>`,
      aoAbrir: (el, fechar) => {
        $('[data-arq]', el).onchange = async (e) => {
          const f = e.target.files[0]; if (!f) return;
          const linhas = lerCsv(await f.text());
          const itens = linhas.map((l) => ({
            matricula: l.matricula || l.matricula_suap || '', nome: l.nome || l.nome_completo || '', cpf: soDigitos(l.cpf || ''),
            curso: l.curso || l.descricao_do_curso || '', nivel: l.nivel || l.nivel_de_ensino || '', situacao_suap: l.situacao_suap || l.situacao || '',
            foto_suap_url: l.foto_suap_url || l.url_foto || '',
            ativo: l.ativo === undefined || l.ativo === '' ? undefined : /^(s|sim|true|1|ativo)$/i.test(l.ativo)
          })).filter((x) => x.nome);
          const semCpf = itens.filter((x) => !x.cpf).length, cpfRuim = itens.filter((x) => x.cpf && !cpfValido(x.cpf.padStart(11, '0'))).length;
          $('[data-prev]', el).innerHTML = `<p><b>${itens.length}</b> aluno(s) no arquivo · ${semCpf} sem CPF · ${cpfRuim} com CPF inválido (serão recusados)</p>
            <div class="tabela-wrap" style="max-height:240px"><table class="tabela"><thead><tr><th>Matrícula</th><th>Nome</th><th>CPF</th><th>Curso</th><th>Ativo</th></tr></thead><tbody>
            ${itens.slice(0, 50).map((x) => `<tr><td>${esc(x.matricula)}</td><td>${esc(x.nome)}</td><td>${esc(x.cpf)}</td><td class="pequeno">${esc(x.curso)}</td><td>${x.ativo === undefined ? '' : x.ativo ? 'sim' : 'não'}</td></tr>`).join('')}</tbody></table></div>
            <div class="linha-flex" style="margin-top:12px"><button class="btn primario" data-ir>Importar ${itens.length} aluno(s)</button></div><div data-res></div>`;
          $('[data-ir]', el).onclick = async (ev) => {
            ev.target.disabled = true; let ins = 0, upd = 0, erros = [];
            for (let i = 0; i < itens.length; i += 150) {
              const r = await api('alunos_importar', { p_lista: itens.slice(i, i + 150) });
              ins += r.inseridos; upd += r.atualizados; erros = erros.concat((r.erros || []).map((x) => ({ ...x, linha: x.linha + i })));
            }
            $('[data-res]', el).innerHTML = `<div class="caixa ok-caixa" style="margin-top:12px">${ins} incluído(s) · ${upd} atualizado(s) · ${erros.length} com erro</div>
              ${erros.map((x) => `<div class="pequeno">Linha ${x.linha}: ${esc(x.nome || '')}: ${esc(x.erro)}</div>`).join('')}`;
            recarregar();
          };
        };
      }
    });
  }

  // ---------------------------------------------------------------- fotos do SUAP e referências faciais
  function progresso(titulo) {
    let cancelado = false;
    const m = modal({ titulo, fecharFora: false, corpo: `<div data-txt>Preparando…</div><progress data-p value="0" max="1" style="width:100%"></progress><div data-log class="pequeno" style="max-height:200px;overflow:auto"></div>`,
      botoes: [{ texto: 'Parar', acao: () => { cancelado = true; return false; } }] });
    return {
      get cancelado() { return cancelado; },
      passo(i, n, txt) { $('[data-p]', m.el).max = n; $('[data-p]', m.el).value = i; $('[data-txt]', m.el).textContent = txt; },
      log(t) { $('[data-log]', m.el).insertAdjacentHTML('beforeend', `<div>${t}</div>`); },
      fim(txt) { $('[data-txt]', m.el).innerHTML = txt; const b = $('footer .btn', m.el); b.textContent = 'Fechar'; b.onclick = () => m.fechar(); }
    };
  }

  async function fotosSuap() {
    if (!gasConfigurado()) return aviso('Configure o Apps Script (config.js) antes.', 'erro');
    const alvo = lista.filter((a) => a.foto_suap_url && !a.foto_suap_id);
    if (!alvo.length) return aviso('Todos os alunos com link do SUAP já têm a foto importada.');
    if (!(await confirmar(`Buscar a foto do SUAP de ${alvo.length} aluno(s) e guardar no Drive? Isso só funciona se os links do SUAP abrirem sem login.`))) return;
    const p = progresso('Importando fotos do SUAP'); let ok = 0, falhas = 0;
    for (let i = 0; i < alvo.length && !p.cancelado; i += 10) {
      p.passo(i, alvo.length, `${i} de ${alvo.length}…`);
      try {
        const r = await gas('importar_suap', { itens: alvo.slice(i, i + 10).map((a) => ({ aluno_id: a.id, matricula: a.matricula, url: a.foto_suap_url })) }, { timeout: 300000 });
        for (const x of r.resultados) {
          if (x.id) { await api('aluno_foto', { p_aluno_id: x.aluno_id, p_campo: 'suap', p_foto_id: x.id }); ok++; }
          else { falhas++; if (falhas <= 5) p.log(`${esc(lista.find((a) => a.id === x.aluno_id)?.nome || '')}: ${esc(x.erro)}`); }
        }
        if (i === 0 && ok === 0 && falhas >= 5) { p.log('<b>Todas as primeiras tentativas falharam; provavelmente o SUAP exige login para as fotos. Interrompido.</b>'); break; }
      } catch (e) { p.log(esc(e.message)); break; }
    }
    p.fim(`${ok} foto(s) importada(s), ${falhas} falha(s).${ok ? ' Agora use "Gerar referências faciais".' : ''}`);
    recarregar();
  }

  async function gerarReferencias() {
    const alvo = lista.filter((a) => a.foto_suap_id && !(a.faces || {}).suap);
    if (!alvo.length) return aviso('Nenhuma foto do SUAP pendente de processamento.');
    const p = progresso('Gerando referências faciais');
    p.passo(0, alvo.length, 'Carregando o reconhecimento facial…');
    try { await carregarFace(); } catch (e) { return p.fim('Não foi possível carregar o reconhecimento facial: ' + esc(e.message)); }
    let ok = 0, sem = 0;
    for (let i = 0; i < alvo.length && !p.cancelado; i += 10) {
      const lote = alvo.slice(i, i + 10);
      const fs = await fotos(lote.map((a) => a.foto_suap_id)).catch(() => ({}));
      for (const [j, a] of lote.entries()) {
        p.passo(i + j, alvo.length, `${i + j + 1} de ${alvo.length}: ${a.nome}`);
        const url = fs[a.foto_suap_id];
        if (!url) { sem++; p.log(`${esc(a.nome)}: foto indisponível`); continue; }
        const r = await descritorDeImagem(await imagemDeDataUrl(url), { minimoLargura: 40 }).catch(() => null);
        if (!r) { sem++; p.log(`${esc(a.nome)}: nenhum rosto detectado na foto do SUAP`); continue; }
        await api('salvar_face', { p_aluno_id: a.id, p_descriptor: r.descritor, p_origem: 'suap', p_foto_id: a.foto_suap_id }); ok++;
      }
    }
    p.fim(`${ok} referência(s) criada(s). ${sem} foto(s) sem rosto utilizável: esses alunos criarão a referência ao digitar o CPF no balcão.`);
    recarregar();
  }

  // ---------------------------------------------------------------- eventos
  $('#a-busca').oninput = debounce(filtrar, 200);
  $('#a-filtro').onchange = filtrar;
  $('#a-corpo').onclick = (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) ficha(lista.find((a) => a.id === tr.dataset.id)); };
  $('#a-csv').onclick = () => baixarCsv('pases_alunos', ['nome', 'matricula', 'cpf', 'curso', 'nivel', 'situacao_suap', 'ativo', 'cancelado_em', 'motivo_cancelamento', 'refeicoes', 'ultima', 'referencia_facial'],
    lista.map((a) => [a.nome, a.matricula, a.cpf, a.curso, a.nivel, a.situacao_suap, a.ativo ? 'sim' : 'não', a.cancelado_em ? fmtData(a.cancelado_em.slice(0, 10)) : '', a.cancelado_motivo || '', a.total, fmtData(a.ultima), a.faces ? 'sim' : 'não']));
  if (admin) {
    $('#a-novo').onclick = () => ficha(null);
    $('#a-imp').onclick = importar;
    $('#a-suap').onclick = fotosSuap;
    $('#a-ref').onclick = gerarReferencias;
  }
  filtrar();
}
