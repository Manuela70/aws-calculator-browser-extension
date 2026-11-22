// lib/rpa/result-aggregator.js — Veredicto todo-o-nada (BR5.1, BR5.4, BR5.6; reliability-design §3).
// PROVISIONAL (U1, walking skeleton). Dueño final: U5 (ResultAggregator).
// finalizeRunResult es la ÚNICA función que puede producir un RunResult DONE.
// No se emite PARTIAL: un fallo parcial es ERROR con failureStep = services.

import { normalizeText } from "../mapping/option-match.js";
import { isCalculatorUrl } from "../validation.js";

export const FAILURE_STEPS = Object.freeze([
  "connection",
  "preconditions",
  "services",
  "estimate_check",
  "rename",
  "share",
  "lost",
]);

// aggregate(requested, serviceResults): conserva el motivo de cada fallo y
// ordena los resultados como los servicios pedidos. Un servicio pedido sin
// resultado cuenta como fallido. Cero servicios pedidos nunca es éxito.
export function aggregate(requested, serviceResults) {
  const byId = new Map((serviceResults ?? []).map((result) => [result.requestId, result]));
  const perServiceResults = (requested ?? []).map(
    (req) =>
      byId.get(req.requestId) ?? {
        requestId: req.requestId,
        serviceName: req.serviceName,
        status: "failed",
        reason: "unexpected_error",
        detail: "sin resultado",
      },
  );
  const confirmedIds = perServiceResults
    .filter((result) => result.status === "confirmed")
    .map((result) => result.requestId);
  const missingIds = perServiceResults
    .filter((result) => result.status !== "confirmed")
    .map((result) => result.requestId);
  return {
    allConfirmed: perServiceResults.length > 0 && missingIds.length === 0,
    confirmedIds,
    missingIds,
    perServiceResults,
  };
}

// BR5.6: My Estimate contiene exactamente los servicios pedidos (mismo número
// y cada uno aparece por su nombre, emparejados uno a uno).
export function estimateMatchesRequest(requested, listedNames) {
  if (!Array.isArray(listedNames) || listedNames.length !== requested.length) return false;
  const remaining = listedNames.map(normalizeText);
  for (const req of requested) {
    const wanted = normalizeText(req.serviceName);
    const index = remaining.findIndex((name) => name === wanted || name.includes(wanted));
    if (index < 0) return false;
    remaining.splice(index, 1);
  }
  return true;
}

export function buildErrorRunResult({
  runId,
  failureStep,
  failureDetail,
  perServiceResults = [],
  now,
}) {
  const result = {
    runId,
    status: "ERROR",
    failureStep: FAILURE_STEPS.includes(failureStep) ? failureStep : "services",
    perServiceResults,
    finishedAt: now().toISOString(),
  };
  if (failureDetail) result.failureDetail = failureDetail;
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
  now,
}) {
  const base = { runId, perServiceResults: aggregation.perServiceResults, now };
  if (!aggregation.allConfirmed) return buildErrorRunResult({ ...base, failureStep: "services" });
  if (estimateMatches !== true)
    return buildErrorRunResult({ ...base, failureStep: "estimate_check" });
  if (renameOk === false) return buildErrorRunResult({ ...base, failureStep: "rename" });
  if (!isCalculatorUrl(shareUrl)) return buildErrorRunResult({ ...base, failureStep: "share" });
  return {
    runId,
    status: "DONE",
    estimateUrl: shareUrl,
    perServiceResults: aggregation.perServiceResults,
    finishedAt: now().toISOString(),
  };
}
