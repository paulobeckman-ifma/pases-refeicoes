// Gráfico de barras em SVG (série única). Dica ao passar o mouse via atributo data-dica.
import { esc } from './util.js';

function teto(v) {
  if (v <= 4) return 4;
  if (v <= 8) return 8;
  const p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

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
