// scripts/check-bundle.js — Verifica el bundle de aws-calculator-extension/ contra
// scripts/bundle-policy.json (NFR1.1, NFR4.1-NFR4.4, NFR5.1, NFR5.8, NFR7.3).
// Falla (código 1) si:
// - el manifest se desvía de la política: permisos, host_permissions (fijos + los
//   derivados de sw/config.js), CSP, web_accessible_resources, versión mínima,
//   service worker, clave "key", o declara permisos opcionales o externally_connectable;
// - el host del cerebro o del proveedor de identidad aparece fuera de sw/config.js y
//   host_permissions;
// - hay patrones de secreto (claves de AWS, claves privadas, claves de Anthropic,
//   tokens con forma de JWT, secretos de cliente OAuth);
// - hay URL de otros orígenes fuera de la documentación exceptuada;
// - hay dependencias de runtime (paquetes importados, node_modules, <script src> remoto,
//   package.json en el bundle).
// Solo herramienta de desarrollo; no forma parte del bundle.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const BUNDLE_DIR = join(ROOT, "aws-calculator-extension");
export const POLICY_PATH = join(ROOT, "scripts", "bundle-policy.json");

const TEXT_EXTENSIONS = [".js", ".json", ".html", ".css", ".md", ".txt"];

const STATIC_IMPORT = /(?:^|[\s;])(?:import|export)\s[^'"`]*?from\s*["']([^"']+)["']/g;
const BARE_IMPORT = /(?:^|[\s;])import\s*["']([^"']+)["']/g;
const DYNAMIC_IMPORT = /import\(\s*["']([^"']+)["']\s*\)/g;
const SCRIPT_SRC = /<script[^>]*\ssrc\s*=\s*["']([^"']+)["']/gi;
const URL_PATTERN = /https?:\/\/[^\s"'`)<>\]\\]+/g;

// Patrones de secreto (NFR5.1). El nombre del secreto de cliente OAuth se arma por
// partes para que este archivo no contenga el literal que busca.
export const SECRET_PATTERNS = Object.freeze([
  { name: "clave de acceso de AWS", pattern: /AKIA[0-9A-Z]{16}/ },
  { name: "clave privada", pattern: /-----BEGIN/ },
  { name: "clave de API de Anthropic", pattern: /sk-ant-/ },
  { name: "token con forma de JWT", pattern: /eyJ[A-Za-z0-9_-]{5,}\.eyJ[A-Za-z0-9_-]{5,}/ },
  { name: "secreto de cliente OAuth", pattern: new RegExp(["client", "secret"].join("_"), "i") },
]);

const toPosix = (path) => path.split(sep).join("/");
const sameSet = (a, b) =>
  a.length === b.length && [...a].sort().join("\n") === [...b].sort().join("\n");
const canonical = (value) => JSON.stringify(value);

export function loadPolicy(path = POLICY_PATH) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function parseUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

// Orígenes del cerebro y del proveedor de identidad definidos en sw/config.js.
export function configuredOrigins(config) {
  const origins = [];
  const problems = [];
  for (const name of ["BRAIN_BASE_URL", "COGNITO_DOMAIN"]) {
    const value = config[name];
    if (value === null || value === undefined) continue;
    const url = parseUrl(value);
    if (!url || url.protocol !== "https:" || url.pathname !== "/" || url.search) {
      problems.push(`sw/config.js: ${name} debe ser un origen https sin ruta ("${value}")`);
      continue;
    }
    origins.push(url.origin);
  }
  return { origins, problems };
}

export function expectedHosts(policy, config) {
  const derived = configuredOrigins(config).origins.map((origin) => `${origin}/*`);
  return [...new Set([...policy.fixed_host_permissions, ...derived])];
}

function checkExactSet(label, actual, expected) {
  if (!Array.isArray(actual)) return [`manifest: ${label} debe ser una lista`];
  if (new Set(actual).size !== actual.length) return [`manifest: ${label} tiene duplicados`];
  if (sameSet(actual, expected)) return [];
  const extra = actual.filter((item) => !expected.includes(item));
  const missing = expected.filter((item) => !actual.includes(item));
  return [`manifest: ${label} difiere de la política (sobra: [${extra}], falta: [${missing}])`];
}

function checkCsp(manifest, policy) {
  const problems = [];
  const csp = manifest.content_security_policy?.extension_pages ?? "";
  if (/unsafe-eval|unsafe-inline|wasm-unsafe-eval|https?:/i.test(csp)) {
    problems.push(`manifest: la CSP permite código inseguro o remoto ("${csp}")`);
  }
  if (canonical(manifest.content_security_policy) !== canonical(policy.content_security_policy)) {
    problems.push("manifest: content_security_policy difiere de la política");
  }
  return problems;
}

export function checkManifest(manifest, policy, config) {
  const problems = [...configuredOrigins(config).problems];
  if (manifest.manifest_version !== policy.manifest_version) problems.push("manifest: no es MV3");
  if (manifest.minimum_chrome_version !== policy.minimum_chrome_version) {
    problems.push(`manifest: minimum_chrome_version debe ser "${policy.minimum_chrome_version}"`);
  }
  if (canonical(manifest.background) !== canonical(policy.background)) {
    problems.push("manifest: background debe ser el service worker background.js como módulo");
  }
  problems.push(...checkExactSet("permissions", manifest.permissions, policy.permissions));
  problems.push(
    ...checkExactSet("host_permissions", manifest.host_permissions, expectedHosts(policy, config)),
  );
  for (const key of [
    "optional_permissions",
    "optional_host_permissions",
    "externally_connectable",
  ]) {
    if (key in manifest) problems.push(`manifest: ${key} no está permitido`);
  }
  problems.push(...checkCsp(manifest, policy));
  if (canonical(manifest.web_accessible_resources) !== canonical(policy.web_accessible_resources)) {
    problems.push("manifest: web_accessible_resources difiere de la política");
  }
  const expectedKey = policy.key ?? undefined;
  if (manifest.key !== expectedKey) {
    problems.push("manifest: la clave key no coincide con bundle-policy.json (null = ausente)");
  }
  return problems;
}

export function scanSecrets(files) {
  const problems = [];
  for (const { rel, text } of files) {
    for (const { name, pattern } of SECRET_PATTERNS) {
      if (pattern.test(text)) problems.push(`${rel}: posible secreto (${name})`);
    }
  }
  return problems;
}

function originOf(url) {
  return parseUrl(url)?.origin ?? null;
}

// URL de otros orígenes en el bundle (u5 NFR4.2 en lib/**). Los orígenes del cerebro
// solo se admiten en el archivo de configuración; la documentación exceptuada se omite.
export function scanForeignUrls(files, policy, config) {
  const brainOrigins = configuredOrigins(config).origins;
  const problems = [];
  for (const { rel, text } of files) {
    if (policy.url_scan_exempt_files.includes(rel)) continue;
    for (const [url] of text.matchAll(URL_PATTERN)) {
      const origin = originOf(url);
      if (origin && policy.allowed_url_origins.includes(origin)) continue;
      if (origin && brainOrigins.includes(origin) && rel === policy.brain_config_file) continue;
      if (origin && brainOrigins.includes(origin) && rel === "manifest.json") continue;
      problems.push(`${rel}: URL de otro origen "${url}"`);
    }
  }
  return problems;
}

// El host del cerebro o del proveedor de identidad solo vive en sw/config.js y en
// host_permissions del manifest (NFR1.1).
export function checkBrainHostPlacement(files, policy, config) {
  const hostnames = configuredOrigins(config).origins.map((origin) => new URL(origin).hostname);
  const problems = [];
  for (const { rel, text } of files) {
    if (rel === policy.brain_config_file || rel === "manifest.json") continue;
    for (const hostname of hostnames) {
      if (text.includes(hostname)) problems.push(`${rel}: contiene el host "${hostname}"`);
    }
  }
  return problems;
}

const isRelative = (specifier) => specifier.startsWith("./") || specifier.startsWith("../");
const collectMatches = (text, pattern) => [...text.matchAll(pattern)].map((m) => m[1]);

// Dependencias de runtime (NFR5.8): paquetes importados, node_modules, <script src> remoto.
export function checkDependencies(files) {
  const problems = [];
  for (const { rel, text } of files) {
    if (!rel.endsWith(".js") && !rel.endsWith(".html")) continue;
    if (text.includes("node_modules")) problems.push(`${rel}: referencia node_modules`);
    if (rel.endsWith(".js")) {
      const specifiers = [STATIC_IMPORT, BARE_IMPORT, DYNAMIC_IMPORT].flatMap((p) =>
        collectMatches(text, p),
      );
      for (const specifier of specifiers) {
        if (!isRelative(specifier)) problems.push(`${rel}: importa el paquete "${specifier}"`);
      }
    } else {
      for (const src of collectMatches(text, SCRIPT_SRC)) {
        if (/^[a-z]+:/i.test(src) || src.startsWith("//")) {
          problems.push(`${rel}: <script src> remoto "${src}"`);
        }
      }
    }
  }
  return problems;
}

export function checkForbiddenEntries(paths) {
  const problems = [];
  if (paths.some((path) => path.split("/").includes("node_modules"))) {
    problems.push("aws-calculator-extension/node_modules no debe existir");
  }
  if (paths.includes("package.json")) {
    problems.push("aws-calculator-extension/package.json no debe existir");
  }
  return problems;
}

export function runChecks({ manifest, policy, config, files, paths }) {
  return [
    ...checkForbiddenEntries(paths),
    ...checkManifest(manifest, policy, config),
    ...scanSecrets(files),
    ...scanForeignUrls(files, policy, config),
    ...checkBrainHostPlacement(files, policy, config),
    ...checkDependencies(files),
  ];
}

function listFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

// Lee el bundle: todas las rutas relativas y el texto de los archivos de texto.
export function readBundle(dir = BUNDLE_DIR) {
  const fullPaths = listFiles(dir);
  const paths = fullPaths.map((full) => toPosix(relative(dir, full)));
  const files = fullPaths
    .filter((full) => TEXT_EXTENSIONS.some((ext) => full.endsWith(ext)))
    .map((full) => ({ rel: toPosix(relative(dir, full)), text: readFileSync(full, "utf8") }));
  return { paths, files };
}

export async function loadBrainConfig(policy, dir = BUNDLE_DIR) {
  const module = await import(pathToFileURL(join(dir, policy.brain_config_file)).href);
  return { ...module };
}

async function main() {
  const policy = loadPolicy();
  const config = await loadBrainConfig(policy);
  const manifest = JSON.parse(readFileSync(join(BUNDLE_DIR, "manifest.json"), "utf8"));
  const { paths, files } = readBundle();
  const problems = runChecks({ manifest, policy, config, files, paths });
  if (problems.length > 0) {
    console.error("check:bundle FALLÓ — el bundle se desvía de scripts/bundle-policy.json:");
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }
  console.log(`check:bundle OK — ${files.length} archivos revisados contra la política.`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]).toLowerCase() : "";
if (invokedPath === fileURLToPath(import.meta.url).toLowerCase()) {
  main().catch((error) => {
    console.error("check:bundle no pudo ejecutarse:", error?.message);
    process.exit(1);
  });
}
