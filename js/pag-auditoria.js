// Auditoria: toda alteração feita por administradores fica registrada com o valor anterior
import { $, esc, fmtDataHora, baixarCsv, ico, normalizar, debounce } from './util.js';
import { api } from './api.js';

const ACOES = {
  criar_aluno: 'Cadastrou aluno', editar_aluno: 'Editou aluno', importar_alunos: 'Importou alunos', foto_aluno_suap: 'Definiu foto do SUAP', foto_aluno_base: 'Definiu foto de referência',
  editar_refeicao: 'Editou registro', excluir_refeicao: 'Excluiu registro', restaurar_refeicao: 'Restaurou registro', registro_manual: 'Registro manual/extra',
  criar_usuario: 'Criou usuário', editar_usuario: 'Editou usuário', trocar_senha: 'Trocou a própria senha', config: 'Alterou configuração',
  face_aprovada: 'Aprovou referência facial', face_rejeitada: 'Rejeitou referência facial', faces_apagadas: 'Apagou referências faciais', conectar_apps_script: 'Conectou o Drive'
};

export async function render(el, { cabecalho }) {
  const lista = await api('auditoria_listar', { p_limite: 2000 });
  el.innerHTML = cabecalho('Auditoria', 'Últimas 2.000 ações administrativas. Nada é apagado desta lista.', `<button class="btn" id="au-csv">${ico('baixar')} CSV</button>`) + `
    <div class="barra-filtros"><label class="campo" style="min-width:280px"><span>Filtrar</span><input type="search" id="au-q" placeholder="Usuário, ação ou conteúdo"></label></div>
    <div class="tabela-wrap"><table class="tabela"><thead><tr><th>Quando</th><th>Usuário</th><th>Ação</th><th>Detalhes</th></tr></thead><tbody id="au-corpo"></tbody></table></div>`;
  const resumo = (x) => {
    const partes = [];
    if (x.antes && x.depois && typeof x.antes === 'object') {
      for (const k of Object.keys(x.depois)) {
        if (['atualizado_em', 'data', 'hora_local'].includes(k)) continue;
        if (JSON.stringify(x.antes[k]) !== JSON.stringify(x.depois[k])) partes.push(`<b>${esc(k)}</b>: ${esc(JSON.stringify(x.antes[k] ?? ''))} → ${esc(JSON.stringify(x.depois[k] ?? ''))}`);
      }
    } else if (x.depois) partes.push(esc(JSON.stringify(x.depois)).slice(0, 400));
    else if (x.antes) partes.push(esc(JSON.stringify(x.antes)).slice(0, 400));
    return partes.join('<br>') || `<span class="mudo">${esc(x.registro_id || '')}</span>`;
  };
  const desenhar = () => {
    const q = normalizar($('#au-q').value);
    const t = lista.filter((x) => !q || normalizar(`${x.usuario} ${x.acao} ${ACOES[x.acao] || ''} ${JSON.stringify(x.antes)} ${JSON.stringify(x.depois)}`).includes(q));
    $('#au-corpo').innerHTML = t.slice(0, 500).map((x) => `<tr><td class="pequeno num">${fmtDataHora(x.em)}</td><td>${esc(x.usuario || '')}</td><td>${esc(ACOES[x.acao] || x.acao)}</td><td class="pequeno" style="max-width:560px;word-break:break-word">${resumo(x)}</td></tr>`).join('')
      || '<tr><td colspan="4" class="vazio">Nada encontrado.</td></tr>';
  };
  $('#au-q').oninput = debounce(desenhar, 200);
  $('#au-csv').onclick = () => baixarCsv('pases_auditoria', ['quando', 'usuario', 'acao', 'registro', 'antes', 'depois'],
    lista.map((x) => [fmtDataHora(x.em), x.usuario, ACOES[x.acao] || x.acao, x.registro_id, JSON.stringify(x.antes ?? ''), JSON.stringify(x.depois ?? '')]));
  desenhar();
}
