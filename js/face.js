// Reconhecimento facial no navegador (face-api / TensorFlow.js). Nenhuma imagem sai do computador para ser analisada.
import { CFG, carregarScript } from './util.js';

let carregando = null;
export let faceErro = null;

export function carregarFace() {
  if (!carregando) {
    carregando = (async () => {
      await carregarScript(CFG.FACE_API_URL);
      const fa = window.faceapi;
      // WebGL (placa de vídeo) é o mais rápido; sem ele, usa a CPU
      let ok = false;
      try { ok = await fa.tf.setBackend('webgl'); } catch { ok = false; }
      if (!ok) await fa.tf.setBackend('cpu');
      await fa.tf.ready();
      const M = CFG.FACE_MODELOS_URL;
      await Promise.all([
        fa.nets.tinyFaceDetector.loadFromUri(M),
        fa.nets.ssdMobilenetv1.loadFromUri(M),
        fa.nets.faceLandmark68Net.loadFromUri(M),
        fa.nets.faceRecognitionNet.loadFromUri(M)
      ]);
      return fa;
    })().catch((e) => { faceErro = e; carregando = null; throw e; });
  }
  return carregando;
}

/** Moldura oval do balcão, em frações do quadro da câmera (centro 0,5 × 0,5; raios horizontal e vertical). */
export const MOLDURA = { rx: 0.2, ry: 0.36 };

const maior = (lista) => lista.reduce((a, b) => (!a || b.detection.box.area > a.detection.box.area ? b : a), null);

/** Detecção rápida em vídeo ao vivo. Retorna o maior rosto com descritor, ou null. */
export async function detectarAoVivo(video, M = MOLDURA) {
  const fa = await carregarFace();
  // com placa de vídeo usa entrada maior (caixa do rosto mais precisa = descritor melhor); na CPU fica leve
  const tam = fa.tf.getBackend() === 'webgl' ? 416 : 320;
  const r = await fa.detectAllFaces(video, new fa.TinyFaceDetectorOptions({ inputSize: tam, scoreThreshold: 0.45 }))
    .withFaceLandmarks().withFaceDescriptors();
  // Fila atrás do aluno: só vale o rosto com o centro dentro da moldura oval; entre esses, o maior e mais centralizado.
  const vw = video.videoWidth || 1, vh = video.videoHeight || 1;
  const pontos = r.map((f) => {
    const b = f.detection.box, dx = ((b.x + b.width / 2) / vw - 0.5) / M.rx, dy = ((b.y + b.height / 2) / vh - 0.5) / M.ry;
    const dist = Math.hypot(dx, dy);                 // 0 = centro, 1 = borda da moldura
    return { f, dist, nota: (b.width / vw) * (1.2 - Math.min(dist, 1)) };
  }).filter((x) => x.dist <= 1 && x.f.detection.box.width >= vw * M.rx * 2 * 0.3);   // rosto pequeno dentro da moldura = pessoa ao fundo
  if (!pontos.length) return { rosto: null, quantidade: r.length, foraMoldura: r.length > 0 };
  pontos.sort((a, b) => b.nota - a.nota);
  return { rosto: pontos[0].f, quantidade: r.length };
}

/** Descritor de alta qualidade a partir de imagem/canvas (usado em cadastro e foto base). */
export async function descritorDeImagem(fonte, { minimoLargura = 60 } = {}) {
  const fa = await carregarFace();
  const r = await fa.detectAllFaces(fonte, new fa.SsdMobilenetv1Options({ minConfidence: 0.45 }))
    .withFaceLandmarks().withFaceDescriptors();
  const f = maior(r);
  if (!f || f.detection.box.width < minimoLargura) return null;
  return { descritor: Array.from(f.descriptor, (v) => Math.round(v * 1e6) / 1e6), pontuacao: f.detection.score, largura: f.detection.box.width, quantidade: r.length };
}

/**
 * Várias referências a partir de uma única foto (ex.: foto do SUAP, antiga ou pequena):
 * original, espelhada e com correção de luz/contraste. Guardar mais de um descritor por aluno
 * (e comparar com o mais próximo) é a técnica padrão para compensar diferença de câmera, pose e iluminação.
 */
export async function descritoresReferencia(img, { max = 3 } = {}) {
  const fa = await carregarFace();
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  const k = w < 480 ? 480 / w : 1;                                    // fotos pequenas: amplia antes de detectar
  const base = document.createElement('canvas'); base.width = Math.round(w * k); base.height = Math.round(h * k);
  const g = base.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, base.width, base.height);
  const variante = (fn) => { const c = document.createElement('canvas'); c.width = base.width; c.height = base.height; fn(c.getContext('2d'), c); return c; };
  const espelho = variante((x, c) => { x.translate(c.width, 0); x.scale(-1, 1); x.drawImage(base, 0, 0); });
  const luz = variante((x) => { x.filter = 'brightness(1.12) contrast(1.18) saturate(0.9)'; x.drawImage(base, 0, 0); });
  const detectar = async (c) => {
    let r = await fa.detectAllFaces(c, new fa.SsdMobilenetv1Options({ minConfidence: 0.35 })).withFaceLandmarks().withFaceDescriptors();
    if (!r.length) r = await fa.detectAllFaces(c, new fa.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.35 })).withFaceLandmarks().withFaceDescriptors();
    const f = maior(r);
    return f && f.detection.box.width >= 40 ? Array.from(f.descriptor, (v) => Math.round(v * 1e6) / 1e6) : null;
  };
  const out = [];
  for (const c of [base, espelho, luz]) { const d = await detectar(c); if (d) out.push(d); if (out.length >= max) break; }
  return out;
}

/** Média de vários descritores do mesmo rosto (quadros seguidos do vídeo): reduz o ruído de cada quadro. */
export function descritorMedio(lista) {
  if (!lista.length) return null;
  const m = new Float32Array(128);
  for (const d of lista) for (let i = 0; i < 128; i++) m[i] += d[i];
  for (let i = 0; i < 128; i++) m[i] /= lista.length;
  return m;
}

export function imagemDeDataUrl(url) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
}

/** Compara um descritor com todos os cadastrados. */
export class Reconhecedor {
  constructor(faces = []) { this.carregar(faces); }
  carregar(faces) { this.itens = faces.filter((f) => f.d?.length === 128).map((f) => ({ a: f.a, d: Float32Array.from(f.d) })); }
  get tamanho() { return this.itens.length; }
  melhor(desc) {
    const porAluno = new Map();
    for (const it of this.itens) {
      let s = 0; const d = it.d;
      for (let i = 0; i < 128; i++) { const x = d[i] - desc[i]; s += x * x; }
      const dist = Math.sqrt(s);
      if (!porAluno.has(it.a) || dist < porAluno.get(it.a)) porAluno.set(it.a, dist);
    }
    const ord = [...porAluno.entries()].sort((a, b) => a[1] - b[1]);
    if (!ord.length) return null;
    return { aluno: ord[0][0], distancia: ord[0][1], segundo: ord[1] ? ord[1][1] : Infinity };
  }
}

/** Converte distância em "semelhança" legível (aprox.). */
export const semelhanca = (d) => Math.max(0, Math.min(100, Math.round((1 - d / 1.1) * 100)));
