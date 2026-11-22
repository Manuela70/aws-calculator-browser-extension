// sw/messages.js — Tipos de mensaje del borde del service worker y textos en
// español de cada código de error (NFR3.1; contrato BRAIN_CALL, BrainCallError).

export const BRAIN_MESSAGE_TYPES = Object.freeze({
  CALL: "BRAIN_CALL",
  CANCEL: "BRAIN_CANCEL",
  LOGIN: "BRAIN_LOGIN",
  SESSION: "BRAIN_SESSION",
});

// Códigos que puede enviar el cerebro en el cuerpo de un error (brain/core/error-catalog.js).
// model_unavailable no figura en la lista de BrainCallError del contrato, pero
// existe en C1/C2 y en U3: se acepta (decisión 2 del plan).
export const SERVER_ERROR_CODES = Object.freeze([
  "bad_request",
  "unauthorized",
  "rate_limited",
  "daily_quota_exceeded",
  "empty_result",
  "model_unavailable",
  "inventory_unavailable",
  "timeout",
  "internal_error",
]);

// Códigos locales del borde: los produce el service worker, nunca el cerebro.
export const LOCAL_ERROR_CODES = Object.freeze(["login_cancelled", "brain_unavailable"]);

export const ERROR_MESSAGES = Object.freeze({
  bad_request: "El pedido al cerebro no es válido.",
  unauthorized: "Tu sesión no está activa o venció. Inicia sesión de nuevo.",
  login_cancelled: "Se canceló el inicio de sesión.",
  rate_limited: "Demasiadas consultas al cerebro. Espera unos segundos y vuelve a intentar.",
  daily_quota_exceeded: "Se alcanzó tu cuota diaria de uso del cerebro.",
  inventory_unavailable: "El inventario de servicios del cerebro no está disponible.",
  model_unavailable: "El modelo del cerebro no está disponible en este momento.",
  timeout: "El cerebro no respondió dentro de 30 segundos.",
  brain_unavailable: "No se pudo conectar con el cerebro.",
  empty_result: "El cerebro no produjo una respuesta válida.",
  internal_error: "Error interno al consultar el cerebro.",
});

export function isServerErrorCode(code) {
  return SERVER_ERROR_CODES.includes(code);
}

export function messageFor(code) {
  return Object.hasOwn(ERROR_MESSAGES, code) ? ERROR_MESSAGES[code] : ERROR_MESSAGES.internal_error;
}

// Arma el objeto error del borde; retryAfterSeconds solo si es un entero positivo.
export function makeEdgeError(code, { requestId, retryAfterSeconds } = {}) {
  const known = Object.hasOwn(ERROR_MESSAGES, code) ? code : "internal_error";
  const error = { code: known, message: messageFor(known) };
  if (typeof requestId === "string" && requestId.length > 0) error.requestId = requestId;
  if (Number.isInteger(retryAfterSeconds) && retryAfterSeconds > 0) {
    error.retryAfterSeconds = retryAfterSeconds;
  }
  return error;
}
