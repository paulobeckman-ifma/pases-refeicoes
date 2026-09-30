// Webcam: escolha do dispositivo, abertura e captura de foto
const K_CAM = 'pases_camera', K_ROT = 'pases_camera_rotulo', K_ESP = 'pases_espelhar', K_ZOOM = 'pases_zoom', K_MOLD = 'pases_moldura';
const num = (v, pad, min, max) => { const n = Number(v); return Number.isFinite(n) && v !== null ? Math.min(max, Math.max(min, n)) : pad; };

export const preferencias = {
  get camera() { return localStorage.getItem(K_CAM) || ''; },
  get rotulo() { return localStorage.getItem(K_ROT) || ''; },
  get espelhar() { return localStorage.getItem(K_ESP) !== '0'; },
  /** zoom da imagem no balcão: < 1 afasta (rosto menor na moldura), > 1 aproxima */
  get zoom() { return num(localStorage.getItem(K_ZOOM), 1, 0.5, 2.5); },
  /** tamanho da moldura oval (1 = padrão) */
  get moldura() { return num(localStorage.getItem(K_MOLD), 1, 0.7, 1.3); },
  salvar({ camera, rotulo, espelhar, zoom, moldura }) {
    if (camera !== undefined) localStorage.setItem(K_CAM, camera);
    if (rotulo !== undefined) localStorage.setItem(K_ROT, rotulo);
    if (espelhar !== undefined) localStorage.setItem(K_ESP, espelhar ? '1' : '0');
    if (zoom !== undefined) localStorage.setItem(K_ZOOM, String(zoom));
    if (moldura !== undefined) localStorage.setItem(K_MOLD, String(moldura));
  }
};

/*
 * Moldura oval (formato de rosto, mais alta que larga), fixa na tela; o zoom só aumenta ou diminui a imagem.
 * Em coordenadas do quadro da câmera (0 a 1), a moldura vale: ry = 0,42 × tamanho ÷ zoom; rx = ry × (altura ÷ largura) ÷ 1,3.
 */
export const MOLDURA_BASE = 0.42, MOLDURA_PROPORCAO = 1.3;
export function molduraVideo(vw, vh, zoom = preferencias.zoom, tam = preferencias.moldura) {
  const ry = (MOLDURA_BASE * tam) / zoom;
  return { rx: (ry * (vh / vw)) / MOLDURA_PROPORCAO, ry };
}

/**
 * Desenha a moldura sobre a imagem (vídeo com object-fit: contain e transform: scale(zoom)):
 * escurece tudo fora do contorno para destacar a área de captura e, se houver, contorna o rosto detectado.
 */
export function desenharMoldura(canvas, video, { zoom = preferencias.zoom, tam = preferencias.moldura, box = null, cor = '#fff', contorno = 'rgba(255,255,255,.85)', escuro = 0.6 } = {}) {
  const cw = canvas.clientWidth, ch = canvas.clientHeight;
  if (canvas.width !== cw) canvas.width = cw; if (canvas.height !== ch) canvas.height = ch;
  const g = canvas.getContext('2d'); g.clearRect(0, 0, cw, ch);
  const vw = video.videoWidth || 16, vh = video.videoHeight || 9;
  const s0 = Math.min(cw / vw, ch / vh), ry = MOLDURA_BASE * tam * vh * s0, rx = ry / MOLDURA_PROPORCAO;
  g.save();
  g.fillStyle = `rgba(0,0,0,${escuro})`; g.fillRect(0, 0, cw, ch);
  g.globalCompositeOperation = 'destination-out';
  g.beginPath(); g.ellipse(cw / 2, ch / 2, rx, ry, 0, 0, Math.PI * 2); g.fill();
  g.restore();
  g.save(); g.setLineDash([16, 11]); g.lineWidth = Math.max(3, ch / 160); g.strokeStyle = contorno;
  g.beginPath(); g.ellipse(cw / 2, ch / 2, rx, ry, 0, 0, Math.PI * 2); g.stroke(); g.restore();
  if (box && video.videoWidth) {
    const s = s0 * zoom, ox = (cw - vw * s) / 2, oy = (ch - vh * s) / 2;
    g.strokeStyle = cor; g.lineWidth = Math.max(3, ch / 140);
    const x = ox + box.x * vw * s, y = oy + box.y * vh * s, w = box.w * vw * s, h = box.h * vh * s;
    g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, 14) : g.rect(x, y, w, h); g.stroke();
  }
}

/** Aplica zoom e espelhamento ao elemento de vídeo (o vídeo deve usar object-fit: contain). */
export function aplicarZoom(video, zoom = preferencias.zoom, espelhar = preferencias.espelhar) {
  video.style.transform = `${espelhar ? 'scaleX(-1) ' : ''}scale(${zoom})`;
}

export async function listarCameras() {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  let lista = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
  if (lista.length && !lista[0].label) {
    // os nomes só aparecem depois da permissão
    try { const s = await navigator.mediaDevices.getUserMedia({ video: true }); s.getTracks().forEach((t) => t.stop()); } catch { /* sem permissão */ }
    lista = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
  }
  return lista;
}

/** Abre a câmera escolhida em Configurações. Se ela sumir (USB desconectada), NÃO usa outra: falha e avisa. */
export async function abrirCamera(video, deviceId = preferencias.camera) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Este navegador não permite acesso à câmera (use Chrome ou Edge, em endereço https).');
  let id = deviceId;
  if (id) {
    const lista = await listarCameras();
    if (!lista.some((d) => d.deviceId === id)) {
      const porNome = lista.find((d) => d.label && d.label === preferencias.rotulo);
      if (porNome) { id = porNome.deviceId; preferencias.salvar({ camera: id }); }
      else throw new Error('A câmera selecionada não foi encontrada. Verifique o cabo USB ou escolha outra em Configurações.');
    }
  }
  const video_ = { width: { ideal: 1280 }, height: { ideal: 720 } };
  if (id) video_.deviceId = { exact: id };
  const stream = await navigator.mediaDevices.getUserMedia({ video: video_, audio: false });
  video.srcObject = stream; video.muted = true; video.playsInline = true;
  await video.play();
  return stream;
}

export function pararCamera(stream) { stream?.getTracks().forEach((t) => t.stop()); }

export function cameraAtiva(video) {
  const t = video?.srcObject?.getVideoTracks?.()[0];
  return !!t && t.readyState === 'live' && video.videoWidth > 0;
}

/** Captura um quadro. Retorna { dataUrl, canvas } em JPEG (largura padrão 480 px ≈ 20–35 KB). */
export function capturar(video, largura = 480, qualidade = 0.78) {
  const w = video.videoWidth, h = video.videoHeight; if (!w) return null;
  const esc = largura / w;
  const c = document.createElement('canvas'); c.width = largura; c.height = Math.round(h * esc);
  c.getContext('2d').drawImage(video, 0, 0, c.width, c.height);
  return { dataUrl: c.toDataURL('image/jpeg', qualidade), canvas: c };
}

/** Reduz uma imagem (arquivo ou dataURL) para JPEG. */
export function reduzirImagem(fonte, largura = 480, qualidade = 0.8) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const esc = Math.min(1, largura / img.naturalWidth);
      const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * esc); c.height = Math.round(img.naturalHeight * esc);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      res({ dataUrl: c.toDataURL('image/jpeg', qualidade), canvas: c });
    };
    img.onerror = () => rej(new Error('Imagem inválida'));
    if (fonte instanceof Blob) { const r = new FileReader(); r.onload = () => (img.src = r.result); r.readAsDataURL(fonte); }
    else img.src = fonte;
  });
}
