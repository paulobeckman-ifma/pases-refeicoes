// Utilitários gerais do PASES Refeições
export const CFG = window.PASES_CONFIG;
export const FUSO = CFG.FUSO || 'America/Fortaleza';

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ------------------------------------------------------------------ ícones (traço, 24x24)
const P = {
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  alerta: '<path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
  relogio: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3.5"/>',
  semcamera: '<path d="M2 2l20 20M9.5 4h5L17 7h3a2 2 0 0 1 2 2v8.3M16 16a3.5 3.5 0 0 1-5-5M4 7h0a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h14"/>',
  usuario: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  usuarios: '<circle cx="9" cy="8" r="4"/><path d="M1 21a8 8 0 0 1 16 0M17 4a4 4 0 0 1 0 8m6 9a8 8 0 0 0-4-7"/>',
  lista: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  grafico: '<path d="M3 3v18h18"/><path d="M7 16v-5m5 5V8m5 8v-9"/>',
  config: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  escudo: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  casa: '<path d="M3 10.5 12 3l9 7.5V21H3z"/><path d="M9 21v-6h6v6"/>',
  sair: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  baixar: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  enviar: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  imprimir: '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/>',
  atualizar: '<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8M21 3v5h-5"/>',
  rosto: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/>',
  mais: '<path d="M12 5v14M5 12h14"/>',
  editar: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  lixo: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
  olho: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  online: '<path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M2 9a15 15 0 0 1 20 0M12 20h.01"/>',
  offline: '<path d="M2 2l20 20M8.5 16a5 5 0 0 1 7 0M5 12.5a10 10 0 0 1 5.2-2.8M19 12.5a10 10 0 0 0-2.2-1.7M2 9a15 15 0 0 1 4.4-2.8M22 9a15 15 0 0 0-11-3.9M12 20h.01"/>',
  chave: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="M10.7 12.3 21 2m-4 4 3 3m-6 0 2 2"/>',
  monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
  balcao: '<path d="M4 11h16v10H4zM2 11l2-6h16l2 6M9 15h6"/>',
  nuvem: '<path d="M17.5 19a4.5 4.5 0 1 0-1.4-8.8A6 6 0 0 0 4 12a4 4 0 0 0 1 7.9z"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  historico: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l4 2"/>'
};
export const ico = (n, cls = '') =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || ''}</svg>`;

// ------------------------------------------------------------------ datas (sempre no fuso do campus)
const fmtISO = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' });
const fmtHora = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit', hour12: false });
const fmtHoraSeg = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
export const isoDe = (d = new Date()) => fmtISO.format(d);
export const hojeISO = () => isoDe(new Date());
export const horaDe = (d = new Date()) => fmtHora.format(d);
export const horaSegDe = (d = new Date()) => fmtHoraSeg.format(d);
export function addDias(iso, n) {
  const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}
export const diaSemanaNum = (iso) => { const w = new Date(iso + 'T12:00:00Z').getUTCDay(); return w === 0 ? 7 : w; }; // 1=seg … 7=dom
export const DIAS_SEMANA = ['', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];
export const DIAS_CURTO = ['', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
export const inicioSemana = (iso) => addDias(iso, 1 - diaSemanaNum(iso));
export const fmtData = (iso) => iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '';
export const fmtDataCurta = (iso) => iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '';
export function fmtDataHora(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${fmtData(isoDe(d))} ${horaDe(d)}`;
}
export function diasEntre(a, b) { return Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 86400000); }
export const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

// ------------------------------------------------------------------ CPF
export const soDigitos = (s) => String(s ?? '').replace(/\D/g, '');
export function cpfValido(c) {
  c = soDigitos(c);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  const d = c.split('').map(Number);
  let s = 0; for (let i = 0; i < 9; i++) s += d[i] * (10 - i);
  let r = (s * 10) % 11; if (r === 10) r = 0; if (r !== d[9]) return false;
  s = 0; for (let i = 0; i < 10; i++) s += d[i] * (11 - i);
  r = (s * 10) % 11; if (r === 10) r = 0; return r === d[10];
}
export function fmtCpf(c) {
  c = soDigitos(c); if (c.length !== 11) return c;
  return `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}`;
}
export async function sha256hex(txt) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
export function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16)); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
  const h = Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// ------------------------------------------------------------------ avisos e modais
