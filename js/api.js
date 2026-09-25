// Comunicação com o banco (Supabase/PostgREST) e com o Apps Script (Google Drive)
import { CFG, idb } from './util.js';

export class ApiErro extends Error {
  constructor(codigo, rede = false) { super(traduzir(codigo)); this.codigo = codigo; this.rede = rede; }
}

const MSG = {
  REDE: 'Sem conexão com o servidor. Verifique a internet.',
  SESSAO_INVALIDA: 'Sua sessão expirou. Entre novamente.',
  TROCAR_SENHA: 'Defina uma nova senha antes de continuar (Minha conta).',
  SENHA_IGUAL: 'A nova senha deve ser diferente da atual.',
  DATA_ANTIGA: 'Registro com data muito antiga (mais de 10 dias). Peça ao administrador para lançar manualmente.',
  SEM_PERMISSAO: 'Seu perfil não tem permissão para esta ação.',
  LOGIN_INVALIDO: 'Usuário ou senha incorretos.',
  BLOQUEADO: 'Muitas tentativas incorretas. Aguarde 15 minutos.',
  CPF_INVALIDO: 'CPF inválido. Confira os números.',
  CPF_OU_MATRICULA_DUPLICADO: 'Já existe outro aluno com este CPF ou matrícula.',
  NOME_OBRIGATORIO: 'Informe o nome completo.',
  SENHA_CURTA: 'A senha precisa ter pelo menos 6 caracteres.',
  SENHA_ATUAL_INCORRETA: 'A senha atual não confere.',
  SENHA_OBRIGATORIA: 'Defina uma senha inicial.',
  LOGIN_EM_USO: 'Este login já está em uso.',
  LOGIN_INVALIDO_FORMATO: 'Login: use de 3 a 40 letras minúsculas, números, ponto, hífen ou sublinhado.',
  NAO_PODE_REBAIXAR_A_SI: 'Você não pode desativar nem trocar o perfil da sua própria conta.',
  ULTIMO_ADMIN: 'O sistema precisa de pelo menos um administrador ativo.',
  MOTIVO_OBRIGATORIO: 'Informe o motivo (mínimo de 5 caracteres).',
  JUSTIFICATIVA_OBRIGATORIA: 'Registro sem foto exige justificativa.',
  JA_EXISTE_REFEICAO_NESSE_DIA: 'Este aluno já tem refeição registrada nesse dia. Marque como refeição extra, se for o caso.',
  HORARIO_INVALIDO: 'Horário inválido: o início deve ser antes do fim.',
  NAO_ENCONTRADO: 'Registro não encontrado.',
  ALUNO_COM_HISTORICO: 'Este aluno tem refeições registradas: o cadastro pode ser cancelado, mas não excluído (o histórico precisa ser mantido).',
  TIPO_INVALIDO: 'Tipo inválido (use Refeição ou Lanche).',
  GAS_NAO_CONFIGURADO: 'O Apps Script (Google Drive) ainda não foi configurado em config.js.',
  APPS_SCRIPT_NAO_CONECTADO: 'O Drive ainda não foi conectado. Use "Conectar ao Drive" em Configurações.',
  SEGREDO_INVALIDO: 'O Apps Script perdeu a conexão com o banco. Use "Conectar ao Drive" novamente.',
  FOTO_INVALIDA: 'Foto inválida ou grande demais.'
};
export function traduzir(c) {
  const k = String(c || '').split(':')[0].trim();
  return MSG[k] || String(c || 'Erro desconhecido');
}

// ------------------------------------------------------------------ sessão
const CHAVE = 'pases_sessao';
export const sessao = {
  dados: (() => { try { return JSON.parse(localStorage.getItem(CHAVE) || 'null'); } catch { return null; } })(),
  get token() { return this.dados?.token || null; },
  get usuario() { return this.dados?.usuario || null; },
  get perfil() { return this.dados?.usuario?.perfil || null; },
  salvar(token, usuario) { this.dados = { token, usuario }; localStorage.setItem(CHAVE, JSON.stringify(this.dados)); },
  atualizarUsuario(u) { if (this.dados) { this.dados.usuario = u; localStorage.setItem(CHAVE, JSON.stringify(this.dados)); } },
  limpar() { this.dados = null; localStorage.removeItem(CHAVE); }
};

