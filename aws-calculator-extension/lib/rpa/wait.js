// lib/rpa/wait.js — Esperas por condición con tope y cancelación (performance-design §1; BR4.10, NFR8.8).
// PROVISIONAL (U1, walking skeleton). Dueño final: U5.
// Ninguna espera es infinita ni ciega: se sondea cada 250 ms hasta cumplirse, hasta
// el tope (20 s por defecto) o hasta que el signal de cancelación se dispare.

export const POLL_INTERVAL_MS = 250;
export const DEFAULT_WAIT_TIMEOUT_MS = 20000;

// Retardos cortos nombrados entre acciones (≤ 1,5 s, NFR8.8).
export const DELAY = Object.freeze({ SHORT: 300, MEDIUM: 800, LONG: 1500 });

// Resuelve true al cumplirse el tiempo y false si se cancela; nunca rechaza.
export function sleep(ms, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve(false);
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      resolve(false);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve(true);
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

// Devuelve { ok: true, value } o { ok: false, reason: "timeout" | "cancelled" | "error", label };
// nunca lanza ni espera de más.
export async function waitFor(condition, options = {}) {
  const {
    timeoutMs = DEFAULT_WAIT_TIMEOUT_MS,
    signal,
    label = "",
    intervalMs = POLL_INTERVAL_MS,
    now = Date.now,
  } = options;
  const deadline = now() + timeoutMs;
  for (;;) {
    if (signal?.aborted) return { ok: false, reason: "cancelled", label };
    let value;
    try {
      value = await condition();
    } catch (error) {
      return { ok: false, reason: "error", label, error: String(error?.message ?? error) };
    }
    if (value) return { ok: true, value };
    const remaining = deadline - now();
    if (remaining <= 0) return { ok: false, reason: "timeout", label };
    const slept = await sleep(Math.min(intervalMs, remaining), signal);
    if (!slept) return { ok: false, reason: "cancelled", label };
  }
}
