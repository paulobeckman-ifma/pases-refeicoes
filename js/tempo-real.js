// Canal em tempo real entre notebooks (Supabase Realtime, modo "broadcast": nada é gravado no banco).
// Usado para espelhar o balcão principal nos notebooks de apoio. Cliente mínimo do protocolo Phoenix.
import { CFG } from './util.js';

export function conectarCanal(nome, { aoMsg, aoEstado } = {}) {
  // teste local (sem Supabase): usa um BroadcastChannel do navegador
  if (CFG.SUPABASE_KEY === 'teste-local') {
    const bc = new BroadcastChannel('pases-rt-' + nome);
    bc.onmessage = (e) => aoMsg?.(e.data.ev, e.data.p);
    setTimeout(() => aoEstado?.(true), 0);
    return { enviar: (ev, p) => bc.postMessage({ ev, p }), fechar: () => bc.close(), get conectado() { return true; } };
  }
  const topic = 'realtime:pases-' + nome;
  let ws = null, ref = 0, joinRef = null, hb = null, aberto = false, fechado = false, espera = 1000;
  const send = (o) => { if (ws?.readyState === 1) ws.send(JSON.stringify(o)); };
  function abrir() {
    if (fechado) return;
    ws = new WebSocket(`${CFG.SUPABASE_URL.replace(/^http/, 'ws')}/realtime/v1/websocket?apikey=${encodeURIComponent(CFG.SUPABASE_KEY)}&vsn=1.0.0`);
    ws.onopen = () => {
      joinRef = String(++ref);
      send({ topic, event: 'phx_join', payload: { config: { broadcast: { self: false, ack: false }, presence: { key: '' }, private: false } }, ref: joinRef, join_ref: joinRef });
      clearInterval(hb); hb = setInterval(() => send({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: String(++ref) }), 25000);
    };
    ws.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.event === 'phx_reply' && m.ref === joinRef) {
        aberto = m.payload?.status === 'ok'; espera = 1000; aoEstado?.(aberto);
      } else if (m.event === 'broadcast' && m.topic === topic) aoMsg?.(m.payload?.event, m.payload?.payload);
      else if (m.event === 'phx_error' || m.event === 'phx_close') { aberto = false; aoEstado?.(false); }
    };
    ws.onclose = () => {
      aberto = false; clearInterval(hb); aoEstado?.(false);
      if (!fechado) { setTimeout(abrir, espera); espera = Math.min(espera * 2, 15000); }
    };
    ws.onerror = () => { /* onclose cuida da reconexão */ };
  }
  abrir();
  return {
    enviar(ev, p) { if (aberto) send({ topic, event: 'broadcast', payload: { type: 'broadcast', event: ev, payload: p }, ref: String(++ref), join_ref: joinRef }); },
    fechar() { fechado = true; clearInterval(hb); try { ws?.close(); } catch { /* */ } },
    get conectado() { return aberto; }
  };
}

/** Identificador fixo deste computador (para saber qual notebook é o balcão principal). */
export function dispositivo() {
  const url = new URLSearchParams(location.search).get('disp');
  if (url) return url;
  let d = null; try { d = localStorage.getItem('pases_dispositivo'); } catch { /* */ }
  if (!d) { d = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()).replace(/-/g, ''); try { localStorage.setItem('pases_dispositivo', d); } catch { /* */ } }
  return d;
}
