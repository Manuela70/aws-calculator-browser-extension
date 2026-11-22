// Datos de prueba de U6: cada función arma un objeto nuevo (sin estado mutable
// compartido). Las formas salen de los contratos reales: NormalizedRun e
// InputError de U2 (se generan con normalize/makeInputError), RunResult y
// ProgressEvent de U5 (buildServiceResult, buildErrorRunResult, finalizeRunResult,
// buildProgressEvent) y la respuesta de /waf-evaluate de C2 1.1.0.

import { normalize } from "../../aws-calculator-extension/lib/input/input-normalizer.js";
import { makeInputError } from "../../aws-calculator-extension/lib/input/input-errors.js";
import {
  aggregate,
  buildErrorRunResult,
  buildProgressEvent,
  buildServiceResult,
  finalizeRunResult,
} from "../../aws-calculator-extension/lib/rpa/result-aggregator.js";

export const VALID_URL = "https://calculator.aws/#/estimate?id=abc-123";
export const FIXED_NOW = Date.parse("2026-11-22T10:00:00.000Z");
const now = () => new Date(FIXED_NOW);

export const EC2_JSON = {
  project: "Demo",
  region: "us-east-1",
  services: [
    {
      name: "Amazon EC2",
      search_term: "Amazon EC2",
      fields: { "Operating system": "Linux", "Instance type": "t3.micro" },
    },
    {
      name: "Amazon S3",
      fields: { "S3 Standard storage": "100" },
    },
  ],
};

// Puerto de lenguaje natural que devuelve una configuración interpretada.
function interpretedPort(runInput) {
  return async () => ({ status: "interpreted", runInput, inventoryVersion: "v1" });
}

export async function makeJsonRun(overrides = {}) {
  const config = { ...structuredClone(EC2_JSON), ...overrides };
  const result = await normalize(
    { format: "json", text: JSON.stringify(config) },
    { interpretNaturalLanguage: interpretedPort(config) },
  );
  if (!result.ok) throw new Error(`fixture inválido: ${result.error.code}`);
  return result.value;
}

export async function makeNaturalLanguageRun() {
  const runInput = { services: [{ name: "Amazon EC2", fields: { "Instance type": "t3.micro" } }] };
  const result = await normalize(
    { format: "natural_language", text: "una instancia EC2 t3.micro" },
    { interpretNaturalLanguage: interpretedPort(runInput) },
  );
  if (!result.ok) throw new Error(`fixture inválido: ${result.error.code}`);
  return result.value;
}

// Un InputError por familia de U2: JSON, límites, lenguaje natural y cerebro.
export function makeInputErrors() {
  return {
    json: makeInputError("invalid_json"),
    unknownKey: makeInputError("unknown_key", { service: "Amazon EC2", serviceIndex: 0, key: "x" }),
    limit: makeInputError("input_limit_exceeded", { limit: "services" }),
    unresolved: makeInputError("nl_unresolved", {
      fragments: [{ fragment: "algo raro", reason: "unknown_service" }],
    }),
    unauthorized: makeInputError("unauthorized"),
    cancelled: makeInputError("cancelled"),
    timeout: makeInputError("timeout"),
  };
}

const EC2_REQUEST = { requestId: "svc-1", serviceName: "Amazon EC2" };
const S3_REQUEST = { requestId: "svc-2", serviceName: "Amazon S3" };

export function makeDoneRunResult(runId = "run-1", url = VALID_URL) {
  const results = [
    buildServiceResult(EC2_REQUEST, { status: "confirmed", durationMs: 1000 }),
    buildServiceResult(S3_REQUEST, { status: "confirmed", durationMs: 900 }),
  ];
  return finalizeRunResult({
    runId,
    aggregation: aggregate([EC2_REQUEST, S3_REQUEST], results),
    estimateMatches: true,
    renameOk: true,
    shareUrl: url,
    now,
  });
}

// DONE con una URL que no es de calculator.aws (forzado: finalizeRunResult no lo produce).
export function makeDoneWithBadUrl(runId = "run-1") {
  return { ...makeDoneRunResult(runId), estimateUrl: "javascript:alert(1)" };
}

export function makeErrorRunResult(runId = "run-1", { brainErrorCode } = {}) {
  const results = [
    buildServiceResult(EC2_REQUEST, {
      status: "confirmed",
      appliedActions: [
        {
          requestKey: "Instance type",
          requestedValue: "t3.m",
          value: "t3.medium",
          substituted: true,
        },
      ],
    }),
    buildServiceResult(S3_REQUEST, {
      status: "failed",
      reason: "option_no_match",
      detail: "Plan 9",
      stoppedAtLabel: "Operating system",
      brainErrorCode,
    }),
  ];
  return finalizeRunResult({
    runId,
    aggregation: aggregate([EC2_REQUEST, S3_REQUEST], results),
    estimateMatches: false,
    now,
  });
}

export function makeConnectionFailure(runId = "run-1", failureStep = "connection") {
  return buildErrorRunResult({ runId, failureStep, now });
}

export function makeProgress(runId, step, extra = {}) {
  return buildProgressEvent({ runId, step, serviceCount: 2, ...extra });
}

export function makeWafResponse({ withFindings = true } = {}) {
  return {
    perService: [
      withFindings
        ? {
            serviceIndex: 0,
            service: "Amazon EC2",
            noFindings: false,
            recommendations: [
              { pillar: "Security", severity: "high", text: "Activa IMDSv2." },
              { pillar: "CostOptimization", severity: "low", text: "Evalúa Savings Plans." },
            ],
          }
        : { serviceIndex: 0, service: "Amazon EC2", noFindings: true },
      { serviceIndex: 1, service: "Amazon S3", noFindings: true },
    ],
    inventoryVersion: "v1",
  };
}

// expiresAt a N minutos de FIXED_NOW.
export function makeSession(minutes) {
  if (minutes === null) return { authenticated: false, expiresAt: null };
  return { authenticated: true, expiresAt: FIXED_NOW + minutes * 60 * 1000 };
}
