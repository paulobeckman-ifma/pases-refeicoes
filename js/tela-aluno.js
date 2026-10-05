// Tela voltada ao aluno (2º monitor) e espelho dentro do balcão (?embed=1). Recebe os eventos do balcão pelo BroadcastChannel.
import { abrirCamera, pararCamera, preferencias, desenharMoldura, aplicarZoom } from './camera.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ICO = {
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  alerta: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"><path d="M12 8v5m0 4h.01"/></svg>'
};
const EMBED = new URLSearchParams(location.search).has('embed');
const APOIO = new URLSearchParams(location.search).has('apoio');   // notebook de apoio: sem câmera, mostra o último quadro do balcão principal
if (EMBED) document.body.classList.add('embed');

const canal = new BroadcastChannel('pases-tela-aluno');
const video = $('#video'), over = $('#over'), painel = $('#painel'), camBox = $('#camera');
let stream = null, espelhar = preferencias.espelhar, cameraId = preferencias.camera, zoom = preferencias.zoom, tam = preferencias.moldura;
let retorno = null, ultimoEstado = '', rostoAtual = { box: null, cor: '#fff', fora: false };

async function iniciarCamera() {
  if (APOIO) return;
  pararCamera(stream);
  aplicarZoom(video, zoom, espelhar); over.style.transform = espelhar ? 'scaleX(-1)' : '';
  try { stream = await abrirCamera(video, cameraId); $('#semcam').hidden = true; }
  catch (e) { stream = null; $('#semcam').hidden = false; }
  desenhar();
}

// a câmera fica ligada o tempo todo, mas a imagem só aparece durante o reconhecimento e a confirmação
const COM_IMAGEM = APOIO ? ['capturando', 'confirmar', 'processando', 'naoreconhecido'] : ['capturando', 'confirmar', 'processando'];
let quadro = null;
function imagem(visivel) {
  if (APOIO) {
    // no apoio não há vídeo: mostra o último quadro capturado pelo balcão principal (fim do reconhecimento)
    const img = $('#quadro'); const mostrar = visivel && quadro && ultimoEstado !== 'capturando';
    img.hidden = !mostrar; if (mostrar) img.src = quadro.img; img.style.transform = quadro?.espelho ? 'scaleX(-1)' : '';
    camBox.classList.toggle('espera', !mostrar);
    $('#repouso-txt').innerHTML = ultimoEstado === 'capturando' ? '<b>Reconhecendo…</b><span>o aluno está diante da câmera do balcão principal</span>' : '<b>Espelho do balcão</b><span>a imagem aparece ao fim do reconhecimento</span>';
    return;
  }
  camBox.classList.toggle('espera', !visivel); if (visivel) desenhar();
}
if (APOIO) {
  video.hidden = true; over.hidden = true;
  camBox.insertAdjacentHTML('beforeend', '<img id="quadro" alt="" hidden style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain">');
}

function desenhar() {
  const { box, cor, fora } = rostoAtual;
  desenharMoldura(over, video, { zoom, tam, box, cor, contorno: box ? 'rgba(53,208,90,.95)' : fora ? 'rgba(242,179,61,.95)' : 'rgba(255,255,255,.85)' });
}
window.addEventListener('resize', desenhar);
video.addEventListener('loadedmetadata', desenhar);

function mostrar(html, classe = '') { painel.className = 'painel ' + classe; painel.innerHTML = html; }
// opções do dia: o aluno pode trocar com 1 (refeição) ou 2 (lanche) antes do ENTER
const escolha = (t, md) => `<div class="escolha">
    <div class="opcao ${t !== 'lanche' ? 'sel' : ''}"><span class="tecla">1</span>Almoço</div>
    <div class="opcao lanche ${t === 'lanche' ? 'sel' : ''}"><span class="tecla">2</span>Lanche</div></div>
  <p class="escolha-nota">${md && t !== md ? `<b>Troca:</b> seu cadastro é de ${md === 'lanche' ? 'lanche' : 'almoço'}` : 'Conforme seu cadastro · tecle 1 ou 2 para mudar'}</p>`;
const modalidade = (t) => `<div class="modalidade ${t === 'lanche' ? 'lanche' : ''}"><small>Beneficiário de</small>${t === 'lanche' ? 'Lanche' : 'Almoço'}</div>`;

function estadoPadrao() {
  imagem(false);
  mostrar(`<h2>Bem-vindo(a)!</h2>
    <p class="grande">Aperte <span class="tecla">ENTER</span> para o reconhecimento facial</p>
    <p>ou digite seu <b>CPF</b> no teclado</p>`);
}

