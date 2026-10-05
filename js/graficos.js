// Gráficos em SVG. Dica ao passar o mouse via atributo data-dica.
//   barras    série única (usado no painel e nas abas de relatório)
//   colunas   várias séries lado a lado ou empilhadas, com linhas de referência por cima
//   barrasH   barras horizontais com rótulo à esquerda e texto à direita (rankings)
import { esc } from './util.js';

function teto(v) {
  if (v <= 4) return 4;
  if (v <= 8) return 8;
  const p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}
const num = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1).replace('.', ','));

/**
 * dados: [{ r: rótulo do eixo, v: valor, dica: texto, classe: 'fora' | '' }]
 */
export function barras(dados, { altura = 220, largura = 760, rotuloMin = 40, titulo = '' } = {}) {
  if (!dados.length || !dados.some((d) => d.v > 0)) return '<div class="vazio">Sem registros no período.</div>';
  const ml = 34, mr = 6, mt = 10, mb = 24, W = largura, H = altura;
  const pw = W - ml - mr, ph = H - mt - mb, n = dados.length;
  const max = teto(Math.max(...dados.map((d) => d.v)));
  const passo = pw / n, gap = Math.max(2, Math.min(8, passo * 0.22)), bw = Math.max(2, passo - gap);
  const cada = Math.max(1, Math.ceil(n / Math.max(1, pw / rotuloMin)));
  let s = `<svg class="grafico" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(titulo)}">`;
  for (let i = 0; i <= 4; i++) {
    const y = mt + ph - (ph * i) / 4, v = (max * i) / 4;
    s += `<line class="${i ? 'grade-h' : 'eixo'}" x1="${ml}" x2="${W - mr}" y1="${y}" y2="${y}"/>`;
    s += `<text x="${ml - 6}" y="${y + 4}" text-anchor="end">${Number.isInteger(v) ? v : v.toFixed(1)}</text>`;
  }
  dados.forEach((d, i) => {
    const h = (d.v / max) * ph, x = ml + i * passo + gap / 2, y = mt + ph - h, r = Math.min(4, bw / 2, h);
    if (h > 0) {
      s += `<path class="barra ${d.classe || ''}" data-dica="${esc(d.dica ?? `${d.r}: ${d.v}`)}" d="M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + bw - r},${y} Q${x + bw},${y} ${x + bw},${y + r} L${x + bw},${y + h} Z"/>`;
    }
    // área de toque maior que a barra
    s += `<rect x="${ml + i * passo}" y="${mt}" width="${passo}" height="${ph}" fill="transparent" data-dica="${esc(d.dica ?? `${d.r}: ${d.v}`)}"/>`;
    if (i % cada === 0) s += `<text x="${x + bw / 2}" y="${H - 6}" text-anchor="middle">${esc(d.r)}</text>`;
  });
  return s + '</svg>';
}

/**
 * Colunas com uma ou mais séries.
 * cats:   [{ r: rótulo do eixo, dica: rótulo longo (opcional), v: [valor por série], cor: cor só desta coluna (opcional) }]
 * series: [{ nome, cor }]
 * opções: empilhar (soma as séries numa coluna só), linhas: [{ nome, cor, v: [valor por categoria ou null], tracejada }],
 *         rotulos (mostra o valor em cima), fmt (formata os números)
 */
