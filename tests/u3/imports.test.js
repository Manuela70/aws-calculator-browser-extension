// Prueba estructural de U3 (NFR7.1, NFR1.1): la capa de mapeo solo importa de
// lib/mapping/**, lib/messages*.js y lib/dom/aria-label.js, y no toca el DOM
// ni las APIs chrome.*. Solo usa fs de Node; sin dependencias nuevas.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const LIB = fileURLToPath(new URL("../../aws-calculator-extension/lib/", import.meta.url));
const MAPPING = join(LIB, "mapping");
const ARIA_LABEL = join(LIB, "dom", "aria-label.js");

const STATIC_IMPORT = /(?:^|[\s;])(?:import|export)\s[^'"`]*?from\s*["']([^"']+)["']/g;
const BARE_IMPORT = /(?:^|[\s;])import\s*["']([^"']+)["']/g;
const DYNAMIC_IMPORT = /import\(\s*["']([^"']+)["']\s*\)/g;

function listJsFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return listJsFiles(full);
    return full.endsWith(".js") ? [full] : [];
  });
}

// Quita comentarios de bloque y de línea (sin tocar "://" de URLs).
export function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");
}

export function extractSpecifiers(source) {
  const code = stripComments(source);
  return [STATIC_IMPORT, BARE_IMPORT, DYNAMIC_IMPORT].flatMap((pattern) =>
    [...code.matchAll(pattern)].map((match) => match[1]),
  );
}

// Ruta del import relativa a lib/, con "/" como separador.
function libPathOf(file, specifier) {
  return relative(LIB, resolve(dirname(file), specifier))
    .split(sep)
    .join("/");
}

export function isAllowedTarget(libPath) {
  return (
    (libPath.startsWith("mapping/") && !libPath.includes("..")) ||
    /^messages[^/]*\.js$/.test(libPath) ||
    libPath === "dom/aria-label.js"
  );
}

const u3Files = () => [...listJsFiles(MAPPING), ARIA_LABEL];

describe("estructura de imports de U3 (NFR7.1)", () => {
  it("el extractor reconoce import, export ... from e import() y omite comentarios", () => {
    const sample = [
      'import { a } from "./a.js";',
      'export { b } from "../messages.js";',
      'const c = await import("../dom/form-scanner.js");',
      '// import { x } from "../panel/panel-state.js";',
      '/* import "../rpa/wait.js"; */',
      'import "./side-effect.js";',
    ].join("\n");
    expect(extractSpecifiers(sample)).toEqual([
      "./a.js",
      "../messages.js",
      "./side-effect.js",
      "../dom/form-scanner.js",
    ]);
    expect(isAllowedTarget("mapping/option-match.js")).toBe(true);
    expect(isAllowedTarget("messages-es.js")).toBe(true);
    expect(isAllowedTarget("dom/aria-label.js")).toBe(true);
    expect(isAllowedTarget("dom/dom-utils.js")).toBe(false);
    expect(isAllowedTarget("panel/panel-state.js")).toBe(false);
  });

  it("lib/mapping/** y aria-label.js solo importan destinos permitidos", () => {
    const violations = [];
    for (const file of u3Files()) {
      for (const specifier of extractSpecifiers(readFileSync(file, "utf8"))) {
        const isRelative = specifier.startsWith("./") || specifier.startsWith("../");
        const target = isRelative ? libPathOf(file, specifier) : specifier;
        if (!isRelative || !isAllowedTarget(target)) {
          violations.push(`${relative(LIB, file)} → ${specifier}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("el código sin comentarios no usa document. ni chrome. (NFR4.1, NFR7.1)", () => {
    const violations = u3Files().filter((file) =>
      /\b(?:document|chrome)\./.test(stripComments(readFileSync(file, "utf8"))),
    );
    expect(violations).toEqual([]);
  });
});
