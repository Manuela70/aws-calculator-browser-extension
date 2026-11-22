// scripts/check-bundle.js — Verifica que el bundle cargado por Chrome no tenga
// dependencias de runtime empaquetadas (NFR5.8; regla "cero dependencias de runtime").
// Falla (código 1) si algún archivo de aws-calculator-extension/:
// - importa un paquete (especificador que no es relativo "./" o "../"),
// - referencia node_modules,
// - carga un <script src> remoto,
// o si la carpeta contiene node_modules/ o package.json.
// Solo herramienta de desarrollo; no forma parte del bundle.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const BUNDLE_DIR = join(ROOT, "aws-calculator-extension");

const STATIC_IMPORT = /(?:^|[\s;])(?:import|export)\s[^'"`]*?from\s*["']([^"']+)["']/g;
const BARE_IMPORT = /(?:^|[\s;])import\s*["']([^"']+)["']/g;
const DYNAMIC_IMPORT = /import\(\s*["']([^"']+)["']\s*\)/g;
const SCRIPT_SRC = /<script[^>]*\ssrc\s*=\s*["']([^"']+)["']/gi;

function listFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

function isRelative(specifier) {
  return specifier.startsWith("./") || specifier.startsWith("../");
}

function collectMatches(text, pattern) {
  return [...text.matchAll(pattern)].map((m) => m[1]);
}

function checkFile(file) {
  const problems = [];
  const text = readFileSync(file, "utf8");
  const rel = relative(ROOT, file);
  if (text.includes("node_modules")) problems.push(`${rel}: referencia node_modules`);
  if (file.endsWith(".js")) {
    const specifiers = [STATIC_IMPORT, BARE_IMPORT, DYNAMIC_IMPORT].flatMap((p) =>
      collectMatches(text, p),
    );
    for (const specifier of specifiers) {
      if (!isRelative(specifier)) problems.push(`${rel}: importa el paquete "${specifier}"`);
    }
  }
  if (file.endsWith(".html")) {
    for (const src of collectMatches(text, SCRIPT_SRC)) {
      if (/^[a-z]+:/i.test(src) || src.startsWith("//"))
        problems.push(`${rel}: <script src> remoto "${src}"`);
    }
  }
  return problems;
}

function main() {
  const problems = [];
  for (const forbidden of ["node_modules", "package.json"]) {
    if (existsSync(join(BUNDLE_DIR, forbidden)))
      problems.push(`aws-calculator-extension/${forbidden} no debe existir`);
  }
  const files = listFiles(BUNDLE_DIR).filter((f) => f.endsWith(".js") || f.endsWith(".html"));
  for (const file of files) problems.push(...checkFile(file));
  if (problems.length > 0) {
    console.error("check:bundle FALLÓ — dependencias de runtime en el bundle:");
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }
  console.log(`check:bundle OK — ${files.length} archivos revisados, sin dependencias de runtime.`);
}

main();
