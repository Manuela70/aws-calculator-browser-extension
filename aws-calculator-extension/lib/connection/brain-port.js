// lib/connection/brain-port.js — Adaptador de página hacia el borde del service worker
// (contrato BRAIN_CALL, BRAIN_CANCEL, BRAIN_LOGIN, BRAIN_SESSION, BrainCallError).
// Lo usan el content script (mapResidue, U3/U5) y el panel (interpret, wafEvaluate,
// login y session, U6). Sin URL, sin configuración, sin fetch y sin chrome.storage:
// solo mensajes. Un AbortSignal no cruza chrome.runtime, así que abortar envía
// BRAIN_CANCEL con el mismo callId. Un canal perdido es brain_unavailable.

export const BRAIN_MESSAGE = Object.freeze({
  CALL: "BRAIN_CALL",
  CANCEL: "BRAIN_CANCEL",
  LOGIN: "BRAIN_LOGIN",
  SESSION: "BRAIN_SESSION",
});

export const BRAIN_CALL_ERROR_CODES = Object.freeze([
  "unauthorized",
  "login_cancelled",
  "rate_limited",
  "daily_quota_exceeded",
  "inventory_unavailable",
  "model_unavailable",
  "timeout",
  "brain_unavailable",
  "bad_request",
  "empty_result",
  "internal_error",
]);

export class BrainCallError extends Error {
  constructor(code, { requestId, retryAfterSeconds, message } = {}) {
    const known = BRAIN_CALL_ERROR_CODES.includes(code) ? code : "internal_error";
    super(message || known);
    this.name = "BrainCallError";
    this.code = known;
    if (typeof requestId === "string") this.requestId = requestId;
    if (Number.isInteger(retryAfterSeconds)) this.retryAfterSeconds = retryAfterSeconds;
  }
}

// Envuelve chrome.runtime.sendMessage en una promesa que rechaza con
// chrome.runtime.lastError (canal perdido, service worker reiniciado).
export function fromChromeRuntime(runtime) {
  return (message) =>
    new Promise((resolve, reject) => {
      try {
        runtime.sendMessage(message, (reply) => {
          const lastError = runtime.lastError;
          if (lastError) reject(new Error(lastError.message || "canal perdido"));
          else resolve(reply);
        });
      } catch (error) {
        reject(error);
      }
    });
}

function abortReason(signal) {
  return signal.reason ?? new DOMException("La llamada fue cancelada.", "AbortError");
}

function toOutcome(reply, callId) {
  if (!reply || typeof reply !== "object" || reply.callId !== callId) {
    return { ok: false, error: new BrainCallError("brain_unavailable") };
  }
  if (reply.ok === true) return { ok: true, value: reply.value };
  const error = reply.error ?? {};
  return { ok: false, error: new BrainCallError(error.code, error) };
}

export function createBrainPort({
  sendMessage,
  newCallId = () => crypto.randomUUID(),
  onWarn = (...args) => console.warn("[aws-calc] brain-port", ...args),
}) {
  function call(operation, body, { signal } = {}) {
    if (signal?.aborted) return Promise.reject(abortReason(signal));
    const callId = newCallId();
    return new Promise((resolve, reject) => {
      let settled = false;
      // El oyente se retira antes de resolver, así que solo corre con la llamada en curso.
      const onAbort = () => {
        settled = true;
        Promise.resolve()
          .then(() => sendMessage({ type: BRAIN_MESSAGE.CANCEL, callId }))
          .catch((error) => onWarn("No se pudo enviar BRAIN_CANCEL:", error?.message));
        reject(abortReason(signal));
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      Promise.resolve()
        .then(() => sendMessage({ type: BRAIN_MESSAGE.CALL, callId, operation, body }))
        .then(
          (reply) => toOutcome(reply, callId),
          () => ({ ok: false, error: new BrainCallError("brain_unavailable") }),
        )
        .then((outcome) => {
          signal?.removeEventListener("abort", onAbort);
          if (settled) return;
          settled = true;
          if (outcome.ok) resolve(outcome.value);
          else reject(outcome.error);
        });
    });
  }

  async function login() {
    try {
      const reply = await sendMessage({ type: BRAIN_MESSAGE.LOGIN });
      if (reply && typeof reply === "object" && typeof reply.ok === "boolean") return reply;
    } catch (error) {
      onWarn("BRAIN_LOGIN sin respuesta:", error?.message);
    }
    return { ok: false, error: { code: "brain_unavailable" } };
  }

  async function session() {
    try {
      const reply = await sendMessage({ type: BRAIN_MESSAGE.SESSION });
      if (reply && typeof reply.authenticated === "boolean") return reply;
    } catch (error) {
      onWarn("BRAIN_SESSION sin respuesta:", error?.message);
    }
    return { authenticated: false, expiresAt: null };
  }

  return {
    mapResidue: (request, options) => call("map-residue", request, options),
    interpret: (request, options) => call("interpret", request, options),
    wafEvaluate: (request, options) => call("waf-evaluate", request, options),
    login,
    session,
  };
}
