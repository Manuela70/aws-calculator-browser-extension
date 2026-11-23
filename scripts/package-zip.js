// scripts/package-zip.js — Genera el .zip de distribución de la extensión (NFR7.2).
// Sin build step: comprime aws-calculator-extension/ tal como está, sin pruebas,
// sin documentación (*.md, que incluye REVIVAL_PLAN.md y SMOKE.md) y sin archivos
// ocultos. Usa la utilidad del sistema (tar -a en Windows 10 o posterior, zip en
// otros sistemas) y luego verifica que las entradas del .zip sean exactamente la
// lista esperada. node_modules, tests/ y el workflow quedan fuera del directorio.
// Solo herramienta de desarrollo; no forma parte del bundle.

import { mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const BUNDLE_DIR = join(ROOT, "aws-calculator-extension");
const DIST_DIR = join(ROOT, "dist");

// Acepta separadores de Windows en cualquier sistema (los nombres del bundle no
// llevan barra invertida).
const toPosix = (path) => path.replace(/\\/g, "/");

function isExcluded(relPath) {
  const segments = relPath.split("/");
  const name = segments.at(-1);
  return (
    segments.some((segment) => segment.startsWith(".")) ||
    segments.includes("__tests__") ||
    segments.includes("node_modules") ||
    name.endsWith(".test.js") ||
    name.toLowerCase().endsWith(".md")
  );
}

// Lista ordenada de archivos que entran al .zip.
export function selectFiles(relPaths) {
  return relPaths
    .map(toPosix)
    .filter((path) => !isExcluded(path))
    .sort();
}

// Compara las entradas listadas del .zip con la lista esperada (ignora directorios).
export function verifyEntries(entries, expected) {
  const files = entries
    .map((entry) => toPosix(entry.trim()).replace(/^\.\//, ""))
    .filter((entry) => entry.length > 0 && !entry.endsWith("/"));
  const missing = expected.filter((path) => !files.includes(path));
  const extra = files.filter((path) => !expected.includes(path));
  return { ok: missing.length === 0 && extra.length === 0, missing, extra };
}

export function archiveCommand(platform, zipPath, files) {
  if (platform === "win32") return { command: "tar", args: ["-a", "-c", "-f", zipPath, ...files] };
  return { command: "zip", args: ["-X", "-q", zipPath, ...files] };
}

export function listCommand(platform, zipPath) {
  if (platform === "win32") return { command: "tar", args: ["-t", "-f", zipPath] };
  return { command: "unzip", args: ["-Z1", zipPath] };
}

function listFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

function run({ command, args }, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.error || result.status !== 0) {
    const reason = result.error?.message ?? result.stderr?.trim() ?? `código ${result.status}`;
    throw new Error(`${command} falló: ${reason}`);
  }
  return result.stdout;
}

function main() {
  const manifest = JSON.parse(readFileSync(join(BUNDLE_DIR, "manifest.json"), "utf8"));
  const files = selectFiles(listFiles(BUNDLE_DIR).map((full) => relative(BUNDLE_DIR, full)));
  mkdirSync(DIST_DIR, { recursive: true });
  const zipPath = join(DIST_DIR, `aws-calculator-extension-${manifest.version}.zip`);
  rmSync(zipPath, { force: true });
  run(archiveCommand(process.platform, zipPath, files), BUNDLE_DIR);
  const listed = run(listCommand(process.platform, zipPath), BUNDLE_DIR).split(/\r?\n/);
  const check = verifyEntries(listed, files);
  if (!check.ok) {
    rmSync(zipPath, { force: true });
    console.error("package FALLÓ — el .zip no coincide con la lista esperada:");
    for (const path of check.missing) console.error(`  - falta ${path}`);
    for (const path of check.extra) console.error(`  - sobra ${path}`);
    process.exit(1);
  }
  console.log(`package OK — ${files.length} archivos en ${toPosix(relative(ROOT, zipPath))}`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]).toLowerCase() : "";
if (invokedPath === fileURLToPath(import.meta.url).toLowerCase()) {
  try {
    main();
  } catch (error) {
    console.error("package no pudo ejecutarse:", error.message);
    process.exit(1);
  }
}
