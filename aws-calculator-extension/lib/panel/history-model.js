// lib/panel/history-model.js — Filas del historial y de "Última corrida" (BR1.1, BR5.3, NFR8.7).
// Dueño: U6. Zona A. Funciones puras sobre runLogIndex (U1) y lastRunResult:
// nunca mutan la lista recibida. El enlace solo aparece si la URL valida.

import { getRowState } from "../log/log-index.js";
import { isValidEstimateUrl } from "./url-check.js";

export const HISTORY_LIMIT = 200;

function timeOf(row) {
  const ms = Date.parse(row?.startedAt);
  return Number.isFinite(ms) ? ms : -Infinity;
}

// Más reciente primero; las filas sin fecha legible quedan al final.
export function sortRunsByDate(index) {
  const list = Array.isArray(index) ? index.filter((row) => row && typeof row === "object") : [];
  return [...list].sort((a, b) => timeOf(b) - timeOf(a));
}

function matchingResult(row, lastRunResult) {
  return lastRunResult && lastRunResult.runId === row.runId ? lastRunResult : null;
}

function serviceCountOf(row, result) {
  if (Number.isInteger(row.serviceCount) && row.serviceCount >= 0) return row.serviceCount;
  return Array.isArray(result?.perServiceResults) ? result.perServiceResults.length : null;
}

// URL declarada por la fila o por el lastRunResult de la misma corrida (o undefined).
function claimedUrlOf(row, result) {
  if (row.estimateUrl !== undefined) return row.estimateUrl;
  return result?.status === "DONE" ? (result.estimateUrl ?? null) : undefined;
}

// Veredicto de una fila: una URL declarada e inválida nunca es DONE; sin
// cierre, interrumpida. Las filas del índice de U1 no guardan la URL.
function verdictOf(row, claimedUrl) {
  const state = getRowState(row);
  if (state === "DONE") {
    return claimedUrl === undefined || isValidEstimateUrl(claimedUrl) ? "DONE" : "ERROR";
  }
  return state === "interrupted" ? "interrupted" : "ERROR";
}

export function toHistoryRow(row, lastRunResult = null) {
  const result = matchingResult(row, lastRunResult);
  const claimedUrl = claimedUrlOf(row, result);
  const estimateUrl = isValidEstimateUrl(claimedUrl) ? claimedUrl : null;
  return {
    runId: String(row.runId ?? ""),
    startedAt: typeof row.startedAt === "string" ? row.startedAt : null,
    verdict: verdictOf(row, claimedUrl),
    serviceCount: serviceCountOf(row, result),
    estimateUrl,
    degraded: row.degraded === true,
    bytes: Number(row.bytes) || 0,
    source: row,
  };
}

// Las 200 corridas más recientes como filas listas para pintar, el total y si
// se recortó la lista.
export function buildHistoryView(index, { lastRunResult = null, limit = HISTORY_LIMIT } = {}) {
  const sorted = sortRunsByDate(index);
  const rows = sorted.slice(0, limit).map((row) => toHistoryRow(row, lastRunResult));
  return { rows, total: sorted.length, truncated: sorted.length > limit, limit };
}

// "Última corrida" (plegada en Idle): fecha, veredicto y enlace solo con DONE
// y URL válida. Nunca un mensaje de error abierto (AC6.3.1).
export function describeLastRun(lastRunResult) {
  if (!lastRunResult || typeof lastRunResult !== "object") return null;
  if (typeof lastRunResult.runId !== "string") return null;
  const isDone = lastRunResult.status === "DONE" && isValidEstimateUrl(lastRunResult.estimateUrl);
  return {
    runId: lastRunResult.runId,
    finishedAt: typeof lastRunResult.finishedAt === "string" ? lastRunResult.finishedAt : null,
    verdict: isDone ? "DONE" : "ERROR",
    estimateUrl: isDone ? lastRunResult.estimateUrl : null,
  };
}
