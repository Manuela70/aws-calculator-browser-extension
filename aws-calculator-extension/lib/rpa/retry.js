// lib/rpa/retry.js — Reintentos acotados (performance-design §2; BR2.3, BR4.6, NFR8.4).
// PROVISIONAL (U1, walking skeleton). Dueño final: U5.

import { sleep } from "./wait.js";

export function canAttempt(attemptsMade, maxAttempts) {
  return Number.isInteger(attemptsMade) && attemptsMade < maxAttempts;
}

// attempt(n) devuelve { status: "success", value } | { status: "retry", reason }
// | { status: "fail", reason, detail }. "fail" corta sin más intentos (p. ej.
// validación obligatoria, BR4.5). Resultado:
// { ok: true, value, attempts } | { ok: false, reason, attempts, detail? }
// con reason "exhausted", "cancelled" o el motivo del fallo.
export async function retry(attempt, { maxAttempts, delayMs = 0, signal, sleepFn = sleep }) {
  let attempts = 0;
  let lastReason = "exhausted";
  while (canAttempt(attempts, maxAttempts)) {
    if (signal?.aborted) return { ok: false, reason: "cancelled", attempts };
    attempts += 1;
    const outcome = await attempt(attempts);
    if (outcome?.status === "success") return { ok: true, value: outcome.value, attempts };
    if (outcome?.status === "fail") {
      return { ok: false, reason: outcome.reason, detail: outcome.detail, attempts };
    }
    lastReason = outcome?.reason ?? "exhausted";
    if (canAttempt(attempts, maxAttempts) && delayMs > 0) {
      const slept = await sleepFn(delayMs, signal);
      if (!slept) return { ok: false, reason: "cancelled", attempts };
    }
  }
  return { ok: false, reason: "exhausted", lastReason, attempts };
}
