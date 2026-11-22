// lib/rpa/service-timer.js — Corte duro por servicio encadenado a la corrida (BR2.7; NFR8.4).
// Dueño: U5. Módulo de Zona A: sin DOM, sin red.
// Cada servicio recibe un AbortController que se aborta con "service_timeout"
// a los 180 s, o con el motivo de la corrida si el SE la cancela. El reloj se
// inyecta ({ setTimeout, clearTimeout }) para que Vitest controle el tiempo.
// No usa AbortSignal.timeout ni AbortSignal.any (decisión de NFR8.4).

export const SERVICE_TIMEOUT_MS = 180000;
export const SERVICE_TIMEOUT_REASON = "service_timeout";
// Salida sin guardar: señal propia de 20 s, fuera de los 180 s (BR2.5).
export const EXIT_TIMEOUT_MS = 20000;
export const EXIT_TIMEOUT_REASON = "exit_timeout";
export const RUN_CANCELLED_REASON = "cancelled";

// Envoltorios para no invocar los temporizadores globales con otro "this".
const SYSTEM_CLOCK = Object.freeze({
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id),
});

export function createServiceTimer({
  timeoutMs = SERVICE_TIMEOUT_MS,
  reason = SERVICE_TIMEOUT_REASON,
  clock = SYSTEM_CLOCK,
  runSignal,
  now = Date.now,
} = {}) {
  const controller = new AbortController();
  const startedAt = now();
  // Un abort() sin motivo trae un DOMException: se normaliza a "cancelled".
  const onRunAbort = () =>
    controller.abort(
      typeof runSignal.reason === "string" ? runSignal.reason : RUN_CANCELLED_REASON,
    );
  let timer = null;
  if (runSignal?.aborted) {
    onRunAbort();
  } else {
    timer = clock.setTimeout(() => controller.abort(reason), timeoutMs);
    runSignal?.addEventListener("abort", onRunAbort, { once: true });
  }
  return {
    signal: controller.signal,
    startedAt,
    deadline: startedAt + timeoutMs,
    isExpired: () => controller.signal.aborted && controller.signal.reason === reason,
    abortReason: () => (controller.signal.aborted ? controller.signal.reason : undefined),
    elapsedMs: () => now() - startedAt,
    // Se limpia al terminar el servicio por cualquier vía; idempotente y sin
    // efecto tardío (el temporizador y el oyente de la corrida se quitan).
    clear() {
      if (timer !== null) {
        clock.clearTimeout(timer);
        timer = null;
      }
      runSignal?.removeEventListener("abort", onRunAbort);
    },
  };
}

// Corre la promesa en carrera con el signal. Si el signal se dispara primero,
// resuelve { timedOut: true, reason } y el resultado tardío (incluido un
// banner) se ignora por diseño. Un error de la promesa vuelve como { error }.
export function raceWithSignal(promise, signal) {
  const guarded = Promise.resolve(promise).then(
    (value) => ({ timedOut: false, value }),
    (error) => ({ timedOut: false, error }),
  );
  if (signal.aborted) return Promise.resolve({ timedOut: true, reason: signal.reason });
  const aborted = new Promise((resolve) => {
    signal.addEventListener("abort", () => resolve({ timedOut: true, reason: signal.reason }), {
      once: true,
    });
  });
  return Promise.race([guarded, aborted]);
}
