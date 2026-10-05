// Balcão: tela do operador (notebook). Reconhecimento facial, CPF no teclado numérico, foto, fila offline.
import { $, esc, ico, uuid, idb, isoDe, hojeISO, horaDe, horaSegDe, cpfValido, sha256hex, modal, aviso, confirmar, TIPO } from './util.js';
import { api, rpc, gas, gasConfigurado, relogio, foto, fotos, guardarFotoLocal, sessao } from './api.js';
import { abrirCamera, pararCamera, capturar, cameraAtiva, preferencias, listarCameras, molduraVideo } from './camera.js';
import { conectarCanal, dispositivo } from './tempo-real.js';
import { carregarFace, detectarAoVivo, descritorDeImagem, descritorMedio, Reconhecedor, semelhanca } from './face.js';

const JUSTIFICATIVAS = [
  'Falha ou desconexão da webcam',
  'Câmera sem imagem ou imagem escura',
  'Aluno sem condições de ser fotografado no momento',
  'Outro motivo'
];

function montarPrincipal(raiz, { aoSair, disp, canalRt, aoPerder }) {
  const S = {
    alunos: new Map(), porHash: new Map(), hoje: new Map(), hojeTipo: new Map(), ultimos: [], sal: '', tipoSel: null,
    config: { horario_inicio: '11:30', horario_fim: '13:30', reconhecimento: { ativo: true, limiar: 0.5, quadros: 3, confirmar: true } }, cap: null,
    rec: new Reconhecedor(), estado: 'aguardando', cpf: '', ultimoDigitoEm: 0,
    cand: null, seq: 0, semMatch: 0, candidato: null, ignorar: new Map(),
    camOk: false, faceOk: false, stream: null, parado: false, online: navigator.onLine, sinc: false,
    semFotoForcado: null, timers: [], resultadoTimer: null, confirmarTimer: null, emEnvio: new Set()
  };
  const canal = new BroadcastChannel('pases-tela-aluno');
  // tudo o que vai para a tela do aluno também vai para os notebooks de apoio (menos o contorno do rosto, que é contínuo)
  const ESPELHO = new Set(['estado', 'cpf', 'resultado', 'frame']);
  let rt = null, ultimaTela = null, ultimoTopo = '';
  const espelhar = (m) => { if (rt) try { rt.enviar('tela', m); } catch { /* */ } };
  const tela = (m) => {
    try { canal.postMessage(m); } catch { /* janela fechada */ }
    if (m.tipo === 'estado' || m.tipo === 'resultado') ultimaTela = m;
    if (ESPELHO.has(m.tipo)) espelhar(m);
    else if (m.tipo === 'topo' && m.hora !== ultimoTopo) { ultimoTopo = m.hora; espelhar(m); }
  };
  const status = { t: '', sub: '' };
  function enviarResumo() {
    if (!rt) return;
    espelhar({ tipo: 'status', ...status });
    espelhar({ tipo: 'hoje', n: S.hoje.size, lista: S.ultimos.slice(0, 150) });
    espelhar({ tipo: 'principal', usuario: sessao.usuario?.nome || '', semFoto: S.semFotoForcado || null, online: S.online });
  }
  // quadro da câmera no fim do reconhecimento (só uma imagem pequena, não o vídeo)
  function enviarQuadro() {
    if (!rt || !S.camOk || !cameraAtiva(video)) return;
    const c = capturar(video, 360, 0.7); if (c) tela({ tipo: 'frame', img: c.dataUrl, espelho: preferencias.espelhar });
  }
  function ligarEspelho() {
    if (!canalRt || rt) return;
    rt = conectarCanal(canalRt, {
      aoMsg: (ev, p) => {
        if (ev === 'ola') { enviarResumo(); if (ultimaTela) espelhar(ultimaTela); }
        else if (ev === 'cmd' && p) {
          if (p.k === 'tecla') teclaVirtual(p.v);
          else if (p.k === 'semfoto') { S.semFotoForcado = p.j || null; atualizarModoSemFoto(); enviarResumo(); }
        } else if (ev === 'assumido' && p?.disp && p.disp !== disp) perdeu();
      },
      aoEstado: (ok) => { if (ok) enviarResumo(); }
    });
  }
  async function pulso() {
    try { const r = await api('balcao_pulso', { p_dispositivo: disp }, { timeout: 8000 }); if (r && r.principal === false) perdeu(); }
    catch { /* sem internet: continua como principal */ }
  }
  let perdido = false;
  function perdeu() {
    if (perdido) return; perdido = true;
    aviso('Outro notebook assumiu o balcão. Este passa a ser apoio (espelho).', 'erro');
    aoPerder?.();
  }

  raiz.innerHTML = `
  <div class="balcao balcao-espelho">
    <div class="balcao-topo">
      <img src="assets/simbolo-ifma.png" alt="">
      <div class="titulo"><b>Balcão PASES</b><small>Atendente: ${esc(sessao.usuario?.nome || '')}</small></div>
      <div class="relogio" id="k-relogio">--:--:--</div>
      <span class="pilula" id="k-horario"></span>
      <button type="button" class="pilula clicavel" id="k-total" title="Ver os registros de hoje">Hoje: 0</button>
      <button type="button" class="pilula clicavel" id="k-rede" title="Clique para verificar a conexão agora"></button>
      <span class="pilula oculto" id="k-face"></span>
      <span class="espaco"></span>
      <button class="btn" id="k-tec" title="Mostrar ou esconder o teclado numérico na tela">${ico('teclado')} Teclado</button>
      <button class="btn" id="k-registros">${ico('lista')} Registros</button>
      <button class="btn" id="k-camera">${ico('camera')} Câmera</button>
      <button class="btn" id="k-tela">${ico('monitor')} Tela do aluno</button>
      <button class="btn" id="k-semfoto">${ico('semcamera')} Sem foto</button>
      <button class="btn" id="k-sair">${ico('sair')} ${sessao.perfil === 'admin' ? 'Painel' : 'Sair'}</button>
    </div>
    <div class="balcao-status"><span id="k-msg"></span><span class="caixa erro-caixa oculto" id="k-modo-semfoto"></span></div>
    <div class="balcao-corpo-espelho">
      <iframe id="k-espelho" src="tela-aluno.html?embed=1" title="Tela do aluno"></iframe>
      <div class="camera-falha oculto" id="k-falha"><div>
        <b>Câmera indisponível</b><span id="k-falha-msg"></span>
        <p class="pequeno">Registros continuam possíveis, mas exigem justificativa.</p>
        <button class="btn" id="k-tentar">${ico('atualizar')} Tentar novamente</button>
        <button class="btn" id="k-camera2">${ico('camera')} Escolher câmera</button>
      </div></div>
      <div class="teclado-pop oculto" id="k-tecpop">
        <div class="cpf-visor" id="k-cpf" aria-live="polite"></div>
        <div class="teclado" id="k-teclado">
          ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button data-d="${n}">${n}</button>`).join('')}
          <button class="apagar" data-a="apagar">⌫</button><button data-d="0">0</button><button class="ok" data-a="ok">ENTER</button>
        </div>
        <button class="btn fantasma pequeno" data-a="esc" style="width:100%;justify-content:center;margin-top:6px">ESC · cancelar</button>
      </div>
    </div>
    <video id="k-video" class="video-oculto" muted playsinline></video>
  </div>`;

  const video = $('#k-video', raiz);

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
    const locaisT = S.hojeTipo; S.hojeTipo = new Map();
    if (d.dia === hojeISO()) d.hoje.forEach((x) => { S.hoje.set(x.a, x.h); S.hojeTipo.set(x.a, x.t || 'refeicao'); });
    locaisT.forEach((t, a) => { if (!S.hojeTipo.has(a)) S.hojeTipo.set(a, t); });
    locais.forEach((h, a) => { if (!S.hoje.has(a)) S.hoje.set(a, h); });
    S.ultimos = [...S.hoje.entries()].map(([a, h]) => {
      const antigo = S.ultimos.find((u) => u.a === a);
      return antigo || { a, h, t: S.hojeTipo.get(a) || 'refeicao', nome: S.alunos.get(a)?.n || '(aluno)' };
    }).sort((x, y) => y.h.localeCompare(x.h));
    desenharUltimos(); atualizarTopo();
    prebuscarFotos();
  }
  // registros de hoje que ainda estão na fila deste computador (ex.: feitos sem internet antes de recarregar a página)
  async function incluirFilaDeHoje() {
    const hoje = hojeISO();
    for (const it of await idb.todos('fila').catch(() => [])) {
      if (it.data === hoje && !S.hoje.has(it.aluno_id)) {
        S.hoje.set(it.aluno_id, it.hora); S.hojeTipo.set(it.aluno_id, it.tipo || 'refeicao');
        if (!S.ultimos.some((u) => u.a === it.aluno_id)) S.ultimos.unshift({ a: it.aluno_id, h: it.hora, t: it.tipo || 'refeicao', nome: S.alunos.get(it.aluno_id)?.n || '(aluno)', semFoto: !it.foto, offline: true });
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
    const at = ico('atualizar');
    if (ok && !n) { el.className = 'pilula clicavel ok'; el.innerHTML = `<i></i> Online ${at}`; }
    else if (ok) { el.className = 'pilula clicavel aviso'; el.innerHTML = `<i></i> Enviando ${n} pendente(s) ${at}`; }
    else { el.className = 'pilula clicavel erro'; el.innerHTML = `<i></i> Sem internet · ${n} na fila ${at}`; }
  }
  // Confere a conexão de verdade (o "online" do navegador nem sempre muda quando a rede cai ou volta).
  // Roda sozinho a cada 15 s e também ao clicar no indicador de conexão.
  async function verificarConexao(manual = false) {
    if (S.verificando) return; S.verificando = true;
    const el = $('#k-rede', raiz); if (manual && el) el.classList.add('verificando');
    const antes = S.online;
    try {
      await rpc('ping', {}, { timeout: 6000 });
      await marcarRede(true);
      if (!antes || manual) { sincronizar(); carregarDados().catch(() => {}); }
      if (manual) aviso(S.nFila ? `Conectado. Enviando ${S.nFila} registro(s) pendente(s).` : 'Conectado à internet.', 'ok');
    } catch (e) {
      await marcarRede(false);
      if (manual) aviso('Sem conexão com o servidor. Os registros continuam salvos neste computador e serão enviados quando a internet voltar.', 'erro');
    } finally { S.verificando = false; if (el) el.classList.remove('verificando'); }
  }

  // ---------------------------------------------------------------- câmera e rosto
  async function iniciarCamera() {
    pararCamera(S.stream); S.camOk = false;
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
  /*
   * Reconhecimento sob demanda: a câmera fica ligada, mas só analisa depois que o aluno aperta ENTER.
   * Junta vários quadros do rosto dentro da moldura, compara a MÉDIA deles com as referências e só aceita
   * quando o aluno está perto o bastante E claramente mais perto que o 2º mais parecido. Depois o aluno confirma com ENTER.
   */
  const CAPTURA_MS = 9000;
  async function ciclo() {
    if (S.parado) return;
    const t0 = performance.now();
    try {
      if (['capturando', 'confirmar'].includes(S.estado) && S.faceOk && S.camOk && !document.hidden && cameraAtiva(video)) {
        const M = molduraVideo(video.videoWidth, video.videoHeight);
        const { rosto, quantidade, foraMoldura } = await detectarAoVivo(video, M);
        S.foraMoldura = !!foraMoldura;
        if (rosto) S.ultimoRosto = { desc: Array.from(rosto.descriptor, (v) => Math.round(v * 1e6) / 1e6), largura: rosto.detection.box.width, quantidade, t: Date.now() };
        if (S.estado === 'capturando') processarCaptura(rosto);
        else mostrarRosto(rosto, '#35d05a');
      }
    } catch (e) { console.warn(e); }
    const dt = performance.now() - t0;
    S.timers.loop = setTimeout(ciclo, ['capturando', 'confirmar'].includes(S.estado) ? Math.max(60, dt * 0.5) : 200);
  }
  function iniciarCaptura() {
    if (!S.config.reconhecimento?.ativo || !S.faceOk) { mensagem('Reconhecimento facial desligado ou indisponível', 'Digite o CPF.'); return; }
    if (!S.camOk) { mensagem('Câmera indisponível', 'Digite o CPF.'); return; }
    if (!S.rec.tamanho) { mensagem('Nenhuma referência facial cadastrada', 'Digite o CPF.'); return; }
    S.cap = { inicio: Date.now(), descs: [], cx: null, viuRosto: false, seq: 0, cand: null };
    definirEstado('capturando');
  }
  function processarCaptura(rosto) {
    const c = S.cap; if (!c) return;
    if (Date.now() - c.inicio > CAPTURA_MS) return naoReconhecido(c.viuRosto ? 'Rosto não reconhecido. A foto de hoje será usada para reconhecer você nos próximos dias.' : 'Nenhum rosto encontrado dentro da moldura.');
    if (!rosto) { mostrarRosto(null); return; }
    c.viuRosto = true;
    const b = rosto.detection.box, cx = b.x + b.width / 2;
    if (c.cx !== null && Math.abs(cx - c.cx) > b.width * 0.35) { c.descs = []; c.seq = 0; c.cand = null; }   // outra pessoa entrou na moldura
    c.cx = cx; c.descs.push(rosto.descriptor); if (c.descs.length > 6) c.descs.shift();
    if (c.descs.length < 2) { mostrarRosto(rosto, '#ffffff'); return; }
    const desc = descritorMedio(c.descs);
    const lim = Number(S.config.reconhecimento.limiar ?? 0.5);
    const m = S.rec.melhor(desc);
    const margem = m ? m.segundo - m.distancia : 0;
    // casamento apertado (ate 0,36) aceita folga normal; casamento folgado so vale com folga grande para o segundo
      // colocado. Isso evita registrar um aluno no nome de outro parecido (caso real: dist. 0,39 com folga de 0,07).
      const bateu = m && S.alunos.has(m.aluno) && m.distancia <= lim && margem >= (m.distancia <= 0.36 ? 0.06 : 0.12);
    if (bateu) {
      c.seq = c.cand === m.aluno ? c.seq + 1 : 1; c.cand = m.aluno;
      mostrarRosto(rosto, '#35d05a');
      if (c.seq >= Math.max(2, (S.config.reconhecimento.quadros || 3) - 1)) { S.cap = null; S.descFacial = Array.from(desc, (v) => Math.round(v * 1e6) / 1e6); reconhecido(S.alunos.get(m.aluno), m.distancia); }
    } else {
      c.seq = 0; c.cand = null; mostrarRosto(rosto, '#ffffff');
      if (c.descs.length >= 6 && Date.now() - c.inicio > 4500) naoReconhecido('Rosto não reconhecido. A foto de hoje será usada para reconhecer você nos próximos dias.');
    }
  }
  function naoReconhecido(motivo) {
    S.cap = null; mostrarRosto(null); enviarQuadro();
    definirEstado('naoreconhecido', { tela: { motivo } });
    S.confirmarTimer = setTimeout(() => { if (S.estado === 'naoreconhecido') definirEstado('aguardando'); }, 12000);
  }
  function mostrarRosto(rosto, cor = '#fff') {
    const vw = video.videoWidth || 1, vh = video.videoHeight || 1;
    if (!rosto) { tela({ tipo: 'rosto', box: null, foraMoldura: S.foraMoldura }); return; }
    const b = rosto.detection.box;
    tela({ tipo: 'rosto', box: { x: b.x / vw, y: b.y / vh, w: b.width / vw, h: b.height / vh }, cor });
  }

  // ---------------------------------------------------------------- estados e mensagens
  function mensagem(t, sub = '') { $('#k-msg', raiz).innerHTML = `${esc(t)}${sub ? `<small>${esc(sub)}</small>` : ''}`; status.t = t; status.sub = sub; espelhar({ tipo: 'status', t, sub }); }
  function mostrarTipos(mostrar) {
    const el = $('#k-tipos', raiz); if (!el) return;
    el.classList.toggle('oculto', !mostrar || !S.tipoSel);
    el.className = `modalidade-balcao ${S.tipoSel === 'lanche' ? 'lanche' : 'refeicao'} ${mostrar && S.tipoSel ? '' : 'oculto'}`;
    const c = S.candidato?.aluno, troca = c && S.tipoSel !== modalidadeDe(c);
    el.innerHTML = S.tipoSel ? `<small>${troca ? `Troca · cadastro: ${TIPO[modalidadeDe(c)]}` : 'Conforme o cadastro'}</small>${TIPO[S.tipoSel]}` : '';
  }
  function mensagemConfirmar(a, distancia) {
    const troca = S.tipoSel !== modalidadeDe(a);
    mensagem(`${a.n} · ${a.m || ''} · ${TIPO[S.tipoSel]}${troca ? ` (troca: cadastro é ${TIPO[modalidadeDe(a)]})` : ''}`,
      `${distancia != null ? `semelhança ${semelhanca(distancia)}% · ` : 'pelo CPF · '}1 almoço · 2 lanche · ENTER confirma · ESC se não for ele(a)`);
  }
  // antes do ENTER o aluno pode trocar: tecla 1 = refeição, 2 = lanche (sem escolha, vale o cadastro)
  function escolherTipo(t) {
    const c = S.candidato; if (S.estado !== 'confirmar' || !c || S.tipoSel === t) return;
    S.tipoSel = t; mostrarTipos(true); mensagemConfirmar(c.aluno, c.distancia);
    clearTimeout(S.confirmarTimer);
    S.confirmarTimer = setTimeout(() => { if (S.estado === 'confirmar') definirEstado('aguardando'); }, 25000);
    tela({ tipo: 'estado', estado: 'confirmar', ...telaEscolha(c.aluno, S.fotoCand, c.distancia) });
  }
  function definirEstado(est, extra = {}) {
    S.estado = est; clearTimeout(S.confirmarTimer);
    if (est !== 'confirmar') S.tipoSel = null;
    mostrarTipos(est === 'confirmar');
    if (est !== 'capturando' && est !== 'confirmar') mostrarRosto(null);
    if (est === 'aguardando') {
      S.cpf = ''; S.candidato = null; S.cap = null; S.descFacial = null; desenharCpf();
      mensagem(S.faceOk && S.camOk ? 'Aguardando: ENTER inicia o reconhecimento facial · ou digite o CPF' : 'Aguardando: digite o CPF');
    } else if (est === 'capturando') {
      mensagem('Reconhecimento facial em andamento…', 'O aluno deve encaixar o rosto na moldura. ESC cancela.');
    } else if (est === 'naoreconhecido') {
      mensagem('Rosto não reconhecido', 'Peça ao aluno para digitar o CPF. A foto de hoje passará a ser a referência dele.');
    } else if (est === 'confirmar') {
      const a = extra.aluno;
      mensagemConfirmar(a, extra.distancia);
      S.confirmarTimer = setTimeout(() => { if (S.estado === 'confirmar') definirEstado('aguardando'); }, 25000);
    } else if (est === 'cpf') {
      mensagem('Digitando CPF…', 'Ao digitar o 11º número, os dados do aluno aparecem · ⌫ apaga · ESC cancela');
    } else if (est === 'processando') mensagem(extra.tela?.nome ? 'Registrando…' : 'Conferindo o CPF…');
    tela({ tipo: 'estado', estado: est, ...extra.tela });
  }
  function desenharCpf() {
    const d = S.cpf, mostrarUltimo = Date.now() - S.ultimoDigitoEm < 900;
    let s = '';
    for (let i = 0; i < 11; i++) {
      if (i === 3 || i === 6) s += '.'; if (i === 9) s += '-';
      s += i < d.length ? (i === d.length - 1 && mostrarUltimo ? d[i] : '•') : '_';
    }
    $('#k-cpf', raiz).textContent = d.length ? s : 'CPF';
    tela({ tipo: 'cpf', texto: d.length ? s : '' });
  }

  async function reconhecido(aluno, distancia) {
    S.candidato = { aluno, distancia };
    S.candidato = { aluno, distancia, metodo: 'facial' };
    if (S.hoje.has(aluno.id)) return resultado('duplicado', { aluno, hora: S.hoje.get(aluno.id), tipo: S.hojeTipo.get(aluno.id) });
    if (!aluno.at) return resultado('inativo', { aluno });
    const fotoCad = await fotoRapida(aluno.fb || aluno.fs);
    if (S.estado !== 'capturando') return;
    enviarQuadro();
    S.fotoCand = fotoCad;
    S.tipoSel = modalidadeDe(aluno);
    definirEstado('confirmar', { aluno, distancia, tela: telaEscolha(aluno, fotoCad, distancia) });
  }
  const modalidadeDe = (aluno) => (aluno.md === 'lanche' ? 'lanche' : 'refeicao');
  function telaEscolha(aluno, foto, distancia = null) {
    return { nome: aluno.n, matricula: aluno.m, curso: aluno.c, foto, semelhanca: distancia != null ? semelhanca(distancia) : null,
      tipoSel: S.tipoSel, md: modalidadeDe(aluno), confirmar: S.config.reconhecimento.confirmar !== false };
  }
  // vale o que estiver selecionado ao apertar ENTER (cadastro, ou a troca feita com 1/2)
  function confirmarEscolha() {
    const c = S.candidato; if (!c) return;
    registrar(c.aluno, c.metodo, c.distancia, S.tipoSel || modalidadeDe(c.aluno));
  }

  // foto de cadastro: usa o cache local; se precisar buscar no Drive, espera no máximo 1,5 s
  function fotoRapida(id, ms = 1500) {
    if (!id) return Promise.resolve(null);
    return Promise.race([foto(id).catch(() => null), new Promise((r) => setTimeout(() => r(null), ms))]);
  }

  // ---------------------------------------------------------------- teclado
  function digito(d) {
    if (S.estado === 'confirmar') { if (d === '1') escolherTipo('refeicao'); else if (d === '2') escolherTipo('lanche'); return; }
    if (S.estado === 'processando') return;
    if (S.estado === 'resultado') fecharResultado();
    if (S.cpf.length >= 11) return;
    if (S.estado !== 'cpf') { S.cap = null; definirEstado('cpf'); }
    S.cpf += d; S.ultimoDigitoEm = Date.now(); desenharCpf();
    setTimeout(desenharCpf, 950);
    if (S.cpf.length === 11) setTimeout(buscarCpf, 150);   // CPF completo: busca sozinho, sem precisar de ENTER
  }
  function apagar() {
    if (S.estado !== 'cpf') return;
    S.cpf = S.cpf.slice(0, -1); S.ultimoDigitoEm = 0; desenharCpf();
    if (!S.cpf) definirEstado('aguardando');
  }
  async function enter() {
    if (S.estado === 'resultado') { fecharResultado(); return; }
    if (S.estado === 'confirmar' && S.candidato) return confirmarEscolha();
    if (S.estado === 'aguardando' || S.estado === 'naoreconhecido') return iniciarCaptura();
    if (S.estado === 'cpf') {
      if (S.cpf.length < 11) { mensagem('CPF incompleto', 'Digite os 11 números do CPF.'); return; }
      return buscarCpf();
    }
  }
  async function buscarCpf() {
    if (S.estado !== 'cpf' || S.cpf.length !== 11) return;
    const cpf = S.cpf;
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
    if (S.hoje.has(aluno.id)) return resultado('duplicado', { aluno, hora: S.hoje.get(aluno.id), tipo: S.hojeTipo.get(aluno.id) });
    if (!aluno.at) return resultado('inativo', { aluno });
    S.cpf = ''; desenharCpf();
    S.candidato = { aluno, distancia: null, metodo: 'cpf' };
    S.fotoCand = await fotoRapida(aluno.fb || aluno.fs);
    S.tipoSel = modalidadeDe(aluno);
    enviarQuadro();   // o apoio vê quem está diante da câmera ao confirmar pelo CPF
    definirEstado('confirmar', { aluno, distancia: null, tela: telaEscolha(aluno, S.fotoCand) });
  }
  function cancelar() {
    if (S.estado === 'resultado') return fecharResultado();
    S.candidato = null; S.cap = null; S.descFacial = null;
    if (S.estado !== 'processando') definirEstado('aguardando');
  }
  function teclaVirtual(k) {
    if (document.querySelector('.fundo-modal')) return;
    if (/^\d$/.test(k)) return digito(k);
    if (k === 'Enter') return enter();
    if (k === 'Backspace') return apagar();
    if (k === 'Escape') return cancelar();
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
      p_offline: !!it.offline, p_observacao: it.observacao, p_tipo: it.tipo || 'refeicao'
    };
  }

  async function registrar(aluno, metodo, distancia, tipo = 'refeicao') {
    if (S.estado === 'processando') return;
    try { await registrarInterno(aluno, metodo, distancia, tipo); }
    catch (e) { console.error(e); resultado('erro', { aluno, msg: e.message || String(e) }); }
  }
  async function registrarInterno(aluno, metodo, distancia, tipo) {
    definirEstado('processando', { tela: { nome: aluno.n } });
    if (S.hoje.has(aluno.id)) { S.ignorar.set(aluno.id, Date.now() + 20000); return resultado('duplicado', { aluno, hora: S.hoje.get(aluno.id), tipo: S.hojeTipo.get(aluno.id) }); }
    if (!aluno.at) return resultado('inativo', { aluno });

    let cap = null, justificativa = null, observacao = null, descritor = null;
    if (S.semFotoForcado) { justificativa = S.semFotoForcado; S.semFotoForcado = null; atualizarModoSemFoto(); }
    else if (S.camOk && cameraAtiva(video)) cap = capturar(video, 480, 0.78);
    if (!cap && !justificativa) {
      tela({ tipo: 'estado', estado: 'atendente' });
      justificativa = await pedirJustificativa();
      if (!justificativa) { definirEstado('aguardando'); return; }
    }
    // Referências: o balcão compara com a foto do cadastro (SUAP e/ou foto de cadastro) e com o último registro.
    // Reconhecido pelo rosto: a foto de hoje vira o "último registro". Pelo CPF: vira a nova foto do cadastro.
    if (cap && S.faceOk && S.config.reconhecimento?.ativo) {
      try {
        let r = null;
        if (metodo === 'facial' && S.descFacial) r = { descritor: S.descFacial, quantidade: 1 };   // média dos quadros já aceita
        else {
          // pelo CPF: usa o rosto detectado ao vivo nos últimos 2 s; senão, analisa a foto capturada
          const u = S.ultimoRosto;
          r = u && Date.now() - u.t < 2000 && u.largura >= (video.videoWidth || 1) * 0.08
            ? { descritor: u.desc, quantidade: u.quantidade }
            : await Promise.race([descritorDeImagem(cap.canvas, { minimoLargura: 70 }), new Promise((ok) => setTimeout(() => ok(null), 3000))]);   // nunca trava o registro
        }
        if (r && r.quantidade === 1) {
          // segurança: se este rosto for claramente mais parecido com OUTRO aluno, não vira referência
          const outro = S.rec.tamanho ? S.rec.melhor(r.descritor) : null;
          const lim = Number(S.config.reconhecimento.limiar ?? 0.5);
          if (outro && outro.aluno !== aluno.id && outro.distancia <= lim - 0.05) {
            const o = S.alunos.get(outro.aluno);
            observacao = `Atenção: rosto muito semelhante ao cadastro de ${o?.n || 'outro aluno'} (${o?.m || ''}). Foto enviada para "Validar rostos"; só vira referência depois de aprovada.`; descritor = r.descritor; S.duvidaFace = true;
          } else descritor = r.descritor;
        }
      } catch (e) { console.warn('descritor', e); }
    }
    S.descFacial = null;
    const duvida = !!S.duvidaFace; S.duvidaFace = false; // rosto parecido com o de outro aluno: a foto fica pendente em "Validar rostos"
    // reconhecimento folgado nao vira "ultimo registro": se a pessoa for outra, a referencia errada se reforcaria sozinha
    const fraco = metodo === 'facial' && !(distancia <= 0.36);
    const confirmada = !!descritor && !duvida && !fraco;   // identidade confirmada com ENTER: a referência já nasce válida

    const agora = relogio.agora();
    const it = {
      id: uuid(), aluno_id: aluno.id, matricula: aluno.m, registrado_em: agora.toISOString(), data: isoDe(agora), tipo,
      hora: horaDe(agora), metodo, distancia: distancia ?? null, foto: cap?.dataUrl || null, justificativa, observacao,
      descritor, confirmada, duvida, registrado: false, fotoId: null, tentativasFoto: 0, faceFeita: !descritor, offline: false, criado: Date.now()
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
      if (descritor && confirmada) {
        // referências do aluno = cadastro (SUAP e/ou foto de cadastro) + último registro
        const cad = metodo === 'cpf';
        S.rec.itens = S.rec.itens.filter((x) => !(x.a === aluno.id && (x.o === 'webcam' || (cad && x.o === 'manual'))));
        S.rec.itens.push({ a: aluno.id, o: cad ? 'manual' : 'webcam', d: Float32Array.from(descritor) }); aluno.nw = cad ? 0 : 1;
      }
      const hora = r.hora || it.hora, dentro = tipo === 'lanche' ? true : (r.dentro_horario ?? dentroDoHorario(agora));
      S.hoje.set(aluno.id, hora); S.hojeTipo.set(aluno.id, tipo);
      S.ultimos.unshift({ a: aluno.id, h: hora, t: tipo, nome: aluno.n, semFoto: !it.foto, fora: !dentro, offline: !!r.local });
      desenharUltimos(); atualizarTopo();
      S.ignorar.set(aluno.id, Date.now() + 20000);
      resultado('ok', { aluno, hora, dentro, tipo, fotoAgora: it.foto, semFoto: !it.foto, offline: !!r.local, novaBase: !!descritor && metodo === 'cpf', observacao });
      setTimeout(sincronizar, 300);
    } else {
      if (r.status === 'duplicado') { S.hoje.set(aluno.id, r.hora); S.hojeTipo.set(aluno.id, r.tipo || 'refeicao'); }
      S.ignorar.set(aluno.id, Date.now() + 20000);
      resultado(r.status, { aluno, hora: r.hora, tipo: r.tipo });
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
            // pelo CPF a foto vira a do cadastro; pelo rosto ela é só o "último registro" (o cadastro fica como está)
            const cad = it.metodo === 'cpf';
            if (it.duvida) await proporFaceDuvidosa(it);
          else await api('salvar_face', { p_aluno_id: it.aluno_id, p_descriptor: it.descritor, p_origem: cad ? 'cpf' : 'webcam', p_foto_id: it.fotoId, p_confirmada: !!it.confirmada });
            const a = S.alunos.get(it.aluno_id); if (a && it.fotoId && !it.duvida && (cad || (!a.fb && !a.fs))) a.fb = it.fotoId;
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
      ok: { classe: d.dentro === false || d.semFoto ? 'aviso' : 'ok', icone: d.dentro === false || d.semFoto ? 'alerta' : 'check', titulo: d.tipo === 'lanche' ? 'Lanche registrado' : 'Almoço registrado',
        texto: `${nome} · ${mat}<br>às <b>${esc(d.hora)}</b>${d.dentro === false ? ` · <b>fora do horário</b> (${S.config.horario_inicio}–${S.config.horario_fim})` : ''}${d.semFoto ? '<br><b>Sem foto</b> (justificado)' : ''}${d.offline ? '<br>Sem internet: será enviado automaticamente.' : ''}${d.novaBase ? '<br><small>Foto de hoje salva como nova foto do cadastro.</small>' : ''}${d.observacao ? `<br><small style="color:var(--vermelho)">${esc(d.observacao)}</small>` : ''}` },
      duplicado: { classe: 'erro', icone: 'x', titulo: 'Já registrado hoje', texto: `${nome}<br>${TIPO[d.tipo] || 'Registro'} às <b>${esc(d.hora || '')}</b>.<br><small>Vale um almoço OU um lanche por dia.</small>` },
      inativo: { classe: 'erro', icone: 'x', titulo: 'Cadastro inativo no PASES', texto: `${nome}<br>Encaminhe o aluno à assistência estudantil.` },
      nao_encontrado: { classe: 'erro', icone: 'x', titulo: 'CPF não encontrado', texto: 'Este CPF não está cadastrado no PASES. Confira os números ou procure a assistência estudantil.' },
      cpf_invalido: { classe: 'erro', icone: 'x', titulo: 'CPF inválido', texto: 'Os números digitados não formam um CPF válido. Digite novamente.' },
      erro: { classe: 'erro', icone: 'alerta', titulo: 'Não foi possível registrar', texto: esc(d.msg || 'Erro inesperado.') }
    }[tipo] || { classe: 'erro', icone: 'alerta', titulo: 'Atenção', texto: esc(tipo) };
    const fotoCad = a && tipo === 'ok' ? await fotoRapida(a.fb || a.fs) : null;
    const fotosHtml = tipo === 'ok' ? `<div class="fotos-par">
        <div class="foto-box">${fotoCad ? `<img src="${fotoCad}" alt="">` : 'Sem foto de cadastro'}<span class="rotulo">Cadastro</span></div>
        <div class="foto-box ${d.fotoAgora ? '' : 'sem'}">${d.fotoAgora ? `<img src="${d.fotoAgora}" alt="">` : 'SEM FOTO'}<span class="rotulo">Agora</span></div></div>` : '';
    void fotosHtml;
    mensagem(T.titulo, (T.texto || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() + ' · ENTER ou qualquer número continua');
    tela({ tipo: 'resultado', status: tipo, classe: T.classe, titulo: T.titulo, nome: a?.n, matricula: a?.m, curso: a?.c, hora: d.hora, tipoReg: d.tipo,
      dentro: d.dentro, semFoto: d.semFoto, offline: d.offline, fotoCadastro: fotoCad, fotoAgora: d.fotoAgora,
      inicio: S.config.horario_inicio, fim: S.config.horario_fim });
    S.resultadoTimer = setTimeout(fecharResultado, tipo === 'ok' ? 4000 : 6500);
  }
  function fecharResultado() {
    clearTimeout(S.resultadoTimer);
    if (S.estado === 'resultado') definirEstado('aguardando');
  }

  function desenharUltimos() { atualizarTopo(); if (rt) espelhar({ tipo: 'hoje', n: S.hoje.size, lista: S.ultimos.slice(0, 150) }); }
  function verHoje() {
    modal({ titulo: `Registros de hoje (${S.hoje.size})`, corpo: `<ul class="lista-hoje">${S.ultimos.slice(0, 200).map((u) => `<li class="${u.semFoto ? 'sem-foto' : ''}"><span class="hora">${esc(u.h)}</span>
      <span class="nome">${esc(u.nome)}</span>${u.t === 'lanche' ? '<span class="selo azul">lanche</span>' : '<span class="selo verde">almoço</span>'}${u.semFoto ? '<span class="selo vermelho">sem foto</span>' : ''}${u.fora ? '<span class="selo ambar">fora</span>' : ''}${u.offline ? '<span class="selo">fila</span>' : ''}</li>`).join('')
      || '<li class="mudo">Nenhum registro ainda.</li>'}</ul>`, botoes: [{ texto: 'Fechar' }] });
  }


  function atualizarModoSemFoto() {
    if (rt) espelhar({ tipo: 'principal', usuario: sessao.usuario?.nome || '', semFoto: S.semFotoForcado || null, online: S.online });
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
    // teclas digitadas com a janela do aluno em foco (teclado numérico na frente do aluno)
    if (e.data?.tipo === 'tecla') { teclaVirtual(e.data.k); return; }
    if (e.data?.tipo === 'ola') {
      tela({ tipo: 'config', camera: preferencias.camera, espelhar: preferencias.espelhar, zoom: preferencias.zoom, moldura: preferencias.moldura });
      atualizarTopo(); tela({ tipo: 'camera', ok: S.camOk }); tela({ tipo: 'estado', estado: S.estado });
    }
  };

  // ---------------------------------------------------------------- eventos
  $('#k-tecpop', raiz).addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.d) digito(b.dataset.d); else if (b.dataset.a === 'apagar') apagar(); else if (b.dataset.a === 'ok') enter(); else if (b.dataset.a === 'esc') cancelar();
    b.blur();
  });
  // teclado numérico na tela: janela flutuante, aberta ou fechada pelo botão Teclado (fica lembrado neste computador)
  const tecAberto = (v) => { $('#k-tecpop', raiz).classList.toggle('oculto', !v); $('#k-tec', raiz).classList.toggle('ativo', v); try { localStorage.setItem('pases_teclado', v ? '1' : '0'); } catch { /* */ } };
  tecAberto((() => { try { return localStorage.getItem('pases_teclado') === '1'; } catch { return false; } })());
  $('#k-tec', raiz).onclick = () => tecAberto($('#k-tecpop', raiz).classList.contains('oculto'));
  $('#k-total', raiz).onclick = verHoje;
  $('#k-tela', raiz).onclick = abrirTelaAluno;
  $('#k-rede', raiz).onclick = () => verificarConexao(true);
  $('#k-registros', raiz).onclick = () => { location.hash = '#/registros'; };
  $('#k-camera', raiz).onclick = escolherCamera; $('#k-camera2', raiz).onclick = escolherCamera;
  async function escolherCamera() {
    const cams = await listarCameras().catch(() => []);
    const cfg = () => tela({ tipo: 'config', camera: preferencias.camera, espelhar: preferencias.espelhar, zoom: preferencias.zoom, moldura: preferencias.moldura });
    const antes = { zoom: preferencias.zoom, moldura: preferencias.moldura };
    tela({ tipo: 'previa', on: true });
    const m = modal({
      titulo: 'Câmera deste computador',
      corpo: `<p class="mudo" style="margin:0">Escolha a webcam USB apontada para o aluno e ajuste o enquadramento olhando a imagem atrás desta janela (ou na tela do aluno). Fica salvo neste computador.</p>
        <label class="campo"><span>Webcam</span><select data-c><option value="">Padrão do sistema</option>${cams.map((c, i) => `<option value="${esc(c.deviceId)}" ${c.deviceId === preferencias.camera ? 'selected' : ''}>${esc(c.label || `Câmera ${i + 1}`)}</option>`).join('')}</select></label>
        <label class="check"><input type="checkbox" data-e ${preferencias.espelhar ? 'checked' : ''}> Espelhar a imagem (como um espelho)</label>
        <label class="campo"><span>Zoom da imagem: <b data-zv>${preferencias.zoom.toFixed(2)}×</b> (menor = afasta, o rosto fica menor na moldura)</span>
          <input type="range" data-z min="0.5" max="2.5" step="0.05" value="${preferencias.zoom}"></label>
        <label class="campo"><span>Tamanho da moldura: <b data-mv>${Math.round(preferencias.moldura * 100)}%</b></span>
          <input type="range" data-m min="0.7" max="1.3" step="0.05" value="${preferencias.moldura}"></label>`,
      aoAbrir: (el) => {
        $('[data-z]', el).oninput = (e) => { preferencias.salvar({ zoom: Number(e.target.value) }); $('[data-zv]', el).textContent = `${Number(e.target.value).toFixed(2)}×`; cfg(); };
        $('[data-m]', el).oninput = (e) => { preferencias.salvar({ moldura: Number(e.target.value) }); $('[data-mv]', el).textContent = `${Math.round(e.target.value * 100)}%`; cfg(); };
      },
      botoes: [{ texto: 'Cancelar', acao: (fechar) => { preferencias.salvar(antes); cfg(); fechar(); return false; } },
        { texto: 'Salvar câmera', classe: 'primario', acao: async (fechar, el) => {
        const sel = $('[data-c]', el);
        preferencias.salvar({ camera: sel.value, rotulo: sel.value ? sel.selectedOptions[0].textContent : '', espelhar: $('[data-e]', el).checked });
        fechar(); await iniciarCamera(); cfg();
        aviso('Câmera salva.', 'ok'); return false;
      } }]
    });
    m.promessa.finally(() => tela({ tipo: 'previa', on: false }));
    return m;
  }
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
  const aoOnline = () => verificarConexao(false);
  const aoOffline = () => verificarConexao(false);
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
    S.timers.rede = setInterval(() => verificarConexao(false), 15000);
    S.timers.dados = setInterval(() => carregarDados().catch(() => {}), 5 * 60000);
    await Promise.all([carregarDados().catch((e) => aviso(e.message, 'erro')), iniciarCamera()]);
    await iniciarFace();
    definirEstado('aguardando');
    if (S.faceOk) $('#k-face', raiz).innerHTML = `${ico('rosto')} Facial ativo · ${S.rec.tamanho} ref.`;
    ciclo(); sincronizar();
    ligarEspelho();
    if (disp) { S.timers.pulso = setInterval(pulso, 10000); }
  })();

  return function desmontar() {
    S.parado = true;
    Object.values(S.timers).forEach((t) => { clearInterval(t); clearTimeout(t); });
    clearTimeout(S.resultadoTimer); clearTimeout(S.confirmarTimer);
    document.removeEventListener('keydown', tecla);
    window.removeEventListener('online', aoOnline); window.removeEventListener('offline', aoOffline);
    window.removeEventListener('beforeunload', aoSairPagina);
    pararCamera(S.stream); tela({ tipo: 'estado', estado: 'fechado' }); canal.close();
    if (rt) { try { rt.enviar('encerrado', { disp }); } catch { /* */ } setTimeout(() => rt.fechar(), 300); }
    if (disp && !perdido) api('balcao_liberar', { p_dispositivo: disp }, { timeout: 5000 }).catch(() => {});
  };
}

/*
 * Balcão em mais de um notebook: só um é o PRINCIPAL (câmera, reconhecimento e registros).
 * Ao abrir, se outro notebook estiver ativo, este pode abrir como APOIO (espelho do principal, com comandos)
 * ou ASSUMIR o balcão. Sem internet, abre direto como principal (os registros ficam na fila deste computador).
 */
export function montarBalcao(raiz, opcoes) {
  let atual = null, parado = false;
  const disp = dispositivo();
  const trocar = (fn) => { if (parado) return; try { atual?.(); } catch (e) { console.warn(e); } atual = fn(); };
  const principal = (canalRt) => trocar(() => montarPrincipal(raiz, { ...opcoes, disp, canalRt, aoPerder: () => abrirApoio() }));
  const abrirApoio = async () => {
    let st = null; try { st = await api('balcao_status', {}, { timeout: 8000 }); } catch { /* */ }
    trocar(() => montarApoio(raiz, { ...opcoes, disp, canalRt: st?.canal, ativo: st?.ativo, aoAssumir: (canal) => principal(canal) }));
  };
  (async () => {
    raiz.innerHTML = '<div class="balcao balcao-espelho"><div class="vazio" style="margin:auto;color:#cfe0d7">Verificando se o balcão já está aberto em outro notebook…</div></div>';
    let r;
    try { r = await api('balcao_assumir', { p_dispositivo: disp, p_forcar: false }, { timeout: 8000 }); }
    catch (e) { if (e.rede || /HTTP_404|balcao_assumir/.test(e.codigo || e.message || '')) return principal(null); throw e; }
    if (r.ok) return principal(r.canal);
    if (parado) return;
    const a = r.ativo || {};
    const escolha = await modal({
      titulo: 'O balcão já está aberto em outro notebook', fecharFora: false,
      corpo: `<p style="margin:0">Atendente: <b>${esc(a.usuario || '')}</b>, desde ${esc((a.desde || '').slice(11, 16))}.</p>
        <p class="mudo" style="margin:8px 0 0"><b>Abrir como apoio</b>: este notebook espelha o balcão ativo e pode digitar CPF, confirmar, cancelar e marcar "sem foto"; a câmera e os registros continuam no outro notebook.<br>
        <b>Assumir o balcão</b>: este notebook passa a ser o principal (use se o outro travou ou vai sair); o outro vira apoio.</p>`,
      botoes: [{ texto: 'Voltar', valor: 'voltar' }, { texto: 'Assumir o balcão', classe: 'perigo', valor: 'assumir' }, { texto: 'Abrir como apoio', classe: 'primario', valor: 'apoio' }]
    }).promessa;
    if (parado) return;
    if (escolha === 'apoio') return trocar(() => montarApoio(raiz, { ...opcoes, disp, canalRt: r.canal, ativo: r.ativo, aoAssumir: (canal) => principal(canal) }));
    if (escolha === 'assumir') return assumir(r.canal);
    opcoes.aoSair?.({ semLogout: true });
  })().catch((e) => { raiz.innerHTML = `<div class="vazio">${esc(e.message || e)}</div>`; });
  async function assumir(canalAntigo) {
    try {
      const r = await api('balcao_assumir', { p_dispositivo: disp, p_forcar: true });
      const avisar = conectarCanal(r.canal || canalAntigo, {});
      setTimeout(() => { avisar.enviar('assumido', { disp }); setTimeout(() => avisar.fechar(), 800); }, 800);
      principal(r.canal || canalAntigo);
    } catch (e) { aviso(e.message, 'erro'); }
  }
  return function desmontar() { parado = true; try { atual?.(); } catch { /* */ } };
}

function montarApoio(raiz, { aoSair, disp, canalRt, ativo, aoAssumir }) {
  const canalLocal = new BroadcastChannel('pases-tela-aluno');   // repassa o espelho ao iframe (e a uma tela do aluno aberta aqui)
  const timers = {};
  let rt = null, nHoje = 0, lista = [], principalNome = ativo?.usuario || '', conectado = false, ultimoVisto = Date.now(), encerrado = false;
  raiz.innerHTML = `
  <div class="balcao balcao-espelho apoio">
    <div class="balcao-topo">
      <img src="assets/simbolo-ifma.png" alt="">
      <div class="titulo"><b>Balcão PASES · APOIO</b><small>Espelho do balcão de <span id="a-princ">${esc(principalNome)}</span></small></div>
      <div class="relogio" id="a-relogio">--:--:--</div>
      <button type="button" class="pilula clicavel" id="a-total" title="Ver os registros de hoje">Hoje: 0</button>
      <span class="pilula" id="a-con"></span>
      <span class="espaco"></span>
      <button class="btn" id="a-tec">${ico('teclado')} Teclado</button>
      <button class="btn" id="a-registros">${ico('lista')} Registros</button>
      <button class="btn" id="a-semfoto">${ico('semcamera')} Sem foto</button>
      <button class="btn perigo" id="a-assumir">${ico('balcao')} Assumir o balcão</button>
      <button class="btn" id="a-sair">${ico('sair')} ${sessao.perfil === 'admin' ? 'Painel' : 'Sair'}</button>
    </div>
    <div class="balcao-status"><span id="a-msg">Conectando ao balcão principal…</span><span class="caixa erro-caixa oculto" id="a-semfoto-aviso"></span></div>
    <div class="balcao-corpo-espelho">
      <iframe src="tela-aluno.html?embed=1&apoio=1" title="Espelho do balcão"></iframe>
      <div class="caixa erro-caixa oculto" id="a-encerrado" style="position:absolute;top:12px;left:50%;transform:translateX(-50%);z-index:5;text-align:center">
        <b>O balcão principal foi fechado.</b><br><button class="btn primario" id="a-abrir" style="margin-top:8px">${ico('balcao')} Abrir o balcão neste notebook</button></div>
      <div class="teclado-pop oculto" id="a-tecpop">
        <div class="teclado">
          ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button data-d="${n}">${n}</button>`).join('')}
          <button class="apagar" data-a="Backspace">⌫</button><button data-d="0">0</button><button class="ok" data-a="Enter">ENTER</button>
        </div>
        <button class="btn fantasma pequeno" data-a="Escape" style="width:100%;justify-content:center;margin-top:6px">ESC · cancelar</button>
      </div>
    </div>
  </div>`;
  const cmd = (p) => { if (!rt || !conectado) return aviso('Sem conexão com o balcão principal.', 'erro'); rt.enviar('cmd', p); };
  const tecla = (v) => cmd({ k: 'tecla', v });
  const marcarCon = () => {
    const el = $('#a-con', raiz); if (!el) return;
    const vivo = conectado && Date.now() - ultimoVisto < 45000;
    el.className = 'pilula ' + (vivo ? 'ok' : 'erro'); el.innerHTML = `<i></i> ${vivo ? 'Espelhando' : 'Sem conexão com o balcão'}`;
  };
  if (canalRt) {
    rt = conectarCanal(canalRt, {
      aoEstado: (ok) => { conectado = ok; marcarCon(); if (ok) rt.enviar('ola', {}); },
      aoMsg: (ev, p) => {
        ultimoVisto = Date.now();
        if (ev === 'tela' && p) {
          if (!$('#a-msg', raiz)) return;
          if (p.tipo === 'status') $('#a-msg', raiz).innerHTML = `${esc(p.t)}${p.sub ? `<small>${esc(p.sub)}</small>` : ''}`;
          else if (p.tipo === 'hoje') { nHoje = p.n; lista = p.lista || []; $('#a-total', raiz).textContent = `Hoje: ${nHoje}`; }
          else if (p.tipo === 'principal') {
            principalNome = p.usuario || principalNome; $('#a-princ', raiz).textContent = principalNome;
            const sf = $('#a-semfoto-aviso', raiz); sf.classList.toggle('oculto', !p.semFoto); sf.innerHTML = p.semFoto ? `<b>Próximo registro SEM FOTO</b>: ${esc(p.semFoto)}` : '';
          } else try { canalLocal.postMessage(p); } catch { /* */ }
        } else if (ev === 'encerrado') { encerrado = true; $('#a-encerrado', raiz).classList.remove('oculto'); $('#a-msg', raiz).textContent = 'O balcão principal foi fechado.'; }
        else if (ev === 'assumido' && p?.disp !== disp) { encerrado = false; $('#a-encerrado', raiz).classList.add('oculto'); rt.enviar('ola', {}); }
        marcarCon();
      }
    });
  } else $('#a-msg', raiz).textContent = 'Sem conexão com o servidor: o espelho precisa de internet.';
  // relógio próprio e checagem do principal
  timers.rel = setInterval(() => { $('#a-relogio', raiz).textContent = horaSegDe(relogio.agora()); marcarCon(); }, 1000);
  timers.st = setInterval(async () => {
    try {
      const st = await api('balcao_status', {}, { timeout: 8000 });
      if (!st.ativo) { encerrado = true; $('#a-encerrado', raiz).classList.remove('oculto'); }
      else if (st.ativo.dispositivo === disp) { limpar(); aoAssumir?.(st.canal); }
      else { encerrado = false; $('#a-encerrado', raiz).classList.add('oculto'); principalNome = st.ativo.usuario; $('#a-princ', raiz).textContent = principalNome; }
    } catch { /* sem internet */ }
  }, 15000);
  // teclas: deste notebook (ou do iframe) viram comandos para o balcão principal
  const aoTecla = (e) => {
    if (document.querySelector('.fundo-modal')) return;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
    let k = e.key; const cod = e.code || '';
    if (/^Numpad\d$/.test(cod)) k = cod.slice(-1);
    else if (cod === 'NumpadEnter') k = 'Enter';
    else if (k === '-' || k === 'Delete' || cod === 'NumpadSubtract' || cod === 'NumpadDecimal') k = 'Escape';
    if (/^\d$/.test(k) || ['Enter', 'Backspace', 'Escape'].includes(k)) { e.preventDefault(); tecla(k); }
  };
  document.addEventListener('keydown', aoTecla);
  canalLocal.onmessage = (e) => {
    if (e.data?.tipo === 'tecla' && !document.querySelector('.fundo-modal')) tecla(e.data.k);
    else if (e.data?.tipo === 'ola' && rt && conectado) rt.enviar('ola', {});
  };
  $('#a-tecpop', raiz).addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return; b.blur();
    tecla(b.dataset.d || b.dataset.a);
  });
  const tecAberto = (v) => { $('#a-tecpop', raiz).classList.toggle('oculto', !v); $('#a-tec', raiz).classList.toggle('ativo', v); };
  $('#a-tec', raiz).onclick = () => tecAberto($('#a-tecpop', raiz).classList.contains('oculto'));
  $('#a-total', raiz).onclick = () => modal({ titulo: `Registros de hoje (${nHoje})`, corpo: `<ul class="lista-hoje">${lista.map((u) => `<li class="${u.semFoto ? 'sem-foto' : ''}"><span class="hora">${esc(u.h)}</span>
      <span class="nome">${esc(u.nome)}</span>${u.t === 'lanche' ? '<span class="selo azul">lanche</span>' : '<span class="selo verde">almoço</span>'}${u.semFoto ? '<span class="selo vermelho">sem foto</span>' : ''}${u.fora ? '<span class="selo ambar">fora</span>' : ''}${u.offline ? '<span class="selo">fila</span>' : ''}</li>`).join('') || '<li class="mudo">Nenhum registro ainda.</li>'}</ul>`, botoes: [{ texto: 'Fechar' }] });
  $('#a-registros', raiz).onclick = () => { location.hash = '#/registros'; };
  $('#a-semfoto', raiz).onclick = () => {
    modal({ titulo: 'Próximo registro sem foto', corpo: `<p style="margin:0">Justificativa (vale para o próximo registro feito no balcão principal):</p>
      ${JUSTIFICATIVAS.map((j, i) => `<label class="check"><input type="radio" name="just" value="${i}" ${i === 0 ? 'checked' : ''}> ${esc(j)}</label>`).join('')}
      <label class="campo"><span>Detalhe (obrigatório em "Outro motivo")</span><input type="text" data-det maxlength="300"></label>`,
      botoes: [{ texto: 'Cancelar' }, { texto: 'Enviar ao balcão', classe: 'primario', acao: (fechar, el) => {
        const i = Number($('input[name=just]:checked', el).value), det = $('[data-det]', el).value.trim();
        if (i === 3 && det.length < 5) { aviso('Descreva o motivo.', 'erro'); return false; }
        cmd({ k: 'semfoto', j: i === 3 ? det : JUSTIFICATIVAS[i] + (det ? ` · ${det}` : '') }); fechar(); return false;
      } }] });
  };

  const assumirAqui = async () => {
    if (!encerrado && !(await confirmar(`Assumir o balcão? O notebook de ${esc(principalNome)} deixa de registrar e passa a ser apoio.`, { ok: 'Assumir', perigo: true }))) return;
    try {
      const r = await api('balcao_assumir', { p_dispositivo: disp, p_forcar: true });
      if (rt) rt.enviar('assumido', { disp });
      limpar(); setTimeout(() => aoAssumir?.(r.canal), 400);
    } catch (e) { aviso(e.message, 'erro'); }
  };
  $('#a-assumir', raiz).onclick = assumirAqui; $('#a-abrir', raiz).onclick = assumirAqui;
  $('#a-sair', raiz).onclick = () => aoSair();
  let limpo = false;
  function limpar() {
    if (limpo) return; limpo = true;
    Object.values(timers).forEach((t) => clearInterval(t));
    document.removeEventListener('keydown', aoTecla);
    try { canalLocal.close(); } catch { /* */ }
    if (rt) setTimeout(() => rt.fechar(), 500);
  }
  marcarCon();
  return limpar;
}

// Rosto muito parecido com o de outro aluno (registro pelo CPF): a foto não vira referência direto.
// Ela vai para "Validar rostos" como pendente e só passa a valer depois que o administrador aprovar.
async function proporFaceDuvidosa(it) {
  if (it.metodo !== 'cpf' || !it.fotoId) return; // sem foto guardada não há o que validar
  const base = { p_aluno_id: it.aluno_id, p_descriptor: it.descritor, p_foto_id: it.fotoId };
  try { await api('salvar_face', { ...base, p_origem: 'cpf', p_confirmada: false }); }
  catch (e) {
    if (e.rede) throw e; // sem internet: tenta de novo depois
    // banco ainda sem a pendência pelo CPF: o operador propõe pela via que já existe (fica pendente);
    // com administrador no balcão nada é gravado, porque por essa via a foto seria aprovada na hora
    if (sessao.perfil === 'operador') {
      try { await api('salvar_face', { ...base, p_origem: 'manual', p_confirmada: false }); }
      catch (e2) { if (e2.rede) throw e2; console.warn('face duvidosa', e2); }
    }
  }
}
