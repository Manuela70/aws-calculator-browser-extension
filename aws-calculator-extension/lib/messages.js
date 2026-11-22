// lib/messages.js — Contrato de mensajes y claves de almacenamiento.
// PROVISIONAL (U1, walking skeleton). Dueño final: U1 (compartido); U5/U6 lo
// amplían en sitio. Reemplaza el contrato del v6 (PROGRESS_TEXT sin handler,
// DOM_FIELDS muerto, DONE, ERROR).

export const MESSAGE_TYPES = Object.freeze({
  PING: "PING",
  RUN_RPA: "RUN_RPA",
  PROGRESS: "PROGRESS",
  RUN_RESULT: "RUN_RESULT",
  // U5 (decisión 7 del plan): el panel cancela la corrida en curso.
  CANCEL_RPA: "CANCEL_RPA",
});

export const KNOWN_MESSAGE_TYPES = Object.freeze(Object.values(MESSAGE_TYPES));

// Motivos de rechazo de RUN_RPA (BR6.1).
export const REJECT_REASONS = Object.freeze({
  BUSY: "busy",
  NOT_READY: "not_ready",
});

// Claves de chrome.storage.local (security-design §5, scalability-design §3).
export const STORAGE_KEYS = Object.freeze({
  ACTIVE_RUN: "activeRun",
  LAST_RUN_RESULT: "lastRunResult",
  RUN_LOG_INDEX: "runLogIndex",
  RUN_LOG_PREFIX: "runLog:",
});

export const SCHEMA_VERSION = 1;

export function makePing() {
  return { type: MESSAGE_TYPES.PING };
}

// Respuestas de PING (BR2.5): listo, cargando o módulo fallido.
export function makePingResponse(state) {
  if (state === "ready") return { ok: true, ready: true };
  if (state === "failed") return { ok: false, ready: false };
  return { ok: true, ready: false };
}

// RUN_RPA lleva el RunRequest y el tabId que el panel obtuvo en el handshake,
// porque el content script lo necesita para el registro activeRun.
export function makeRunRpa(runRequest, tabId) {
  return { type: MESSAGE_TYPES.RUN_RPA, runRequest, tabId };
}

export function makeRunRpaResponse(accepted, reason) {
  return accepted ? { accepted: true } : { accepted: false, reason };
}

// CANCEL_RPA { runId }: solo para la corrida en curso (decisión 7 del plan).
export function makeCancelRpa(runId) {
  return { type: MESSAGE_TYPES.CANCEL_RPA, runId };
}

export function isCancelRpaMessage(message) {
  return (
    message !== null &&
    typeof message === "object" &&
    message.type === MESSAGE_TYPES.CANCEL_RPA &&
    typeof message.runId === "string" &&
    message.runId.trim().length > 0
  );
}

export function makeCancelRpaResponse(cancelled) {
  return { cancelled: cancelled === true };
}

// Campos estructurados del ProgressEvent de U5 (entities.md, decisión 2 del plan).
const PROGRESS_FIELDS = Object.freeze([
  "step",
  "serviceIndex",
  "serviceCount",
  "label",
  "serviceStatus",
  "requestId",
]);

// ProgressEvent (entities.md): solo los campos estructurados, sin pct ni text
// (decisión 7 de U6; el panel arma el texto del paso). logDegraded avisa al
// panel que parte del registro técnico no se pudo guardar (observability-design §2).
export function makeProgressEvent(runId, fields = {}) {
  const event = { runId };
  for (const field of PROGRESS_FIELDS) {
    if (fields[field] !== undefined) event[field] = fields[field];
  }
  if (fields.logDegraded === true) event.logDegraded = true;
  return event;
}

export function makeProgressMessage(progressEvent) {
  return { type: MESSAGE_TYPES.PROGRESS, ...progressEvent };
}

export function makeRunResultMessage(runResult) {
  return { type: MESSAGE_TYPES.RUN_RESULT, runId: runResult.runId, runResult };
}

export function makeStoredRunRecord(runResult) {
  return { schemaVersion: SCHEMA_VERSION, value: runResult };
}

export function makeActiveRunRecord({ runId, tabId, lastProgress, updatedAt }) {
  const record = { runId, tabId, updatedAt };
  if (lastProgress) record.lastProgress = lastProgress;
  return record;
}