export function colunas(cats, series, { altura = 240, largura = 760, titulo = '', empilhar = false, linhas = [], rotulos = true, rotuloMin = 46, fmt = num } = {}) {
  const topo = (c) => (empilhar ? c.v.reduce((s, x) => s + (x || 0), 0) : Math.max(0, ...c.v.map((x) => x || 0)));
  const maior = Math.max(0, ...cats.map(topo), ...linhas.flatMap((l) => l.v.map((x) => x || 0)));
  if (!cats.length || maior <= 0) return '<div class="vazio">Sem registros no período.</div>';
  const ml = 40, mr = 8, mt = 18, mb = 26, W = largura, H = altura, pw = W - ml - mr, ph = H - mt - mb, n = cats.length;
  const max = teto(maior), passo = pw / n, ns = empilhar ? 1 : series.length;
  const gw = Math.max(2, Math.min(passo * 0.74, ns * 46)), bw = Math.max(1.5, gw / ns - (ns > 1 ? 2 : 0));
  const cada = Math.max(1, Math.ceil(n / Math.max(1, pw / rotuloMin)));
  const Y = (v) => mt + ph - (v / max) * ph, cx = (i) => ml + i * passo + passo / 2;
  let s = `<svg class="grafico" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(titulo)}">`;
  for (let i = 0; i <= 4; i++) {
    const y = mt + ph - (ph * i) / 4;
    s += `<line class="${i ? 'grade-h' : 'eixo'}" x1="${ml}" x2="${W - mr}" y1="${y}" y2="${y}"/><text x="${ml - 6}" y="${y + 4}" text-anchor="end">${fmt((max * i) / 4)}</text>`;
  }
  cats.forEach((c, i) => {
    const x0 = cx(i) - gw / 2, nome = c.dica || c.r;
    if (empilhar) {
      let y = mt + ph;
      c.v.forEach((v, k) => { if (!(v > 0)) return; const h = (v / max) * ph; y -= h; s += `<rect x="${x0.toFixed(1)}" y="${y.toFixed(1)}" width="${gw.toFixed(1)}" height="${h.toFixed(1)}" fill="${c.cor || series[k].cor}" data-dica="${esc(`${nome} · ${series[k].nome}: ${fmt(v)}`)}"/>`; });
      if (rotulos && passo >= 30 && topo(c) > 0) s += `<text x="${cx(i)}" y="${y - 4}" text-anchor="middle">${fmt(topo(c))}</text>`;
    } else {
      c.v.forEach((v, k) => {
        if (!(v > 0)) return;
        const h = (v / max) * ph, x = x0 + k * (gw / ns) + (ns > 1 ? 1 : 0), y = mt + ph - h, r = Math.min(3, bw / 2, h);
        s += `<path fill="${c.cor || series[k].cor}" data-dica="${esc(`${nome} · ${series[k].nome}: ${fmt(v)}`)}" d="M${x.toFixed(1)},${y + h} L${x.toFixed(1)},${y + r} Q${x.toFixed(1)},${y} ${(x + r).toFixed(1)},${y} L${(x + bw - r).toFixed(1)},${y} Q${(x + bw).toFixed(1)},${y} ${(x + bw).toFixed(1)},${y + r} L${(x + bw).toFixed(1)},${y + h} Z"/>`;
        if (rotulos && bw >= 18) s += `<text x="${(x + bw / 2).toFixed(1)}" y="${y - 4}" text-anchor="middle">${fmt(v)}</text>`;
      });
    }
    if (i % cada === 0) s += `<text x="${cx(i)}" y="${H - 7}" text-anchor="middle">${esc(c.r)}</text>`;
  });
  linhas.forEach((l) => {
    const pts = l.v.map((v, i) => (v == null ? null : [cx(i), Y(v), v, i])).filter(Boolean);
    if (!pts.length) return;
    if (pts.length > 1) s += `<polyline fill="none" stroke="${l.cor}" stroke-width="2" ${l.tracejada ? 'stroke-dasharray="5 4"' : ''} points="${pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')}"/>`;
    pts.forEach((p) => { s += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${n > 40 ? 2 : 3.5}" fill="${l.cor}" stroke="#fff" stroke-width="1" data-dica="${esc(`${cats[p[3]].dica || cats[p[3]].r} · ${l.nome}: ${fmt(p[2])}`)}"/>`; });
  });
  return s + '</svg>';
}

/**
 * Barras horizontais para comparar itens com nome longo.
 * itens: [{ r: rótulo, v: valor, txt: texto à direita, dica, cor }]
 */
export function barrasH(itens, { largura = 760, titulo = '', max = null, rotuloLarg = 230, cor = 'var(--verde)' } = {}) {
  if (!itens.length) return '<div class="vazio">Sem dados para este filtro.</div>';
  const lh = 26, mt = 4, W = largura, H = itens.length * lh + mt * 2, textoLarg = 150, pw = W - rotuloLarg - textoLarg;
  const mx = max || Math.max(1, ...itens.map((x) => x.v));
  const corta = (t) => (t.length > 36 ? t.slice(0, 35) + '…' : t);
  let s = `<svg class="grafico" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(titulo)}">`;
  itens.forEach((x, i) => {
    const y = mt + i * lh, w = Math.max(0, Math.min(1, x.v / mx)) * pw, dica = esc(x.dica ?? `${x.r}: ${x.txt ?? num(x.v)}`);
    s += `<text x="${rotuloLarg - 8}" y="${y + 17}" text-anchor="end">${esc(corta(String(x.r)))}</text>`;
    s += `<rect x="${rotuloLarg}" y="${y + 6}" width="${pw}" height="14" rx="4" fill="rgba(60,50,20,.07)" data-dica="${dica}"/>`;
    if (w > 0) s += `<rect x="${rotuloLarg}" y="${y + 6}" width="${w.toFixed(1)}" height="14" rx="4" fill="${x.cor || cor}" data-dica="${dica}"/>`;
    s += `<text x="${rotuloLarg + pw + 8}" y="${y + 17}">${esc(x.txt ?? num(x.v))}</text>`;
  });
  return s + '</svg>';
}

/** Legenda: [[cor, texto, éLinha]] */
export const legenda = (itens) => `<div class="legenda">${itens.map(([c, t, linha]) => `<span><i style="background:${c}${linha ? ';height:3px;border-radius:2px' : ''}"></i>${esc(t)}</span>`).join('')}</div>`;
