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

const maior = (lista) => lista.reduce((a, b) => (!a || b.detection.box.area > a.detection.box.area ? b : a), null);

/** Detecção rápida em vídeo ao vivo. Retorna o maior rosto com descritor, ou null. */
export async function detectarAoVivo(video) {
  const fa = await carregarFace();
  const r = await fa.detectAllFaces(video, new fa.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
    .withFaceLandmarks().withFaceDescriptors();
  const f = maior(r); if (!f) return { rosto: null, quantidade: 0 };
  return { rosto: f, quantidade: r.length };
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
