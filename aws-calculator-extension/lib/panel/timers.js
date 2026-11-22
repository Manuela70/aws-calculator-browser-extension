// lib/panel/timers.js — Topes de espera del panel con reloj inyectable (NFR8.4, NFR8.5).
// Dueño: U6. Zona A: no toca el DOM ni chrome; el reloj se inyecta para probar
// los topes sin esperar (vi.useFakeTimers o un reloj falso).

export const TIMEOUTS = Object.freeze({
  // Interpreting: el mismo tope de 30 s de U2 y del service worker.
  INTERPRET_MS: 30000,
  // Reviewing y WafLoading: 30 s del service worker más margen.
  BRAIN_CALL_MS: 35000,
  // Running con cancelación confirmada: espera del RunResult de esa corrida.
  CANCEL_RUN_MS: 20000,
  // BRAIN_SESSION antes de Reviewing.
  SESSION_MS: 2000,
  // Lectura de la corrida activa al abrir el panel.
  RESUME_MS: 300,
  // Vigilancia del latido mientras hay una corrida.
  WATCH_INTERVAL_MS: 5000,
  // Repintado del tiempo transcurrido en asking_brain.
  TICK_MS: 1000,
});

export const systemClock = Object.freeze({
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id),
});

// Temporizadores con nombre: arrancar uno con un nombre ya activo lo reemplaza.
export function createTimers(clock = systemClock) {
  const active = new Map();

  function stop(name) {
    if (!active.has(name)) return false;
    clock.clearTimeout(active.get(name));
    active.delete(name);
    return true;
  }

  function start(name, ms, onFire) {
    stop(name);
    const id = clock.setTimeout(() => {
      active.delete(name);
      onFire();
    }, ms);
    active.set(name, id);
  }

  // Repite onTick cada ms hasta stop(name).
  function every(name, ms, onTick) {
    start(name, ms, function tick() {
      start(name, ms, tick);
      onTick();
    });
  }

  function stopAll() {
    for (const name of [...active.keys()]) stop(name);
  }

  return { start, every, stop, stopAll, has: (name) => active.has(name) };
}

// Carrera entre una promesa y un tope: vencido, resuelve con fallback. Un
// rechazo de la promesa se propaga; el temporizador se limpia siempre.
export function withTimeout(promise, ms, { clock = systemClock, fallback = null } = {}) {
  let id;
  const expired = new Promise((resolve) => {
    id = clock.setTimeout(() => resolve(fallback), ms);
  });
  return Promise.race([Promise.resolve(promise), expired]).finally(() => clock.clearTimeout(id));
}