function aoEstado(m) {
  if (m.estado === ultimoEstado && !['confirmar', 'processando', 'capturando'].includes(m.estado)) return;
  ultimoEstado = m.estado;
  clearTimeout(retorno);
  imagem(COM_IMAGEM.includes(m.estado));
  switch (m.estado) {
    case 'aguardando': estadoPadrao(); break;
    case 'capturando':
      quadro = null; imagem(true);
      $('#dica').textContent = 'Encaixe seu rosto na moldura';
      mostrar(`<div class="girando"></div><h2>Olhe para a câmera</h2><p class="grande">Encaixe o rosto dentro da moldura e fique parado</p>
        <p>Não funcionou? Digite seu CPF.</p>`); break;
    case 'naoreconhecido':
      mostrar(`<h2>Não reconhecemos seu rosto</h2><p class="grande">Digite seu <b>CPF</b> no teclado</p>
        <p>${esc(m.motivo || 'A foto de hoje será usada para reconhecer você nos próximos dias.')}</p>`, 'aviso'); break;
    case 'confirmar': {
      $('#dica').textContent = 'Identificado';
      mostrar(`<div class="fotos uma"><div class="foto">${m.foto ? `<img src="${m.foto}" alt="">` : 'Sem foto de cadastro'}<span>Cadastro</span></div></div>
        <div class="nome">${esc(m.nome)}</div><div class="sub">Matrícula ${esc(m.matricula || '')}<br>${esc(m.curso || '')}</div>
        ${escolha(m.tipoSel, m.md)}
        ${(m.atendente || m.porCpf) ? `<p class="grande">${m.passo === 2 ? 'Aguarde: o atendente vai confirmar' : 'Fique de frente para a câmera'}</p><p>Quem confirma este registro é o atendente.</p>` : `<p class="grande">Confirme com <span class="tecla">ENTER</span></p>`}
        <p>Não é você? Tecle <span class="tecla">ESC</span> ou <span class="tecla">-</span>.</p>`, 'ok'); break; }
    case 'cpf':
      mostrar(`<h2>Digite seu CPF</h2><div class="cpf" id="cpf">&nbsp;</div><p>Ao digitar o último número, seus dados aparecem para você confirmar.</p>`); break;
    case 'processando':
      mostrar(`<div class="girando"></div><h2>${m.nome ? 'Registrando…' : 'Conferindo…'}</h2>${m.nome ? `<p class="grande">${esc(m.nome)}</p>` : ''}`); break;
    case 'atendente':
      mostrar(`<h2>Aguarde o atendente</h2><p class="grande">A câmera não pôde registrar sua foto.</p>`, 'aviso'); break;
    case 'fechado':
      mostrar(`<h2>Balcão fechado</h2><p>Aguarde a abertura do atendimento.</p>`); break;
    default: estadoPadrao();
  }
}

function aoResultado(m) {
  ultimoEstado = 'resultado'; imagem(false);
  const icone = m.classe === 'ok' ? ICO.check : m.classe === 'aviso' ? ICO.alerta : ICO.x;
  let corpo = '';
  if (m.status === 'ok') {
    corpo = `<div class="fotos"><div class="foto">${m.fotoCadastro ? `<img src="${m.fotoCadastro}" alt="">` : 'Sem foto de cadastro'}<span>Cadastro</span></div>
      <div class="foto ${m.fotoAgora ? '' : 'sem'}">${m.fotoAgora ? `<img src="${m.fotoAgora}" alt="">` : 'SEM FOTO'}<span>Agora</span></div></div>
      <div class="nome">${esc(m.nome)}</div><div class="sub">Matrícula ${esc(m.matricula || '')} · ${esc(m.hora || '')}</div>
      ${m.dentro === false ? `<p class="grande" style="color:#ffd98f">Registrado fora do horário (${esc(m.inicio)} às ${esc(m.fim)})</p>` : `<p class="grande">${m.tipoReg === 'lanche' ? 'Bom lanche!' : 'Bom almoço!'}</p>`}`;
  } else if (m.status === 'duplicado') {
    corpo = `<div class="nome">${esc(m.nome || '')}</div><p class="grande">Você já teve ${m.tipoReg === 'lanche' ? 'lanche' : 'almoço'} registrado hoje às <b>${esc(m.hora || '')}</b>.</p><p>Vale um almoço OU um lanche por dia.</p>`;
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
    const mudou = m.camera !== cameraId;
    cameraId = m.camera; espelhar = m.espelhar;
    if (m.zoom) zoom = m.zoom; if (m.moldura) tam = m.moldura;
    aplicarZoom(video, zoom, espelhar); over.style.transform = espelhar ? 'scaleX(-1)' : '';
    if (mudou || !stream) iniciarCamera(); else desenhar();
  } else if (m.tipo === 'camera') {
    if (m.ok && !stream) iniciarCamera();
  } else if (m.tipo === 'rosto') { rostoAtual = { box: m.box, cor: m.cor, fora: m.foraMoldura }; desenhar(); }
  else if (m.tipo === 'frame') { if (APOIO) { quadro = { img: m.img, espelho: m.espelho }; imagem(COM_IMAGEM.includes(ultimoEstado)); } }
  else if (m.tipo === 'previa') { if (m.on) $('#dica').textContent = 'Ajuste do enquadramento'; imagem(m.on || COM_IMAGEM.includes(ultimoEstado)); }
  else if (m.tipo === 'estado') aoEstado(m);
  else if (m.tipo === 'cpf') { const el = $('#cpf'); if (el) el.textContent = m.texto || ' '; }
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
