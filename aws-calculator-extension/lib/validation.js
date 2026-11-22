// lib/validation.js — Validación en los bordes (security-design §3; NFR5.6, NFR5.7).
// PROVISIONAL (U1, walking skeleton). Dueño final: U1 (compartido).
// Todo lo que llega por mensajes o se lee de calculator.aws se trata como dato
// no confiable: se valida la forma antes de actuar.

import { KNOWN_MESSAGE_TYPES, MESSAGE_TYPES } from "./messages.js";

const CALCULATOR_HOST = "calculator.aws";

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isRequestedValue(item) {
  return (
    item !== null &&
    typeof item === "object" &&
    isNonEmptyString(item.key) &&
    typeof item.value === "string"
  );
}

function isToggleRequest(item) {
  return (
    item !== null &&
    typeof item === "object" &&
    isNonEmptyString(item.label) &&
    typeof item.wantOn === "boolean"
  );
}

export function isServiceRequest(svc) {
  return (
    svc !== null &&
    typeof svc === "object" &&
    isNonEmptyString(svc.requestId) &&
    isNonEmptyString(svc.serviceName) &&
    isNonEmptyString(svc.searchTerm) &&
    isNonEmptyString(svc.region) &&
    Array.isArray(svc.fields) &&
    svc.fields.every(isRequestedValue) &&
    Array.isArray(svc.toggles) &&
    svc.toggles.every(isToggleRequest)
  );
}

// RunRequest: runId texto no vacío, services lista no vacía de ServiceRequest.
export function isRunRequest(request) {
  if (request === null || typeof request !== "object") return false;
  if (!isNonEmptyString(request.runId)) return false;
  if (request.project !== undefined && typeof request.project !== "string") return false;
  return (
    Array.isArray(request.services) &&
    request.services.length > 0 &&
    request.services.every(isServiceRequest)
  );
}

// Mensajes entrantes al content script: solo de la propia extensión, con tipo
// conocido y payload válido. Devuelve un resultado tipado; nunca lanza.
export function validateIncomingMessage(message, sender, extensionId) {
  if (!sender || sender.id !== extensionId) return { ok: false, reason: "foreign_sender" };
  if (message === null || typeof message !== "object") return { ok: false, reason: "not_object" };
  if (!KNOWN_MESSAGE_TYPES.includes(message.type)) return { ok: false, reason: "unknown_type" };
  if (message.type === MESSAGE_TYPES.RUN_RPA) {
    if (!isRunRequest(message.runRequest)) return { ok: false, reason: "invalid_run_request" };
    if (!Number.isInteger(message.tabId)) return { ok: false, reason: "invalid_tab_id" };
  }
  return { ok: true, type: message.type };
}

// Mensajes entrantes al panel: PROGRESS/RUN_RESULT solo de la corrida en curso.
export function isMessageForRun(message, currentRunId) {
  if (message === null || typeof message !== "object") return false;
  if (message.type !== MESSAGE_TYPES.PROGRESS && message.type !== MESSAGE_TYPES.RUN_RESULT)
    return false;
  return isNonEmptyString(currentRunId) && message.runId === currentRunId;
}

// Enlace de Share: URL válida, https y host exacto calculator.aws (BR5.3, BR6.5).
export function isCalculatorUrl(value) {
  if (typeof value !== "string") return false;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  return parsed.protocol === "https:" && parsed.hostname === CALCULATOR_HOST;
}

// RunResult guardado o recibido: forma mínima para presentarlo sin romper el
// invariante "URL solo si DONE" (BR5.4).
export function isRunResult(result) {
  if (result === null || typeof result !== "object") return false;
  if (!isNonEmptyString(result.runId)) return false;
  if (result.status !== "DONE" && result.status !== "ERROR") return false;
  if (!Array.isArray(result.perServiceResults)) return false;
  if (result.status === "DONE") return isCalculatorUrl(result.estimateUrl);
  return result.estimateUrl === undefined;
}
