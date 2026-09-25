// Balcão: tela do operador (notebook). Reconhecimento facial, CPF no teclado numérico, foto, fila offline.
import { $, esc, ico, uuid, idb, isoDe, hojeISO, horaDe, horaSegDe, cpfValido, sha256hex, modal, aviso, confirmar } from './util.js';
import { api, gas, gasConfigurado, relogio, foto, fotos, guardarFotoLocal, sessao } from './api.js';
import { abrirCamera, pararCamera, capturar, cameraAtiva, preferencias } from './camera.js';
import { carregarFace, detectarAoVivo, descritorDeImagem, Reconhecedor, semelhanca } from './face.js';

const JUSTIFICATIVAS = [
  'Falha ou desconexão da webcam',
  'Câmera sem imagem ou imagem escura',
  'Aluno sem condições de ser fotografado no momento',
  'Outro motivo'
];

export function montarBalcao(raiz, { aoSair }) {
  const S = {
    alunos: new Map(), porHash: new Map(), hoje: new Map(), ultimos: [], sal: '',
    config: { horario_inicio: '11:30', horario_fim: '13:30', reconhecimento: { ativo: true, limiar: 0.5, quadros: 3, confirmar: true } },
    rec: new Reconhecedor(), estado: 'aguardando', cpf: '', ultimoDigitoEm: 0,
    cand: null, seq: 0, semMatch: 0, candidato: null, ignorar: new Map(),
    camOk: false, faceOk: false, stream: null, parado: false, online: navigator.onLine, sinc: false,
    semFotoForcado: null, timers: [], resultadoTimer: null, confirmarTimer: null, emEnvio: new Set()
  };
  const canal = new BroadcastChannel('pases-tela-aluno');
  const tela = (m) => { try { canal.postMessage(m); } catch { /* janela fechada */ } };

  raiz.innerHTML = `
  <div class="balcao">
    <div class="balcao-topo">
      <img src="assets/simbolo-ifma.png" alt="">
      <div class="titulo"><b>Balcão PASES</b><small>Atendente: ${esc(sessao.usuario?.nome || '')}</small></div>
      <div class="relogio" id="k-relogio">--:--:--</div>
      <span class="pilula" id="k-horario"></span>
      <span class="pilula" id="k-total">Hoje: 0</span>
      <span class="pilula" id="k-rede"></span>
      <span class="pilula oculto" id="k-face"></span>
      <span class="espaco"></span>
      <button class="btn" id="k-tela">${ico('monitor')} Tela do aluno</button>
      <button class="btn" id="k-semfoto">${ico('semcamera')} Sem foto</button>
      <button class="btn" id="k-sair">${ico('sair')} ${sessao.perfil === 'admin' ? 'Painel' : 'Sair'}</button>
    </div>
    <div class="balcao-corpo">
      <div class="camera-area">
        <video id="k-video" autoplay muted playsinline></video>
        <canvas class="sobreposicao" id="k-over"></canvas>
        <div class="camera-status" id="k-camstatus"></div>
        <div class="camera-falha oculto" id="k-falha"><div>
          <b>Câmera indisponível</b><span id="k-falha-msg"></span>
          <p class="pequeno">Registros continuam possíveis, mas exigem justificativa.</p>
          <button class="btn" id="k-tentar">${ico('atualizar')} Tentar novamente</button>
          <a class="btn" href="#/configuracoes">${ico('config')} Escolher câmera</a>
        </div></div>
        <div class="resultado-overlay oculto" id="k-resultado"></div>
      </div>
      <div class="painel-direito">
        <div class="caixa-escura">
          <div class="caixa erro-caixa oculto" id="k-modo-semfoto" style="margin-bottom:10px"></div>
          <div class="mensagem-balcao" id="k-msg"></div>
          <div class="cpf-visor" id="k-cpf" aria-live="polite"></div>
          <div class="teclado" id="k-teclado">
            ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button data-d="${n}">${n}</button>`).join('')}
            <button class="apagar" data-a="apagar">⌫ Apagar</button><button data-d="0">0</button><button class="ok" data-a="ok">ENTER</button>
          </div>
        </div>
        <div class="caixa-escura ultimos"><h3 style="margin-bottom:8px">Registros de hoje</h3><ul id="k-ultimos"></ul></div>
      </div>
    </div>
  </div>`;

  const video = $('#k-video', raiz), over = $('#k-over', raiz);

  // ---------------------------------------------------------------- dados
  async function carregarDados() {
    try {
      const d = await api('kiosk_dados', {}, { timeout: 25000 });
      relogio.ajustar(d.servidor);
      d.dia = hojeISO();
      idb.put('cache', 'kiosk', d).catch(() => {});
      aplicar(d); await incluirFilaDeHoje(); marcarRede(true);
    } catch (e) {
      if (!e.rede) throw e;
      marcarRede(false);
      const d = await idb.get('cache', 'kiosk').catch(() => null);
      if (d) { aplicar(d); await incluirFilaDeHoje(); }
      else mensagem('Sem internet e sem dados salvos', 'Conecte à internet ao menos uma vez para carregar a lista de alunos.');
    }
  }
  function aplicar(d) {
    S.sal = d.sal;
    S.config = { ...S.config, ...d.config, reconhecimento: { ...S.config.reconhecimento, ...(d.config?.reconhecimento || {}) } };
    S.alunos = new Map(d.alunos.map((a) => [a.id, a]));
    S.porHash = new Map();
    d.alunos.filter((a) => a.h).forEach((a) => { if (!S.porHash.has(a.h)) S.porHash.set(a.h, []); S.porHash.get(a.h).push(a); });
    S.rec.carregar(d.faces);
    const locais = S.hoje; S.hoje = new Map();
    if (d.dia === hojeISO()) d.hoje.forEach((x) => S.hoje.set(x.a, x.h));
    locais.forEach((h, a) => { if (!S.hoje.has(a)) S.hoje.set(a, h); });
    S.ultimos = [...S.hoje.entries()].map(([a, h]) => {
      const antigo = S.ultimos.find((u) => u.a === a);
      return antigo || { a, h, nome: S.alunos.get(a)?.n || '(aluno)' };
    }).sort((x, y) => y.h.localeCompare(x.h));
    desenharUltimos(); atualizarTopo();
    prebuscarFotos();
  }
  // registros de hoje que ainda estão na fila deste computador (ex.: feitos sem internet antes de recarregar a página)
  async function incluirFilaDeHoje() {
    const hoje = hojeISO();
    for (const it of await idb.todos('fila').catch(() => [])) {
      if (it.data === hoje && !S.hoje.has(it.aluno_id)) {
        S.hoje.set(it.aluno_id, it.hora);
        if (!S.ultimos.some((u) => u.a === it.aluno_id)) S.ultimos.unshift({ a: it.aluno_id, h: it.hora, nome: S.alunos.get(it.aluno_id)?.n || '(aluno)', semFoto: !it.foto, offline: true });
      }
    }
    S.ultimos.sort((x, y) => y.h.localeCompare(x.h)); desenharUltimos(); atualizarTopo();
  }
  let prebuscando = false;
  async function prebuscarFotos() {
    if (prebuscando || !gasConfigurado() || !S.online) return;
    prebuscando = true;
    try {
      const salvos = new Set(await idb.chaves('fotos').catch(() => []));
      const ids = [...S.alunos.values()].map((a) => a.fb || a.fs).filter((id) => id && !salvos.has(id));
      for (let i = 0; i < ids.length && !S.parado; i += 20) {
        await fotos(ids.slice(i, i + 20)).catch(() => {});
        await new Promise((r) => setTimeout(r, 400));
      }
    } finally { prebuscando = false; }
  }

  // ---------------------------------------------------------------- topo, relógio, rede
  function dentroDoHorario(d = relogio.agora()) {
    const h = horaDe(d); return h >= S.config.horario_inicio && h <= S.config.horario_fim;
  }
  function atualizarTopo() {
    const agora = relogio.agora();
    $('#k-relogio', raiz).textContent = horaSegDe(agora);
    const h = horaDe(agora), el = $('#k-horario', raiz);
    if (h < S.config.horario_inicio) { el.className = 'pilula aviso'; el.innerHTML = `${ico('relogio')} Antes do horário`; el.title = `Almoço: ${S.config.horario_inicio}–${S.config.horario_fim}`; }
    else if (h <= S.config.horario_fim) { el.className = 'pilula ok'; el.innerHTML = `${ico('relogio')} No horário · até ${S.config.horario_fim}`; }
    else { el.className = 'pilula aviso'; el.innerHTML = `${ico('relogio')} Fora do horário`; el.title = `Almoço: ${S.config.horario_inicio}–${S.config.horario_fim}`; }
    $('#k-total', raiz).textContent = `Hoje: ${S.hoje.size}`;
    tela({ tipo: 'topo', hora: horaDe(agora), dentro: dentroDoHorario(agora), inicio: S.config.horario_inicio, fim: S.config.horario_fim });
  }
  async function marcarRede(ok) {
    S.online = ok;
    const n = (await idb.chaves('fila').catch(() => [])).length;
    S.nFila = n;
    const el = $('#k-rede', raiz); if (!el) return;
    if (ok && !n) { el.className = 'pilula ok'; el.innerHTML = `<i></i> Online`; }
    else if (ok) { el.className = 'pilula aviso'; el.innerHTML = `<i></i> Enviando ${n} pendente(s)`; }
    else { el.className = 'pilula erro'; el.innerHTML = `<i></i> Sem internet · ${n} na fila`; }
  }

  // ---------------------------------------------------------------- câmera e rosto
  async function iniciarCamera() {
    pararCamera(S.stream); S.camOk = false;
    video.classList.toggle('espelho', preferencias.espelhar); over.classList.toggle('espelho', preferencias.espelhar);
    try {
      S.stream = await abrirCamera(video);
      S.camOk = true; $('#k-falha', raiz).classList.add('oculto');
      S.stream.getVideoTracks()[0].addEventListener('ended', () => falhaCamera('A câmera foi desconectada.'));
    } catch (e) { falhaCamera(e.message || String(e)); }
    tela({ tipo: 'camera', ok: S.camOk });
  }
  function falhaCamera(msg) {
    S.camOk = false; $('#k-falha-msg', raiz).textContent = ' ' + msg; $('#k-falha', raiz).classList.remove('oculto');
    tela({ tipo: 'camera', ok: false });
  }
  async function iniciarFace() {
    const pil = $('#k-face', raiz);
    if (!S.config.reconhecimento?.ativo) { pil.classList.add('oculto'); return; }
    pil.className = 'pilula'; pil.innerHTML = `${ico('rosto')} Carregando facial…`;
    try {
      await carregarFace(); S.faceOk = true;
      pil.className = 'pilula ok'; pil.innerHTML = `${ico('rosto')} Facial ativo · ${S.rec.tamanho} ref.`;
    } catch (e) {
      S.faceOk = false; pil.className = 'pilula erro'; pil.innerHTML = `${ico('rosto')} Facial indisponível`;
      console.warn('face', e);
    }
  }
  async function ciclo() {
    if (S.parado) return;
    const t0 = performance.now();
    try {
      if (S.faceOk && S.camOk && S.config.reconhecimento?.ativo && ['aguardando', 'naoreconhecido', 'cpf'].includes(S.estado) && !document.hidden && cameraAtiva(video)) {
        const { rosto, quantidade } = await detectarAoVivo(video);
        if (rosto) S.ultimoRosto = { desc: Array.from(rosto.descriptor, (v) => Math.round(v * 1e6) / 1e6), largura: rosto.detection.box.width, quantidade, t: Date.now() };
        if (S.estado === 'cpf') desenharRosto(rosto && rosto.detection.box.width >= (video.videoWidth || 1) * 0.11 ? rosto : null);
        else processarRosto(rosto);
      } else if (!['confirmar'].includes(S.estado)) desenharRosto(null);
    } catch (e) { console.warn(e); }
    // em computadores sem placa de vídeo a detecção é lenta: deixa o navegador livre metade do tempo
    const dt = performance.now() - t0;
    S.timers.loop = setTimeout(ciclo, Math.max(150, 330 - dt, dt));
  }
  function processarRosto(rosto) {
    const vw = video.videoWidth || 1;
    // ignora rostos pequenos (pessoas ao fundo, na fila)
    if (rosto && rosto.detection.box.width < vw * 0.11) rosto = null;
    if (!rosto) {
      desenharRosto(null); S.seq = 0; S.cand = null; S.semMatch = 0;
      if (S.estado === 'naoreconhecido' && Date.now() - S.naoRecEm > 5000) definirEstado('aguardando');
      return;
    }
    const lim = Number(S.config.reconhecimento.limiar ?? 0.5);
    const m = S.rec.tamanho ? S.rec.melhor(rosto.descriptor) : null;
    const bateu = m && m.distancia <= lim && (m.segundo - m.distancia) >= 0.04 && S.alunos.has(m.aluno)
      && !(S.ignorar.get(m.aluno) > Date.now());
    if (bateu) {
      S.seq = S.cand === m.aluno ? S.seq + 1 : 1; S.cand = m.aluno; S.semMatch = 0;
      desenharRosto(rosto, '#35d05a');
      if (S.seq >= (S.config.reconhecimento.quadros || 3)) reconhecido(S.alunos.get(m.aluno), m.distancia);
      else tela({ tipo: 'estado', estado: 'analisando' });
    } else {
      S.cand = null; S.seq = 0; S.semMatch++;
      desenharRosto(rosto, S.semMatch >= 7 ? '#f2b33d' : '#ffffff');
      if (S.semMatch === 7 && S.estado === 'aguardando') { S.naoRecEm = Date.now(); definirEstado('naoreconhecido'); }
      else if (S.estado === 'aguardando') tela({ tipo: 'estado', estado: 'analisando' });
      if (S.estado === 'naoreconhecido') S.naoRecEm = Date.now();
    }
  }
  function desenharRosto(rosto, cor = '#fff') {
    const cw = over.clientWidth, ch = over.clientHeight;
    if (over.width !== cw) over.width = cw; if (over.height !== ch) over.height = ch;
    const g = over.getContext('2d'); g.clearRect(0, 0, cw, ch);
    if (!rosto) { tela({ tipo: 'rosto', box: null }); return; }
    const vw = video.videoWidth, vh = video.videoHeight, s = Math.min(cw / vw, ch / vh);
    const ox = (cw - vw * s) / 2, oy = (ch - vh * s) / 2, b = rosto.detection.box;
    g.strokeStyle = cor; g.lineWidth = 4; g.beginPath();
    g.roundRect ? g.roundRect(ox + b.x * s, oy + b.y * s, b.width * s, b.height * s, 12) : g.rect(ox + b.x * s, oy + b.y * s, b.width * s, b.height * s);
    g.stroke();
    tela({ tipo: 'rosto', box: { x: b.x / vw, y: b.y / vh, w: b.width / vw, h: b.height / vh }, cor });
  }

  // ---------------------------------------------------------------- estados e mensagens
  function mensagem(t, sub = '') { $('#k-msg', raiz).innerHTML = `${esc(t)}${sub ? `<small>${esc(sub)}</small>` : ''}`; }
  function definirEstado(est, extra = {}) {
    S.estado = est; clearTimeout(S.confirmarTimer);
    if (est === 'aguardando') {
      S.cpf = ''; S.candidato = null; desenharCpf();
      mensagem(S.faceOk && S.camOk ? 'Olhe para a câmera ou digite o CPF' : 'Digite o CPF e pressione ENTER',
        S.faceOk && S.camOk ? 'O reconhecimento facial identifica o aluno automaticamente.' : '');
    } else if (est === 'naoreconhecido') {
      mensagem('Rosto não reconhecido', 'Peça ao aluno para digitar o CPF. A foto de hoje passará a ser a referência dele.');
    } else if (est === 'confirmar') {
      const a = extra.aluno;
      mensagem(`${a.n}`, `${a.m || ''} · ${a.c || ''} · semelhança ${semelhanca(extra.distancia)}% · ENTER confirma, digite o CPF se não for ele(a)`);
      S.confirmarTimer = setTimeout(() => { if (S.estado === 'confirmar') { S.ignorar.set(a.id, Date.now() + 8000); definirEstado('aguardando'); } }, 12000);
    } else if (est === 'cpf') {
      mensagem('Digitando CPF…', 'ENTER confirma · ⌫ apaga · ESC ou "-" cancela');
    } else if (est === 'processando') mensagem('Registrando…');
    tela({ tipo: 'estado', estado: est, ...extra.tela });
  }
  function desenharCpf() {
    const d = S.cpf, mostrarUltimo = Date.now() - S.ultimoDigitoEm < 900;
    let s = '';
    for (let i = 0; i < 11; i++) {
      if (i === 3 || i === 6) s += '.'; if (i === 9) s += '-';
      s += i < d.length ? (i === d.length - 1 && mostrarUltimo ? d[i] : '•') : '_';
    }
    $('#k-cpf', raiz).textContent = d.length ? s : '';
    tela({ tipo: 'cpf', texto: d.length ? s : '' });
  }

  async function reconhecido(aluno, distancia) {
    S.candidato = { aluno, distancia };
    if (S.hoje.has(aluno.id)) { S.ignorar.set(aluno.id, Date.now() + 20000); return resultado('duplicado', { aluno, hora: S.hoje.get(aluno.id) }); }
    const fotoCad = await fotoRapida(aluno.fb || aluno.fs);
    if (S.estado !== 'aguardando' && S.estado !== 'naoreconhecido') return;
    definirEstado('confirmar', {
      aluno, distancia,
      tela: { nome: aluno.n, matricula: aluno.m, curso: aluno.c, foto: fotoCad, semelhanca: semelhanca(distancia), confirmar: S.config.reconhecimento.confirmar !== false }
    });
    if (S.config.reconhecimento.confirmar === false) registrar(aluno, 'facial', distancia);
  }

  // foto de cadastro: usa o cache local; se precisar buscar no Drive, espera no máximo 1,5 s
  function fotoRapida(id, ms = 1500) {
    if (!id) return Promise.resolve(null);
    return Promise.race([foto(id).catch(() => null), new Promise((r) => setTimeout(() => r(null), ms))]);
  }

  // ---------------------------------------------------------------- teclado
  function digito(d) {
    if (S.estado === 'processando') return;
    if (S.estado === 'resultado') fecharResultado();
    if (S.cpf.length >= 11) return;
    if (S.estado !== 'cpf') definirEstado('cpf');
    S.cpf += d; S.ultimoDigitoEm = Date.now(); desenharCpf();
    setTimeout(desenharCpf, 950);
  }
  function apagar() {
    if (S.estado !== 'cpf') return;
    S.cpf = S.cpf.slice(0, -1); S.ultimoDigitoEm = 0; desenharCpf();
    if (!S.cpf) definirEstado('aguardando');
  }
  async function enter() {
    if (S.estado === 'resultado') return fecharResultado();
    if (S.estado === 'confirmar' && S.candidato) return registrar(S.candidato.aluno, 'facial', S.candidato.distancia);
    if (S.estado !== 'cpf') return;
    const cpf = S.cpf;
    if (cpf.length < 11) { mensagem('CPF incompleto', 'Digite os 11 números do CPF.'); return; }
    if (!cpfValido(cpf)) return resultado('cpf_invalido', {});
    definirEstado('processando');
    let aluno = null;
    try {
      // com internet: confirmação exata no servidor
      const r = await api('kiosk_cpf', { p_cpf: cpf }, { timeout: 5000 });
      if (!r.id) return resultado('nao_encontrado', {});
      aluno = S.alunos.get(r.id);
      if (!aluno) { await carregarDados(); aluno = S.alunos.get(r.id); }
      if (!aluno) return resultado('erro', { msg: 'Aluno recém-cadastrado ainda não carregado. Tente novamente.' });
    } catch (e) {
      if (!e.rede) return resultado('erro', { msg: e.message });
      // sem internet: usa o código curto guardado neste computador
      const lista = S.porHash.get((await sha256hex(S.sal + cpf)).slice(0, 6)) || [];
      if (!lista.length) return resultado('nao_encontrado', {});
      if (lista.length > 1) return resultado('erro', { msg: 'Sem internet não foi possível confirmar este CPF. Anote o nome do aluno para registro manual.' });
      aluno = lista[0];
    }
    S.estado = 'cpf';
    registrar(aluno, 'cpf', null);
  }
  function cancelar() {
    if (S.estado === 'resultado') return fecharResultado();
    if (S.estado === 'confirmar' && S.candidato) S.ignorar.set(S.candidato.aluno.id, Date.now() + 8000);
    if (S.estado !== 'processando') definirEstado('aguardando');
  }
  function tecla(e) {
    if (document.querySelector('.fundo-modal')) return;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
    const k = e.key, cod = e.code || '';
    let d = null;
    if (/^\d$/.test(k)) d = k; else if (/^Numpad\d$/.test(cod)) d = cod.slice(-1);
    if (d !== null) { e.preventDefault(); return digito(d); }
    if (k === 'Enter') { e.preventDefault(); return enter(); }
    if (k === 'Backspace') { e.preventDefault(); return apagar(); }
    if (k === 'Escape' || k === '-' || k === 'Delete' || cod === 'NumpadSubtract' || cod === 'NumpadDecimal') { e.preventDefault(); return cancelar(); }
  }

  // ---------------------------------------------------------------- registro
  function pedirJustificativa(pre = '') {
    return modal({
      titulo: 'Registro sem foto: justificativa obrigatória',
      fecharFora: false,
      corpo: `<p style="margin:0">Escolha o motivo (teclas 1 a 4) e confirme com ENTER.</p>
        ${JUSTIFICATIVAS.map((j, i) => `<label class="check"><input type="radio" name="just" value="${i}" ${i === 0 ? 'checked' : ''}> <b>${i + 1}</b> ${esc(j)}</label>`).join('')}
        <label class="campo"><span>Detalhe (obrigatório em "Outro motivo")</span><input type="text" id="j-det" value="${esc(pre)}" maxlength="300"></label>
        <div class="caixa erro-caixa oculto" id="j-erro">Descreva o motivo.</div>`,
      aoAbrir: (el, fechar) => {
        const conf = () => {
          const i = Number($('input[name=just]:checked', el).value), det = $('#j-det', el).value.trim();
          if (i === 3 && det.length < 5) { $('#j-erro', el).classList.remove('oculto'); $('#j-det', el).focus(); return; }
          fechar(i === 3 ? det : JUSTIFICATIVAS[i] + (det ? `: ${det}` : ''));
        };
        const teclaJ = (e) => {
          if (!document.body.contains(el)) return document.removeEventListener('keydown', teclaJ, true);
          let k = e.key; if (/^Numpad[1-4]$/.test(e.code || '')) k = e.code.slice(-1);
          if (/^[1-4]$/.test(k) && e.target.id !== 'j-det') {
            $$radio(el)[Number(k) - 1].checked = true; e.preventDefault(); e.stopPropagation();
            if (k === '4') $('#j-det', el).focus();
          }
          if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); conf(); }
        };
        document.addEventListener('keydown', teclaJ, true);
        el._conf = conf;
        setTimeout(() => $('input[name=just]:checked', el).focus(), 30);
      },
      botoes: [{ texto: 'Cancelar', valor: null }, { texto: 'Registrar sem foto', classe: 'primario', acao: (f, el) => { el._conf(); return false; } }]
    }).promessa;
  }
  const $$radio = (el) => Array.from(el.querySelectorAll('input[name=just]'));

  function parametros(it) {
    return {
      p_id: it.id, p_aluno_id: it.aluno_id, p_registrado_em: it.registrado_em, p_metodo: it.metodo,
      p_tem_foto: !!it.foto, p_justificativa: it.justificativa, p_distancia: it.distancia,
      p_offline: !!it.offline, p_observacao: it.observacao
    };
  }

  async function registrar(aluno, metodo, distancia) {
    if (S.estado === 'processando') return;
    try { await registrarInterno(aluno, metodo, distancia); }
    catch (e) { console.error(e); resultado('erro', { aluno, msg: e.message || String(e) }); }
  }
  async function registrarInterno(aluno, metodo, distancia) {
    definirEstado('processando', { tela: { nome: aluno.n } });
    if (S.hoje.has(aluno.id)) { S.ignorar.set(aluno.id, Date.now() + 20000); return resultado('duplicado', { aluno, hora: S.hoje.get(aluno.id) }); }
    if (!aluno.at) return resultado('inativo', { aluno });

    let cap = null, justificativa = null, observacao = null, descritor = null;
    if (S.semFotoForcado) { justificativa = S.semFotoForcado; S.semFotoForcado = null; atualizarModoSemFoto(); }
    else if (S.camOk && cameraAtiva(video)) cap = capturar(video, 480, 0.78);
    if (!cap && !justificativa) {
      tela({ tipo: 'estado', estado: 'atendente' });
      justificativa = await pedirJustificativa();
      if (!justificativa) { definirEstado('aguardando'); return; }
    }
    // Foto base: quando o aluno se identificou pelo CPF, o rosto de hoje vira referência para os próximos dias.
    if (cap && metodo === 'cpf' && S.faceOk && S.config.reconhecimento?.ativo) {
      try {
        // usa o rosto detectado ao vivo nos últimos 2 s (rápido); senão, analisa a foto capturada
        const u = S.ultimoRosto;
        const r = u && Date.now() - u.t < 2000 && u.largura >= (video.videoWidth || 1) * 0.11
          ? { descritor: u.desc, quantidade: u.quantidade }
          : await descritorDeImagem(cap.canvas, { minimoLargura: 70 });
        if (r && r.quantidade === 1) {
          const outro = S.rec.tamanho ? S.rec.melhor(r.descritor) : null;
          const lim = Number(S.config.reconhecimento.limiar ?? 0.5);
          if (outro && outro.aluno !== aluno.id && outro.distancia <= lim - 0.05) {
            const o = S.alunos.get(outro.aluno);
            observacao = `Atenção: rosto muito semelhante ao cadastro de ${o?.n || 'outro aluno'} (${o?.m || ''}). Foto não usada como referência.`;
          } else descritor = r.descritor;
        }
      } catch (e) { console.warn('descritor', e); }
    }

    const agora = relogio.agora();
    const it = {
      id: uuid(), aluno_id: aluno.id, matricula: aluno.m, registrado_em: agora.toISOString(), data: isoDe(agora),
      hora: horaDe(agora), metodo, distancia: distancia ?? null, foto: cap?.dataUrl || null, justificativa, observacao,
      descritor, registrado: false, fotoId: null, tentativasFoto: 0, faceFeita: !descritor, offline: false, criado: Date.now()
    };
    S.emEnvio.add(it.id);
    let r;
    try {
      await idb.put('fila', it.id, it);
      try { r = await api('registrar_refeicao', parametros(it), { timeout: 7000 }); marcarRede(true); }
      catch (e) {
        if (e.rede) { r = { status: 'ok', local: true }; it.offline = true; marcarRede(false); }
        else { await idb.del('fila', it.id); return resultado('erro', { aluno, msg: e.message }); }
      }
      if (r.status === 'ok') {
        if (!r.local) it.registrado = true;
        if (it.registrado && !it.foto && it.faceFeita) await idb.del('fila', it.id); else await idb.put('fila', it.id, it);
      } else await idb.del('fila', it.id);
    } finally { S.emEnvio.delete(it.id); }
    if (r.status === 'ok') {
      if (descritor) { S.rec.itens.push({ a: aluno.id, d: Float32Array.from(descritor) }); aluno.nw = (aluno.nw || 0) + 1; }
      const hora = r.hora || it.hora, dentro = r.dentro_horario ?? dentroDoHorario(agora);
      S.hoje.set(aluno.id, hora);
      S.ultimos.unshift({ a: aluno.id, h: hora, nome: aluno.n, semFoto: !it.foto, fora: !dentro, offline: !!r.local });
      desenharUltimos(); atualizarTopo();
      S.ignorar.set(aluno.id, Date.now() + 20000);
      resultado('ok', { aluno, hora, dentro, fotoAgora: it.foto, semFoto: !it.foto, offline: !!r.local, novaBase: !!descritor, observacao });
      setTimeout(sincronizar, 300);
    } else {
      if (r.status === 'duplicado') S.hoje.set(aluno.id, r.hora);
      S.ignorar.set(aluno.id, Date.now() + 20000);
      resultado(r.status, { aluno, hora: r.hora });
    }
  }

  async function sincronizar() {
    if (S.sinc || S.parado) return;
    S.sinc = true;
    try {
      const itens = (await idb.todos('fila')).sort((a, b) => a.criado - b.criado);
      for (const it of itens) {
        if (S.emEnvio.has(it.id) || (it.falhas || 0) >= 30) continue;   // em envio agora, ou travado (ver Configurações)
        try {
          if (!it.registrado) {
            let r;
            try { r = await api('registrar_refeicao', { ...parametros(it), p_offline: true }, { timeout: 15000 }); }
            catch (e) { if (e.codigo === 'DATA_ANTIGA') r = { status: 'data_antiga' }; else throw e; }
            if (r.status !== 'ok') {
              const log = (await idb.get('cache', 'conflitos').catch(() => null)) || [];
              log.unshift({ em: new Date().toISOString(), aluno: S.alunos.get(it.aluno_id)?.n, status: r.status, registrado_em: it.registrado_em });
              await idb.put('cache', 'conflitos', log.slice(0, 100));
              await idb.del('fila', it.id); continue;
            }
            it.registrado = true; await idb.put('fila', it.id, it);
          }
          if (it.foto && !it.fotoId && gasConfigurado()) {
            try {
              const up = await gas('upload', { tipo: 'refeicao', data: it.data, dados: it.foto,
                nome: `${it.data}_${(it.hora || '').replace(':', '')}_${it.matricula || ''}_${it.id.slice(0, 8)}` }, { timeout: 60000 });
              it.fotoId = up.id; guardarFotoLocal(up.id, it.foto);
            } catch (e) { it.tentativasFoto++; if (e.rede) { await idb.put('fila', it.id, it); throw e; } }
            await idb.put('fila', it.id, it);
          }
          if (it.fotoId && !it.fotoAnexada) {
            await api('anexar_foto', { p_id: it.id, p_foto_id: it.fotoId });
            it.fotoAnexada = true; await idb.put('fila', it.id, it);
          }
          if (!it.faceFeita && (it.fotoId || it.tentativasFoto >= 3 || !gasConfigurado())) {
            await api('salvar_face', { p_aluno_id: it.aluno_id, p_descriptor: it.descritor, p_origem: 'webcam', p_foto_id: it.fotoId });
            const a = S.alunos.get(it.aluno_id); if (a && !a.fb && it.fotoId) a.fb = it.fotoId;
            it.faceFeita = true; await idb.put('fila', it.id, it);
          }
          if (it.registrado && (!it.foto || it.fotoAnexada) && it.faceFeita) await idb.del('fila', it.id);
          marcarRede(true);
        } catch (e) {
          if (e.rede) { marcarRede(false); break; }
          if (['SESSAO_INVALIDA', 'TROCAR_SENHA'].includes(e.codigo)) break;
          it.falhas = (it.falhas || 0) + 1; it.ultimoErro = e.message; await idb.put('fila', it.id, it).catch(() => {});
          console.warn('fila', e);
        }
      }
    } finally { S.sinc = false; marcarRede(S.online); }
  }

  // ---------------------------------------------------------------- resultado
  async function resultado(tipo, d) {
    S.estado = 'resultado'; clearTimeout(S.resultadoTimer);
    S.cpf = ''; desenharCpf();
    const a = d.aluno, nome = esc(a?.n || ''), mat = esc(a?.m || '');
    const T = {
      ok: { classe: d.dentro === false || d.semFoto ? 'aviso' : 'ok', icone: d.dentro === false || d.semFoto ? 'alerta' : 'check', titulo: 'Refeição registrada',
        texto: `${nome} · ${mat}<br>às <b>${esc(d.hora)}</b>${d.dentro === false ? ` · <b>fora do horário</b> (${S.config.horario_inicio}–${S.config.horario_fim})` : ''}${d.semFoto ? '<br><b>Sem foto</b> (justificado)' : ''}${d.offline ? '<br>Sem internet: será enviado automaticamente.' : ''}${d.novaBase ? '<br><small>Foto salva como referência facial.</small>' : ''}${d.observacao ? `<br><small style="color:var(--vermelho)">${esc(d.observacao)}</small>` : ''}` },
      duplicado: { classe: 'erro', icone: 'x', titulo: 'Refeição já registrada hoje', texto: `${nome}<br>Registro feito às <b>${esc(d.hora || '')}</b>.` },
      inativo: { classe: 'erro', icone: 'x', titulo: 'Cadastro inativo no PASES', texto: `${nome}<br>Encaminhe o aluno à assistência estudantil.` },
      nao_encontrado: { classe: 'erro', icone: 'x', titulo: 'CPF não encontrado', texto: 'Este CPF não está cadastrado no PASES. Confira os números ou procure a assistência estudantil.' },
      cpf_invalido: { classe: 'erro', icone: 'x', titulo: 'CPF inválido', texto: 'Os números digitados não formam um CPF válido. Digite novamente.' },
      erro: { classe: 'erro', icone: 'alerta', titulo: 'Não foi possível registrar', texto: esc(d.msg || 'Erro inesperado.') }
    }[tipo] || { classe: 'erro', icone: 'alerta', titulo: 'Atenção', texto: esc(tipo) };
    const fotoCad = a && tipo === 'ok' ? await fotoRapida(a.fb || a.fs) : null;
    const fotosHtml = tipo === 'ok' ? `<div class="fotos-par">
        <div class="foto-box">${fotoCad ? `<img src="${fotoCad}" alt="">` : 'Sem foto de cadastro'}<span class="rotulo">Cadastro</span></div>
        <div class="foto-box ${d.fotoAgora ? '' : 'sem'}">${d.fotoAgora ? `<img src="${d.fotoAgora}" alt="">` : 'SEM FOTO'}<span class="rotulo">Agora</span></div></div>` : '';
    const box = $('#k-resultado', raiz);
    box.innerHTML = `<div class="resultado-cartao ${T.classe}"><div class="icone">${ico(T.icone)}</div><h2>${T.titulo}</h2><p>${T.texto}</p>${fotosHtml}
      <p class="pequeno mudo" style="margin-top:14px">ENTER ou qualquer número para continuar</p></div>`;
    box.classList.remove('oculto');
    mensagem(T.titulo);
    tela({ tipo: 'resultado', status: tipo, classe: T.classe, titulo: T.titulo, nome: a?.n, matricula: a?.m, curso: a?.c, hora: d.hora,
      dentro: d.dentro, semFoto: d.semFoto, offline: d.offline, fotoCadastro: fotoCad, fotoAgora: d.fotoAgora,
      inicio: S.config.horario_inicio, fim: S.config.horario_fim });
    S.resultadoTimer = setTimeout(fecharResultado, tipo === 'ok' ? 4000 : 6500);
  }
  function fecharResultado() {
    clearTimeout(S.resultadoTimer);
    $('#k-resultado', raiz).classList.add('oculto');
    if (S.estado === 'resultado') definirEstado('aguardando');
  }

  function desenharUltimos() {
    const ul = $('#k-ultimos', raiz); if (!ul) return;
    ul.innerHTML = S.ultimos.slice(0, 60).map((u) => `<li class="${u.semFoto ? 'sem-foto' : ''}"><span class="hora">${esc(u.h)}</span>
      <span class="nome">${esc(u.nome)}</span>${u.semFoto ? '<span class="selo vermelho">sem foto</span>' : ''}${u.fora ? '<span class="selo ambar">fora</span>' : ''}${u.offline ? '<span class="selo">fila</span>' : ''}</li>`).join('')
      || '<li class="mudo">Nenhum registro ainda.</li>';
  }

  function atualizarModoSemFoto() {
    const el = $('#k-modo-semfoto', raiz);
    if (S.semFotoForcado) { el.innerHTML = `<b>Próximo registro SEM FOTO</b>: ${esc(S.semFotoForcado)} <button class="btn pequeno" id="k-cancela-sf">cancelar</button>`; el.classList.remove('oculto');
      $('#k-cancela-sf', el).onclick = () => { S.semFotoForcado = null; atualizarModoSemFoto(); }; }
    else el.classList.add('oculto');
  }

  // ---------------------------------------------------------------- tela do aluno (2º monitor)
  async function abrirTelaAluno() {
    const w = window.open('tela-aluno.html', 'pases_tela_aluno', 'popup=yes,width=1280,height=800');
    if (!w) return aviso('O navegador bloqueou a janela. Permita pop-ups para este site.', 'erro');
    try {
      if ('getScreenDetails' in window) {
        const sd = await window.getScreenDetails();
        const outra = sd.screens.find((s) => s !== sd.currentScreen);
        if (outra) { w.moveTo(outra.availLeft, outra.availTop); w.resizeTo(outra.availWidth, outra.availHeight); }
      }
    } catch { /* sem permissão de gerenciamento de janelas: arrastar manualmente */ }
  }
  canal.onmessage = (e) => {
    if (e.data?.tipo === 'ola') {
      tela({ tipo: 'config', camera: preferencias.camera, espelhar: preferencias.espelhar });
      atualizarTopo(); tela({ tipo: 'camera', ok: S.camOk }); tela({ tipo: 'estado', estado: S.estado });
    }
  };

  // ---------------------------------------------------------------- eventos
  $('#k-teclado', raiz).addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.d) digito(b.dataset.d); else if (b.dataset.a === 'apagar') apagar(); else if (b.dataset.a === 'ok') enter();
    b.blur();
  });
  $('#k-tela', raiz).onclick = abrirTelaAluno;
  $('#k-tentar', raiz).onclick = iniciarCamera;
  $('#k-semfoto', raiz).onclick = async () => {
    const j = await pedirJustificativa(); if (!j) return;
    S.semFotoForcado = j; atualizarModoSemFoto(); aviso('O próximo registro será feito sem foto.');
  };
  $('#k-sair', raiz).onclick = async () => {
    const n = (await idb.chaves('fila').catch(() => [])).length;
    if (n && !(await confirmar(`Há ${n} registro(s) aguardando envio. Eles continuam salvos neste computador e serão enviados quando o balcão for aberto novamente. Sair mesmo assim?`))) return;
    aoSair();
  };
  const aoOnline = () => { marcarRede(true); sincronizar(); carregarDados().catch(() => {}); };
  const aoOffline = () => marcarRede(false);
  const aoSairPagina = (e) => { if (S.nFila) { e.preventDefault(); e.returnValue = ''; } };
  document.addEventListener('keydown', tecla);
  window.addEventListener('online', aoOnline);
  window.addEventListener('offline', aoOffline);
  window.addEventListener('beforeunload', aoSairPagina);

  // ---------------------------------------------------------------- início
  (async () => {
    definirEstado('aguardando'); atualizarTopo(); marcarRede(navigator.onLine);
    S.timers.relogio = setInterval(atualizarTopo, 1000);
    S.timers.cam = setInterval(() => { if (S.camOk && !cameraAtiva(video) && video.readyState >= 2) falhaCamera('A câmera parou de enviar imagem.'); }, 3000);
    S.timers.sinc = setInterval(sincronizar, 20000);
    S.timers.dados = setInterval(() => carregarDados().catch(() => {}), 5 * 60000);
    await Promise.all([carregarDados().catch((e) => aviso(e.message, 'erro')), iniciarCamera()]);
    await iniciarFace();
    definirEstado('aguardando');
    if (S.faceOk) $('#k-face', raiz).innerHTML = `${ico('rosto')} Facial ativo · ${S.rec.tamanho} ref.`;
    ciclo(); sincronizar();
  })();

  return function desmontar() {
    S.parado = true;
    Object.values(S.timers).forEach((t) => { clearInterval(t); clearTimeout(t); });
    clearTimeout(S.resultadoTimer); clearTimeout(S.confirmarTimer);
    document.removeEventListener('keydown', tecla);
    window.removeEventListener('online', aoOnline); window.removeEventListener('offline', aoOffline);
    window.removeEventListener('beforeunload', aoSairPagina);
    pararCamera(S.stream); tela({ tipo: 'estado', estado: 'fechado' }); canal.close();
  };
}
