// brain/core/log-record.js — Registro de una operación sin datos del cliente
// (BR6.1, NFR5.5, NFR3.6) y métricas embebidas en formato EMF (NFR3.7).
// La lista blanca es la única puerta: el cuerpo del pedido, la salida del modelo,
// los nombres de servicio y el sub en claro nunca llegan al registro.

import { createHash } from "node:crypto";

export const METRICS_NAMESPACE = "Brain";

const OPERATIONS = new Set(["interpret", "map_residue", "waf_pre_fill", "waf_post_fill", "health"]);

function nonNegativeInt(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
}

// SHA-256 del sub con sal de configuración: permite agrupar por SE sin guardar su identidad.
export function seHash(sub, salt) {
  if (typeof sub !== "string" || sub.length === 0) return null;
  return createHash("sha256")
    .update(`${salt ?? ""}:${sub}`)
    .digest("hex");
}

// Arma la línea de registro con lista blanca de campos. Cualquier otra
// propiedad de `entry` se ignora.
export function toLogRecord(entry, { salt } = {}) {
  return {
    requestId: typeof entry.requestId === "string" ? entry.requestId : null,
    operation: OPERATIONS.has(entry.operation) ? entry.operation : "unknown",
    inventoryVersion: typeof entry.inventoryVersion === "string" ? entry.inventoryVersion : null,
    code: typeof entry.code === "string" ? entry.code : "internal_error",
    status: nonNegativeInt(entry.status),
    latencyMs: nonNegativeInt(entry.latencyMs),
    attempts: Math.min(2, nonNegativeInt(entry.attempts)),
    inputTokens: nonNegativeInt(entry.inputTokens),
    outputTokens: nonNegativeInt(entry.outputTokens),
    seHash: seHash(entry.sub, salt),
  };
}

// Agrega al registro el bloque EMF con solo las métricas que usan las alarmas y
// el tablero, sin dimensiones (cada combinación de dimensiones es una métrica
// facturada): Requests, Latency, Errors5xx, Errors429, InputTokens y
// OutputTokens. La operación y el código de error quedan en el registro para
// Logs Insights.
export function withRequestMetrics(record, timestampMs) {
  const status = record.status;
  const metrics = {
    Requests: 1,
    Latency: record.latencyMs,
    Errors5xx: status >= 500 ? 1 : 0,
    Errors429: status === 429 ? 1 : 0,
    InputTokens: record.inputTokens,
    OutputTokens: record.outputTokens,
  };
  const directives = [
    {
      Namespace: METRICS_NAMESPACE,
      Dimensions: [[]],
      Metrics: [
        { Name: "Requests", Unit: "Count" },
        { Name: "Latency", Unit: "Milliseconds" },
        { Name: "Errors5xx", Unit: "Count" },
        { Name: "Errors429", Unit: "Count" },
        { Name: "InputTokens", Unit: "Count" },
        { Name: "OutputTokens", Unit: "Count" },
      ],
    },
  ];
  return {
    _aws: { Timestamp: timestampMs, CloudWatchMetrics: directives },
    ...record,
    ...metrics,
  };
}

// Métrica operativa suelta (UsageGuardFallback, InventoryReloadFailed,
// InventoryJobFailed, InventoryAgeDays) en formato EMF.
export function operationalMetric(name, value, timestampMs, unit = "Count") {
  return {
    _aws: {
      Timestamp: timestampMs,
      CloudWatchMetrics: [
        { Namespace: METRICS_NAMESPACE, Dimensions: [[]], Metrics: [{ Name: name, Unit: unit }] },
      ],
    },
    metric: name,
    [name]: value,
  };
}
