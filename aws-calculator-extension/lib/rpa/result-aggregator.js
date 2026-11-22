// lib/rpa/result-aggregator.js — Resultado todo-o-nada de la corrida (BR1.2, BR4.2, BR4.3;
// NFR3.2, NFR3.4, NFR5.4, NFR5.5, NFR8.6).
// Dueño: U5 (ResultAggregator). Módulo de Zona A: sin DOM, sin red y sin estado.
// finalizeRunResult es la ÚNICA función que puede producir un RunResult DONE.
// No existe PARTIAL: un fallo parcial es ERROR con failureStep = services y la
// lista de faltantes en missing.

import { normalizeText } from "../mapping/option-match.js";
import { SERVICE_TIMEOUT_REASON } from "./service-timer.js";

export const FAILURE_STEPS = Object.freeze([
  "connection",
  "preconditions",
  "services",
  "estimate_check",
  "rename",
  "share",
  "lost",
]);

// ServiceResult.reason (entities.md): superset de U1.
export const SERVICE_REASONS = Object.freeze([
  "service_not_found",
  "template_not_found",
  "field_not_recognized",
  "field_not_resolved",
  "field_not_applied",
  "option_no_match",
  "option_ambiguous",
  "toggle_not_applied",
  "validation_required",
  "save_not_confirmed",
  "page_timeout",
  "service_timeout",
  "not_attempted",
  "unexpected_error",
]);

// RunResult.failureDetail con motivo propio de U5 (decisiones 3 y 7 del plan).
export const RUN_FAILURE_DETAILS = Object.freeze({
  SHARE_INVALID: "share_invalid",
  CANCELLED: "cancelled",
  EXIT_NOT_CONFIRMED: "exit_not_confirmed",
});

// ProgressEvent.step (entities.md).
export const PROGRESS_STEPS = Object.freeze([
  "adding_service",
  "applying_toggles",
  "mapping_pass",
  "asking_brain",
  "applying_action",
  "saving",
  "cancelling",
  "checking_estimate",
  "renaming",
  "sharing",
]);

export const SERVICE_STATUSES = Object.freeze(["in_progress", "confirmed", "failed"]);

export const MAX_TEXT_CHARS = 200;

