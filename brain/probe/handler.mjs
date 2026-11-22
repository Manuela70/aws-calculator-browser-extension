// brain/probe/handler.mjs — Lambda `Probe`: sonda sintética del SLI de
// disponibilidad (NFR1.4; reliability-design.md "Sonda Probe").
// - Obtiene un token de máquina de Cognito (credenciales de cliente, alcance
//   brain/probe) con el secreto guardado en Secrets Manager; lo reutiliza hasta
//   un minuto antes de su vencimiento.
// - Cada invocación ejecuta una operación real que invoca el modelo, rotando
//   por minuto entre /map-residue, /interpret y /waf-evaluate, con casos
//   sintéticos fijos sin datos de cliente.
// - Emite ProbeSuccess (1 o 0) en formato EMF y devuelve el resultado (el job
//   `smoke` del pipeline lo lee).
// Autocontenida: se empaqueta sola (el runtime de Lambda trae el AWS SDK v3).

import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";

const REQUEST_TIMEOUT_MS = 28_000;
const TOKEN_TIMEOUT_MS = 5_000;

export const PROBE_CASES = [
  {
    operation: "map_residue",
    path: "/map-residue",
    body: {
      service: "S3 Standard",
      domFields: [{ label: "S3 Standard storage", type: "number" }],
      requestedValues: [{ key: "Almacenamiento", value: "10" }],
      unresolved: [{ key: "Almacenamiento", value: "10" }],
    },
  },
  {
    operation: "interpret",
    path: "/interpret",
    body: { text: "Un bucket S3 Standard de 10 GB en us-east-1", locale: "es", schemaVersion: 1 },
  },
  {
    operation: "waf_post_fill",
    path: "/waf-evaluate",
    body: {
      phase: "post_fill",
      services: [{ name: "S3 Standard", config: { "S3 Standard storage": "10" } }],
    },
  },
];

export function caseForMinute(nowMs) {
  return PROBE_CASES[Math.floor(nowMs / 60_000) % PROBE_CASES.length];
}

export function probeMetric(success, operation, status, nowMs) {
  return {
    _aws: {
      Timestamp: nowMs,
      CloudWatchMetrics: [
        {
          Namespace: "Brain",
          Dimensions: [[]],
          Metrics: [{ Name: "ProbeSuccess", Unit: "Count" }],
        },
      ],
    },
    ProbeSuccess: success ? 1 : 0,
    operation,
    status,
  };
}

function defaultDeps() {
  const secrets = new SecretsManagerClient({});
  return {
    env: process.env,
    now: Date.now,
    fetchImpl: globalThis.fetch,
    log: (record) => process.stdout.write(`${JSON.stringify(record)}\n`),
    async getSecret(secretId) {
      const response = await secrets.send(new GetSecretValueCommand({ SecretId: secretId }));
      return JSON.parse(response.SecretString);
    },
  };
}

let cachedToken = null; // { accessToken, expiresAt }

export function resetTokenCache() {
  cachedToken = null;
}

class ProbeFailure extends Error {
  constructor(reason) {
    super(reason);
    this.reason = reason;
  }
}

async function readSecret(deps) {
  try {
    const secret = await deps.getSecret(deps.env.PROBE_SECRET_ARN);
    if (typeof secret?.clientId === "string" && typeof secret?.clientSecret === "string") {
      return secret;
    }
  } catch {
    // se informa abajo como secret_unreadable, sin detalles del proveedor
  }
  throw new ProbeFailure("secret_unreadable");
}

async function machineToken(deps) {
  const nowMs = deps.now();
  if (cachedToken && cachedToken.expiresAt - 60_000 > nowMs) return cachedToken.accessToken;
  const secret = await readSecret(deps);
  const basic = Buffer.from(`${secret.clientId}:${secret.clientSecret}`).toString("base64");
  const response = await deps.fetchImpl(deps.env.TOKEN_URL, {
    method: "POST",
    headers: {
      authorization: `Basic ${basic}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: deps.env.PROBE_SCOPE,
    }).toString(),
    signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
  });
  if (!response.ok) throw new ProbeFailure(`token_http_${response.status}`);
  const body = await response.json();
  if (typeof body?.access_token !== "string") throw new ProbeFailure("token_invalid");
  cachedToken = {
    accessToken: body.access_token,
    expiresAt: nowMs + Number(body.expires_in) * 1000,
  };
  return cachedToken.accessToken;
}

export async function handler(_event, _context, deps = defaultDeps()) {
  const nowMs = deps.now();
  const probeCase = caseForMinute(nowMs);
  let status = 0;
  let reason;
  try {
    const token = await machineToken(deps);
    const response = await deps.fetchImpl(`${deps.env.BRAIN_URL}${probeCase.path}`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(probeCase.body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    status = response.status;
    if (status !== 200) reason = `http_${status}`;
  } catch (error) {
    reason = error instanceof ProbeFailure ? error.reason : "request_failed";
  }
  const success = status === 200;
  deps.log(probeMetric(success, probeCase.operation, status, nowMs));
  return { success, operation: probeCase.operation, status, ...(reason ? { reason } : {}) };
}
