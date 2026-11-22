// Pruebas estructurales de U2.
// - NFR7.1: lib/input/** solo importa de lib/input/**, lib/messages*.js y
//   lib/mapping/region-map.js (tabla de regiones de u1, datos puros admitidos
//   de forma explícita). Así la capa de entrada sigue siendo extraíble.
// - NFR4.1: sin red propia ni APIs chrome.* en lib/input/**.
// - NFR3.6: las salidas públicas de U2 son texto plano, sin marcado generado.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import {
  INPUT_ERROR_CODES,
  NL_PRIVACY_NOTICE,
  makeInputError,
} from "../../aws-calculator-extension/lib/input/input-errors.js";
import { normalize } from "../../aws-calculator-extension/lib/input/input-normalizer.js";
import { makeRunInput, toText } from "./fixtures.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const LIB = join(ROOT, "aws-calculator-extension", "lib");
const INPUT_DIR = join(LIB, "input");

const SPECIFIER_PATTERNS = [
  /(?:^|[\s;])import\s[^'"`]*?from\s*["']([^"']+)["']/g,
  /(?:^|[\s;])export\s[^'"`]*?from\s*["']([^"']+)["']/g,
  /(?:^|[\s;])import\s*["']([^"']+)["']/g,
  /import\(\s*["']([^"']+)["']\s*\)/g,
];

function listJsFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return listJsFiles(full);
    return entry.name.endsWith(".js") ? [full] : [];
  });
}

function toPosix(path) {
  return path.split("\\").join("/");
}

function isAllowedTarget(target) {
  const rel = toPosix(relative(LIB, target));
  return (
    rel.startsWith("input/") || /^messages[^/]*\.js$/.test(rel) || rel === "mapping/region-map.js"
  );
}

function importsOf(file) {
  const text = readFileSync(file, "utf8");
  return SPECIFIER_PATTERNS.flatMap((pattern) => [...text.matchAll(pattern)].map((m) => m[1]));
}

describe("estructura de lib/input/** (NFR7.1, NFR4.1)", () => {
  const files = listJsFiles(INPUT_DIR);

  it("encuentra los cinco módulos de U2", () => {
    const names = files.map((file) => toPosix(relative(INPUT_DIR, file))).sort();
    expect(names).toEqual([
      "input-errors.js",
      "input-normalizer.js",
      "input-schema.js",
      "json-parser.js",
      "nl-interpreter.js",
    ]);
  });

  it("solo importa rutas relativas dentro de lo permitido", () => {
    const isViolation = (file, spec) => {
      const isRelative = spec.startsWith("./") || spec.startsWith("../");
      return !isRelative || !isAllowedTarget(resolve(dirname(file), spec));
    };
    const violations = files.flatMap((file) =>
      importsOf(file)
        .filter((spec) => isViolation(file, spec))
        .map((spec) => `${toPosix(relative(ROOT, file))} → ${spec}`),
    );
    expect(violations).toEqual([]);
    expect(isAllowedTarget(join(LIB, "rpa", "orchestrator.js"))).toBe(false);
  });

  it("no usa fetch, XMLHttpRequest, chrome.*, eval ni new Function", () => {
    const forbidden = /\bfetch\s*\(|XMLHttpRequest|\bchrome\.|\beval\s*\(|new\s+Function\b/;
    const offenders = files.filter((file) => forbidden.test(readFileSync(file, "utf8")));
    expect(offenders.map((file) => toPosix(relative(ROOT, file)))).toEqual([]);
  });
});

describe("salidas sin marcado (NFR3.6)", () => {
  const details = {
    service: "Amazon S3",
    serviceIndex: 0,
    key: "fields",
    limit: "services",
    maxLength: 2000,
    region: "xx-1",
    retryAfterSeconds: 5,
    fragments: [{ fragment: "100 GB", service: "S3 Standard", reason: "ambiguous_field" }],
  };

  it("ningún mensaje de InputError ni el aviso de privacidad contiene < o >", () => {
    const texts = Object.values(INPUT_ERROR_CODES).map(
      (code) => makeInputError(code, details).message,
    );
    texts.push(NL_PRIVACY_NOTICE);
    expect(texts.filter((text) => /[<>]/.test(text))).toEqual([]);
  });

  it("un NormalizedRun serializado no agrega marcado a la entrada", async () => {
    const result = await normalize(
      { format: "json", text: toText(makeRunInput()) },
      { interpretNaturalLanguage: null },
    );
    expect(JSON.stringify(result)).not.toMatch(/[<>]/);
  });
});