// Diferença entre o relógio do servidor e o do notebook (ms). Usada para carimbar os registros.
export const relogio = { offset: 0, ajustar(servidorISO) { if (servidorISO) this.offset = new Date(servidorISO).getTime() - Date.now(); }, agora() { return new Date(Date.now() + this.offset); } };

// ------------------------------------------------------------------ banco
export async function rpc(fn, args = {}, { timeout = 20000 } = {}) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), timeout);
  const headers = { 'Content-Type': 'application/json', apikey: CFG.SUPABASE_KEY };
  if (/^eyJ/.test(CFG.SUPABASE_KEY)) headers.Authorization = 'Bearer ' + CFG.SUPABASE_KEY;
  let r;
  try {
    r = await fetch(`${CFG.SUPABASE_URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(args), signal: ctrl.signal, cache: 'no-store' });
  } catch (e) { throw new ApiErro('REDE', true); }
  finally { clearTimeout(t); }
  const txt = await r.text();
  let corpo = null; try { corpo = txt ? JSON.parse(txt) : null; } catch { /* texto */ }
  if (!r.ok) {
    const cod = corpo?.message || `HTTP_${r.status}`;
    if (cod === 'SESSAO_INVALIDA') window.dispatchEvent(new CustomEvent('pases:sessao-expirada'));
    if (cod === 'TROCAR_SENHA') window.dispatchEvent(new CustomEvent('pases:trocar-senha'));
    throw new ApiErro(cod, r.status >= 500 || r.status === 0 || r.status === 408 || r.status === 429);
  }
  return corpo;
}
export const api = (fn, args = {}, opcoes) => rpc(fn, { p_token: sessao.token, ...args }, opcoes);

// ------------------------------------------------------------------ Apps Script
export const gasConfigurado = () => !!CFG.APPS_SCRIPT_URL && !/COLE_AQUI/.test(CFG.APPS_SCRIPT_URL);
export async function gas(acao, dados = {}, { timeout = 90000 } = {}) {
  if (!gasConfigurado()) throw new ApiErro('GAS_NAO_CONFIGURADO');
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), timeout);
  let r;
  try {
    r = await fetch(CFG.APPS_SCRIPT_URL, {
      method: 'POST', redirect: 'follow', signal: ctrl.signal,
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ acao, token: sessao.token, ...dados })
    });
  } catch (e) { throw new ApiErro('REDE', true); }
  finally { clearTimeout(t); }
  let j; try { j = await r.json(); } catch { throw new ApiErro('Resposta inválida do Apps Script (HTTP ' + r.status + ')', true); }
  if (!j.ok) throw new ApiErro(j.erro || 'ERRO_APPS_SCRIPT', /ERRO_BANCO_5|TEMPO/.test(j.erro || ''));
  return j;
}

// ------------------------------------------------------------------ fotos (cache em memória + IndexedDB)
const memoria = new Map();
export async function fotos(ids) {
  ids = [...new Set(ids.filter(Boolean))];
  const out = {}; const faltam = [];
  for (const id of ids) {
    if (memoria.has(id)) { out[id] = memoria.get(id); continue; }
    const salvo = await idb.get('fotos', id).catch(() => null);
    if (salvo) { memoria.set(id, salvo); out[id] = salvo; } else faltam.push(id);
  }
  for (let i = 0; i < faltam.length; i += 20) {
    const lote = faltam.slice(i, i + 20);
    const r = await gas('fotos', { ids: lote });
    for (const [id, url] of Object.entries(r.fotos || {})) {
      out[id] = url;
      if (url) { memoria.set(id, url); idb.put('fotos', id, url).catch(() => {}); }
    }
  }
  return out;
}
export async function foto(id) { if (!id) return null; return (await fotos([id]))[id] || null; }
export function guardarFotoLocal(id, dataUrl) { if (id && dataUrl) { memoria.set(id, dataUrl); idb.put('fotos', id, dataUrl).catch(() => {}); } }
