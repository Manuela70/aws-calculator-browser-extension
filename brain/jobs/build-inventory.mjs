// brain/jobs/build-inventory.mjs — InventoryJob semanal (BR5.1-BR5.3, NFR1.8,
// NFR1.9). Portado de aidlc/spaces/default/knowledge/calculator-catalog/tools/
// build-inventory.mjs y completado según entities.md:
// 1. descarga el catálogo público de calculator.aws (manifest + definiciones);
// 2. arma la versión (metadatos, `kind` por campo, etiquetas "Sección > Campo",
//    clave "<Campo> unit", canónicas y sinónimos versionados junto a este script);
// 3. la valida (esquema, ≤ 50 MB, pérdida ≤ 10 % frente a la activa);
// 4. si pasa: la publica en versions/<v>.json, calcula su SHA-256 y reescribe el
//    puntero `active` con `previous` en una sola escritura;
//    si no: la publica con status "rejected", no toca el puntero y emite
//    InventoryJobFailed.
// Uso: en Lambda lo corre jobs/job-server.mjs; a mano, node jobs/build-inventory.mjs run.
// Solo datos públicos; sin credenciales propias (rol IAM de la función).

import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { S3Client } from "@aws-sdk/client-s3";
import { createInventoryStore } from "../adapters/inventory-store.js";
import { buildSnapshot, compareWithActive, validateSnapshot } from "../core/inventory-model.js";
import { operationalMetric } from "../core/log-record.js";

export const MANIFEST_URL = "https://d1qsjq9pzbk1k6.cloudfront.net/manifest/en_US.json";
const CONCURRENCY = 6;
const FETCH_TIMEOUT_MS = 15_000;

// Recorre la definición y junta todo objeto con type === "input" (igual que la
// herramienta original del catálogo).
export function collectInputs(node, ctx, acc) {
  if (Array.isArray(node)) {
    for (const item of node) collectInputs(item, ctx, acc);
    return;
  }
  if (!node || typeof node !== "object") return;
  const next = { ...ctx };
  if (typeof node.title === "string" && Array.isArray(node.cards)) next.template = node.title;
  if (typeof node.title === "string" && node.inputSection) next.card = node.title;
  if (node.type === "input") {
    acc.push({
      template: ctx.template ?? null,
      card: ctx.card ?? null,
      id: node.id ?? null,
      label: typeof node.label === "string" ? node.label.trim() : null,
      subType: node.subType ?? null,
      options: Array.isArray(node.options)
        ? node.options.map((o) => (typeof o === "object" ? (o.label ?? o.id) : o))
        : null,
      conditional: Boolean(node.displayIf),
    });
  }
  for (const value of Object.values(node)) collectInputs(value, next, acc);
}

export function toRawService(svc, definition) {
  const inputs = [];
  collectInputs(definition.templates ?? [], {}, inputs);
  return {
    serviceCode: svc.serviceCode,
    name: String(svc.name).trim(),
    searchKeywords: svc.searchKeywords ?? [],
    regions: Array.isArray(svc.regions) ? svc.regions : [],
    templates: (definition.templates ?? []).map((t) => t.title),
    inputs,
  };
}

async function fetchJson(fetchImpl, url) {
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`http_${response.status}`);
  return response.json();
}

// Descarga el catálogo completo. Un servicio sin definición descargable se
// omite (la comparación del 10 % detecta una caída masiva).
export async function fetchRawServices({
  fetchImpl = globalThis.fetch,
  manifestUrl = MANIFEST_URL,
} = {}) {
  const manifest = await fetchJson(fetchImpl, manifestUrl);
  const services = (manifest.awsServices ?? []).filter((s) => s.serviceDefinitionLocation);
  const raw = [];
  let missing = 0;
  for (let i = 0; i < services.length; i += CONCURRENCY) {
    const chunk = services.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      chunk.map((svc) =>
        fetchJson(fetchImpl, svc.serviceDefinitionLocation).then(
          (definition) => toRawService(svc, definition),
          () => null,
        ),
      ),
    );
    for (const item of results) {
      if (item) raw.push(item);
      else missing += 1;
    }
  }
  return { rawServices: raw, missing };
}