// NFR5.5: todo texto leído del DOM que viaja al panel se recorta a 200
// caracteres (el último es "…" cuando se corta).
export function clip(text, max = MAX_TEXT_CHARS) {
  if (text === undefined || text === null) return "";
  const value = String(text);
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

// NFR5.4: el enlace de Share solo vale con este prefijo exacto y un id
// alfanumérico con guiones de 1 a 128 caracteres.
export const SHARE_URL_PREFIX = "https://calculator.aws/#/estimate?id=";
const SHARE_ID = /^[A-Za-z0-9-]{1,128}$/;

export function validateShareUrl(url) {
  if (typeof url !== "string" || !url.startsWith(SHARE_URL_PREFIX)) return false;
  return SHARE_ID.test(url.slice(SHARE_URL_PREFIX.length));
}

// Tabla DomError → reason (security-design §3; decisión 5 del plan). Los
// códigos que ya son un reason válido pasan tal cual.
const DOM_ERROR_TO_REASON = Object.freeze({
  readback_mismatch: "field_not_applied",
  not_confirmed: "save_not_confirmed",
  timeout: "page_timeout",
});

const RUN_LEVEL_STEPS = Object.freeze(["preconditions", "estimate_check", "rename", "share"]);

// code: código de DomError o reason del resolvedor. context.step: paso en que
// ocurrió ("search_service", "estimate_check", …). context.abortReason: motivo
// de la señal abortada (corte de 3 minutos o cancelación de la corrida).
// Devuelve { reason, failureStep }.
export function translateDomError(code, { step, abortReason } = {}) {
  const failureStep = RUN_LEVEL_STEPS.includes(step) ? step : "services";
  let reason;
  if (code === "not_found") {
    reason = step === "search_service" ? "service_not_found" : "page_timeout";
  } else if (code === "aborted" || code === "cancelled") {
    reason = abortReason === SERVICE_TIMEOUT_REASON ? "service_timeout" : "not_attempted";
  } else if (DOM_ERROR_TO_REASON[code]) {
    reason = DOM_ERROR_TO_REASON[code];
  } else {
    reason = SERVICE_REASONS.includes(code) ? code : "unexpected_error";
  }
  return { reason, failureStep };
}

// NFR3.4: solo las acciones aplicadas con substituted = true, con el valor
// pedido y la opción realmente aplicada.
export function collectSubstitutions(appliedActions) {
  return (appliedActions ?? [])
    .filter((action) => action?.substituted === true)
    .map((action) => ({
      key: clip(action.requestKey),
      requestedValue: clip(action.requestedValue),
      appliedValue: clip(action.value),
    }));
}

function toDuration(durationMs) {
  const value = Math.round(Number(durationMs));
  return Number.isFinite(value) && value > 0 ? value : 0;
}

// Arma un ServiceResult (entities.md). Un fallo sin reason válido es
// unexpected_error; todo texto que viene del DOM se recorta (NFR5.5).
export function buildServiceResult(svc, outcome = {}) {
  const isConfirmed = outcome.status === "confirmed";
  const result = {
    requestId: svc.requestId,
    serviceName: svc.serviceName,
    status: isConfirmed ? "confirmed" : "failed",
    durationMs: toDuration(outcome.durationMs),
  };
  if (!isConfirmed) {
    result.reason = SERVICE_REASONS.includes(outcome.reason) ? outcome.reason : "unexpected_error";
  }
  if (outcome.detail) result.detail = clip(outcome.detail);
  if (!isConfirmed && outcome.stoppedAtLabel) result.stoppedAtLabel = clip(outcome.stoppedAtLabel);
  if (outcome.listedInEstimate === true) result.listedInEstimate = true;
  const substitutions = collectSubstitutions(outcome.appliedActions);
  if (substitutions.length > 0) result.brainSubstitutions = substitutions;
  if (outcome.brainErrorCode) result.brainErrorCode = clip(outcome.brainErrorCode);
  return result;
}

// ProgressEvent estructurado (decisión 2 del plan): conserva pct y text para el
// panel actual; U6 los retirará.
export function buildProgressEvent({
  runId,
  step,
  serviceIndex,
  serviceCount,
  label,
  serviceStatus,
  requestId,
  pct,
  text,
}) {
  if (!PROGRESS_STEPS.includes(step)) throw new RangeError(`Paso de progreso desconocido: ${step}`);
  const event = { runId, step, serviceCount: Number.isInteger(serviceCount) ? serviceCount : 0 };
  if (Number.isInteger(serviceIndex)) event.serviceIndex = serviceIndex;
  if (requestId) event.requestId = requestId;
  if (label) event.label = clip(label);
  if (SERVICE_STATUSES.includes(serviceStatus)) event.serviceStatus = serviceStatus;
  if (pct !== undefined) event.pct = pct;
  if (text !== undefined) event.text = clip(text);
  return event;
}

function failedPlaceholder(req) {
  return {
    requestId: req.requestId,
    serviceName: req.serviceName,
    status: "failed",
    reason: "unexpected_error",
    detail: "sin resultado",
    durationMs: 0,
  };
}

// aggregate(requested, serviceResults): un ServiceResult por servicio pedido,
// en orden; un servicio pedido sin resultado cuenta como fallido. Cero
// servicios pedidos nunca es éxito.
export function aggregate(requested, serviceResults) {
  const byId = new Map((serviceResults ?? []).map((result) => [result.requestId, result]));
  const perServiceResults = (requested ?? []).map(
    (req) => byId.get(req.requestId) ?? failedPlaceholder(req),
  );
  const notConfirmed = perServiceResults.filter((result) => result.status !== "confirmed");
  return {
    allConfirmed: perServiceResults.length > 0 && notConfirmed.length === 0,
    confirmedIds: perServiceResults
      .filter((result) => result.status === "confirmed")
      .map((result) => result.requestId),
    missingIds: notConfirmed.map((result) => result.requestId),
    missing: notConfirmed.map((result) => result.serviceName),
    perServiceResults,
  };
}

// BR1.2 / NFR3.2: My Estimate contiene exactamente los servicios pedidos, como
// multiconjunto de nombres normalizados y con coincidencia exacta (decisión 9).
// Cada pedido se compara por calculatorServiceName (título de la tarjeta) si lo
// trae, o por serviceName.
export function estimateMatchesRequest(requested, listedNames) {
  if (!Array.isArray(requested) || !Array.isArray(listedNames)) return false;
  if (listedNames.length !== requested.length) return false;
  const counts = new Map();
  for (const name of listedNames) {
    const key = normalizeText(name);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const req of requested) {
    const key = normalizeText(req.calculatorServiceName ?? req.serviceName);
    const left = counts.get(key) ?? 0;
    if (left === 0) return false;
    counts.set(key, left - 1);
  }
  return true;
}

function firstStoppedAt(perServiceResults) {
  return perServiceResults.find((result) => result.stoppedAtLabel)?.stoppedAtLabel;
}

export function buildErrorRunResult({
  runId,
  failureStep,
  failureDetail,
  perServiceResults = [],
  missing,
  now,
}) {
  const result = {
    runId,
    status: "ERROR",
    failureStep: FAILURE_STEPS.includes(failureStep) ? failureStep : "services",
    perServiceResults,
    missing:
      missing ??
      perServiceResults.filter((r) => r.status !== "confirmed").map((r) => r.serviceName),
    finishedAt: now().toISOString(),
  };
  if (failureDetail) result.failureDetail = failureDetail;
  const stoppedAtLabel = firstStoppedAt(perServiceResults);
  if (stoppedAtLabel) result.stoppedAtLabel = stoppedAtLabel;
  return result;
}

// Encadena las condiciones de DONE en orden; cualquier falso corta:
// todos confirmados → contenido exacto → renombrado (si se pidió) → enlace válido.
export function finalizeRunResult({
  runId,
  aggregation,
  estimateMatches,
  renameOk,
  shareUrl,
  failureDetail,
  now,
}) {
  const base = {
    runId,
    perServiceResults: aggregation.perServiceResults,
    missing: aggregation.missing,
    now,
  };
  if (!aggregation.allConfirmed) {
    return buildErrorRunResult({ ...base, failureStep: "services", failureDetail });
  }
  if (estimateMatches !== true)
    return buildErrorRunResult({ ...base, failureStep: "estimate_check" });
  if (renameOk === false) return buildErrorRunResult({ ...base, failureStep: "rename" });
  if (!validateShareUrl(shareUrl)) {
    return buildErrorRunResult({
      ...base,
      failureStep: "share",
      failureDetail: shareUrl === undefined ? undefined : RUN_FAILURE_DETAILS.SHARE_INVALID,
    });
  }
  return {
    runId,
    status: "DONE",
    estimateUrl: shareUrl,
    perServiceResults: aggregation.perServiceResults,
    missing: [],
    finishedAt: now().toISOString(),
  };
}