export function aviso(msg, tipo = '') {
  const box = document.getElementById('avisos'); if (!box) return;
  const el = document.createElement('div'); el.className = `aviso ${tipo}`; el.textContent = msg;
  box.appendChild(el); setTimeout(() => el.remove(), tipo === 'erro' ? 7000 : 3800);
}

export function modal({ titulo, corpo = '', botoes = [], largo = false, aoAbrir, fecharFora = true }) {
  const fundo = document.createElement('div'); fundo.className = 'fundo-modal';
  fundo.innerHTML = `<div class="modal ${largo ? 'largo' : ''}" role="dialog" aria-modal="true">
      <header><h2>${esc(titulo)}</h2><button class="btn fantasma pequeno" data-fechar aria-label="Fechar">${ico('x')}</button></header>
      <div class="corpo"></div><footer class="${botoes.length ? '' : 'oculto'}"></footer></div>`;
  const c = fundo.querySelector('.corpo');
  if (typeof corpo === 'string') c.innerHTML = corpo; else c.appendChild(corpo);
  let resolver; const promessa = new Promise((r) => (resolver = r));
  const fechar = (v = null) => { fundo.remove(); document.removeEventListener('keydown', tecla); resolver(v); };
  const tecla = (e) => { if (e.key === 'Escape') fechar(null); };
  document.addEventListener('keydown', tecla);
  const rodape = fundo.querySelector('footer');
  botoes.forEach((b) => {
    const el = document.createElement('button'); el.className = `btn ${b.classe || ''}`; el.innerHTML = b.texto;
    el.onclick = async () => {
      if (!b.acao) return fechar(b.valor ?? null);
      el.disabled = true;
      try { const r = await b.acao(fechar, fundo); if (r !== false && document.body.contains(fundo) && b.fechar !== false) fechar(r ?? b.valor ?? true); }
      finally { el.disabled = false; }
    };
    rodape.appendChild(el);
  });
  fundo.querySelector('[data-fechar]').onclick = () => fechar(null);
  if (fecharFora) fundo.addEventListener('mousedown', (e) => { if (e.target === fundo) fechar(null); });
  document.body.appendChild(fundo);
  if (aoAbrir) aoAbrir(fundo, fechar);
  const primeiro = fundo.querySelector('input, select, textarea'); if (primeiro) setTimeout(() => primeiro.focus(), 30);
  return { el: fundo, fechar, promessa };
}

export function confirmar(texto, { titulo = 'Confirmar', ok = 'Confirmar', perigo = false } = {}) {
  return modal({
    titulo, corpo: `<p style="margin:0">${texto}</p>`,
    botoes: [{ texto: 'Cancelar', valor: false }, { texto: ok, classe: perigo ? 'perigo' : 'primario', valor: true }]
  }).promessa.then((v) => v === true);
}

export function pedirTexto(titulo, rotulo, { minimo = 5, sugestoes = [], valor = '' } = {}) {
  const corpo = `<label class="campo"><span>${esc(rotulo)}</span><textarea data-t>${esc(valor)}</textarea></label>
    ${sugestoes.length ? `<div class="linha-flex">${sugestoes.map((s) => `<button class="btn pequeno" data-s="${esc(s)}">${esc(s)}</button>`).join('')}</div>` : ''}
    <div class="caixa erro-caixa oculto" data-e>Escreva pelo menos ${minimo} caracteres.</div>`;
  return modal({
    titulo, corpo,
    aoAbrir: (el) => $$('[data-s]', el).forEach((b) => (b.onclick = () => { $('[data-t]', el).value = b.dataset.s; })),
    botoes: [{ texto: 'Cancelar', valor: null }, {
      texto: 'Confirmar', classe: 'primario', acao: (fechar, el) => {
        const v = $('[data-t]', el).value.trim();
        if (v.length < minimo) { $('[data-e]', el).classList.remove('oculto'); return false; }
        fechar(v); return false;
      }
    }]
  }).promessa;
}

