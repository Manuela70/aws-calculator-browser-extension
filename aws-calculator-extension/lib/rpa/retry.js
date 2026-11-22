// lib/rpa/retry.js — Reintentos acotados con contador puro (BR4.1; NFR8.5; AC6.2.2).
// Dueño: U5. Módulo de Zona A: sin DOM, sin red.
// RetryCounter decide si queda un intento; retry() es el envoltorio async que
// lo usa para repetir una operación con resultado tipado.

import { sleep } from "./wait.js";

// Topes por operación (BR4.1). page_wait: una espera de 20 s, sin repetir.
export const RETRY_LIMITS = Object.freeze({
  save: 3,
  search_service: 2,
  dropdown_open: 2,
  page_wait: 1,
});

export function canAttempt(attemptsMade, maxAttempts) {
  return Number.isInteger(attemptsMade) && attemptsMade < maxAttempts;
}

// Contador de una operación acotada (entities.md, RetryCounter). next() registra
// un intento si queda alguno y devuelve si se puede hacer; fail(code) guarda el
// código del último fallo para devolverlo cuando se agota.
export class RetryCounter {
  constructor(operation, maxAttempts = RETRY_LIMITS[operation]) {
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
      throw new RangeError(`Operación de reintento desconocida: ${operation}`);
    }
    this.operation = operation;
    this.maxAttempts = maxAttempts;
    this.attempt = 0;
    this.lastCode = null;
  }

  get exhausted() {
    return this.attempt >= this.maxAttempts;
  }

  next() {
    if (this.exhausted) return false;
    this.attempt += 1;
    return true;
  }

  fail(code) {
    this.lastCode = code ?? null;
    return this;
  }

  snapshot() {
    return {
      operation: this.operation,
      attempt: this.attempt,
      maxAttempts: this.maxAttempts,
      exhausted: this.exhausted,
      lastCode: this.lastCode,
    };
  }
}

// attempt(n) devuelve { status: "success", value } | { status: "retry", reason }
// | { status: "fail", reason, detail }. "fail" corta sin más intentos (p. ej.
// validación obligatoria). El tope sale de operation (RETRY_LIMITS) o de
// maxAttempts. Resultado:
// { ok: true, value, attempts } | { ok: false, reason, attempts, detail?, lastReason? }
// con reason "exhausted", "cancelled" o el motivo del fallo.
export async function retry(
  attempt,
  { operation, maxAttempts, delayMs = 0, signal, sleepFn = sleep },
) {
  const counter = new RetryCounter(operation, maxAttempts ?? RETRY_LIMITS[operation]);
  while (!counter.exhausted) {
    if (signal?.aborted) return { ok: false, reason: "cancelled", attempts: counter.attempt };
    counter.next();
    const outcome = await attempt(counter.attempt);
    if (outcome?.status === "success") {
      return { ok: true, value: outcome.value, attempts: counter.attempt };
    }
    if (outcome?.status === "fail") {
      return {
        ok: false,
        reason: outcome.reason,
        detail: outcome.detail,
        attempts: counter.attempt,
      };
    }
    counter.fail(outcome?.reason ?? "exhausted");
    if (!counter.exhausted && delayMs > 0) {
      const slept = await sleepFn(delayMs, signal);
      if (!slept) return { ok: false, reason: "cancelled", attempts: counter.attempt };
    }
  }
  return {
    ok: false,
    reason: "exhausted",
    lastReason: counter.lastCode,
    attempts: counter.attempt,
  };
}
