// brain/core/error-catalog.js — Códigos de error y su estado HTTP fijo (BR7.2) con
// mensajes de un catálogo cerrado: ningún mensaje copia el pedido, encabezados
// ni detalles del proveedor (BR1.3, BR6.1).

export const ERROR_CATALOG = Object.freeze({
  bad_request: { status: 400, message: "El pedido no cumple el contrato." },
  unauthorized: { status: 401, message: "Token de acceso ausente, inválido o vencido." },
  rate_limited: { status: 429, message: "Demasiadas operaciones; reintenta más tarde." },
  daily_quota_exceeded: { status: 429, message: "Se alcanzó la cuota diaria de uso." },
  empty_result: { status: 502, message: "El modelo no produjo una salida válida." },
  model_unavailable: { status: 503, message: "El modelo no está disponible." },
  inventory_unavailable: { status: 503, message: "El inventario no está disponible." },
  timeout: { status: 504, message: "La operación superó su plazo." },
  internal_error: { status: 500, message: "Error interno del cerebro." },
});

export function isKnownCode(code) {
  return Object.hasOwn(ERROR_CATALOG, code);
}

// Arma el cuerpo de un BrainError. Un código desconocido se trata como
// internal_error. retryAfterSeconds solo acompaña a rate_limited.
export function errorResponse(code, { requestId, retryAfterSeconds } = {}) {
  const known = isKnownCode(code) ? code : "internal_error";
  const entry = ERROR_CATALOG[known];
  const body = { code: known, message: entry.message };
  if (requestId) body.requestId = requestId;
  if (known === "rate_limited") {
    body.retryAfterSeconds = Math.max(1, Math.ceil(Number(retryAfterSeconds) || 1));
  }
  return { status: entry.status, body };
}
