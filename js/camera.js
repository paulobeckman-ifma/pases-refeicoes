// Webcam: escolha do dispositivo, abertura e captura de foto
const K_CAM = 'pases_camera', K_ROT = 'pases_camera_rotulo', K_ESP = 'pases_espelhar';

export const preferencias = {
  get camera() { return localStorage.getItem(K_CAM) || ''; },
  get rotulo() { return localStorage.getItem(K_ROT) || ''; },
  get espelhar() { return localStorage.getItem(K_ESP) !== '0'; },
  salvar({ camera, rotulo, espelhar }) {
    if (camera !== undefined) localStorage.setItem(K_CAM, camera);
    if (rotulo !== undefined) localStorage.setItem(K_ROT, rotulo);
    if (espelhar !== undefined) localStorage.setItem(K_ESP, espelhar ? '1' : '0');
  }
};

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
