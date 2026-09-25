// Painel inicial: o dia de hoje em números
import { esc, ico, hojeISO, addDias, fmtDataCurta, DIAS_CURTO, diaSemanaNum, fmtPct, fmtNum, fmtDataHora, diasEntre } from './util.js';
import { api } from './api.js';
import * as D from './dados.js';
import { barras } from './graficos.js';

export async function render(el, { cabecalho, perfil }) {
  const h = hojeISO();
  const [lista, alunos, cfg, backups, pend] = await Promise.all([
    api('refeicoes_listar', { p_ini: addDias(h, -13), p_fim: h }),
    D.alunos(true), D.config(true),
    perfil === 'admin' ? api('backups_listar').catch(() => []) : Promise.resolve(null),
    perfil === 'admin' ? api('faces_listar', { p_pendentes: true }).catch(() => []) : Promise.resolve([])
  ]);
  const A = D.mapa(alunos);
  const hoje = lista.filter((r) => r.dt === h);
  const ativos = alunos.filter((a) => a.ativo).length;
  const fora = hoje.filter((r) => !r.dh).length, semFoto = hoje.filter((r) => r.fs === 'sem_foto').length;
  const facial = hoje.filter((r) => r.m === 'facial').length;

  // por dia (14 dias)
  const dias = []; for (let i = 13; i >= 0; i--) dias.push(addDias(h, -i));
  const porDia = dias.map((d) => { const n = lista.filter((r) => r.dt === d).length; return { r: fmtDataCurta(d), v: n, dica: `${DIAS_CURTO[diaSemanaNum(d)]} ${fmtDataCurta(d)}: ${n} atendimentos` }; });
  // por faixa de 15 min hoje
  const minutos = hoje.map((r) => { const [hh, mm] = r.h.split(':').map(Number); return hh * 60 + mm; });
  const iniF = Math.min(10 * 60 + 30, ...minutos.map((m) => Math.floor(m / 15) * 15)), fimF = Math.max(14 * 60 + 15, ...minutos);
  const faixas = []; for (let m = iniF; m <= fimF; m += 15) faixas.push(m);
  const ini = cfg.horario_inicio, fim = cfg.horario_fim;
  const hm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const porFaixa = faixas.map((m) => {
    const n = hoje.filter((r) => { const [hh, mm] = r.h.split(':').map(Number); const t = hh * 60 + mm; return t >= m && t < m + 15; }).length;
    const foraFaixa = hm(m + 14) < ini || hm(m) > fim;
    return { r: hm(m), v: n, classe: foraFaixa ? 'fora' : '', dica: `${hm(m)}–${hm(m + 15)}: ${n}` };
  });

  // alertas
  const alertas = [];
  if (perfil === 'admin') {
    const semCpf = alunos.filter((a) => a.ativo && !a.cpf).length;
    if (semCpf) alertas.push(`<a href="#/alunos">${semCpf} aluno(s) ativo(s) sem CPF</a>: não conseguem se identificar pelo teclado.`);
    if (pend.length) alertas.push(`<a href="#/faces">${pend.length} foto(s) de referência</a> capturadas no balcão aguardam validação.`);
    const ult = (backups || []).find((b) => b.status === 'ok');
    if (!ult) alertas.push(`Nenhum backup feito ainda. <a href="#/configuracoes">Configure o backup no Drive</a>.`);
    else if (diasEntre(ult.em.slice(0, 10), h) > 8) alertas.push(`Último backup em ${fmtDataHora(ult.em)}. <a href="#/configuracoes">Verifique o agendamento</a>.`);
    const erro = (backups || [])[0];
    if (erro && erro.status === 'erro') alertas.push(`O último backup falhou: ${esc(erro.detalhe || '')}`);
  }

  el.innerHTML = cabecalho('Painel', `Hoje, ${h.split('-').reverse().join('/')} · horário do almoço ${esc(ini)} às ${esc(fim)}`,
      perfil !== 'consulta' ? `<a class="btn primario" href="#/balcao">${ico('balcao')} Abrir balcão</a>` : '') + `
    ${alertas.map((a) => `<div class="caixa aviso-caixa" style="margin-bottom:10px">${ico('alerta', 'nao-imprimir')} ${a}</div>`).join('')}
    <div class="kpis">
      <div class="kpi"><span>Atendimentos hoje</span><b>${fmtNum(hoje.length)}</b><small>${hoje.filter((r) => r.tp !== 'lanche').length} refeição · ${hoje.filter((r) => r.tp === 'lanche').length} lanche · ${fmtPct(hoje.length, ativos)} dos ${ativos} ativos</small></div>
      <div class="kpi ${fora ? 'kpi-aviso' : ''}"><span>Fora do horário</span><b>${fora}</b><small>${fmtPct(fora, hoje.length)} dos registros</small></div>
      <div class="kpi ${semFoto ? 'kpi-alerta' : ''}"><span>Sem foto</span><b>${semFoto}</b><small>todos com justificativa</small></div>
      <div class="kpi"><span>Reconhecimento facial</span><b>${fmtPct(facial, hoje.length)}</b><small>${facial} de ${hoje.length} registros</small></div>
    </div>
    <div class="duas-col">
      <div class="cartao"><h2>Refeições por dia · últimos 14 dias</h2>${barras(porDia, { titulo: 'Refeições por dia' })}</div>
      <div class="cartao"><h2>Hoje, por horário (15 min)</h2>${barras(porFaixa, { titulo: 'Refeições por faixa de horário' })}
        <div class="legenda"><span><i style="background:var(--verde)"></i>dentro do horário</span><span><i style="background:#e0a33a"></i>fora do horário</span></div></div>
    </div>
    <div class="cartao"><div class="linha-flex" style="margin-bottom:10px"><h2>Últimos registros de hoje</h2><span class="espaco"></span><a href="#/registros" class="btn pequeno">Ver todos</a></div>
      ${hoje.length ? `<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Hora</th><th>Aluno</th><th>Curso</th><th>Método</th><th>Situação</th></tr></thead><tbody>
      ${hoje.slice(-12).reverse().map((r) => { const a = A.get(r.a) || {}; return `<tr class="${r.fs === 'sem_foto' ? 'sem-foto' : ''}">
        <td class="num">${r.h.slice(0, 5)}</td><td>${esc(a.nome)}<br><small class="mudo">${esc(a.matricula || '')}</small></td><td>${esc(a.curso || '')}</td>
        <td>${r.m === 'facial' ? 'Facial' : r.m === 'cpf' ? 'CPF' : 'Manual'}</td>
        <td>${r.fs === 'sem_foto' ? `<span class="selo vermelho">SEM FOTO</span> <small>${esc(r.j || '')}</small>` : r.fs === 'pendente' ? '<span class="selo">foto enviando</span>' : '<span class="selo verde">com foto</span>'}
          ${r.dh ? '' : '<span class="selo ambar">fora do horário</span>'}</td></tr>`; }).join('')}</tbody></table></div>` : '<div class="vazio">Nenhuma refeição registrada hoje.</div>'}
    </div>`;
}
