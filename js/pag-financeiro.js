// Financeiro (só administradores): módulo próprio com três abas.
//   Relatório        consumo e saldo por dia, por semana ou por mês
//   Simulador        cenários de alunos, comparecimento e valores (nada é gravado)
//   Recurso e valores créditos, valor do almoço e do lanche, outras despesas e base da projeção
// Os valores ficam no servidor em uma chave que só o administrador lê.
import { $, $$, esc, ico, aviso, fmtData, fmtDataCurta, addDias, diaSemanaNum, inicioSemana, fmtNum, baixarCsv, MESES, DIAS_CURTO } from './util.js';
import { api } from './api.js';

const AZUL = '#3b7dd8', AMBAR = '#e0a33a', CINZA = '#8a9590', VERDE = 'var(--verde)', VERDE_CLARO = '#9fc7ad', AREIA = '#d9d4c3';
const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const brlCurto = (v) => { const a = Math.abs(v); return (v < 0 ? '-' : '') + (a >= 1e6 ? `${(a / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi` : a >= 1e3 ? `${(a / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : a.toLocaleString('pt-BR', { maximumFractionDigits: 0 })); };
const dec = (v, n = 2) => Number(v || 0).toFixed(n).replace('.', ',');
const pc1 = (v) => `${Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
const num = (v) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const p2 = (n) => String(n).padStart(2, '0');
const mesDe = (iso) => iso.slice(0, 7);
const rotMes = (ym) => `${MESES[+ym.slice(5, 7) - 1].slice(0, 3)}/${ym.slice(2, 4)}`;
const soma = (l, f) => l.reduce((s, x) => s + f(x), 0);
const vazio = (t) => `<div class="vazio">${t}</div>`;
const GRAN = { dia: 'dia', semana: 'semana', mes: 'mês' };
const ABAS = [['relatorio', 'Relatório'], ['simulador', 'Simulador'], ['recurso', 'Recurso e valores']];
const GRAFS = ['saldo', 'gasto', 'acum', 'qtd', 'rosca', 'comp'];
const guardar = (k, v) => { try { sessionStorage.setItem(k, v); } catch { /* sem armazenamento */ } };
const lembrar = (k) => { try { return sessionStorage.getItem(k); } catch { return null; } };

let E = null; // estado da página

// ---------------------------------------------------------------- dias úteis
// Feriados nacionais (fixos e móveis). Carnaval e Corpus Christi entram por não haver aula.
const _fer = {};
function feriados(ano) {
  if (_fer[ano]) return _fer[ano];
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const pascoa = `${ano}-${p2(Math.floor((h + l - 7 * m + 114) / 31))}-${p2(((h + l - 7 * m + 114) % 31) + 1)}`;
  const M = new Map([[`${ano}-01-01`, 'Confraternização Universal'], [`${ano}-04-21`, 'Tiradentes'], [`${ano}-05-01`, 'Dia do Trabalho'], [`${ano}-09-07`, 'Independência'],
    [`${ano}-10-12`, 'N. Sra. Aparecida'], [`${ano}-11-02`, 'Finados'], [`${ano}-11-15`, 'Proclamação da República'], [`${ano}-11-20`, 'Consciência Negra'], [`${ano}-12-25`, 'Natal'],
    [addDias(pascoa, -48), 'Carnaval'], [addDias(pascoa, -47), 'Carnaval'], [addDias(pascoa, -2), 'Sexta-feira Santa'], [addDias(pascoa, 60), 'Corpus Christi']]);
  return (_fer[ano] = M);
}
const feriado = (iso) => feriados(+iso.slice(0, 4)).get(iso);
const util = (iso) => diaSemanaNum(iso) <= 5 && !feriado(iso);

// ---------------------------------------------------------------- entrada
export async function render(el, { cabecalho, perfil }) {
  if (perfil !== 'admin') { el.innerHTML = ''; return; }
  el.innerHTML = cabecalho('Financeiro', 'Recurso da assistência estudantil: consumo, saldo, projeção e simulações.',
    `<button class="btn" id="fin-imp">${ico('imprimir')} Imprimir / salvar PDF</button><button class="btn" id="fin-csv">${ico('baixar')} Exportar CSV desta aba</button>`) + `
<style>
.fin .kpi b{font-size:21px;white-space:nowrap}
.fin .kpis{grid-template-columns:repeat(auto-fit,minmax(190px,1fr))}
.fin .tabela{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}
.fin .tabela th,.fin .tabela td{border:1px solid rgba(60,50,20,.11);padding:7px 10px;vertical-align:middle}
.fin .tabela th.num,.fin .tabela td.num{text-align:right}
.fin .tabela th{white-space:normal;line-height:1.25}
.fin .tabela td{white-space:nowrap}
.fin .tabela th.cen,.fin .tabela td.cen{text-align:center}
.fin .tabela tbody tr:nth-child(even) td{background:rgba(60,50,20,.028)}
.fin .tabela tfoot td{font-weight:700;border-top:2px solid rgba(60,50,20,.25)}
.fin .tabela input{width:100%;min-width:70px;padding:5px 7px;text-align:right;box-sizing:border-box}
.fin .tabela td.proj{color:var(--tinta-3,#7a807c)}
.fin-nav{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.fin-nav h2{margin:0;flex:1;text-align:center}
.fin-nav .btn{padding:5px 9px}
.fin-pontos{display:flex;justify-content:center;gap:7px;margin-top:10px}
.fin-pontos button{width:9px;height:9px;border-radius:50%;border:0;padding:0;background:rgba(60,50,20,.2);cursor:pointer}
.fin-pontos button.ativo{background:var(--verde)}
.fin-seg{display:inline-flex;border:1px solid rgba(60,50,20,.22);border-radius:8px;overflow:hidden;background:#fff}
.fin-seg button{border:0;background:transparent;padding:7px 13px;cursor:pointer;font:inherit;color:inherit}
.fin-seg button+button{border-left:1px solid rgba(60,50,20,.14)}
.fin-seg button.ativo{background:var(--verde);color:#fff}
.fin-leg{display:flex;flex-wrap:wrap;gap:6px 14px;justify-content:center;margin-top:6px}
@media print{.fin .abas,.fin-pontos,.fin-nav .btn,.fin .fin-seg{display:none!important}.fin .tabela th,.fin .tabela td{padding:4px 6px}}
</style>
<div class="fin" id="fin">${vazio('Carregando…')}</div>`;
  $('#fin-imp', el).onclick = () => window.print();
  $('#fin-csv', el).onclick = exportar;

  const d = await api('financeiro_obter');
  const c = d.config || {};
  E = {
    el: $('#fin', el), hoje: d.hoje, dias: d.dias || [], ativos: d.ativos || { refeicao: 0, lanche: 0 },
    cfg: {
      inicio: c.inicio || (d.dias?.[0]?.d ?? d.hoje), fim: c.fim || `${d.hoje.slice(0, 4)}-12-31`,
      creditos: c.creditos || [], despesas: c.despesas || [], precos: (c.precos || []).slice().sort((a, b) => a.desde.localeCompare(b.desde)),
      dias_mes: c.dias_mes || {}, fonte: c.fonte ?? 'Ação 21IV · Assistência Estudantil (IFMA)', proj: c.proj || { modo: 'ultimos' }
    },
    aba: lembrar('pases_fin_aba') || 'relatorio', gran: lembrar('pases_fin_gran') || 'mes', graf: Math.min(GRAFS.length - 1, +(lembrar('pases_fin_graf') || 0) || 0),
    sim: null, simAlt: false, editando: false, rel: null, calc: null
  };
  if (!ABAS.some(([k]) => k === E.aba)) E.aba = 'relatorio';
  if (!GRAN[E.gran]) E.gran = 'mes';
  if (!E.cfg.precos.length) { E.aba = 'recurso'; E.editando = true; }
  E.rel = { ini: E.cfg.inicio, fim: E.hoje < E.cfg.inicio ? E.cfg.fim : E.hoje };
  iniciarSim();
  desenhar();
}

// ---------------------------------------------------------------- cálculo
function preco(iso) {
  const p = E.cfg.precos; if (!p.length) return { r: 0, l: 0 };
  let at = p[0]; for (const x of p) if (x.desde <= iso) at = x;
  return { r: num(at.refeicao), l: num(at.lanche) };
}
// dias úteis de atendimento que ainda virão (seg a sex, sem feriados nacionais; por mês pode ser ajustado na tabela)
function diasFuturos() {
  const out = []; let d = addDias(E.hoje, 1); const cont = {};
  while (d <= E.cfg.fim) {
    if (d >= E.cfg.inicio && util(d)) {
      const m = mesDe(d), lim = E.cfg.dias_mes[m];
      cont[m] = (cont[m] || 0) + 1;
      if (lim == null || lim === '' || cont[m] <= Number(lim)) out.push(d);
    }
    d = addDias(d, 1);
  }
  return out;
}
function uteisRestantes(m) { let n = 0, d = addDias(E.hoje, 1); while (d <= E.cfg.fim) { if (d >= E.cfg.inicio && mesDe(d) === m && util(d)) n++; d = addDias(d, 1); } return n; }
function feriadosRestantes() { const out = []; let d = addDias(E.hoje, 1); while (d <= E.cfg.fim) { if (d >= E.cfg.inicio && diaSemanaNum(d) <= 5 && feriado(d)) out.push(`${fmtDataCurta(d)} ${feriado(d)}`); d = addDias(d, 1); } return out; }

// dias com registro (antes de hoje, se houver, porque o dia de hoje pode estar incompleto)
function atendidos() {
  let l = E.dias.filter((x) => x.r + x.l > 0 && x.d >= E.cfg.inicio && x.d < E.hoje);
  if (!l.length) l = E.dias.filter((x) => x.r + x.l > 0);
  return l;
}
const media = (l) => ({ r: l.length ? soma(l, (x) => x.r) / l.length : 0, l: l.length ? soma(l, (x) => x.l) / l.length : 0, n: l.length });
// comparecimento médio do programa: média diária de registros ÷ alunos ativos
function taxaMedia() {
  const m = media(atendidos()), at = E.ativos;
  return { r: at.refeicao ? (100 * m.r) / at.refeicao : 0, l: at.lanche ? (100 * m.l) / at.lanche : 0, n: m.n };
}
// "ritmo atual": base da projeção, conforme a opção gravada em Recurso e valores
function ritmo() {
  const p = E.cfg.proj || {}, at = E.ativos;
  if (p.modo === 'fixo') return { r: (at.refeicao * num(p.taxaR)) / 100, l: (at.lanche * num(p.taxaL)) / 100, n: 0, modo: 'fixo' };
  const l = atendidos();
  return p.modo === 'media' ? { ...media(l), modo: 'media' } : { ...media(l.slice(-10)), modo: 'ultimos' };
}
const rotBase = (b) => (b.modo === 'fixo' ? `comparecimento fixo de ${pc1(num(E.cfg.proj.taxaR))} no almoço e ${pc1(num(E.cfg.proj.taxaL))} no lanche`
  : b.modo === 'media' ? `média de todos os ${b.n} dia(s) registrados` : `média dos últimos ${b.n} dia(s) de atendimento`);

function iniciarSim() {
  const b = ritmo(), p = preco(E.hoje), at = E.ativos;
  const tx = (q, n) => (n ? Math.min(100, Math.round((1000 * q) / n) / 10) : 0);
  E.base = b;
  E.sim = { alR: at.refeicao, taxaR: tx(b.r, at.refeicao), alL: at.lanche, taxaL: tx(b.l, at.lanche), pr: p.r, pl: p.l, desde: addDias(E.hoje, 1) };
  E.simAlt = false;
}
const simQ = (s) => ({ r: (s.alR * s.taxaR) / 100, l: (s.alL * s.taxaL) / 100 });
function eventos(lista) { const m = {}; for (const x of lista) if (x.data) m[x.data] = (m[x.data] || 0) + num(x.valor); return m; }

/** Uma linha por dia do período: real até hoje; depois, projeção. sim=null usa o ritmo atual e os valores vigentes. */
function calcular(sim) {
  const { cfg, hoje } = E, cred = eventos(cfg.creditos), desp = eventos(cfg.despesas);
  const real = new Map(E.dias.map((x) => [x.d, x]));
  // tudo o que tem data anterior ao início do período entra no saldo inicial
  let saldo = 0;
  for (const d of Object.keys(cred)) if (d < cfg.inicio) saldo += cred[d];
  for (const d of Object.keys(desp)) if (d < cfg.inicio) saldo -= desp[d];
  for (const x of E.dias) if (x.d < cfg.inicio) { const p = preco(x.d); saldo -= x.r * p.r + x.l * p.l; }
  const saldoIni = saldo, fut = new Set(diasFuturos()), linhas = [], q = sim ? simQ(sim) : null;
  let acaba = null, d = cfg.inicio;
  const ultimo = cfg.fim > hoje ? cfg.fim : hoje;
  while (d <= ultimo) {
    const L = { d, proj: d > hoje, at: false, r: 0, l: 0, cr: 0, cl: 0, outras: desp[d] || 0, cred: cred[d] || 0, saldo: 0 };
    if (d <= hoje) {
      const x = real.get(d);
      if (x) { const p = preco(d); L.at = true; L.r = x.r; L.l = x.l; L.cr = x.r * p.r; L.cl = x.l * p.l; }
    } else if (fut.has(d)) {
      const s = !!sim && d >= sim.desde, p = preco(d);
      L.at = true; L.r = s ? q.r : E.base.r; L.l = s ? q.l : E.base.l;
      L.cr = L.r * (s ? sim.pr : p.r); L.cl = L.l * (s ? sim.pl : p.l);
    }
    saldo += L.cred - L.outras - L.cr - L.cl; L.saldo = saldo;
    if (L.proj && saldo < -0.005 && !acaba) acaba = d;
    linhas.push(L); d = addDias(d, 1);
  }
  const hj = linhas.filter((x) => !x.proj).pop();
  return { linhas, saldoIni, saldoHoje: hj ? hj.saldo : saldoIni, saldoFim: saldo, acaba, diasFut: fut.size };
}
function recalc() { const base = calcular(null); E.calc = { base, S: E.simAlt ? calcular(E.sim) : base }; return E.calc; }

/** Agrupa as linhas diárias por dia, semana (seg a dom) ou mês. */
function agrupar(linhas, gran, ini, fim) {
  const chave = gran === 'dia' ? (d) => d : gran === 'semana' ? inicioSemana : mesDe, g = new Map();
  for (const L of linhas) {
    if ((ini && L.d < ini) || (fim && L.d > fim)) continue;
    const k = chave(L.d);
    if (!g.has(k)) g.set(k, { k, ini: L.d, fim: L.d, dr: 0, dp: 0, r: 0, l: 0, pr: 0, pl: 0, cr: 0, cl: 0, pcr: 0, pcl: 0, outras: 0, cred: 0, saldo: 0 });
    const G = g.get(k); G.fim = L.d; G.outras += L.outras; G.cred += L.cred; G.saldo = L.saldo;
    if (!L.at) continue;
    if (L.proj) { G.dp++; G.pr += L.r; G.pl += L.l; G.pcr += L.cr; G.pcl += L.cl; } else { G.dr++; G.r += L.r; G.l += L.l; G.cr += L.cr; G.cl += L.cl; }
  }
  const out = [...g.values()];
  return gran === 'dia' ? out.filter((G) => G.dr || G.dp || G.outras || G.cred) : out;
}
const rotulo = (G, gran) => (gran === 'dia' ? `${DIAS_CURTO[diaSemanaNum(G.k)]} ${fmtData(G.k)}` : gran === 'semana' ? `${fmtDataCurta(G.ini)} a ${fmtData(G.fim)}` : rotMes(G.k));
const rotCurto = (G, gran) => (gran === 'mes' ? rotMes(G.k) : fmtDataCurta(G.ini));
const gasto = (G) => G.cr + G.cl + G.pcr + G.pcl + G.outras;

// ---------------------------------------------------------------- gráficos
const W = 760, H = 280;
const abre = (rot) => `<svg class="grafico" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(rot)}">`;
function eixoY(max, min, fmt, ml, mr, mt, ph) {
  let s = '';
  for (let i = 0; i <= 4; i++) { const v = min + ((max - min) * i) / 4, y = mt + ph - (ph * i) / 4; s += `<line class="${i || min < 0 ? 'grade-h' : 'eixo'}" x1="${ml}" x2="${W - mr}" y1="${y}" y2="${y}"/><text x="${ml - 6}" y="${y + 4}" text-anchor="end">${fmt(v)}</text>`; }
  return s;
}
function marcasMes(L, X, mt, ph) {
  let s = '', ant = '';
  L.forEach((p, i) => {
    const m = mesDe(p.d); if (m === ant) return; ant = m;
    let j = i; while (j < L.length && mesDe(L[j].d) === m) j++; // rótulo só quando o mês tem largura para ele
    if (i) s += `<line class="grade-h" x1="${X(i)}" x2="${X(i)}" y1="${mt}" y2="${mt + ph}"/>`;
    if (X(Math.min(j, L.length - 1)) - X(i) >= 44) s += `<text x="${X(i) + 3}" y="${H - 8}">${rotMes(m)}</text>`;
  });
  return s;
}

function grafSaldo(base, S) {
  const ml = 58, mr = 10, mt = 14, mb = 26, pw = W - ml - mr, ph = H - mt - mb, B = base.linhas, n = B.length;
  if (n < 2) return vazio('Defina o período para ver o gráfico.');
  const todos = B.concat(S.linhas);
  let max = Math.max(...todos.map((x) => x.saldo), 1), min = Math.min(...todos.map((x) => x.saldo), 0);
  const folga = (max - min) * 0.06; max += folga; if (min < 0) min -= folga;
  const X = (i) => ml + (pw * i) / (n - 1), Y = (v) => mt + ph - ((v - min) / (max - min)) * ph;
  const linha = (s, f) => s.map((p, i) => (f(p, i) ? `${X(i).toFixed(1)},${Y(p.saldo).toFixed(1)}` : null)).filter(Boolean).join(' ');
  const iProj = B.findIndex((x) => x.proj), corte = iProj < 0 ? n - 1 : Math.max(0, iProj - 1);
  let s = abre('Saldo ao longo do período') + eixoY(max, min, brlCurto, ml, mr, mt, ph);
  if (min < 0) s += `<line x1="${ml}" x2="${W - mr}" y1="${Y(0)}" y2="${Y(0)}" stroke="var(--vermelho)" stroke-width="1.5"/>`;
  s += marcasMes(B, X, mt, ph);
  s += `<polyline fill="none" stroke="${VERDE}" stroke-width="2.5" points="${linha(B, (p, i) => i <= corte)}"/>`;
  s += `<polyline fill="none" stroke="${CINZA}" stroke-width="2" stroke-dasharray="5 4" points="${linha(B, (p, i) => i >= corte)}"/>`;
  if (S !== base) s += `<polyline fill="none" stroke="${AZUL}" stroke-width="2.5" stroke-dasharray="5 4" points="${linha(S.linhas, (p, i) => i >= corte)}"/>`;
  if (iProj > 0) s += `<line x1="${X(corte)}" x2="${X(corte)}" y1="${mt}" y2="${mt + ph}" stroke="var(--tinta-3)" stroke-dasharray="2 3"/><text x="${X(corte)}" y="${mt + 9}" text-anchor="middle">hoje</text>`;
  const passo = pw / (n - 1);
  S.linhas.forEach((p, i) => { s += `<rect x="${X(i) - passo / 2}" y="${mt}" width="${Math.max(passo, 1)}" height="${ph}" fill="transparent" data-dica="${fmtDataCurta(p.d)}: ${brl(p.saldo)}${p.proj ? ' (projeção)' : ''}"/>`; });
  return s + '</svg>';
}

function grafGasto(G, gran) {
  if (!G.length) return vazio('Sem movimento no período.');
  const ml = 58, mr = 10, mt = 18, mb = 26, pw = W - ml - mr, ph = H - mt - mb, n = G.length;
  const max = Math.max(...G.map(gasto), 1) * 1.1, passo = pw / n, bw = Math.max(1.5, Math.min(70, passo * 0.62)), cada = Math.max(1, Math.ceil(n / (pw / 48)));
  let s = abre(`Gasto por ${GRAN[gran]}`) + eixoY(max, 0, brlCurto, ml, mr, mt, ph);
  G.forEach((m, i) => {
    const x = ml + i * passo + (passo - bw) / 2; let y = mt + ph;
    const parte = (v, cor, op, rot) => { if (v <= 0) return; const h = (v / max) * ph; y -= h; s += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" fill="${cor}" opacity="${op}" data-dica="${rotulo(m, gran)} · ${rot}: ${brl(v)}"/>`; };
    parte(m.cr, VERDE, 1, 'almoço (realizado)'); parte(m.cl, AZUL, 1, 'lanche (realizado)'); parte(m.outras, AMBAR, 1, 'outras despesas');
    parte(m.pcr, VERDE, 0.4, 'almoço (projeção)'); parte(m.pcl, AZUL, 0.4, 'lanche (projeção)');
    if (i % cada === 0) s += `<text x="${x + bw / 2}" y="${H - 8}" text-anchor="middle">${rotCurto(m, gran)}</text>`;
    if (passo >= 46 && gasto(m) > 0) s += `<text x="${x + bw / 2}" y="${y - 4}" text-anchor="middle">${brlCurto(gasto(m))}</text>`;
  });
  return s + '</svg>';
}

function grafAcum(S) {
  const L = S.linhas, n = L.length;
  if (n < 2) return vazio('Defina o período para ver o gráfico.');
  const ml = 58, mr = 10, mt = 14, mb = 26, pw = W - ml - mr, ph = H - mt - mb;
  let g = 0, c = S.saldoIni;
  const pts = L.map((p) => { g += p.cr + p.cl + p.outras; c += p.cred; return { d: p.d, g, c, proj: p.proj }; });
  const max = Math.max(...pts.map((p) => Math.max(p.g, p.c)), 1) * 1.08;
  const X = (i) => ml + (pw * i) / (n - 1), Y = (v) => mt + ph - (v / max) * ph;
  const iProj = pts.findIndex((x) => x.proj), corte = iProj < 0 ? n - 1 : Math.max(0, iProj - 1);
  const pl = (f, k) => pts.map((p, i) => (f(i) ? `${X(i).toFixed(1)},${Y(p[k]).toFixed(1)}` : null)).filter(Boolean).join(' ');
  let s = abre('Gasto acumulado e recurso') + eixoY(max, 0, brlCurto, ml, mr, mt, ph) + marcasMes(L, X, mt, ph);
  s += `<polygon fill="${VERDE}" opacity=".13" points="${X(0)},${Y(0)} ${pl((i) => i <= corte, 'g')} ${X(corte)},${Y(0)}"/>`;
  s += `<polyline fill="none" stroke="${AMBAR}" stroke-width="2" points="${pts.map((p, i) => `${i ? `${X(i).toFixed(1)},${Y(pts[i - 1].c).toFixed(1)} ` : ''}${X(i).toFixed(1)},${Y(p.c).toFixed(1)}`).join(' ')}"/>`;
  s += `<polyline fill="none" stroke="${VERDE}" stroke-width="2.5" points="${pl((i) => i <= corte, 'g')}"/>`;
  s += `<polyline fill="none" stroke="${E.aba === 'simulador' && E.simAlt ? AZUL : CINZA}" stroke-width="2.2" stroke-dasharray="5 4" points="${pl((i) => i >= corte, 'g')}"/>`;
  if (iProj > 0) s += `<line x1="${X(corte)}" x2="${X(corte)}" y1="${mt}" y2="${mt + ph}" stroke="var(--tinta-3)" stroke-dasharray="2 3"/><text x="${X(corte)}" y="${mt + 9}" text-anchor="middle">hoje</text>`;
  const passo = pw / (n - 1);
  pts.forEach((p, i) => { s += `<rect x="${X(i) - passo / 2}" y="${mt}" width="${Math.max(passo, 1)}" height="${ph}" fill="transparent" data-dica="${fmtDataCurta(p.d)}: gasto ${brl(p.g)} de ${brl(p.c)}${p.proj ? ' (projeção)' : ''}"/>`; });
  return s + '</svg>';
}

function grafQtd(G, gran) {
  if (!G.length || !G.some((m) => m.r + m.l + m.pr + m.pl > 0)) return vazio('Sem registros no período.');
  const ml = 46, mr = 10, mt = 18, mb = 26, pw = W - ml - mr, ph = H - mt - mb, n = G.length;
  const max = Math.max(...G.map((m) => Math.max(m.r + m.pr, m.l + m.pl)), 1) * 1.12, passo = pw / n, bw = Math.max(1, Math.min(32, passo * 0.36)), cada = Math.max(1, Math.ceil(n / (pw / 48)));
  let s = abre(`Almoços e lanches por ${GRAN[gran]}`) + eixoY(max, 0, (v) => fmtNum(Math.round(v)), ml, mr, mt, ph);
  G.forEach((m, i) => {
    const cx = ml + i * passo + passo / 2;
    const barra = (x, real, proj, cor, nome) => {
      let y = mt + ph;
      for (const [v, op, t] of [[real, 1, 'realizado'], [proj, 0.4, 'projeção']]) { if (v <= 0) continue; const h = (v / max) * ph; y -= h; s += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" fill="${cor}" opacity="${op}" data-dica="${rotulo(m, gran)} · ${nome} (${t}): ${fmtNum(Math.round(v))}"/>`; }
      if (passo >= 60 && real + proj > 0) s += `<text x="${x + bw / 2}" y="${y - 4}" text-anchor="middle">${fmtNum(Math.round(real + proj))}</text>`;
    };
    barra(cx - bw - 1, m.r, m.pr, VERDE, 'almoços'); barra(cx + 1, m.l, m.pl, AZUL, 'lanches');
    if (i % cada === 0) s += `<text x="${cx}" y="${H - 8}" text-anchor="middle">${rotCurto(m, gran)}</text>`;
  });
  return s + '</svg>';
}

function grafRosca(S) {
  const real = S.linhas.filter((x) => !x.proj), proj = S.linhas.filter((x) => x.proj);
  const partes = [['Almoço realizado', VERDE, soma(real, (x) => x.cr)], ['Lanche realizado', AZUL, soma(real, (x) => x.cl)], ['Outras despesas', AMBAR, soma(S.linhas, (x) => x.outras)],
    ['Gasto projetado até o fim', VERDE_CLARO, soma(proj, (x) => x.cr + x.cl)], ['Saldo previsto no fim', AREIA, Math.max(0, S.saldoFim)]].filter((p) => p[2] > 0.005);
  const total = soma(partes, (p) => p[2]);
  if (!total) return vazio('Informe o recurso e os valores na aba "Recurso e valores" para ver a distribuição.');
  const cx = 160, cy = H / 2, R = 112, r = 68, pt = (a, q) => `${(cx + q * Math.cos(a)).toFixed(2)},${(cy + q * Math.sin(a)).toFixed(2)}`;
  let s = abre('Destino do recurso'), a0 = -Math.PI / 2;
  partes.forEach(([nome, cor, v], i) => {
    const fr = v / total, a1 = a0 + fr * 2 * Math.PI, dica = `data-dica="${nome}: ${brl(v)} (${pc1(100 * fr)})"`;
    if (fr > 0.9995) s += `<circle cx="${cx}" cy="${cy}" r="${(R + r) / 2}" fill="none" stroke="${cor}" stroke-width="${R - r}" ${dica}/>`;
    else { const g = fr > 0.5 ? 1 : 0; s += `<path d="M${pt(a0, R)} A${R},${R} 0 ${g} 1 ${pt(a1, R)} L${pt(a1, r)} A${r},${r} 0 ${g} 0 ${pt(a0, r)} Z" fill="${cor}" stroke="#fff" stroke-width="1.5" ${dica}/>`; }
    a0 = a1;
    const y = 62 + i * 38;
    s += `<rect x="330" y="${y - 11}" width="14" height="14" rx="3" fill="${cor}"/><text x="352" y="${y}" style="font-size:13px">${nome}</text><text x="${W - 12}" y="${y}" text-anchor="end" style="font-size:13px;font-weight:700">${brl(v)}</text><text x="352" y="${y + 15}">${pc1(100 * fr)}</text>`;
  });
  s += `<text x="${cx}" y="${cy - 4}" text-anchor="middle">total considerado</text><text x="${cx}" y="${cy + 16}" text-anchor="middle" style="font-size:17px;font-weight:700">${brlCurto(total)}</text>`;
  if (S.saldoFim < -0.005) s += `<text x="330" y="${62 + partes.length * 38}" style="font-size:13px;font-weight:700;fill:var(--vermelho)">Faltam ${brl(-S.saldoFim)} para cobrir o período</text>`;
  return s + '</svg>';
}

function grafComp() {
  const at = E.ativos, L = E.dias.filter((x) => x.r + x.l > 0 && x.d >= E.cfg.inicio), n = L.length;
  if (!n || !(at.refeicao || at.lanche)) return vazio('Sem registros para calcular o comparecimento.');
  const ml = 46, mr = 12, mt = 18, mb = 26, pw = W - ml - mr, ph = H - mt - mb;
  const series = [['almoço', VERDE, at.refeicao, 'r'], ['lanche', AZUL, at.lanche, 'l']].filter((x) => x[2]);
  const val = (x, k, tot) => (100 * x[k]) / tot;
  const max = Math.min(Math.max(20, Math.ceil((Math.max(...series.flatMap(([, , tot, k]) => L.map((x) => val(x, k, tot)))) * 1.2) / 10) * 10), 400);
  const X = (i) => (n === 1 ? ml + pw / 2 : ml + (pw * i) / (n - 1)), Y = (v) => mt + ph - (Math.min(v, max) / max) * ph;
  const cada = Math.max(1, Math.ceil(n / (pw / 48))), tm = taxaMedia();
  let s = abre('Comparecimento diário') + eixoY(max, 0, (v) => `${Math.round(v)}%`, ml, mr, mt, ph);
  L.forEach((x, i) => { if (i % cada === 0) s += `<text x="${X(i)}" y="${H - 8}" text-anchor="middle">${fmtDataCurta(x.d)}</text>`; });
  series.forEach(([nome, cor, tot, k]) => {
    const m = tm[k];
    s += `<line x1="${ml}" x2="${W - mr}" y1="${Y(m)}" y2="${Y(m)}" stroke="${cor}" stroke-width="1.3" stroke-dasharray="4 4" opacity=".75"/><text x="${W - mr - 2}" y="${Y(m) - 4}" text-anchor="end" style="fill:${cor}">média ${pc1(m)}</text>`;
    if (n > 1) s += `<polyline fill="none" stroke="${cor}" stroke-width="2.2" points="${L.map((x, i) => `${X(i).toFixed(1)},${Y(val(x, k, tot)).toFixed(1)}`).join(' ')}"/>`;
    L.forEach((x, i) => { s += `<circle cx="${X(i).toFixed(1)}" cy="${Y(val(x, k, tot)).toFixed(1)}" r="${n > 40 ? 2.5 : 4}" fill="${cor}" stroke="#fff" stroke-width="1" data-dica="${DIAS_CURTO[diaSemanaNum(x.d)]} ${fmtData(x.d)} · ${nome}: ${fmtNum(x[k])} de ${fmtNum(tot)} (${pc1(val(x, k, tot))})${x.d === E.hoje ? ' · hoje, parcial' : ''}"/>`; });
  });
  return s + '</svg>';
}

const legenda = (itens) => `<div class="fin-leg pequeno mudo">${itens.map(([c, t, tr]) => `<span><span style="display:inline-block;width:14px;height:${tr ? 0 : 10}px;${tr ? `border-top:2px dashed ${c}` : `background:${c}`};vertical-align:middle;border-radius:2px;margin-right:5px"></span>${t}</span>`).join('')}</div>`;
const seta = (d) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d < 0 ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'}"/></svg>`;
const segGran = () => `<div class="fin-seg" role="group" aria-label="Agrupar por">${Object.entries(GRAN).map(([k, t]) => `<button type="button" data-gran="${k}" class="${k === E.gran ? 'ativo' : ''}">Por ${t}</button>`).join('')}</div>`;

/** Cartão com um gráfico por vez; as setas (ou os pontos) trocam o tipo. */
function carrossel() {
  const { base, S } = E.calc, sim = E.aba === 'simulador', usa = sim ? S : base, k = GRAFS[E.graf];
  const G = agrupar(usa.linhas, E.gran, sim ? null : E.rel.ini, sim ? null : E.rel.fim);
  const T = {
    saldo: ['Saldo ao longo do período', () => grafSaldo(base, usa), [[VERDE, 'realizado'], [CINZA, 'projeção no ritmo atual', 1], ...(sim && E.simAlt ? [[AZUL, 'simulação', 1]] : [])]],
    gasto: [`Gasto por ${GRAN[E.gran]}`, () => grafGasto(G, E.gran), [[VERDE, 'almoço'], [AZUL, 'lanche'], [AMBAR, 'outras despesas'], ['#b9d9c3', 'mais claro = projeção']]],
    acum: ['Gasto acumulado e recurso disponível', () => grafAcum(usa), [[VERDE, 'gasto acumulado'], [sim && E.simAlt ? AZUL : CINZA, sim && E.simAlt ? 'simulação' : 'projeção', 1], [AMBAR, 'recurso creditado']]],
    qtd: [`Almoços e lanches por ${GRAN[E.gran]}`, () => grafQtd(G, E.gran), [[VERDE, 'almoços'], [AZUL, 'lanches'], ['#b9d9c3', 'mais claro = projeção']]],
    rosca: ['Destino do recurso', () => grafRosca(usa), []],
    comp: ['Comparecimento diário (registros ÷ alunos ativos)', () => grafComp(), [[VERDE, 'almoço'], [AZUL, 'lanche'], [CINZA, 'média do programa', 1]]]
  }[k];
  return `<div class="cartao" style="margin-bottom:14px">
<div class="fin-nav"><button type="button" class="btn" data-graf="-1" title="Gráfico anterior" aria-label="Gráfico anterior">${seta(-1)}</button>
<h2>${T[0]} <small class="mudo" style="font-weight:400">· ${E.graf + 1}/${GRAFS.length}</small></h2>
<button type="button" class="btn" data-graf="1" title="Próximo gráfico" aria-label="Próximo gráfico">${seta(1)}</button></div>
${sim && (k === 'gasto' || k === 'qtd') ? `<div style="text-align:center;margin-bottom:8px">${segGran()}</div>` : ''}
${T[1]()}${legenda(T[2])}
<div class="fin-pontos">${GRAFS.map((g, i) => `<button type="button" data-graf-ir="${i}" class="${i === E.graf ? 'ativo' : ''}" aria-label="Gráfico ${i + 1}"></button>`).join('')}</div></div>`;
}
function desenharGraf() { const b = $('#fin-graf', E.el); if (b) b.innerHTML = carrossel(); }

// ---------------------------------------------------------------- tela
function desenhar() {
  const { el, cfg } = E, { base } = recalc();
  const orc = soma(cfg.creditos, (x) => num(x.valor)), outras = soma(cfg.despesas.filter((x) => x.data <= E.hoje), (x) => num(x.valor));
  const feitas = base.linhas.filter((x) => !x.proj), qr = soma(feitas, (x) => x.r), ql = soma(feitas, (x) => x.l), consumo = soma(feitas, (x) => x.cr + x.cl);
  const semPrecos = !cfg.precos.length, semCredito = !cfg.creditos.length;
  el.innerHTML = `
<div class="so-impressao"><h2>PASES · Financeiro · ${ABAS.find(([k]) => k === E.aba)[1]} · emitido em ${fmtData(E.hoje)}</h2></div>
${semPrecos ? '<div class="caixa aviso-caixa" style="margin-bottom:12px">Informe na aba <b>Recurso e valores</b> o valor do almoço e do lanche para o sistema calcular o consumo. O recurso pode ser lançado depois.</div>'
    : semCredito ? '<div class="caixa aviso-caixa" style="margin-bottom:12px"><b>Recurso ainda não lançado.</b> O consumo já é calculado e o saldo fica negativo até o crédito ser lançado na aba <b>Recurso e valores</b>, o que pode ser feito com data retroativa.</div>' : ''}
<div class="kpis">
<div class="kpi"><span>Recurso destinado</span><b>${semCredito ? 'A lançar' : brl(orc)}</b><small>${esc(cfg.fonte || '')}${cfg.creditos.length > 1 ? ` · ${cfg.creditos.length} lançamentos` : ''}</small></div>
<div class="kpi"><span>Consumido até hoje</span><b>${brl(consumo)}</b><small>${fmtNum(qr)} almoços · ${fmtNum(ql)} lanches${outras ? ` · + ${brl(outras)} em outras despesas` : ''}</small></div>
<div class="kpi ${base.saldoHoje < 0 ? 'kpi-alerta' : ''}"><span>Saldo hoje</span><b>${brl(base.saldoHoje)}</b><small>${orc ? `${Math.max(0, Math.round((100 * base.saldoHoje) / orc))}% do recurso` : ''}</small></div>
<div class="kpi ${base.saldoFim < 0 ? 'kpi-alerta' : ''}"><span>Projeção em ${fmtData(cfg.fim)}</span><b>${brl(base.saldoFim)}</b><small>no ritmo atual: ${fmtNum(Math.round(E.base.r))} almoços e ${fmtNum(Math.round(E.base.l))} lanches por dia</small></div>
<div class="kpi ${base.acaba && !semCredito ? 'kpi-alerta' : ''}"><span>${semCredito ? 'Necessário até ' + fmtData(cfg.fim) : base.acaba ? 'O recurso acaba em' : 'O recurso cobre o período'}</span><b>${semCredito ? brl(Math.max(0, -base.saldoFim)) : base.acaba ? fmtData(base.acaba) : 'Sim'}</b><small>${base.diasFut} dia(s) úteis de atendimento restantes</small></div>
</div>
<div class="abas" id="fin-abas">${ABAS.map(([k, t]) => `<button data-aba="${k}" class="${k === E.aba ? 'ativo' : ''}">${t}</button>`).join('')}</div>
<div id="fin-corpo">${E.aba === 'relatorio' ? telaRelatorio() : E.aba === 'simulador' ? telaSimulador() : telaRecurso()}</div>`;

  el.onclick = aoClicar;
  if (E.aba === 'relatorio') {
    $('#fr-ini', el).onchange = (e) => { E.rel.ini = e.target.value || cfg.inicio; if (E.rel.ini > E.rel.fim) E.rel.fim = E.rel.ini; desenhar(); };
    $('#fr-fim', el).onchange = (e) => { E.rel.fim = e.target.value || E.hoje; if (E.rel.fim < E.rel.ini) E.rel.ini = E.rel.fim; desenhar(); };
  } else if (E.aba === 'simulador') {
    resultadoSim();
    $('#f-sim', el).oninput = (e) => {
      const k = e.target.dataset.s; if (!k) return;
      E.sim[k] = Math.max(0, num(e.target.value)); if (k === 'taxaR' || k === 'taxaL') E.sim[k] = Math.min(100, E.sim[k]);
      E.simAlt = true; recalc(); resultadoSim(); desenharGraf();
    };
    $('#f-desde', el).onchange = (e) => { E.sim.desde = e.target.value || addDias(E.hoje, 1); E.simAlt = true; recalc(); resultadoSim(); desenharGraf(); };
  } else if (E.editando) ligarCfg();
}

function aoClicar(e) {
  const alvo = (s) => e.target.closest(s);
  let b;
  if ((b = alvo('[data-aba]'))) { E.aba = b.dataset.aba; guardar('pases_fin_aba', E.aba); return desenhar(); }
  if ((b = alvo('[data-graf]'))) { E.graf = (E.graf + +b.dataset.graf + GRAFS.length) % GRAFS.length; guardar('pases_fin_graf', E.graf); return desenharGraf(); }
  if ((b = alvo('[data-graf-ir]'))) { E.graf = +b.dataset.grafIr; guardar('pases_fin_graf', E.graf); return desenharGraf(); }
  if ((b = alvo('[data-gran]'))) { E.gran = b.dataset.gran; guardar('pases_fin_gran', E.gran); return E.aba === 'relatorio' ? desenhar() : desenharGraf(); }
  if (alvo('#fr-hoje')) { E.rel = { ini: E.cfg.inicio, fim: E.hoje < E.cfg.inicio ? E.cfg.fim : E.hoje }; return desenhar(); }
  if (alvo('#fr-tudo')) { E.rel = { ini: E.cfg.inicio, fim: E.cfg.fim > E.hoje ? E.cfg.fim : E.hoje }; return desenhar(); }
  if (alvo('#f-zerar')) { iniciarSim(); return desenhar(); }
  if (alvo('#f-media')) { const t = taxaMedia(), a1 = (v) => Math.min(100, Math.round(v * 10) / 10); E.sim.taxaR = a1(t.r); E.sim.taxaL = a1(t.l); E.simAlt = true; return desenhar(); }
  if (alvo('#f-editar')) { E.editando = !E.editando; return desenhar(); }
}

// ---------------------------------------------------------------- aba Relatório
function linhasRel() { return agrupar(E.calc.base.linhas, E.gran, E.rel.ini, E.rel.fim); }
function telaRelatorio() {
  const G = linhasRel(), t = { d: 0, r: 0, l: 0, cr: 0, cl: 0, o: 0, c: 0 };
  const linhas = G.map((m) => {
    const proj = m.dp > 0 && !m.dr, misto = m.dp > 0 && m.dr > 0, cls = proj ? 'num proj' : 'num';
    t.d += m.dr + m.dp; t.r += m.r + m.pr; t.l += m.l + m.pl; t.cr += m.cr + m.pcr; t.cl += m.cl + m.pcl; t.o += m.outras; t.c += m.cred;
    return `<tr><td><b>${rotulo(m, E.gran)}</b>${proj ? ' <span class="selo">projeção</span>' : misto ? ' <span class="selo">parte projetada</span>' : ''}</td>
<td class="${cls}">${m.dr + m.dp || ''}</td><td class="${cls}">${fmtNum(Math.round(m.r + m.pr))}</td><td class="${cls}">${fmtNum(Math.round(m.l + m.pl))}</td>
<td class="${cls}">${brl(m.cr + m.pcr)}</td><td class="${cls}">${brl(m.cl + m.pcl)}</td><td class="${cls}">${m.outras ? brl(m.outras) : ''}</td>
<td class="${cls}"><b>${brl(gasto(m))}</b></td><td class="${cls}">${m.cred ? brl(m.cred) : ''}</td>
<td class="num"><b style="${m.saldo < 0 ? 'color:var(--vermelho)' : ''}">${brl(m.saldo)}</b></td></tr>`;
  }).join('');
  const saldoFinal = G.length ? G[G.length - 1].saldo : E.calc.base.saldoHoje;
  return `<div class="barra-filtros nao-imprimir">
<div class="campo"><span>Agrupar</span>${segGran()}</div>
<label class="campo"><span>De</span><input type="date" id="fr-ini" value="${E.rel.ini}" min="${E.cfg.inicio}"></label>
<label class="campo"><span>Até</span><input type="date" id="fr-fim" value="${E.rel.fim}"></label>
<button type="button" class="btn" id="fr-hoje">Do início até hoje</button>
<button type="button" class="btn" id="fr-tudo">Período inteiro, com projeção</button>
</div>
<div id="fin-graf">${carrossel()}</div>
<div class="cartao"><h2>Relatório financeiro por ${GRAN[E.gran]} · ${fmtData(E.rel.ini)} a ${fmtData(E.rel.fim)}</h2>
${G.length ? `<div class="tabela-wrap" style="margin-top:10px"><table class="tabela"><thead><tr><th>${E.gran === 'dia' ? 'Dia' : E.gran === 'semana' ? 'Semana' : 'Mês'}</th><th class="num">Dias de atendimento</th><th class="num">Almoços</th><th class="num">Lanches</th><th class="num">Almoço (R$)</th><th class="num">Lanche (R$)</th><th class="num">Outras despesas</th><th class="num">Total gasto</th><th class="num">Créditos</th><th class="num">Saldo no fim</th></tr></thead>
<tbody>${linhas}</tbody>
<tfoot><tr><td>Total</td><td class="num">${t.d}</td><td class="num">${fmtNum(Math.round(t.r))}</td><td class="num">${fmtNum(Math.round(t.l))}</td><td class="num">${brl(t.cr)}</td><td class="num">${brl(t.cl)}</td><td class="num">${t.o ? brl(t.o) : ''}</td><td class="num">${brl(t.cr + t.cl + t.o)}</td><td class="num">${t.c ? brl(t.c) : ''}</td><td class="num" style="${saldoFinal < 0 ? 'color:var(--vermelho)' : ''}">${brl(saldoFinal)}</td></tr></tfoot></table></div>` : vazio('Sem movimento neste intervalo.')}
<p class="pequeno mudo">Até ${fmtData(E.hoje)} os números são os registros realizados. Datas posteriores aparecem como projeção, calculada pela ${rotBase(E.base)}.${E.gran === 'dia' ? ' Só aparecem os dias com atendimento ou lançamento.' : ''}</p></div>`;
}

// ---------------------------------------------------------------- aba Simulador
function telaSimulador() {
  const s = E.sim, p = preco(E.hoje), tm = taxaMedia();
  const lin = (nome, al, tx, pr, q) => `<tr><td><b>${nome}</b></td>
<td class="num"><input type="number" min="0" step="1" data-s="${al}" value="${s[al]}" aria-label="Alunos em ${nome}"></td>
<td class="num"><input type="number" min="0" max="100" step="0.1" data-s="${tx}" value="${s[tx]}" aria-label="Comparecimento em ${nome}, em %"></td>
<td class="num"><b data-o="q${q}"></b></td>
<td class="num"><input type="number" min="0" step="0.01" data-s="${pr}" value="${s[pr]}" aria-label="Valor unitário de ${nome}"></td>
<td class="num"><b data-o="c${q}"></b></td></tr>`;
  return `<div class="cartao" style="margin-bottom:14px"><h2>Cenário</h2>
<p class="pequeno mudo" style="margin:4px 0 10px">Mude os números e veja o efeito nos meses seguintes. Nada aqui é gravado. O comparecimento é editável; a média do programa nos ${tm.n} dia(s) registrados é de <b>${pc1(tm.r)}</b> no almoço e <b>${pc1(tm.l)}</b> no lanche. Valores vigentes: almoço ${brl(p.r)} e lanche ${brl(p.l)}.</p>
<div class="tabela-wrap"><table class="tabela" id="f-sim"><thead><tr><th style="width:16%"></th><th class="num" style="width:16%">Alunos ativos</th><th class="num" style="width:17%">Comparecimento (%)</th><th class="num" style="width:17%">Atendimentos por dia</th><th class="num" style="width:17%">Valor unitário (R$)</th><th class="num" style="width:17%">Custo por dia</th></tr></thead>
<tbody>${lin('Almoço', 'alR', 'taxaR', 'pr', 'R')}${lin('Lanche', 'alL', 'taxaL', 'pl', 'L')}</tbody>
<tfoot><tr><td>Total</td><td class="num" data-o="al"></td><td></td><td class="num" data-o="q"></td><td></td><td class="num" data-o="c"></td></tr></tfoot></table></div>
<div class="barra-filtros nao-imprimir" style="margin-top:12px">
<label class="campo"><span>Cenário vale a partir de</span><input type="date" id="f-desde" value="${s.desde}" min="${addDias(E.hoje, 1)}"></label>
<button type="button" class="btn" id="f-media">Usar comparecimento médio dos registros</button>
<button type="button" class="btn" id="f-zerar">${ico('atualizar')} Voltar ao ritmo atual</button>
</div></div>
<div id="f-res"></div>
<div id="fin-graf">${carrossel()}</div>
<div class="cartao"><h2>Mês a mês</h2><div id="f-meses"></div></div>`;
}

function resultadoSim() {
  const { base, S } = E.calc, { sim, cfg, el } = E, q = simQ(sim);
  const dia = q.r * sim.pr + q.l * sim.pl, saldo = base.saldoHoje, dif = S.saldoFim - base.saldoFim;
  const sai = { qR: fmtNum(Math.round(q.r)), qL: fmtNum(Math.round(q.l)), cR: brl(q.r * sim.pr), cL: brl(q.l * sim.pl), al: fmtNum(sim.alR + sim.alL), q: fmtNum(Math.round(q.r) + Math.round(q.l)), c: brl(dia) };
  for (const [k, v] of Object.entries(sai)) { const o = $(`[data-o=${k}]`, el); if (o) o.textContent = v; }
  // quanto dos lançamentos futuros (créditos e outras despesas) ainda entra até o fim
  const futuros = soma(cfg.creditos.filter((x) => x.data > E.hoje), (x) => num(x.valor)) - soma(cfg.despesas.filter((x) => x.data > E.hoje), (x) => num(x.valor));
  const disp = saldo + futuros, n = S.diasFut;
  const maxR = n && sim.pr ? Math.floor((disp / n - q.l * sim.pl) / sim.pr) : 0, maxL = n && sim.pl ? Math.floor((disp / n - q.r * sim.pr) / sim.pl) : 0;
  const compra = (v) => (v ? fmtNum(Math.floor(Math.max(0, saldo) / v)) : null), cR = compra(sim.pr), cL = compra(sim.pl);
  $('#f-res', el).innerHTML = `<div class="kpis" style="margin-bottom:14px">
<div class="kpi"><span>Custo por dia de atendimento</span><b>${brl(dia)}</b><small>${sai.qR} almoços + ${sai.qL} lanches</small></div>
<div class="kpi ${S.saldoFim < 0 ? 'kpi-alerta' : ''}"><span>Saldo em ${fmtData(cfg.fim)}</span><b>${brl(S.saldoFim)}</b><small>${Math.abs(dif) > 0.5 ? `${dif > 0 ? '+' : '−'} ${brl(Math.abs(dif))} em relação ao ritmo atual` : 'igual ao ritmo atual'}</small></div>
<div class="kpi ${S.acaba ? 'kpi-alerta' : ''}"><span>${S.acaba ? 'O recurso acaba em' : 'Cobre até o fim?'}</span><b>${S.acaba ? fmtData(S.acaba) : 'Sim'}</b><small>${dia ? `o saldo de hoje paga ${fmtNum(Math.floor(Math.max(0, saldo) / dia))} dia(s) úteis neste cenário` : `${n} dia(s) úteis restantes`}</small></div>
<div class="kpi"><span>O saldo de hoje compra</span><b>${cR == null ? 'n/d' : `${cR} almoços`}</b><small>${cR == null && cL == null ? 'informe o valor unitário' : `ou ${cL == null ? 'n/d' : cL} lanches`}</small></div>
<div class="kpi"><span>Limite por dia para durar até o fim</span><b>${sim.pr ? `${fmtNum(Math.max(0, maxR))} almoços` : 'n/d'}</b><small>${sim.pr || sim.pl ? `mantendo ${sai.qL} lanches · ou ${fmtNum(Math.max(0, maxL))} lanches mantendo ${sai.qR} almoços` : 'informe o valor unitário'}</small></div>
</div>`;
  const M = agrupar(S.linhas, 'mes'), fr = feriadosRestantes();
  $('#f-meses', el).innerHTML = `<div class="tabela-wrap" style="margin-top:10px"><table class="tabela"><thead><tr><th>Mês</th><th class="num">Dias feitos</th><th class="num" style="width:130px">Dias úteis a fazer</th><th class="num">Almoços</th><th class="num">Lanches</th><th class="num">Realizado</th><th class="num">Projetado</th><th class="num">Outras despesas</th><th class="num">Saldo no fim</th></tr></thead>
<tbody>${M.map((m) => { const ur = uteisRestantes(m.k); return `<tr><td><b>${rotMes(m.k)}</b></td>
<td class="num">${m.dr}</td>
<td class="num">${ur ? `<input type="number" min="0" max="${ur}" data-dm="${m.k}" value="${m.dp}" title="Dias úteis de atendimento que ainda virão neste mês (máximo ${ur})">` : '0'}</td>
<td class="num">${fmtNum(Math.round(m.r + m.pr))}</td><td class="num">${fmtNum(Math.round(m.l + m.pl))}</td>
<td class="num">${brl(m.cr + m.cl)}</td><td class="num">${m.dp ? brl(m.pcr + m.pcl) : ''}</td><td class="num">${m.outras ? brl(m.outras) : ''}</td>
<td class="num"><b style="${m.saldo < 0 ? 'color:var(--vermelho)' : ''}">${brl(m.saldo)}</b></td></tr>`; }).join('')}</tbody></table></div>
<p class="pequeno mudo">"Dias úteis a fazer" conta de segunda a sexta até ${fmtData(cfg.fim)}${fr.length ? `, já sem os feriados nacionais (${fr.join(', ')})` : ''}. Reduza o número do mês quando houver feriado local, recesso ou férias; esse ajuste fica gravado.</p>`;
  $$('[data-dm]', el).forEach((i) => (i.onchange = async () => {
    const ur = uteisRestantes(i.dataset.dm), v = Math.max(0, Math.min(ur, Math.round(num(i.value))));
    if (v === ur) delete E.cfg.dias_mes[i.dataset.dm]; else E.cfg.dias_mes[i.dataset.dm] = v;
    try { await api('financeiro_salvar', { p_dados: E.cfg }); } catch (err) { aviso(err.message, 'erro'); }
    recalc(); resultadoSim(); desenharGraf();
  }));
}

// ---------------------------------------------------------------- aba Recurso e valores
function telaRecurso() {
  return `<div class="cartao"><div class="linha-flex"><h2>Recurso e valores</h2><span class="espaco"></span>
<button type="button" class="btn nao-imprimir" id="f-editar">${ico('editar')} ${E.editando ? 'Fechar edição' : 'Editar'}</button></div>
<div id="f-cfg">${E.editando ? formCfg() : resumoCfg()}</div></div>`;
}
function resumoCfg() {
  const c = E.cfg, lin = (l, f, n) => l.map(f).join('') || `<tr><td colspan="${n}" class="vazio">Nada lançado.</td></tr>`;
  return `<p class="pequeno mudo" style="margin:6px 0 10px">${c.fonte ? `<b>${esc(c.fonte)}</b> · ` : ''}Período: ${fmtData(c.inicio)} a ${fmtData(c.fim)} · Projeção pela ${rotBase(E.base)}</p>
<div class="grade" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px">
<div><h3>Recurso (créditos)</h3><table class="tabela"><thead><tr><th>Data</th><th>Descrição</th><th class="num">Valor</th></tr></thead><tbody>${lin(c.creditos, (x) => `<tr><td>${fmtData(x.data)}</td><td>${esc(x.descricao || '')}</td><td class="num"><b>${brl(x.valor)}</b></td></tr>`, 3)}</tbody></table></div>
<div><h3>Valor por unidade</h3><table class="tabela"><thead><tr><th>Desde</th><th class="num">Almoço</th><th class="num">Lanche</th></tr></thead><tbody>${lin(c.precos, (x) => `<tr><td>${fmtData(x.desde)}</td><td class="num">${brl(x.refeicao)}</td><td class="num">${brl(x.lanche)}</td></tr>`, 3)}</tbody></table></div>
<div><h3>Outras despesas do mesmo recurso</h3><table class="tabela"><thead><tr><th>Data</th><th>Descrição</th><th class="num">Valor</th></tr></thead><tbody>${lin(c.despesas, (x) => `<tr><td>${fmtData(x.data)}</td><td>${esc(x.descricao || '')}</td><td class="num"><b>${brl(x.valor)}</b></td></tr>`, 3)}</tbody></table></div>
</div>`;
}
function formCfg() {
  const c = E.cfg, pj = c.proj || {}, tm = taxaMedia();
  const lanc = (k, x = {}) => `<div class="linha-flex" data-lin="${k}" style="margin-bottom:6px;flex-wrap:nowrap"><input type="date" data-c="data" value="${esc(x.data || (k === 'creditos' ? c.inicio : E.hoje))}" style="width:150px">
<input type="text" data-c="descricao" value="${esc(x.descricao || '')}" placeholder="Descrição" style="flex:1;min-width:120px"><input type="number" min="0" step="0.01" data-c="valor" value="${x.valor ?? ''}" placeholder="R$" style="width:130px"><button type="button" class="btn pequeno" data-rem title="Remover">${ico('x')}</button></div>`;
  const prc = (x = {}) => `<div class="linha-flex" data-lin="precos" style="margin-bottom:6px;flex-wrap:nowrap"><input type="date" data-c="desde" value="${esc(x.desde || c.inicio)}" style="width:150px">
<input type="number" min="0" step="0.01" data-c="refeicao" value="${x.refeicao ?? ''}" placeholder="Almoço R$" style="width:130px"><input type="number" min="0" step="0.01" data-c="lanche" value="${x.lanche ?? ''}" placeholder="Lanche R$" style="width:130px"><button type="button" class="btn pequeno" data-rem title="Remover">${ico('x')}</button></div>`;
  E._lin = { creditos: lanc.bind(null, 'creditos'), despesas: lanc.bind(null, 'despesas'), precos: prc };
  return `<div class="barra-filtros" style="margin-top:10px"><label class="campo" style="min-width:300px"><span>Origem do recurso</span><input type="text" id="fc-fonte" value="${esc(c.fonte || '')}" maxlength="120"></label>
<label class="campo"><span>Início do período</span><input type="date" id="fc-ini" value="${c.inicio}"></label>
<label class="campo"><span>Fim do período (último dia de atendimento)</span><input type="date" id="fc-fim" value="${c.fim}"></label></div>
<h3>Recurso destinado à assistência estudantil</h3><p class="pequeno mudo" style="margin:2px 0 8px">Lance o valor total ou cada parcela recebida (data, descrição, valor). Pode ficar em branco e ser lançado depois, com a data em que o crédito de fato ocorreu.</p>
<div data-grupo="creditos">${(c.creditos.length ? c.creditos : [{}]).map((x) => lanc('creditos', x)).join('')}</div><button type="button" class="btn pequeno" data-add="creditos">${ico('mais')} Adicionar crédito</button>
<h3 style="margin-top:16px">Valor do almoço e do lanche</h3><p class="pequeno mudo" style="margin:2px 0 8px">Se o valor mudar (novo contrato ou reajuste), adicione outra linha com a data em que passa a valer.</p>
<div data-grupo="precos">${(c.precos.length ? c.precos : [{}]).map(prc).join('')}</div><button type="button" class="btn pequeno" data-add="precos">${ico('mais')} Adicionar valor</button>
<h3 style="margin-top:16px">Outras despesas pagas com o mesmo recurso (opcional)</h3>
<div data-grupo="despesas">${c.despesas.map((x) => lanc('despesas', x)).join('')}</div><button type="button" class="btn pequeno" data-add="despesas">${ico('mais')} Adicionar despesa</button>
<h3 style="margin-top:16px">Base da projeção ("ritmo atual")</h3><p class="pequeno mudo" style="margin:2px 0 8px">Define quantos almoços e lanches por dia o sistema supõe para os dias úteis que faltam. Média do programa hoje: ${pc1(tm.r)} no almoço e ${pc1(tm.l)} no lanche.</p>
<div class="barra-filtros"><label class="campo" style="min-width:300px"><span>Calcular por</span><select id="fc-modo">
<option value="ultimos" ${pj.modo !== 'media' && pj.modo !== 'fixo' ? 'selected' : ''}>Média dos últimos 10 dias de atendimento</option>
<option value="media" ${pj.modo === 'media' ? 'selected' : ''}>Média de todos os dias registrados</option>
<option value="fixo" ${pj.modo === 'fixo' ? 'selected' : ''}>Percentual de comparecimento informado</option></select></label>
<label class="campo"><span>Comparecimento no almoço (%)</span><input type="number" min="0" max="100" step="0.1" id="fc-tr" value="${pj.taxaR ?? Math.round(tm.r * 10) / 10}" style="width:150px"></label>
<label class="campo"><span>Comparecimento no lanche (%)</span><input type="number" min="0" max="100" step="0.1" id="fc-tl" value="${pj.taxaL ?? Math.round(tm.l * 10) / 10}" style="width:150px"></label></div>
<div style="margin-top:16px"><button type="button" class="btn primario" id="fc-salvar">Salvar</button></div>`;
}
function ligarCfg() {
  const box = $('#f-cfg', E.el), modo = $('#fc-modo', box);
  const travar = () => { for (const i of [$('#fc-tr', box), $('#fc-tl', box)]) i.disabled = modo.value !== 'fixo'; };
  modo.onchange = travar; travar();
  box.onclick = async (e) => {
    const add = e.target.closest('[data-add]'), rem = e.target.closest('[data-rem]');
    if (add) $(`[data-grupo=${add.dataset.add}]`, box).insertAdjacentHTML('beforeend', E._lin[add.dataset.add]());
    if (rem) rem.closest('[data-lin]').remove();
    if (!e.target.closest('#fc-salvar')) return;
    const ler = (k, campos) => $$(`[data-lin=${k}]`, box).map((l) => Object.fromEntries(campos.map((c) => [c, $(`[data-c=${c}]`, l).value.trim()])));
    const creditos = ler('creditos', ['data', 'descricao', 'valor']).filter((x) => x.data && num(x.valor) > 0).map((x) => ({ ...x, valor: num(x.valor) }));
    const despesas = ler('despesas', ['data', 'descricao', 'valor']).filter((x) => x.data && num(x.valor) > 0).map((x) => ({ ...x, valor: num(x.valor) }));
    const precos = ler('precos', ['desde', 'refeicao', 'lanche']).filter((x) => x.desde && (x.refeicao !== '' || x.lanche !== '')).map((x) => ({ desde: x.desde, refeicao: num(x.refeicao), lanche: num(x.lanche) })).sort((a, b) => a.desde.localeCompare(b.desde));
    const inicio = $('#fc-ini', box).value, fim = $('#fc-fim', box).value;
    if (!inicio || !fim || inicio > fim) return aviso('Confira o início e o fim do período.', 'erro');
    if (!precos.length) return aviso('Informe o valor do almoço e do lanche.', 'erro');
    const pc = (v) => Math.max(0, Math.min(100, num(v)));
    const proj = modo.value === 'fixo' ? { modo: 'fixo', taxaR: pc($('#fc-tr', box).value), taxaL: pc($('#fc-tl', box).value) } : { modo: modo.value };
    const novo = { inicio, fim, creditos, despesas, precos, dias_mes: E.cfg.dias_mes, fonte: $('#fc-fonte', box).value.trim(), proj };
    try {
      await api('financeiro_salvar', { p_dados: novo });
      E.cfg = novo; E.editando = false; E.rel = { ini: inicio, fim: E.hoje < inicio ? fim : E.hoje };
      iniciarSim(); desenhar(); aviso('Financeiro atualizado.', 'ok');
    } catch (err) { aviso(err.message, 'erro'); }
  };
}

// ---------------------------------------------------------------- CSV
export function exportar() {
  if (!E) return;
  const c = E.cfg;
  if (E.aba === 'recurso') {
    return baixarCsv('pases_financeiro_recurso_e_valores', ['tipo', 'data', 'descricao', 'valor', 'valor_almoco', 'valor_lanche'],
      [...c.creditos.map((x) => ['credito', fmtData(x.data), x.descricao || '', dec(x.valor), '', '']),
        ...c.despesas.map((x) => ['outra_despesa', fmtData(x.data), x.descricao || '', dec(x.valor), '', '']),
        ...c.precos.map((x) => ['valor_unitario', fmtData(x.desde), '', '', dec(x.refeicao), dec(x.lanche)])]);
  }
  const sim = E.aba === 'simulador', gran = sim ? 'mes' : E.gran;
  const G = sim ? agrupar(E.calc.S.linhas, 'mes') : linhasRel();
  baixarCsv(`pases_financeiro_${sim ? 'simulacao' : 'por_' + gran}_${sim ? c.inicio : E.rel.ini}_a_${sim ? c.fim : E.rel.fim}`,
    ['periodo', 'inicio', 'fim', 'dias_realizados', 'dias_a_realizar', 'almocos', 'lanches', 'gasto_almoco', 'gasto_lanche', 'gasto_realizado', 'gasto_projetado', 'outras_despesas', 'creditos', 'saldo_no_fim'],
    G.map((m) => [rotulo(m, gran), fmtData(m.ini), fmtData(m.fim), m.dr, m.dp, Math.round(m.r + m.pr), Math.round(m.l + m.pl), dec(m.cr + m.pcr), dec(m.cl + m.pcl), dec(m.cr + m.cl), dec(m.pcr + m.pcl), dec(m.outras), dec(m.cred), dec(m.saldo)]));
}
