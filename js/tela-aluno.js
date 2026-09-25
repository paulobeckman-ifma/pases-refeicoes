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

const MOLDURA = { rx: 0.2, ry: 0.36 };   // igual a face.js
function desenharRosto(box, cor, foraMoldura) {
  const cw = over.clientWidth, ch = over.clientHeight;
  over.width = cw; over.height = ch;
  const g = over.getContext('2d'); g.clearRect(0, 0, cw, ch);
  if (!video.videoWidth) return;
  // o vídeo usa object-fit: cover
  const vw = video.videoWidth, vh = video.videoHeight, s = Math.max(cw / vw, ch / vh);
  const ox = (cw - vw * s) / 2, oy = (ch - vh * s) / 2;
  g.save(); g.setLineDash([18, 12]); g.lineWidth = 5;
  g.strokeStyle = box ? 'rgba(53,208,90,.95)' : foraMoldura ? 'rgba(242,179,61,.95)' : 'rgba(255,255,255,.8)';
  g.beginPath(); g.ellipse(cw / 2, ch / 2, vw * s * MOLDURA.rx, vh * s * MOLDURA.ry, 0, 0, Math.PI * 2); g.stroke(); g.restore();
  if (!box && foraMoldura) $('#dica').textContent = 'Encaixe seu rosto na moldura';
  if (!box) return;
  g.strokeStyle = cor || '#fff'; g.lineWidth = 6;
  const x = ox + box.x * vw * s, y = oy + box.y * vh * s, w = box.w * vw * s, h = box.h * vh * s;
  g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, 18) : g.rect(x, y, w, h); g.stroke();
}

function mostrar(html, classe = '') { painel.className = 'painel ' + classe; painel.innerHTML = html; }

function estadoPadrao() {
  $('#dica').textContent = 'Encaixe seu rosto na moldura';
  mostrar(`<h2>Bem-vindo(a)!</h2><p class="grande">Encaixe seu rosto na moldura da câmera</p>
    <p>ou digite seu <b>CPF</b> no teclado e pressione <span class="tecla">ENTER</span></p>`);
}

function aoEstado(m) {
  if (m.estado === ultimoEstado && !['confirmar', 'tipo', 'processando'].includes(m.estado)) return;
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
    case 'confirmar': case 'tipo': {
      $('#dica').textContent = 'Identificado';
      const op = (t, n, r) => `<div class="opcao ${m.tipoSel === t ? 'sel' : ''}"><span class="tecla">${n}</span> ${r}</div>`;
      mostrar(`<div class="fotos uma"><div class="foto">${m.foto ? `<img src="${m.foto}" alt="">` : 'Sem foto de cadastro'}<span>Cadastro</span></div></div>
        <div class="nome">${esc(m.nome)}</div><div class="sub">Matrícula ${esc(m.matricula || '')}<br>${esc(m.curso || '')}</div>
        <div class="opcoes">${op('refeicao', 1, 'Refeição')}${op('lanche', 2, 'Lanche')}</div>
        ${m.tipoSel ? (m.confirmar === false ? '<p>Registrando…</p>' : `<p class="grande">Confirme com <span class="tecla">ENTER</span></p>`)
          : '<p class="grande">Tecle <span class="tecla">1</span> ou <span class="tecla">2</span></p>'}
        ${m.estado === 'confirmar' ? '<p>Não é você? Tecle <span class="tecla">-</span> e digite seu CPF.</p>' : ''}`, 'ok'); break; }
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
      ${m.dentro === false ? `<p class="grande" style="color:#ffd98f">Registrado fora do horário (${esc(m.inicio)} às ${esc(m.fim)})</p>` : `<p class="grande">${m.tipoReg === 'lanche' ? 'Bom lanche!' : 'Bom almoço!'}</p>`}`;
  } else if (m.status === 'duplicado') {
    corpo = `<div class="nome">${esc(m.nome || '')}</div><p class="grande">Você já teve ${m.tipoReg === 'lanche' ? 'lanche' : 'refeição'} registrado hoje às <b>${esc(m.hora || '')}</b>.</p><p>Vale uma refeição OU um lanche por dia.</p>`;
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
  } else if (m.tipo === 'rosto') desenharRosto(m.box, m.cor, m.foraMoldura);
  else if (m.tipo === 'estado') aoEstado(m);
  else if (m.tipo === 'cpf') { const el = $('#cpf'); if (el) el.textContent = m.texto || ' '; }
  else if (m.tipo === 'resultado') aoResultado(m);
};

// O teclado numérico fica na frente do aluno: se esta janela estiver em foco, as teclas vão para o balcão.
document.addEventListener('keydown', (e) => {
  let k = e.key; const cod = e.code || '';
  if (/^Numpad\d$/.test(cod)) k = cod.slice(-1);
  else if (cod === 'NumpadEnter') k = 'Enter';
  else if (k === '-' || k === 'Delete' || cod === 'NumpadSubtract' || cod === 'NumpadDecimal') k = 'Escape';
  if (/^\d$/.test(k) || ['Enter', 'Backspace', 'Escape'].includes(k)) { e.preventDefault(); canal.postMessage({ tipo: 'tecla', k }); }
});

$('#cheia').onclick = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen());
estadoPadrao();
iniciarCamera();
canal.postMessage({ tipo: 'ola' });
