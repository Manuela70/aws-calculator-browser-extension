// lib/rpa/service-timer.js — Corte duro de 180 s por servicio con cancelación (NFR8.6).
// PROVISIONAL (U1, walking skeleton). Dueño final: U5.
// Al vencer, abort("service_timeout") dispara el signal que reciben todas las
// esperas, retardos y acciones del servicio.

export const SERVICE_TIMEOUT_MS = 180000;
export const SERVICE_TIMEOUT_REASON = "service_timeout";

export function createServiceTimer({
  timeoutMs = SERVICE_TIMEOUT_MS,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  now = Date.now,
} = {}) {
  const controller = new AbortController();
  const startedAt = now();
  const deadline = startedAt + timeoutMs;
  let timer = setTimer(() => controller.abort(SERVICE_TIMEOUT_REASON), timeoutMs);
  return {
    signal: controller.signal,
    startedAt,
    deadline,
    isExpired: () => controller.signal.aborted,
    elapsedMs: () => now() - startedAt,
    // Se limpia al terminar el servicio por cualquier vía.
    clear() {
      if (timer !== null) {
        clearTimer(timer);
        timer = null;
      }
    },
  };
}

// Corre la promesa en carrera con el signal. Si el signal se dispara primero,
// resuelve { timedOut: true } y el resultado tardío (incluido un banner) se
// ignora por diseño. Un error de la promesa vuelve como { error }.
export function raceWithSignal(promise, signal) {
  const guarded = Promise.resolve(promise).then(
    (value) => ({ timedOut: false, value }),
    (error) => ({ timedOut: false, error }),
  );
  if (signal.aborted) return Promise.resolve({ timedOut: true });
  const aborted = new Promise((resolve) => {
    signal.addEventListener("abort", () => resolve({ timedOut: true }), { once: true });
  });
  return Promise.race([guarded, aborted]);
}