// ------------------------------------------------------------------ CSV
export function baixarCsv(nome, cabecalho, linhas) {
  const cel = (v) => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const txt = '﻿' + [cabecalho, ...linhas].map((l) => l.map(cel).join(';')).join('\r\n');
  baixarArquivo(nome.endsWith('.csv') ? nome : nome + '.csv', new Blob([txt], { type: 'text/csv;charset=utf-8' }));
}
export function baixarArquivo(nome, blob) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
export function lerCsv(texto) {
  texto = texto.replace(/^﻿/, '');
  const primeira = texto.split(/\r?\n/)[0] || '';
  const sep = (primeira.match(/;/g) || []).length >= (primeira.match(/,/g) || []).length ? ';' : ',';
  const linhas = []; let campo = '', linha = [], aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (aspas) {
      if (ch === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (ch === '"') aspas = false; else campo += ch;
    } else if (ch === '"') aspas = true;
    else if (ch === sep) { linha.push(campo); campo = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && texto[i + 1] === '\n') i++;
      linha.push(campo); campo = ''; if (linha.some((c) => c.trim() !== '')) linhas.push(linha); linha = [];
    } else campo += ch;
  }
  linha.push(campo); if (linha.some((c) => c.trim() !== '')) linhas.push(linha);
  const cab = (linhas.shift() || []).map((c) => c.trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '_'));
  return linhas.map((l) => Object.fromEntries(cab.map((c, i) => [c, (l[i] ?? '').trim()])));
}

// ------------------------------------------------------------------ IndexedDB (fila offline, cache e fotos)
let dbp = null;
function db() {
  if (!dbp) dbp = new Promise((res, rej) => {
    const r = indexedDB.open('pases_refeicoes', 1);
    r.onupgradeneeded = () => { ['fila', 'cache', 'fotos'].forEach((s) => r.result.createObjectStore(s)); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  return dbp;
}
async function tx(store, modo, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(store, modo); const s = t.objectStore(store); const r = fn(s);
    t.oncomplete = () => res(r && 'result' in r ? r.result : undefined); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
  });
}
export const idb = {
  get: (s, k) => tx(s, 'readonly', (st) => st.get(k)),
  put: (s, k, v) => tx(s, 'readwrite', (st) => st.put(v, k)),
  del: (s, k) => tx(s, 'readwrite', (st) => st.delete(k)),
  todos: (s) => tx(s, 'readonly', (st) => st.getAll()),
  chaves: (s) => tx(s, 'readonly', (st) => st.getAllKeys()),
  limpar: (s) => tx(s, 'readwrite', (st) => st.clear())
};

// ------------------------------------------------------------------ diversos
export const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export const normalizar = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
export const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
export const fmtNum = (n) => Number(n || 0).toLocaleString('pt-BR');
export const fmtPct = (a, b) => `${pct(a, b).toLocaleString('pt-BR')}%`;
export function carregarScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) return res();
    const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Falha ao carregar ' + src));
    document.head.appendChild(s);
  });
}

// Dica flutuante para gráficos: qualquer elemento com data-dica
let dicaEl = null;
document.addEventListener('mouseover', (e) => {
  const alvo = e.target.closest?.('[data-dica]');
  if (!alvo) { dicaEl?.remove(); dicaEl = null; return; }
  if (!dicaEl) { dicaEl = document.createElement('div'); dicaEl.className = 'dica'; document.body.appendChild(dicaEl); }
  dicaEl.textContent = alvo.dataset.dica;
  const r = alvo.getBoundingClientRect(); dicaEl.style.left = `${r.left + r.width / 2}px`; dicaEl.style.top = `${r.top}px`;
});
