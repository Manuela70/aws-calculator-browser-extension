// brain/server/config.js — Configuración del servicio: config.json versionado
// (modelo, max_tokens, tiempos; NFR7.1), prompts versionados (prompts/*.md) y
// variables de entorno que fija la definición de tarea (orígenes, clientes,
// recursos y topes de tokens calculados por infra/scripts/token-caps.mjs).
// Ninguna credencial pasa por aquí: el acceso a AWS es por la identidad IAM de
// la tarea (BR1.3, NFR5.1).

import { readFileSync } from "node:fs";

const BRAIN_ROOT = new URL("../", import.meta.url);

export function loadStaticConfig() {
  return JSON.parse(readFileSync(new URL("config.json", BRAIN_ROOT), "utf8"));
}

export function loadPrompts() {
  const read = (name) => readFileSync(new URL(`prompts/${name}`, BRAIN_ROOT), "utf8");
  return {
    interpret: read("interpret.md"),
    mapResidue: read("map-residue.md"),
    waf: read("waf-evaluate.md"),
  };
}

const REQUIRED_ENV = [
  "ALLOWED_ORIGINS",
  "ALLOWED_CLIENT_IDS",
  "PROBE_CLIENT_ID",
  "COGNITO_ISSUER",
  "INVENTORY_BUCKET",
  "USAGE_TABLE",
  "DAILY_TOKEN_CAP",
  "GLOBAL_DAILY_TOKEN_CAP",
  "PROBE_DAILY_TOKEN_CAP",
  "SE_HASH_SALT",
];

function list(value) {
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function positiveInt(name, value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${name} debe ser un entero positivo`);
  return n;
}

// Valida y normaliza las variables de entorno; falla rápido con el nombre de la
// variable que falta (nunca con su valor).
export function readEnvConfig(env) {
  const missing = REQUIRED_ENV.filter((name) => !env[name] || env[name].trim() === "");
  if (missing.length > 0) throw new Error(`faltan variables de entorno: ${missing.join(", ")}`);
  const allowedOrigins = list(env.ALLOWED_ORIGINS);
  if (allowedOrigins.some((o) => o === "*")) throw new Error("ALLOWED_ORIGINS no admite *");
  return {
    port: env.PORT ? positiveInt("PORT", env.PORT) : 8080,
    allowedOrigins,
    allowedClientIds: list(env.ALLOWED_CLIENT_IDS),
    probeClientId: env.PROBE_CLIENT_ID.trim(),
    issuer: env.COGNITO_ISSUER.trim(),
    inventoryBucket: env.INVENTORY_BUCKET.trim(),
    usageTable: env.USAGE_TABLE.trim(),
    region: env.AWS_REGION?.trim() || undefined,
    dailyTokenCap: positiveInt("DAILY_TOKEN_CAP", env.DAILY_TOKEN_CAP),
    globalDailyTokenCap: positiveInt("GLOBAL_DAILY_TOKEN_CAP", env.GLOBAL_DAILY_TOKEN_CAP),
    probeDailyTokenCap: positiveInt("PROBE_DAILY_TOKEN_CAP", env.PROBE_DAILY_TOKEN_CAP),
    seHashSalt: env.SE_HASH_SALT,
  };
}

// Lugares del semáforo por instancia: floor(15 / MAX_INSTANCES) (NFR3.4).
export function slotsPerInstance(concurrency) {
  return Math.floor(concurrency.globalInFlight / concurrency.maxInstances);
}