// Versión del día (AAAA-MM-DD) con sufijo si ya existe una activa de ese día.
export function nextVersion(nowMs, activeVersion) {
  const day = new Date(nowMs).toISOString().slice(0, 10);
  if (!activeVersion || !activeVersion.startsWith(day)) return day;
  const suffix = Number(activeVersion.slice(11) || 1) + 1;
  return `${day}-${suffix}`;
}

async function readActiveSnapshot(store, pointer) {
  if (!pointer) return null;
  const text = await store.readVersion(pointer.version, pointer.sha256);
  return JSON.parse(text);
}

export async function runInventoryJob({
  store,
  loadRawServices,
  now = Date.now,
  preferences = {},
  synonyms = {},
  maxLossRatio = 0.1,
  emit = () => {},
}) {
  const nowMs = now();
  const { rawServices, missing } = await loadRawServices();
  const pointer = await store.readPointer();
  const active = await readActiveSnapshot(store, pointer);
  const version = nextVersion(nowMs, pointer?.version);
  const snapshot = buildSnapshot({
    version,
    generatedAt: new Date(nowMs).toISOString(),
    rawServices,
    preferences,
    synonyms,
  });
  let text = JSON.stringify(snapshot);
  const schema = validateSnapshot(snapshot, { byteLength: Buffer.byteLength(text) });
  const loss = compareWithActive(snapshot, active, maxLossRatio);
  const summary = {
    version,
    serviceCount: snapshot.serviceCount,
    fieldCount: snapshot.fieldCount,
    missingDefinitions: missing,
    serviceLoss: Number(loss.serviceLoss.toFixed(4)),
    fieldLoss: Number(loss.fieldLoss.toFixed(4)),
  };
  if (!schema.ok || !loss.ok) {
    snapshot.status = "rejected";
    text = JSON.stringify(snapshot);
    await store.publishVersion(version, text);
    emit(operationalMetric("InventoryJobFailed", 1, nowMs));
    emit({ event: "inventory_rejected", ...summary, schemaErrors: schema.errors.slice(0, 10) });
    return { status: "rejected", ...summary };
  }
  const sha256 = await store.publishVersion(version, text);
  await store.writePointer({
    version,
    sha256,
    previous: pointer ? { version: pointer.version, sha256: pointer.sha256 } : null,
  });
  emit(operationalMetric("InventoryJobFailed", 0, nowMs));
  emit({ event: "inventory_activated", ...summary, sha256 });
  return { status: "active", sha256, ...summary };
}

async function readJson(name) {
  return JSON.parse(await readFile(new URL(name, import.meta.url), "utf8"));
}

// Corre el job con los adaptadores reales (S3 y el catálogo público).
export async function runFromEnvironment(log, env = process.env) {
  const bucket = env.INVENTORY_BUCKET;
  if (!bucket) throw new Error("falta INVENTORY_BUCKET");
  const result = await runInventoryJob({
    store: createInventoryStore({ s3: new S3Client({}), bucket }),
    loadRawServices: () => fetchRawServices(),
    preferences: await readJson("./canonical-services.json"),
    synonyms: await readJson("./synonyms-es.json"),
    emit: log,
  });
  log({ event: "inventory_job_done", status: result.status, version: result.version });
  return result;
}

async function main() {
  await runFromEnvironment((record) => process.stdout.write(`${JSON.stringify(record)}\n`));
}

const invokedDirectly = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invokedDirectly) {
  if (process.argv[2] !== "run") {
    process.stdout.write("uso: node jobs/build-inventory.mjs run\n");
    process.exit(2);
  }
  main().catch((error) => {
    // Falla visible: el proceso termina con código ≠ 0.
    process.stdout.write(
      `${JSON.stringify({ event: "inventory_job_failed", reason: error.message })}\n`,
    );
    process.stdout.write(
      `${JSON.stringify(operationalMetric("InventoryJobFailed", 1, Date.now()))}\n`,
    );
    process.exit(1);
  });
}
