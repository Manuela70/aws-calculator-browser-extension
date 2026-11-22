// sw/keepalive.js — Mantiene vivo el service worker mientras haya trabajos en curso (NFR8.1).
// Cada llamada a una API de la extensión reinicia el contador de inactividad de
// 30 s de MV3; mientras el contador de trabajos sea mayor que cero se invoca
// ping() (chrome.runtime.getPlatformInfo) cada 20 s.

export const KEEPALIVE_INTERVAL_MS = 20000;

export function createKeepalive({
  ping,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
  intervalMs = KEEPALIVE_INTERVAL_MS,
  onError = (error) => console.warn("[aws-calc] keepalive", "ping falló", error?.message),
}) {
  let active = 0;
  let timer = null;

  function tick() {
    try {
      Promise.resolve(ping()).catch(onError);
    } catch (error) {
      onError(error);
    }
  }

  function acquire() {
    active += 1;
    if (active === 1) timer = setIntervalFn(tick, intervalMs);
  }

  function release() {
    if (active === 0) return;
    active -= 1;
    if (active === 0) {
      clearIntervalFn(timer);
      timer = null;
    }
  }

  // Toma el keepalive durante toda la promesa de fn y lo suelta al terminar.
  async function run(fn) {
    acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }

  return { acquire, release, run, activeCount: () => active };
}
