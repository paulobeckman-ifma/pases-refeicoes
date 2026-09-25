// Dados compartilhados entre as páginas do painel (com cache simples) e utilidades de período
import { api } from './api.js';
import { hojeISO, addDias, inicioSemana, esc, MESES } from './util.js';

let _alunos = null, _cfg = null;
export async function alunos(forcar = false) { if (!_alunos || forcar) _alunos = await api('alunos_listar'); return _alunos; }
export function invalidarAlunos() { _alunos = null; }
export async function config(forcar = false) { if (!_cfg || forcar) _cfg = await api('config_obter'); return _cfg; }
export function invalidarConfig() { _cfg = null; }
export const mapa = (lista, chave = 'id') => new Map(lista.map((x) => [x[chave], x]));

export function periodos(cfg) {
  const h = hojeISO(), ano = h.slice(0, 4), mes = h.slice(0, 7);
  const iniMes = mes + '-01';
  const fimMesPassado = addDias(iniMes, -1), iniMesPassado = fimMesPassado.slice(0, 7) + '-01';
  const lista = [
    { id: 'hoje', rotulo: 'Hoje', ini: h, fim: h },
    { id: 'ontem', rotulo: 'Ontem', ini: addDias(h, -1), fim: addDias(h, -1) },
    { id: 'semana', rotulo: 'Esta semana', ini: inicioSemana(h), fim: h },
    { id: 'semana_passada', rotulo: 'Semana passada', ini: addDias(inicioSemana(h), -7), fim: addDias(inicioSemana(h), -1) },
    { id: 'mes', rotulo: `Este mês (${MESES[+mes.slice(5) - 1]})`, ini: iniMes, fim: h },
    { id: 'mes_passado', rotulo: `Mês passado (${MESES[+fimMesPassado.slice(5, 7) - 1]})`, ini: iniMesPassado, fim: fimMesPassado },
    { id: 'ultimos30', rotulo: 'Últimos 30 dias', ini: addDias(h, -29), fim: h }
  ];
  (cfg?.semestres || []).forEach((s) => lista.push({ id: 'sem_' + s.nome, rotulo: `Semestre ${s.nome}`, ini: s.inicio, fim: s.fim < h ? s.fim : h }));
  lista.push({ id: 'ano', rotulo: `Ano de ${ano}`, ini: `${ano}-01-01`, fim: h });
  lista.push({ id: 'dia', rotulo: 'Um dia específico…' });
  lista.push({ id: 'personalizado', rotulo: 'Intervalo de datas…' });
  return lista;
}

/** Seletor de período reutilizável. Chama aoMudar({ini, fim, rotulo}). */
export function seletorPeriodo(el, cfg, aoMudar, padrao = 'hoje') {
  const lista = periodos(cfg);
  const salvo = sessionStorage.getItem('pases_periodo_' + padrao);
  let atual = lista.find((p) => p.id === (salvo || padrao)) || lista[0];
  el.innerHTML = `<label class="campo"><span>Período</span><select data-p>${lista.map((p) => `<option value="${p.id}" ${p.id === atual.id ? 'selected' : ''}>${esc(p.rotulo)}</option>`).join('')}</select></label>
    <label class="campo oculto" data-pd><span>Dia</span><input type="date" data-dia></label>
    <label class="campo oculto" data-pi><span>De</span><input type="date" data-ini></label>
    <label class="campo oculto" data-pf><span>Até</span><input type="date" data-fim></label>`;
  const sel = el.querySelector('[data-p]'), dia = el.querySelector('[data-dia]'), ini = el.querySelector('[data-ini]'), fim = el.querySelector('[data-fim]');
  const emitir = () => {
    const p = lista.find((x) => x.id === sel.value);
    sessionStorage.setItem('pases_periodo_' + padrao, p.id);
    const pers = p.id === 'personalizado', umDia = p.id === 'dia';
    el.querySelector('[data-pi]').classList.toggle('oculto', !pers); el.querySelector('[data-pf]').classList.toggle('oculto', !pers);
    el.querySelector('[data-pd]').classList.toggle('oculto', !umDia);
    if (umDia) {
      if (!dia.value) dia.value = hojeISO();
      aoMudar({ ini: dia.value, fim: dia.value, rotulo: `Dia ${dia.value.split('-').reverse().join('/')}` });
    } else if (pers) {
      if (!ini.value) { ini.value = addDias(hojeISO(), -6); fim.value = hojeISO(); }
      if (ini.value > fim.value) return;
      aoMudar({ ini: ini.value, fim: fim.value, rotulo: `${ini.value.split('-').reverse().join('/')} a ${fim.value.split('-').reverse().join('/')}` });
    } else aoMudar({ ini: p.ini, fim: p.fim, rotulo: p.rotulo });
  };
  sel.onchange = emitir; dia.onchange = emitir; ini.onchange = emitir; fim.onchange = emitir;
  emitir();
}
