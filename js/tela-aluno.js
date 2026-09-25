// Tela voltada ao aluno (2º monitor). Recebe os eventos do balcão pelo BroadcastChannel.
import { abrirCamera, pararCamera, preferencias } from './camera.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ICO = {
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  alerta: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"><path d="M12 8v5m0 4h.01"/></svg>'
};
const canal = new BroadcastChannel('pases-tela-aluno');
const video = $('#video'), over = $('#over'), painel = $('#painel');
let stream = null, espelhar = preferencias.espelhar, cameraId = preferencias.camera, retorno = null, ultimoEstado = '';

async function iniciarCamera() {
  pararCamera(stream);
  video.classList.toggle('espelho', espelhar); over.classList.toggle('espelho', espelhar);
  try { stream = await abrirCamera(video, cameraId); $('#semcam').hidden = true; }
  catch (e) { stream = null; $('#semcam').hidden = false; }
}

function desenharRosto(box, cor) {
  const cw = over.clientWidth, ch = over.clientHeight;
  over.width = cw; over.height = ch;
  const g = over.getContext('2d'); g.clearRect(0, 0, cw, ch);
  if (!box || !video.videoWidth) return;
  // o vídeo usa object-fit: cover
  const vw = video.videoWidth, vh = video.videoHeight, s = Math.max(cw / vw, ch / vh);
  const ox = (cw - vw * s) / 2, oy = (ch - vh * s) / 2;
  g.strokeStyle = cor || '#fff'; g.lineWidth = 6;
  const x = ox + box.x * vw * s, y = oy + box.y * vh * s, w = box.w * vw * s, h = box.h * vh * s;
  g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, 18) : g.rect(x, y, w, h); g.stroke();
}

function mostrar(html, classe = '') { painel.className = 'painel ' + classe; painel.innerHTML = html; }

function estadoPadrao() {
  $('#dica').textContent = 'Olhe para a câmera';
  mostrar(`<h2>Bem-vindo(a)!</h2><p class="grande">Olhe para a câmera para ser identificado(a)</p>
    <p>ou digite seu <b>CPF</b> no teclado e pressione <span class="tecla">ENTER</span></p>`);
}

function aoEstado(m) {
  if (m.estado === ultimoEstado && !['confirmar', 'processando'].includes(m.estado)) return;
  ultimoEstado = m.estado;
  clearTimeout(retorno);
  switch (m.estado) {
    case 'aguardando': estadoPadrao(); break;
    case 'analisando':
      $('#dica').textContent = 'Identificando…';
      mostrar(`<div class="girando"></div><h2>Identificando…</h2><p>Mantenha o rosto parado, de frente para a câmera.</p>`); break;
    case 'naoreconhecido':
      $('#dica').textContent = 'Rosto não reconhecido';
      mostrar(`<h2>Não reconhecemos seu rosto</h2><p class="grande">Digite seu <b>CPF</b> no teclado e pressione <span class="tecla">ENTER</span></p>
        <p>A foto de hoje será usada para reconhecer você nos próximos dias.</p>`, 'aviso'); break;
    case 'confirmar':
      $('#dica').textContent = 'Identificado';
      mostrar(`<div class="fotos uma"><div class="foto">${m.foto ? `<img src="${m.foto}" alt="">` : 'Sem foto de cadastro'}<span>Cadastro</span></div></div>
        <div class="nome">${esc(m.nome)}</div><div class="sub">Matrícula ${esc(m.matricula || '')}<br>${esc(m.curso || '')}</div>
        ${m.confirmar === false ? '<p>Registrando…</p>' : `<p class="grande">É você? Pressione <span class="tecla">ENTER</span></p><p>Se não for, digite seu CPF.</p>`}`, 'ok'); break;
    case 'cpf':
      $('#dica').textContent = 'Digitando CPF';
      mostrar(`<h2>Digite seu CPF</h2><div class="cpf" id="cpf">&nbsp;</div><p>Pressione <span class="tecla">ENTER</span> para confirmar</p>`); break;
    case 'processando':
      mostrar(`<div class="girando"></div><h2>Registrando…</h2>${m.nome ? `<p class="grande">${esc(m.nome)}</p>` : ''}`); break;
    case 'atendente':
      mostrar(`<h2>Aguarde o atendente</h2><p class="grande">A câmera não pôde registrar sua foto.</p>`, 'aviso'); break;
    case 'fechado':
      mostrar(`<h2>Balcão fechado</h2><p>Aguarde a abertura do atendimento.</p>`); break;
    default: estadoPadrao();
  }
}

