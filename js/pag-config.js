// Configurações: câmera deste computador (todos) e parâmetros do sistema, Drive e backup (admin)
import { $, $$, esc, ico, aviso, confirmar, fmtDataHora, idb, CFG, DIAS_SEMANA } from './util.js';
import { api, gas, gasConfigurado } from './api.js';
import { listarCameras, abrirCamera, pararCamera, preferencias } from './camera.js';
import * as D from './dados.js';

export async function render(el, { cabecalho, perfil }) {
  const admin = perfil === 'admin';
  const cfg = admin ? await D.config(true) : null;
  let stream = null;

  el.innerHTML = cabecalho('Configurações', admin ? 'Câmera deste computador e parâmetros do sistema.' : 'Câmera deste computador.') + `
    <div class="cartao"><h2>${ico('camera')} Câmera deste computador</h2>
      <p class="mudo" style="margin-top:-4px">Se o notebook tiver câmera embutida, escolha aqui a webcam USB apontada para o aluno. A escolha fica salva neste computador.</p>
      <div class="duas-col">
        <div class="grade" style="grid-template-columns:1fr;align-content:start">
          <label class="campo"><span>Webcam</span><select id="c-cam"><option value="">Carregando…</option></select></label>
          <label class="check"><input type="checkbox" id="c-esp" ${preferencias.espelhar ? 'checked' : ''}> Espelhar a imagem na tela (como um espelho)</label>
          <div class="linha-flex"><button class="btn primario" id="c-salvar-cam">Salvar câmera</button><button class="btn" id="c-atual">${ico('atualizar')} Atualizar lista</button></div>
          <div id="c-fila" class="pequeno mudo"></div>
        </div>
        <div class="foto-box" style="background:#000"><video id="c-video" autoplay muted playsinline style="width:100%;height:100%;object-fit:contain"></video><span class="rotulo">Pré-visualização</span></div>
      </div>
    </div>
    ${admin ? `
    <div class="cartao"><h2>${ico('relogio')} Horário do almoço</h2>
      <div class="linha-flex"><label class="campo"><span>Início</span><input type="time" id="c-ini" value="${esc(cfg.horario_inicio)}"></label>
        <label class="campo"><span>Fim</span><input type="time" id="c-fim" value="${esc(cfg.horario_fim)}"></label>
        <button class="btn primario" id="c-salvar-hor" style="align-self:flex-end">Salvar horário</button></div>
      <p class="mudo pequeno">Registros fora desta janela são aceitos, mas ficam marcados como "fora do horário" nos relatórios.</p></div>

    <div class="cartao"><h2>${ico('rosto')} Reconhecimento facial</h2>
      <div class="grade" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr))">
        <label class="check"><input type="checkbox" id="c-rec" ${cfg.reconhecimento?.ativo ? 'checked' : ''}> Usar reconhecimento facial no balcão</label>
        <label class="check"><input type="checkbox" id="c-conf" ${cfg.reconhecimento?.confirmar !== false ? 'checked' : ''}> Aluno confirma com ENTER (recomendado)</label>
        <label class="campo"><span>Rigor: <b id="c-lim-v">${Number(cfg.reconhecimento?.limiar ?? 0.5).toFixed(2)}</b> (menor = mais rigoroso)</span>
          <input type="range" id="c-lim" min="0.35" max="0.60" step="0.01" value="${cfg.reconhecimento?.limiar ?? 0.5}"></label>
        <label class="campo"><span>Quadros seguidos para confirmar</span><input type="number" id="c-qua" min="2" max="8" value="${cfg.reconhecimento?.quadros ?? 3}"></label>
      </div>
      <p class="mudo pequeno">Padrão recomendado: rigor 0,50 e 3 quadros. Se alunos forem confundidos entre si, diminua o rigor para 0,45. Se muitos não forem reconhecidos, aumente para 0,55.</p>
      <button class="btn primario" id="c-salvar-rec">Salvar reconhecimento</button></div>

    <div class="cartao"><h2>${ico('grafico')} Semestres (para os relatórios)</h2>
      <div id="c-sem"></div><div class="linha-flex" style="margin-top:10px"><button class="btn" id="c-sem-add">${ico('mais')} Adicionar semestre</button><button class="btn primario" id="c-sem-salvar">Salvar semestres</button></div></div>

    <div class="cartao"><h2>${ico('nuvem')} Google Drive e backup</h2>
      <div id="c-drive" class="caixa info">Verificando conexão com o Apps Script…</div>
      <div class="linha-flex" style="margin:12px 0"><button class="btn" id="c-conectar">${ico('nuvem')} Conectar ao Drive</button>
        <button class="btn primario" id="c-backup-agora">${ico('baixar')} Fazer backup agora</button></div>
      <h3 style="margin:14px 0 8px">Backup automático semanal</h3>
      <div class="linha-flex">
        <label class="check"><input type="checkbox" id="c-bk-auto" ${cfg.backup?.automatico !== false ? 'checked' : ''}> Ativado</label>
        <label class="campo"><span>Dia da semana</span><select id="c-bk-dia">${[1, 2, 3, 4, 5, 6, 7].map((d) => `<option value="${d}" ${Number(cfg.backup?.dia_semana ?? 5) === d ? 'selected' : ''}>${DIAS_SEMANA[d]}</option>`).join('')}</select></label>
        <label class="campo"><span>Hora</span><select id="c-bk-hora">${Array.from({ length: 24 }, (_, h) => `<option value="${h}" ${Number(cfg.backup?.hora ?? 22) === h ? 'selected' : ''}>${String(h).padStart(2, '0')}h</option>`).join('')}</select></label>
        <label class="campo"><span>Manter os últimos</span><select id="c-bk-manter">${[8, 13, 26, 52, 104].map((n) => `<option value="${n}" ${Number(cfg.backup?.manter ?? 26) === n ? 'selected' : ''}>${n} backups</option>`).join('')}</select></label>
        <button class="btn primario" id="c-bk-salvar" style="align-self:flex-end">Salvar agendamento</button>
      </div>
      <p class="mudo pequeno">Cada backup gera, na pasta "backups" do Drive, um arquivo JSON completo (serve para restaurar o banco) e uma planilha legível com refeições, alunos e usuários. As fotos já ficam no Drive.</p>
      <h3 style="margin:14px 0 8px">Histórico</h3><div id="c-bk-hist" class="pequeno mudo">Carregando…</div></div>

    <div class="cartao"><h2>${ico('escudo')} Sistema</h2><dl class="dl pequeno">
      <dt>Banco de dados</dt><dd>${esc(CFG.SUPABASE_URL)}</dd><dt>Apps Script</dt><dd style="word-break:break-all">${esc(CFG.APPS_SCRIPT_URL)}</dd>
      <dt>Fuso horário</dt><dd>${esc(CFG.FUSO)}</dd></dl></div>` : ''}`;

  // ---------------------------------------------------------------- câmera
  async function preencherCameras() {
    const l = await listarCameras();
    $('#c-cam').innerHTML = `<option value="">Padrão do sistema</option>` + l.map((d, i) => `<option value="${esc(d.deviceId)}" data-rot="${esc(d.label)}" ${d.deviceId === preferencias.camera ? 'selected' : ''}>${esc(d.label || `Câmera ${i + 1}`)}</option>`).join('');
    if (!l.length) $('#c-cam').innerHTML = '<option value="">Nenhuma câmera encontrada</option>';
    previa();
  }
  async function previa() {
    pararCamera(stream); const v = $('#c-video'); if (!v) return;
    v.style.transform = $('#c-esp').checked ? 'scaleX(-1)' : '';
    try { stream = await abrirCamera(v, $('#c-cam').value); } catch (e) { aviso(e.message, 'erro'); }
  }
  $('#c-cam').onchange = previa; $('#c-esp').onchange = previa; $('#c-atual').onclick = preencherCameras;
  $('#c-salvar-cam').onclick = () => {
    const o = $('#c-cam').selectedOptions[0];
    preferencias.salvar({ camera: $('#c-cam').value, rotulo: o?.dataset.rot || '', espelhar: $('#c-esp').checked });
    aviso('Câmera salva neste computador. Reabra o balcão para aplicar.', 'ok');
  };
  preencherCameras();
  (async () => {
    const fila = await idb.todos('fila').catch(() => []);
    const conf = (await idb.get('cache', 'conflitos').catch(() => null)) || [];
    const travados = fila.filter((i) => (i.falhas || 0) >= 30);
    $('#c-fila').innerHTML = `${fila.length} registro(s) deste computador aguardando envio ao servidor.` +
      (travados.length ? `<br><b style="color:var(--vermelho)">${travados.length} não conseguem ser enviados</b> (último erro: ${esc(travados[0].ultimoErro || '')}). Não limpe os dados do navegador deste computador; procure o suporte.` : '') +
      (conf.length ? `<br>${conf.length} registro(s) feitos sem internet foram recusados pelo servidor ao sincronizar (ex.: aluno já tinha refeição no dia): ${conf.slice(0, 5).map((c) => `${esc(c.aluno || '')} (${esc(c.status)})`).join(', ')}` : '');
  })();

  if (!admin) return () => pararCamera(stream);

  // ---------------------------------------------------------------- horário e reconhecimento
  const salvarCfg = async (dados, msg) => { try { await api('config_salvar', { p_dados: dados }); D.invalidarConfig(); aviso(msg, 'ok'); } catch (e) { aviso(e.message, 'erro'); } };
  $('#c-salvar-hor').onclick = () => salvarCfg({ horario_inicio: $('#c-ini').value, horario_fim: $('#c-fim').value }, 'Horário salvo. Vale para os próximos registros.');
  $('#c-lim').oninput = () => ($('#c-lim-v').textContent = Number($('#c-lim').value).toFixed(2));
  $('#c-salvar-rec').onclick = () => salvarCfg({ reconhecimento: { ativo: $('#c-rec').checked, confirmar: $('#c-conf').checked, limiar: Number($('#c-lim').value), quadros: Math.max(2, Math.min(8, Number($('#c-qua').value) || 3)) } }, 'Reconhecimento salvo. Reabra o balcão para aplicar.');

  // ---------------------------------------------------------------- semestres
  let semestres = [...(cfg.semestres || [])];
  const desenharSem = () => {
    $('#c-sem').innerHTML = semestres.map((s, i) => `<div class="linha-flex" style="margin-bottom:8px" data-i="${i}">
      <label class="campo" style="width:110px"><span>Nome</span><input type="text" data-k="nome" value="${esc(s.nome)}"></label>
      <label class="campo"><span>Início</span><input type="date" data-k="inicio" value="${esc(s.inicio)}"></label>
      <label class="campo"><span>Fim</span><input type="date" data-k="fim" value="${esc(s.fim)}"></label>
      <button class="btn perigo pequeno" data-rm style="align-self:flex-end">${ico('lixo')}</button></div>`).join('') || '<p class="mudo">Nenhum semestre cadastrado.</p>';
  };
  $('#c-sem').oninput = (e) => { const r = e.target.closest('[data-i]'); if (r && e.target.dataset.k) semestres[r.dataset.i][e.target.dataset.k] = e.target.value; };
  $('#c-sem').onclick = (e) => { const r = e.target.closest('[data-i]'); if (r && e.target.closest('[data-rm]')) { semestres.splice(r.dataset.i, 1); desenharSem(); } };
  $('#c-sem-add').onclick = () => { semestres.push({ nome: '', inicio: '', fim: '' }); desenharSem(); };
  $('#c-sem-salvar').onclick = () => {
    if (semestres.some((s) => !s.nome || !s.inicio || !s.fim || s.inicio > s.fim)) return aviso('Preencha nome, início e fim de cada semestre (início antes do fim).', 'erro');
    salvarCfg({ semestres: semestres.sort((a, b) => a.inicio.localeCompare(b.inicio)) }, 'Semestres salvos.');
  };
  desenharSem();

  // ---------------------------------------------------------------- Drive e backup
  async function statusDrive() {
    const box = $('#c-drive');
    if (!gasConfigurado()) { box.className = 'caixa aviso-caixa'; box.innerHTML = 'O endereço do Apps Script ainda não foi preenchido em <b>config.js</b>. Sem ele, as fotos ficam guardadas neste computador e o backup no Drive não funciona.'; return; }
    try {
      const s = await gas('status', {}, { timeout: 30000 });
      box.className = s.conectado ? 'caixa ok-caixa' : 'caixa aviso-caixa';
      box.innerHTML = s.conectado
        ? `Conectado. Pasta no Drive: <a href="${esc(s.pasta_url)}" target="_blank" rel="noopener">abrir</a> · consulta diária anti-pausa: ${s.manter_ativo ? 'ativa' : '<b>inativa</b>'} · backup automático: ${s.backup_agendado ? `ativo (${DIAS_SEMANA[s.backup_cfg?.dia_semana] || ''}, ${s.backup_cfg?.hora}h)` : '<b>desligado</b>'}`
        : 'O Apps Script responde, mas ainda não foi conectado ao banco. Clique em <b>Conectar ao Drive</b>.';
    } catch (e) { box.className = 'caixa erro-caixa'; box.textContent = 'Apps Script indisponível: ' + e.message; }
  }
  async function historico() {
    const l = await api('backups_listar').catch(() => []);
    $('#c-bk-hist').innerHTML = l.length ? `<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Quando</th><th>Tipo</th><th>Situação</th><th>Detalhe</th><th>Arquivo</th></tr></thead><tbody>
      ${l.slice(0, 15).map((b) => `<tr><td class="num">${fmtDataHora(b.em)}</td><td>${b.tipo}${b.usuario ? ` · ${esc(b.usuario)}` : ''}</td><td>${b.status === 'ok' ? '<span class="selo verde">ok</span>' : '<span class="selo vermelho">erro</span>'}</td>
      <td>${esc(b.detalhe || '')}</td><td>${b.arquivo_url ? `<a href="${esc(b.arquivo_url)}" target="_blank" rel="noopener">abrir</a>` : ''}</td></tr>`).join('')}</tbody></table></div>` : 'Nenhum backup ainda.';
  }
  const bkCfg = () => ({ automatico: $('#c-bk-auto').checked, dia_semana: Number($('#c-bk-dia').value), hora: Number($('#c-bk-hora').value), manter: Number($('#c-bk-manter').value) });
  $('#c-conectar').onclick = async (e) => {
    e.target.disabled = true;
    try { await gas('conectar', { backup: bkCfg() }, { timeout: 60000 }); aviso('Drive conectado e agendamentos criados.', 'ok'); statusDrive(); }
    catch (err) { aviso(err.message, 'erro'); } finally { e.target.disabled = false; }
  };
  $('#c-bk-salvar').onclick = async () => {
    const b = bkCfg();
    await salvarCfg({ backup: b }, 'Agendamento salvo.');
    try { await gas('agendar_backup', b, { timeout: 60000 }); statusDrive(); } catch (e) { aviso('Salvo no banco, mas o Apps Script não confirmou: ' + e.message, 'erro'); }
  };
  $('#c-backup-agora').onclick = async (e) => {
    if (!(await confirmar('Gerar agora um backup completo no Drive? Pode levar até 1 minuto.'))) return;
    e.target.disabled = true; aviso('Gerando backup…');
    try { const r = await gas('backup', {}, { timeout: 330000 }); aviso(`Backup concluído: ${r.detalhe || ''}`, 'ok'); }
    catch (err) { aviso(err.message, 'erro'); } finally { e.target.disabled = false; historico(); }
  };
  statusDrive(); historico();
  return () => pararCamera(stream);
}
