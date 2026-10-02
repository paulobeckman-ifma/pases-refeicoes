// Financeiro (só administradores): orçamento da assistência estudantil, consumo, projeção e simulações.
// Aberto como aba dentro de Relatórios. Os valores ficam no servidor em uma chave que só o administrador lê.
import { $, $$, esc, ico, aviso, fmtData, fmtDataCurta, addDias, diaSemanaNum, fmtNum, baixarCsv, MESES } from './util.js';
import { api } from './api.js';

const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const brlCurto = (v) => { const a = Math.abs(v); return (v < 0 ? '-' : '') + (a >= 1e6 ? `${(a / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi` : a >= 1e3 ? `${(a / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : a.toLocaleString('pt-BR', { maximumFractionDigits: 0 })); };
const num = (v) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const mesDe = (iso) => iso.slice(0, 7);
const rotMes = (ym) => `${MESES[+ym.slice(5) - 1].slice(0, 3)}/${ym.slice(2, 4)}`;
const util = (iso) => diaSemanaNum(iso) <= 5;
const soma = (l, f) => l.reduce((s, x) => s + f(x), 0);

let E = null;   // estado da página (config, consumo, simulação)

export async function render(el) {
  el.innerHTML = '<div class="vazio">Carregando…</div>';
  const d = await api('financeiro_obter');
  const c = d.config || {};
  E = {
    el, hoje: d.hoje, dias: d.dias || [], ativos: d.ativos || { refeicao: 0, lanche: 0 },
    cfg: {
      inicio: c.inicio || (d.dias[0]?.d ?? d.hoje), fim: c.fim || `${d.hoje.slice(0, 4)}-12-31`,
      creditos: c.creditos || [], despesas: c.despesas || [], precos: (c.precos || []).slice().sort((a, b) => a.desde.localeCompare(b.desde)),
      dias_mes: c.dias_mes || {}, fonte: c.fonte ?? 'Ação 21IV · Assistência Estudantil (IFMA)'
    },
    sim: null, editando: !(c.creditos?.length && c.precos?.length)
  };
  iniciarSim();
  desenhar();
}

// ---------------------------------------------------------------- cálculo
function preco(iso) {
  const p = E.cfg.precos; if (!p.length) return { r: 0, l: 0 };
  let at = p[0]; for (const x of p) if (x.desde <= iso) at = x;
  return { r: num(at.refeicao), l: num(at.lanche) };
}
// dias de atendimento que ainda virão (seg a sex até o fim do período; por mês pode ser ajustado na tabela)
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
// ritmo atual: média dos últimos 10 dias de atendimento (dias com registro, antes de hoje se houver)
function ritmo() {
  let l = E.dias.filter((x) => x.r + x.l > 0 && x.d < E.hoje);
  if (!l.length) l = E.dias.filter((x) => x.r + x.l > 0);
  l = l.slice(-10);
  return { r: l.length ? soma(l, (x) => x.r) / l.length : 0, l: l.length ? soma(l, (x) => x.l) / l.length : 0, n: l.length };
}
function iniciarSim() {
  const b = ritmo(), p = preco(E.hoje), at = E.ativos;
  E.base = b;
  E.sim = {
    r: Math.round(b.r), l: Math.round(b.l), addR: 0, addL: 0,
    taxaR: at.refeicao ? Math.min(100, Math.round((100 * b.r) / at.refeicao)) || 80 : 80,
    taxaL: at.lanche ? Math.min(100, Math.round((100 * b.l) / at.lanche)) || 80 : 80,
    pr: p.r, pl: p.l, desde: addDias(E.hoje, 1)
  };
}
function eventos(lista, sinal) { const m = {}; for (const x of lista) if (x.data) m[x.data] = (m[x.data] || 0) + sinal * num(x.valor); return m; }

/** Saldo dia a dia: real até hoje; depois, projeção. sim=null usa o ritmo atual e os valores vigentes. */
function calcular(sim) {
  const { cfg, hoje } = E, cred = eventos(cfg.creditos, 1), desp = eventos(cfg.despesas, -1);
  const mov = (d) => (cred[d] || 0) + (desp[d] || 0);
  const real = new Map(E.dias.map((x) => [x.d, x]));
  // tudo o que tem data anterior ao início do período entra no saldo inicial
  let saldo = 0;
  for (const d of Object.keys(cred)) if (d < cfg.inicio) saldo += cred[d];
  for (const d of Object.keys(desp)) if (d < cfg.inicio) saldo += desp[d];
  for (const x of E.dias) if (x.d < cfg.inicio) { const p = preco(x.d); saldo -= x.r * p.r + x.l * p.l; }
  const fut = new Set(diasFuturos()), serie = [], meses = new Map();
  const mes = (d) => { const k = mesDe(d); if (!meses.has(k)) meses.set(k, { m: k, dr: 0, r: 0, l: 0, cr: 0, cl: 0, dp: 0, pr: 0, pl: 0, pcr: 0, pcl: 0, outras: 0, creditos: 0, saldo: 0 }); return meses.get(k); };
  let fimSaldo = null, d = cfg.inicio;
  const ultimo = cfg.fim > hoje ? cfg.fim : hoje;
  while (d <= ultimo) {
    const M = mes(d); saldo += mov(d); M.creditos += cred[d] || 0; M.outras -= desp[d] || 0;
    if (d <= hoje) {
      const x = real.get(d);
      if (x) { const p = preco(d); M.dr++; M.r += x.r; M.l += x.l; M.cr += x.r * p.r; M.cl += x.l * p.l; saldo -= x.r * p.r + x.l * p.l; }
    } else if (fut.has(d)) {
      const s = sim && d >= sim.desde ? sim : null, p = preco(d);
      const qr = s ? s.r + s.addR * (s.taxaR / 100) : E.base.r, ql = s ? s.l + s.addL * (s.taxaL / 100) : E.base.l;
      const vr = s ? s.pr : p.r, vl = s ? s.pl : p.l;
      M.dp++; M.pr += qr; M.pl += ql; M.pcr += qr * vr; M.pcl += ql * vl; saldo -= qr * vr + ql * vl;
      if (saldo < 0 && !fimSaldo) fimSaldo = d;
    }
    M.saldo = saldo; serie.push({ d, s: saldo, proj: d > hoje });
    d = addDias(d, 1);
  }
  const hojeP = serie.filter((x) => !x.proj).pop();
  return { serie, meses: [...meses.values()], saldoHoje: hojeP ? hojeP.s : saldo, saldoFim: saldo, acaba: fimSaldo, diasFut: fut.size };
}

// ---------------------------------------------------------------- gráficos
function grafSaldo(base, sim) {
  const W = 760, H = 260, ml = 54, mr = 10, mt = 12, mb = 26, pw = W - ml - mr, ph = H - mt - mb;
  const todos = base.serie.concat(sim.serie); if (base.serie.length < 2) return '<div class="vazio">Defina o período para ver o gráfico.</div>';
  let max = Math.max(...todos.map((x) => x.s), 1), min = Math.min(...todos.map((x) => x.s), 0);
  const folga = (max - min) * 0.06; max += folga; if (min < 0) min -= folga;
  const n = base.serie.length, X = (i) => ml + (pw * i) / (n - 1), Y = (v) => mt + ph - ((v - min) / (max - min)) * ph;
  const linha = (s, f) => s.map((p, i) => (f(p, i) ? `${X(i).toFixed(1)},${Y(p.s).toFixed(1)}` : null)).filter(Boolean).join(' ');
  const iHoje = base.serie.findIndex((x) => x.proj) - 1, corte = iHoje < 0 ? n - 1 : iHoje;
  let s = `<svg class="grafico" viewBox="0 0 ${W} ${H}" role="img" aria-label="Saldo ao longo do período">`;
  for (let i = 0; i <= 4; i++) { const v = min + ((max - min) * i) / 4, y = Y(v); s += `<line class="grade-h" x1="${ml}" x2="${W - mr}" y1="${y}" y2="${y}"/><text x="${ml - 6}" y="${y + 4}" text-anchor="end">${brlCurto(v)}</text>`; }
  if (min < 0) s += `<line x1="${ml}" x2="${W - mr}" y1="${Y(0)}" y2="${Y(0)}" stroke="var(--vermelho)" stroke-width="1.5"/>`;
  let ant = '';
  base.serie.forEach((p, i) => { const m = mesDe(p.d); if (m !== ant) { ant = m; if (i) s += `<line class="grade-h" x1="${X(i)}" x2="${X(i)}" y1="${mt}" y2="${mt + ph}"/>`; s += `<text x="${X(i) + 3}" y="${H - 8}">${rotMes(m)}</text>`; } });
  s += `<polyline fill="none" stroke="var(--verde)" stroke-width="2.5" points="${linha(base.serie, (p, i) => i <= corte)}"/>`;
  s += `<polyline fill="none" stroke="#8a9590" stroke-width="2" stroke-dasharray="5 4" points="${linha(base.serie, (p, i) => i >= corte)}"/>`;
  if (Math.abs(sim.saldoFim - base.saldoFim) > 0.5) s += `<polyline fill="none" stroke="#3b7dd8" stroke-width="2.5" stroke-dasharray="5 4" points="${linha(sim.serie, (p, i) => i >= corte)}"/>`;
  if (iHoje >= 0) s += `<line x1="${X(corte)}" x2="${X(corte)}" y1="${mt}" y2="${mt + ph}" stroke="var(--tinta-3)" stroke-dasharray="2 3"/><text x="${X(corte)}" y="${mt + 9}" text-anchor="middle">hoje</text>`;
  const passo = pw / (n - 1);
  sim.serie.forEach((p, i) => { s += `<rect x="${X(i) - passo / 2}" y="${mt}" width="${Math.max(passo, 1)}" height="${ph}" fill="transparent" data-dica="${fmtDataCurta(p.d)}: ${brl(p.proj ? p.s : base.serie[i].s)}${p.proj ? ' (projeção)' : ''}"/>`; });
  return s + '</svg>';
}
function grafMeses(meses) {
  const W = 760, H = 220, ml = 54, mr = 10, mt = 10, mb = 24, pw = W - ml - mr, ph = H - mt - mb, n = meses.length;
  const tot = (m) => m.cr + m.cl + m.pcr + m.pcl + m.outras, max = Math.max(...meses.map(tot), 1) * 1.08;
  const passo = pw / n, bw = Math.min(70, passo * 0.6);
  let s = `<svg class="grafico" viewBox="0 0 ${W} ${H}" role="img" aria-label="Gasto por mês">`;
  for (let i = 0; i <= 4; i++) { const y = mt + ph - (ph * i) / 4; s += `<line class="${i ? 'grade-h' : 'eixo'}" x1="${ml}" x2="${W - mr}" y1="${y}" y2="${y}"/><text x="${ml - 6}" y="${y + 4}" text-anchor="end">${brlCurto((max * i) / 4)}</text>`; }
  meses.forEach((m, i) => {
    const x = ml + i * passo + (passo - bw) / 2; let y = mt + ph;
    const parte = (v, cor, op, rot) => { if (v <= 0) return; const h = (v / max) * ph; y -= h; s += `<rect x="${x}" y="${y}" width="${bw}" height="${h}" fill="${cor}" opacity="${op}" data-dica="${rotMes(m.m)} · ${rot}: ${brl(v)}"/>`; };
    parte(m.cr, 'var(--verde)', 1, 'almoço (realizado)'); parte(m.cl, '#3b7dd8', 1, 'lanche (realizado)'); parte(m.outras, '#e0a33a', 1, 'outras despesas');
    parte(m.pcr, 'var(--verde)', 0.4, 'almoço (projeção)'); parte(m.pcl, '#3b7dd8', 0.4, 'lanche (projeção)');
    s += `<text x="${x + bw / 2}" y="${H - 6}" text-anchor="middle">${rotMes(m.m)}</text><text x="${x + bw / 2}" y="${y - 4}" text-anchor="middle">${brlCurto(tot(m))}</text>`;
  });
  return s + '</svg>';
}
const legenda = (itens) => `<div class="linha-flex pequeno mudo" style="gap:14px;margin:6px 0 0">${itens.map(([c, t, tr]) => `<span><span style="display:inline-block;width:14px;height:${tr ? 0 : 10}px;${tr ? `border-top:2px dashed ${c}` : `background:${c}`};vertical-align:middle;border-radius:2px;margin-right:5px"></span>${t}</span>`).join('')}</div>`;

// ---------------------------------------------------------------- tela
function desenhar() {
  const { el, cfg, sim } = E;
  const orc = soma(cfg.creditos, (x) => num(x.valor)), outras = soma(cfg.despesas.filter((x) => x.data <= E.hoje), (x) => num(x.valor));
  const base = calcular(null), S = calcular(sim), p = preco(E.hoje);
  const feitas = E.dias.filter((x) => x.d >= cfg.inicio), qr = soma(feitas, (x) => x.r), ql = soma(feitas, (x) => x.l);
  const consumo = soma(base.meses, (m) => m.cr + m.cl);
  const semDados = !cfg.creditos.length || !cfg.precos.length;

  el.innerHTML = `<style>#rel-corpo .kpi b{font-size:21px;white-space:nowrap}#rel-corpo .kpis{grid-template-columns:repeat(auto-fit,minmax(190px,1fr))}</style>
    ${semDados ? '<div class="caixa aviso-caixa" style="margin-bottom:12px">Informe abaixo o <b>recurso disponível</b> e o <b>valor do almoço e do lanche</b> para o sistema calcular consumo, saldo e projeções.</div>' : ''}
    <div class="kpis">
      <div class="kpi"><span>Recurso destinado</span><b>${brl(orc)}</b><small>${esc(cfg.fonte || '')}${cfg.creditos.length > 1 ? ` · ${cfg.creditos.length} lançamentos` : ''}</small></div>
      <div class="kpi"><span>Consumido até hoje</span><b>${brl(consumo)}</b><small>${fmtNum(qr)} almoços · ${fmtNum(ql)} lanches${outras ? ` · + ${brl(outras)} em outras despesas` : ''}</small></div>
      <div class="kpi ${base.saldoHoje < 0 ? 'kpi-alerta' : ''}"><span>Saldo hoje</span><b>${brl(base.saldoHoje)}</b><small>${orc ? `${Math.max(0, Math.round((100 * base.saldoHoje) / orc))}% do recurso` : ''}</small></div>
      <div class="kpi ${base.saldoFim < 0 ? 'kpi-alerta' : ''}"><span>Projeção em ${fmtData(cfg.fim)}</span><b>${brl(base.saldoFim)}</b><small>no ritmo atual: ${fmtNum(Math.round(E.base.r))} almoços e ${fmtNum(Math.round(E.base.l))} lanches por dia</small></div>
      <div class="kpi ${base.acaba ? 'kpi-alerta' : ''}"><span>${base.acaba ? 'O recurso acaba em' : 'O recurso cobre o período'}</span><b>${base.acaba ? fmtData(base.acaba) : 'Sim'}</b><small>${base.diasFut} dia(s) de atendimento restantes</small></div>
    </div>
    <div class="grade" style="grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:14px;margin-bottom:14px">
      <div class="cartao"><h2>Saldo ao longo do período</h2><div id="f-gsaldo">${grafSaldo(base, S)}</div>
        ${legenda([['var(--verde)', 'realizado'], ['#8a9590', 'projeção no ritmo atual', 1], ['#3b7dd8', 'simulação', 1]])}</div>
      <div class="cartao"><h2>Gasto por mês</h2><div id="f-gmes">${grafMeses(S.meses)}</div>
        ${legenda([['var(--verde)', 'almoço'], ['#3b7dd8', 'lanche'], ['#e0a33a', 'outras despesas'], ['#b9d9c3', 'mais claro = projeção']])}</div>
    </div>

    <div class="cartao" style="margin-bottom:14px"><h2>Simulador</h2>
      <p class="pequeno mudo" style="margin:4px 0 10px">Mude os números e veja o efeito nos meses seguintes. Nada aqui é gravado; serve só para testar cenários.
        Hoje: ${E.ativos.refeicao} alunos ativos em almoço e ${E.ativos.lanche} em lanche; valores vigentes: almoço ${brl(p.r)} e lanche ${brl(p.l)}.</p>
      <div class="barra-filtros nao-imprimir" id="f-sim">
        <label class="campo"><span>Almoços por dia</span><input type="number" min="0" data-s="r" value="${sim.r}" style="width:110px"></label>
        <label class="campo"><span>Lanches por dia</span><input type="number" min="0" data-s="l" value="${sim.l}" style="width:110px"></label>
        <label class="campo"><span>+ alunos em almoço</span><input type="number" data-s="addR" value="${sim.addR}" style="width:110px"></label>
        <label class="campo"><span>comparecimento %</span><input type="number" min="0" max="100" data-s="taxaR" value="${sim.taxaR}" style="width:90px"></label>
        <label class="campo"><span>+ alunos em lanche</span><input type="number" data-s="addL" value="${sim.addL}" style="width:110px"></label>
        <label class="campo"><span>comparecimento %</span><input type="number" min="0" max="100" data-s="taxaL" value="${sim.taxaL}" style="width:90px"></label>
        <label class="campo"><span>Valor do almoço (R$)</span><input type="number" min="0" step="0.01" data-s="pr" value="${sim.pr}" style="width:110px"></label>
        <label class="campo"><span>Valor do lanche (R$)</span><input type="number" min="0" step="0.01" data-s="pl" value="${sim.pl}" style="width:110px"></label>
        <label class="campo"><span>A partir de</span><input type="date" data-s="desde" value="${sim.desde}"></label>
        <button class="btn" id="f-zerar">${ico('atualizar')} Voltar ao ritmo atual</button>
      </div>
      <div id="f-res"></div>
    </div>

    <div class="cartao"><div class="linha-flex"><h2>Recurso e valores</h2><span class="espaco"></span>
      <button class="btn nao-imprimir" id="f-editar">${ico('editar')} ${E.editando ? 'Fechar edição' : 'Editar'}</button></div>
      <div id="f-cfg">${E.editando ? formCfg() : resumoCfg()}</div></div>`;

  resultado(base, S);
  $('#f-sim', el).oninput = (e) => {
    const k = e.target.dataset.s; if (!k) return;
    E.sim[k] = k === 'desde' ? (e.target.value || addDias(E.hoje, 1)) : num(e.target.value);
    const b = calcular(null), s2 = calcular(E.sim);
    $('#f-gsaldo', el).innerHTML = grafSaldo(b, s2); $('#f-gmes', el).innerHTML = grafMeses(s2.meses); resultado(b, s2);
  };
  $('#f-zerar', el).onclick = () => { iniciarSim(); desenhar(); };
  $('#f-editar', el).onclick = () => { E.editando = !E.editando; desenhar(); };
  if (E.editando) ligarCfg();
}

function resultado(base, S) {
  const { sim, cfg } = E, qR = sim.r + sim.addR * (sim.taxaR / 100), qL = sim.l + sim.addL * (sim.taxaL / 100);
  const dia = qR * sim.pr + qL * sim.pl, saldo = base.saldoHoje, dif = S.saldoFim - base.saldoFim;
  // quanto dos lançamentos futuros (créditos e outras despesas) ainda entra até o fim
  const futuros = soma(cfg.creditos.filter((x) => x.data > E.hoje), (x) => num(x.valor)) - soma(cfg.despesas.filter((x) => x.data > E.hoje), (x) => num(x.valor));
  const disp = saldo + futuros, n = S.diasFut;
  const maxR = n && sim.pr ? Math.floor((disp / n - qL * sim.pl) / sim.pr) : 0, maxL = n && sim.pl ? Math.floor((disp / n - qR * sim.pr) / sim.pl) : 0;
  const linhas = S.meses.map((m) => {
    const futuro = m.dp > 0 || m.m > mesDe(E.hoje), ur = uteisRestantes(m.m);
    return `<tr><td><b>${rotMes(m.m)}</b></td>
      <td class="num">${m.dr}</td>
      <td class="num">${ur ? `<input type="number" min="0" max="${ur}" data-dm="${m.m}" value="${m.dp}" class="nao-imprimir" style="width:64px;padding:3px 6px" title="Dias de atendimento que ainda virão neste mês (máximo ${ur} dias úteis)">` : (futuro ? 0 : '')}</td>
      <td class="num">${fmtNum(Math.round(m.r + m.pr))}</td><td class="num">${fmtNum(Math.round(m.l + m.pl))}</td>
      <td class="num">${brl(m.cr + m.cl)}</td><td class="num">${m.dp ? brl(m.pcr + m.pcl) : ''}</td><td class="num">${m.outras ? brl(m.outras) : ''}</td>
      <td class="num"><b style="${m.saldo < 0 ? 'color:var(--vermelho)' : ''}">${brl(m.saldo)}</b></td></tr>`;
  }).join('');
  $('#f-res', E.el).innerHTML = `
    <div class="kpis" style="margin-bottom:10px">
      <div class="kpi"><span>Custo por dia de atendimento</span><b>${brl(dia)}</b><small>${fmtNum(Math.round(qR))} almoços + ${fmtNum(Math.round(qL))} lanches</small></div>
      <div class="kpi ${S.saldoFim < 0 ? 'kpi-alerta' : ''}"><span>Saldo em ${fmtData(cfg.fim)}</span><b>${brl(S.saldoFim)}</b><small>${Math.abs(dif) > 0.5 ? `${dif > 0 ? '+' : '−'} ${brl(Math.abs(dif))} em relação ao ritmo atual` : 'igual ao ritmo atual'}</small></div>
      <div class="kpi ${S.acaba ? 'kpi-alerta' : ''}"><span>${S.acaba ? 'O recurso acaba em' : 'Cobre até o fim?'}</span><b>${S.acaba ? fmtData(S.acaba) : 'Sim'}</b><small>${dia ? `o saldo de hoje paga ${fmtNum(Math.floor(Math.max(0, saldo) / dia))} dia(s) neste ritmo` : ''}</small></div>
      <div class="kpi"><span>O saldo de hoje compra</span><b>${sim.pr ? fmtNum(Math.floor(Math.max(0, saldo) / sim.pr)) : '?'} almoços</b><small>ou ${sim.pl ? fmtNum(Math.floor(Math.max(0, saldo) / sim.pl)) : '?'} lanches</small></div>
      <div class="kpi"><span>Limite por dia para durar até o fim</span><b>${fmtNum(Math.max(0, maxR))} almoços</b><small>mantendo ${fmtNum(Math.round(qL))} lanches · ou ${fmtNum(Math.max(0, maxL))} lanches mantendo ${fmtNum(Math.round(qR))} almoços</small></div>
    </div>
    <div class="tabela-wrap"><table class="tabela"><thead><tr><th>Mês</th><th>Dias feitos</th><th>Dias a fazer</th><th>Almoços</th><th>Lanches</th><th>Realizado</th><th>Projetado</th><th>Outras</th><th>Saldo no fim</th></tr></thead>
      <tbody>${linhas}</tbody></table></div>
    <p class="pequeno mudo">"Dias a fazer" conta de segunda a sexta até ${fmtData(cfg.fim)}. Ajuste o número do mês quando houver feriado, recesso ou férias; esse ajuste fica gravado.</p>`;
  $$('[data-dm]', E.el).forEach((i) => (i.onchange = async () => {
    const ur = uteisRestantes(i.dataset.dm), v = Math.max(0, Math.min(ur, Math.round(num(i.value))));
    if (v === ur) delete E.cfg.dias_mes[i.dataset.dm]; else E.cfg.dias_mes[i.dataset.dm] = v;
    try { await api('financeiro_salvar', { p_dados: E.cfg }); } catch (e) { aviso(e.message, 'erro'); }
    desenhar();
  }));
}

// ---------------------------------------------------------------- recurso e valores
function resumoCfg() {
  const c = E.cfg, lin = (l, f) => l.map(f).join('') || '<tr><td colspan="3" class="vazio">Nada lançado.</td></tr>';
  return `<p class="pequeno mudo" style="margin:6px 0 10px">${c.fonte ? `<b>${esc(c.fonte)}</b> · ` : ''}Período: ${fmtData(c.inicio)} a ${fmtData(c.fim)}</p>
    <div class="grade" style="grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px">
      <div><h3>Recurso (créditos)</h3><table class="tabela"><tbody>${lin(c.creditos, (x) => `<tr><td class="num">${fmtData(x.data)}</td><td>${esc(x.descricao || '')}</td><td class="num"><b>${brl(x.valor)}</b></td></tr>`)}</tbody></table></div>
      <div><h3>Valor por unidade</h3><table class="tabela"><thead><tr><th>Desde</th><th>Almoço</th><th>Lanche</th></tr></thead><tbody>${lin(c.precos, (x) => `<tr><td class="num">${fmtData(x.desde)}</td><td class="num">${brl(x.refeicao)}</td><td class="num">${brl(x.lanche)}</td></tr>`)}</tbody></table></div>
      <div><h3>Outras despesas do mesmo recurso</h3><table class="tabela"><tbody>${lin(c.despesas, (x) => `<tr><td class="num">${fmtData(x.data)}</td><td>${esc(x.descricao || '')}</td><td class="num"><b>${brl(x.valor)}</b></td></tr>`)}</tbody></table></div>
    </div>`;
}
function formCfg() {
  const c = E.cfg;
  const lanc = (k, x = {}) => `<div class="linha-flex" data-lin="${k}" style="margin-bottom:6px;flex-wrap:nowrap"><input type="date" data-c="data" value="${esc(x.data || (k === 'creditos' ? c.inicio : E.hoje))}" style="width:150px">
    <input type="text" data-c="descricao" value="${esc(x.descricao || '')}" placeholder="Descrição" style="flex:1;min-width:120px"><input type="number" min="0" step="0.01" data-c="valor" value="${x.valor ?? ''}" placeholder="R$" style="width:130px"><button type="button" class="btn pequeno" data-rem title="Remover">${ico('x')}</button></div>`;
  const prc = (x = {}) => `<div class="linha-flex" data-lin="precos" style="margin-bottom:6px;flex-wrap:nowrap"><input type="date" data-c="desde" value="${esc(x.desde || c.inicio)}" style="width:150px">
    <input type="number" min="0" step="0.01" data-c="refeicao" value="${x.refeicao ?? ''}" placeholder="Almoço R$" style="width:130px"><input type="number" min="0" step="0.01" data-c="lanche" value="${x.lanche ?? ''}" placeholder="Lanche R$" style="width:130px"><button type="button" class="btn pequeno" data-rem title="Remover">${ico('x')}</button></div>`;
  E._lin = { creditos: lanc.bind(null, 'creditos'), despesas: lanc.bind(null, 'despesas'), precos: prc };
  return `<div class="barra-filtros" style="margin-top:10px"><label class="campo" style="min-width:300px"><span>Origem do recurso</span><input type="text" id="fc-fonte" value="${esc(c.fonte || '')}" maxlength="120"></label>
      <label class="campo"><span>Início do período</span><input type="date" id="fc-ini" value="${c.inicio}"></label>
      <label class="campo"><span>Fim do período (último dia de atendimento)</span><input type="date" id="fc-fim" value="${c.fim}"></label></div>
    <h3>Recurso destinado à assistência estudantil</h3><p class="pequeno mudo" style="margin:2px 0 8px">Lance o valor total ou cada parcela recebida (data, descrição, valor).</p>
    <div data-grupo="creditos">${(c.creditos.length ? c.creditos : [{}]).map((x) => lanc('creditos', x)).join('')}</div><button type="button" class="btn pequeno" data-add="creditos">${ico('mais')} Adicionar crédito</button>
    <h3 style="margin-top:16px">Valor do almoço e do lanche</h3><p class="pequeno mudo" style="margin:2px 0 8px">Se o valor mudar (novo contrato ou reajuste), adicione outra linha com a data em que passa a valer.</p>
    <div data-grupo="precos">${(c.precos.length ? c.precos : [{}]).map(prc).join('')}</div><button type="button" class="btn pequeno" data-add="precos">${ico('mais')} Adicionar valor</button>
    <h3 style="margin-top:16px">Outras despesas pagas com o mesmo recurso (opcional)</h3>
    <div data-grupo="despesas">${c.despesas.map((x) => lanc('despesas', x)).join('')}</div><button type="button" class="btn pequeno" data-add="despesas">${ico('mais')} Adicionar despesa</button>
    <div style="margin-top:16px"><button class="btn primario" id="fc-salvar">Salvar</button></div>`;
}
function ligarCfg() {
  const box = $('#f-cfg', E.el);
  box.onclick = async (e) => {
    const add = e.target.closest('[data-add]'), rem = e.target.closest('[data-rem]');
    if (add) $(`[data-grupo=${add.dataset.add}]`, box).insertAdjacentHTML('beforeend', E._lin[add.dataset.add]());
    if (rem) rem.closest('[data-lin]').remove();
    if (e.target.closest('#fc-salvar')) {
      const ler = (k, campos) => $$(`[data-lin=${k}]`, box).map((l) => Object.fromEntries(campos.map((c) => [c, $(`[data-c=${c}]`, l).value.trim()])));
      const creditos = ler('creditos', ['data', 'descricao', 'valor']).filter((x) => x.data && num(x.valor) > 0).map((x) => ({ ...x, valor: num(x.valor) }));
      const despesas = ler('despesas', ['data', 'descricao', 'valor']).filter((x) => x.data && num(x.valor) > 0).map((x) => ({ ...x, valor: num(x.valor) }));
      const precos = ler('precos', ['desde', 'refeicao', 'lanche']).filter((x) => x.desde && (x.refeicao !== '' || x.lanche !== '')).map((x) => ({ desde: x.desde, refeicao: num(x.refeicao), lanche: num(x.lanche) })).sort((a, b) => a.desde.localeCompare(b.desde));
      const inicio = $('#fc-ini', box).value, fim = $('#fc-fim', box).value;
      if (!inicio || !fim || inicio > fim) return aviso('Confira o início e o fim do período.', 'erro');
      if (!creditos.length) return aviso('Lance pelo menos um crédito com valor.', 'erro');
      if (!precos.length) return aviso('Informe o valor do almoço e do lanche.', 'erro');
      const novo = { inicio, fim, creditos, despesas, precos, dias_mes: E.cfg.dias_mes, fonte: $('#fc-fonte', box).value.trim() };
      try { await api('financeiro_salvar', { p_dados: novo }); E.cfg = novo; E.editando = false; iniciarSim(); desenhar(); aviso('Financeiro atualizado.', 'ok'); }
      catch (err) { aviso(err.message, 'erro'); }
    }
  };
}

export function exportar() {
  if (!E) return;
  const S = calcular(E.sim);
  baixarCsv(`pases_financeiro_${E.cfg.inicio}_a_${E.cfg.fim}`, ['mes', 'dias_realizados', 'dias_a_realizar', 'refeicoes', 'lanches', 'gasto_realizado', 'gasto_projetado', 'outras_despesas', 'creditos', 'saldo_fim_do_mes'],
    S.meses.map((m) => [m.m, m.dr, m.dp, Math.round(m.r + m.pr), Math.round(m.l + m.pl), (m.cr + m.cl).toFixed(2).replace('.', ','), (m.pcr + m.pcl).toFixed(2).replace('.', ','), m.outras.toFixed(2).replace('.', ','), m.creditos.toFixed(2).replace('.', ','), m.saldo.toFixed(2).replace('.', ',')]));
}