function aoResultado(m) {
  ultimoEstado = 'resultado';
  const icone = m.classe === 'ok' ? ICO.check : m.classe === 'aviso' ? ICO.alerta : ICO.x;
  let corpo = '';
  if (m.status === 'ok') {
    corpo = `<div class="fotos"><div class="foto">${m.fotoCadastro ? `<img src="${m.fotoCadastro}" alt="">` : 'Sem foto de cadastro'}<span>Cadastro</span></div>
      <div class="foto ${m.fotoAgora ? '' : 'sem'}">${m.fotoAgora ? `<img src="${m.fotoAgora}" alt="">` : 'SEM FOTO'}<span>Agora</span></div></div>
      <div class="nome">${esc(m.nome)}</div><div class="sub">Matrícula ${esc(m.matricula || '')} · ${esc(m.hora || '')}</div>
      ${m.dentro === false ? `<p class="grande" style="color:#ffd98f">Registrado fora do horário (${esc(m.inicio)} às ${esc(m.fim)})</p>` : '<p class="grande">Bom almoço!</p>'}`;
  } else if (m.status === 'duplicado') {
    corpo = `<div class="nome">${esc(m.nome || '')}</div><p class="grande">Sua refeição de hoje já foi registrada às <b>${esc(m.hora || '')}</b>.</p>`;
  } else if (m.status === 'nao_encontrado') {
    corpo = `<p class="grande">CPF não encontrado no PASES.</p><p>Confira os números ou procure a assistência estudantil.</p>`;
  } else if (m.status === 'cpf_invalido') {
    corpo = `<p class="grande">CPF inválido. Digite novamente.</p>`;
  } else if (m.status === 'inativo') {
    corpo = `<div class="nome">${esc(m.nome || '')}</div><p class="grande">Seu cadastro no PASES está inativo.</p><p>Procure a assistência estudantil.</p>`;
  } else corpo = `<p class="grande">Procure o atendente.</p>`;
  mostrar(`<div class="icone">${icone}</div><h2>${esc(m.titulo)}</h2>${corpo}`, m.classe);
  clearTimeout(retorno);
  retorno = setTimeout(() => { ultimoEstado = ''; estadoPadrao(); }, m.status === 'ok' ? 5000 : 7000);
}

canal.onmessage = (e) => {
  const m = e.data || {};
  if (m.tipo === 'topo') {
    $('#hora').textContent = m.hora;
    const f = $('#faixa'); f.className = 'faixa ' + (m.dentro ? 'ok' : 'fora');
    f.textContent = m.dentro ? `Almoço: ${m.inicio} às ${m.fim}` : `Fora do horário (${m.inicio} às ${m.fim})`;
  } else if (m.tipo === 'config') {
    const mudou = m.camera !== cameraId || m.espelhar !== espelhar;
    cameraId = m.camera; espelhar = m.espelhar;
    if (mudou || !stream) iniciarCamera();
  } else if (m.tipo === 'camera') {
    if (m.ok && !stream) iniciarCamera();
  } else if (m.tipo === 'rosto') desenharRosto(m.box, m.cor);
  else if (m.tipo === 'estado') aoEstado(m);
  else if (m.tipo === 'cpf') { const el = $('#cpf'); if (el) el.textContent = m.texto || ' '; }
  else if (m.tipo === 'resultado') aoResultado(m);
};

$('#cheia').onclick = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen());
estadoPadrao();
iniciarCamera();
canal.postMessage({ tipo: 'ola' });
