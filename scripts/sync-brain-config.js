// scripts/sync-brain-config.js — Une la extensión con el cerebro desplegado de u4 (NFR1.1).
// Lee infra/cdk-outputs.json (generado por `cdk deploy --outputs-file`), toma
// BrainUrl, CognitoDomain y ExtensionClientId del stack "brain", valida que las URL
// sean orígenes https y reescribe sw/config.js y los hosts derivados de
// host_permissions del manifest. Lo corre el mantenedor tras un despliegue de u4;
// después conviene correr `npm run format` y `npm run check:bundle`.
// Solo herramienta de desarrollo; no forma parte del bundle.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const OUTPUTS_PATH = join(ROOT, "infra", "cdk-outputs.json");
const BUNDLE_DIR = join(ROOT, "aws-calculator-extension");
const CONFIG_PATH = join(BUNDLE_DIR, "sw", "config.js");
const MANIFEST_PATH = join(BUNDLE_DIR, "manifest.json");
const POLICY_PATH = join(ROOT, "scripts", "bundle-policy.json");

export const STACK_NAME = "brain";
const CLIENT_ID_PATTERN = /^[A-Za-z0-9]{1,128}$/;

function httpsOrigin(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

// Valida las salidas del stack; devuelve los tres valores de sw/config.js o los problemas.
export function parseOutputs(outputs, stackName = STACK_NAME) {
  const stack = outputs?.[stackName];
  if (!stack || typeof stack !== "object") {
    return { ok: false, problems: [`falta el stack "${stackName}" en cdk-outputs.json`] };
  }
  const problems = [];
  const brain = httpsOrigin(stack.BrainUrl);
  const cognito = httpsOrigin(stack.CognitoDomain);
  if (!brain) problems.push("BrainUrl ausente o no es un origen https");
  if (!cognito) problems.push("CognitoDomain ausente o no es un origen https");
  if (!CLIENT_ID_PATTERN.test(stack.ExtensionClientId ?? "")) {
    problems.push("ExtensionClientId ausente o con formato inválido");
  }
  if (problems.length > 0) return { ok: false, problems };
  return {
    ok: true,
    values: { BRAIN_BASE_URL: brain, COGNITO_DOMAIN: cognito, CLIENT_ID: stack.ExtensionClientId },
  };
}

const literal = (value) => (value === null ? "null" : JSON.stringify(value));

// Texto completo de sw/config.js; con valores null reproduce el archivo versionado.
export function renderConfig({ BRAIN_BASE_URL = null, COGNITO_DOMAIN = null, CLIENT_ID = null }) {
  return [
    "// sw/config.js — Configuración del cerebro para el service worker (NFR1.1, NFR5.1).",
    "// Archivo generado por scripts/sync-brain-config.js a partir de infra/cdk-outputs.json.",
    "// Único lugar del bundle con la URL del cerebro y los datos públicos del proveedor",
    "// de identidad; vive fuera de lib/** y de web_accessible_resources.",
    "// Mientras u4 no esté desplegado, los valores quedan en null y BRAIN_CALL y",
    "// BRAIN_LOGIN responden brain_unavailable sin hacer fetch.",
    "",
    `export const BRAIN_BASE_URL = ${literal(BRAIN_BASE_URL)};`,
    `export const COGNITO_DOMAIN = ${literal(COGNITO_DOMAIN)};`,
    `export const CLIENT_ID = ${literal(CLIENT_ID)};`,
    "",
    'export const OAUTH_SCOPES = Object.freeze(["openid", "email"]);',
    "",
    "export const OPERATION_PATHS = Object.freeze({",
    '  "map-residue": "/map-residue",',
    '  interpret: "/interpret",',
    '  "waf-evaluate": "/waf-evaluate",',
    "});",
    "",
  ].join("\n");
}

// host_permissions = fijos de la política + los dos orígenes configurados.
export function updateManifestHosts(manifest, policy, values) {
  const derived = [values.BRAIN_BASE_URL, values.COGNITO_DOMAIN].map((origin) => `${origin}/*`);
  return {
    ...manifest,
    host_permissions: [...new Set([...policy.fixed_host_permissions, ...derived])],
  };
}

function main() {
  if (!existsSync(OUTPUTS_PATH)) {
    console.error("sync-brain-config: falta infra/cdk-outputs.json (cdk deploy --outputs-file).");
    process.exit(1);
  }
  const parsed = parseOutputs(JSON.parse(readFileSync(OUTPUTS_PATH, "utf8")));
  if (!parsed.ok) {
    console.error("sync-brain-config FALLÓ:");
    for (const problem of parsed.problems) console.error(`  - ${problem}`);
    process.exit(1);
  }
  const policy = JSON.parse(readFileSync(POLICY_PATH, "utf8"));
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  writeFileSync(CONFIG_PATH, renderConfig(parsed.values));
  const updated = updateManifestHosts(manifest, policy, parsed.values);
  writeFileSync(MANIFEST_PATH, `${JSON.stringify(updated, null, 2)}\n`);
  console.log("sync-brain-config OK — sw/config.js y host_permissions actualizados.");
  console.log("Siguiente: npm run format && npm run check:bundle, y commit de ambos archivos.");
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]).toLowerCase() : "";
if (invokedPath === fileURLToPath(import.meta.url).toLowerCase()) main();
