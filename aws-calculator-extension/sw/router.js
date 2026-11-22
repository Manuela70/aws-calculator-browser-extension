// sw/router.js — Decisión pura de acceso al borde del service worker (NFR5.3, NFR5.5).
// - Un remitente que no es esta extensión se descarta antes de todo.
// - Los mensajes que no son del borde (PROGRESS, RUN_RESULT, …) se ignoran para
//   que los atienda su destinatario real (el panel).
// - Content script de https://calculator.aws → solo map-residue.
// - Página de la extensión (sin pestaña) → interpret, waf-evaluate, BRAIN_LOGIN, BRAIN_SESSION.
// - Operación desconocida o body de más de 256 KB → bad_request, sin llamar al cerebro.

import { BRAIN_MESSAGE_TYPES } from "./messages.js";
import { isValidCallId } from "./call-registry.js";

export const OPERATIONS = Object.freeze(["map-residue", "interpret", "waf-evaluate"]);
export const MAX_BODY_BYTES = 256 * 1024;
export const CALCULATOR_ORIGIN = "https://calculator.aws";

export const SENDER_CONTEXTS = Object.freeze({
  FOREIGN: "foreign",
  CONTENT_SCRIPT: "content_script",
  EXTENSION_PAGE: "extension_page",
  OTHER: "other",
});

const ALLOWED_OPERATIONS = Object.freeze({
  [SENDER_CONTEXTS.CONTENT_SCRIPT]: ["map-residue"],
  [SENDER_CONTEXTS.EXTENSION_PAGE]: ["interpret", "waf-evaluate"],
});

const BRAIN_TYPES = Object.values(BRAIN_MESSAGE_TYPES);

export function isBrainMessage(message) {
  return message !== null && typeof message === "object" && BRAIN_TYPES.includes(message.type);
}

function originOf(url) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function senderContext(sender, extensionId) {
  if (!sender || typeof extensionId !== "string" || sender.id !== extensionId) {
    return SENDER_CONTEXTS.FOREIGN;
  }
  if (sender.tab) {
    return originOf(sender.url) === CALCULATOR_ORIGIN
      ? SENDER_CONTEXTS.CONTENT_SCRIPT
      : SENDER_CONTEXTS.OTHER;
  }
  if (
    typeof sender.url === "string" &&
    sender.url.startsWith(`chrome-extension://${extensionId}/`)
  ) {
    return SENDER_CONTEXTS.EXTENSION_PAGE;
  }
  return SENDER_CONTEXTS.OTHER;
}

// Tamaño del body en bytes UTF-8 de su JSON; null si no se puede serializar.
export function bodySizeBytes(body) {
  try {
    const json = JSON.stringify(body);
    return typeof json === "string" ? new TextEncoder().encode(json).length : null;
  } catch {
    return null;
  }
}

function reject(reason) {
  return { ok: false, code: "bad_request", reason };
}

function authorizeCall(context, message) {
  if (!isValidCallId(message.callId)) return reject("invalid_call_id");
  if (!OPERATIONS.includes(message.operation)) return reject("unknown_operation");
  const allowed = ALLOWED_OPERATIONS[context] ?? [];
  if (!allowed.includes(message.operation)) return reject("operation_not_allowed");
  if (message.body === null || typeof message.body !== "object" || Array.isArray(message.body)) {
    return reject("invalid_body");
  }
  const size = bodySizeBytes(message.body);
  if (size === null) return reject("invalid_body");
  if (size > MAX_BODY_BYTES) return reject("body_too_large");
  return { ok: true };
}

// Devuelve { ignore: true } (sin respuesta), { ok: true } o { ok: false, code, reason }.
export function authorize(sender, message, { extensionId }) {
  const context = senderContext(sender, extensionId);
  if (context === SENDER_CONTEXTS.FOREIGN || !isBrainMessage(message)) return { ignore: true };
  switch (message.type) {
    case BRAIN_MESSAGE_TYPES.CALL:
      return authorizeCall(context, message);
    case BRAIN_MESSAGE_TYPES.CANCEL:
      if (context === SENDER_CONTEXTS.OTHER) return reject("sender_not_allowed");
      return isValidCallId(message.callId) ? { ok: true } : reject("invalid_call_id");
    default:
      // BRAIN_LOGIN y BRAIN_SESSION: solo páginas de la extensión (NFR5.6 a).
      return context === SENDER_CONTEXTS.EXTENSION_PAGE
        ? { ok: true }
        : reject("sender_not_allowed");
  }
}
