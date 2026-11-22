// lib/log/log-format.js — Formato de las entradas del registro técnico (NFR3.5, NFR3.10).
// PROVISIONAL (U1, walking skeleton). Dueño final: U1 (compartido).
// Único punto por donde pasan las entradas: aplica la lista de campos
// permitidos para que nada inesperado (p. ej. credenciales) termine persistido.

export const ALLOWED_FIELDS = Object.freeze([
  "seq",
  "ts",
  "runId",
  "level",
  "step",
  "event",
  "message",
  "selector",
  "label",
  "value",
  "detail",
]);

export const LOG_LEVELS = Object.freeze(["error", "warn", "info", "debug"]);

export const LOG_EVENTS = Object.freeze({ RUN_START: "run_start", RUN_END: "run_end" });

export const CONSOLE_PREFIX = "[aws-calc]";

const MAX_TEXT_LENGTH = 2000;

function toText(value) {
  const text = typeof value === "string" ? value : String(value);
  return text.length > MAX_TEXT_LENGTH ? text.slice(0, MAX_TEXT_LENGTH) : text;
}

// Formatea una entrada cruda: seq y runId los fija la cola, ts la hora actual.
// Los campos fuera de la lista permitida se descartan; los valores se guardan
// como texto.
export function formatLogEntry(raw, { seq, runId, now }) {
  const level = LOG_LEVELS.includes(raw?.level) ? raw.level : "info";
  const entry = { seq, ts: now().toISOString(), runId, level };
  for (const field of ALLOWED_FIELDS) {
    if (field in entry) continue;
    const value = raw?.[field];
    if (value === undefined || value === null) continue;
    entry[field] = toText(value);
  }
  return entry;
}

// run_start resume el RunRequest: nombres de servicio y número de valores,
// sin copiar el JSON completo (NFR5.2).
export function makeRunStartEntry(runRequest) {
  const summary = runRequest.services
    .map(
      (svc) => `${svc.serviceName} (${svc.fields.length} valores, ${svc.toggles.length} toggles)`,
    )
    .join("; ");
  return {
    level: "info",
    step: "run",
    event: LOG_EVENTS.RUN_START,
    message: `Inicio de corrida con ${runRequest.services.length} servicio(s)`,
    detail: summary,
  };
}

// run_end lleva el veredicto en value y el paso fallido en detail; de aquí sale
// la duración que mide el smoke (NFR8.7) y la reparación del índice.
export function makeRunEndEntry(runResult) {
  const entry = {
    level: runResult.status === "DONE" ? "info" : "warn",
    step: "run",
    event: LOG_EVENTS.RUN_END,
    message: `Fin de corrida: ${runResult.status}`,
    value: runResult.status,
  };
  if (runResult.failureStep) entry.detail = runResult.failureStep;
  return entry;
}

export function formatConsolePrefix(runId, level) {
  return `${CONSOLE_PREFIX} ${runId} ${level}`;
}
