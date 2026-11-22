// Reglas de lint que sostienen el diseño de U5 (NFR2.1, NFR4.1, NFR5.1, NFR5.2, NFR7.1).
// Comprueba que el bloque del content script EXTIENDE las prohibiciones base
// (no las reemplaza) y que cada regla dispara sobre un ejemplo.
import { describe, it, expect } from "vitest";
import { ESLint } from "eslint";

const eslint = new ESLint();
const EXT = "aws-calculator-extension";

function optionsOf(config, rule) {
  return config.rules[rule].slice(1);
}

async function messagesFor(code, filePath) {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.map((m) => `${m.ruleId}: ${m.message}`);
}

describe("eslint.config.js (U5)", () => {
  it("lib/dom conserva las prohibiciones base y suma las del content script", async () => {
    const config = await eslint.calculateConfigForFile(`${EXT}/lib/dom/dom-resolver.js`);
    const globals = optionsOf(config, "no-restricted-globals").map((g) => g.name);
    expect(globals).toEqual(
      expect.arrayContaining(["fetch", "XMLHttpRequest", "WebSocket", "EventSource"]),
    );
    const properties = optionsOf(config, "no-restricted-properties").map(
      (p) => `${p.object}.${p.property}`,
    );
    expect(properties).toEqual(
      expect.arrayContaining([
        "window.fetch",
        "globalThis.fetch",
        "self.fetch",
        "chrome.storage",
        "document.write",
      ]),
    );
    const syntax = optionsOf(config, "no-restricted-syntax").map((s) => s.selector);
    expect(syntax.some((s) => s.includes("innerHTML"))).toBe(true);
    expect(syntax.some((s) => s.includes("awsui_"))).toBe(true);
  });

  it("la capa de mapeo de U3 y content.js quedan dentro del bloque del content script", async () => {
    for (const file of [`${EXT}/lib/mapping/residue-resolver.js`, `${EXT}/content.js`]) {
      const config = await eslint.calculateConfigForFile(file);
      const properties = optionsOf(config, "no-restricted-properties").map(
        (p) => `${p.object}.${p.property}`,
      );
      expect(properties).toContain("chrome.storage");
    }
  });

  it("fuera de selectors.js prohíbe clases de CloudScape y textos de botón (NFR2.1)", async () => {
    const file = `${EXT}/lib/dom/dom-resolver.js`;
    const messages = await messagesFor(
      'export const a = "[class*=awsui_card]";\nexport const b = "Save and add service";\n',
      file,
    );
    expect(messages.filter((m) => m.startsWith("no-restricted-syntax"))).toHaveLength(2);
    const selectors = await messagesFor(
      'export const a = "[class*=awsui_card]";\nexport const b = "Save";\n',
      `${EXT}/lib/dom/selectors.js`,
    );
    expect(selectors).toEqual([]);
  });

  it("el content script no puede usar red propia, chrome.storage ni HTML crudo", async () => {
    const messages = await messagesFor(
      [
        "export function f(el) {",
        "  fetch('/x');",
        "  new WebSocket('wss://x');",
        "  chrome.storage.local.get('k');",
        "  el.innerHTML = 'x';",
        "  document.write('x');",
        "}",
        "",
      ].join("\n"),
      `${EXT}/lib/rpa/orchestrator.js`,
    );
    expect(messages.join("\n")).toMatch(/no-restricted-globals: .*fetch/);
    expect(messages.join("\n")).toMatch(/WebSocket/);
    expect(messages.join("\n")).toMatch(/chrome\.storage/);
    expect(messages.join("\n")).toMatch(/no-restricted-syntax: Prohibido insertar HTML/);
    expect(messages.join("\n")).toMatch(/document\.write/);
  });

  it("la Zona A no usa document ni chrome ni importa la Zona B (NFR7.1)", async () => {
    const messages = await messagesFor(
      [
        'import { SELECTORS } from "./selectors.js";',
        "export const x = () => [SELECTORS, document.title, chrome.runtime.id];",
        "",
      ].join("\n"),
      `${EXT}/lib/dom/cascade.js`,
    );
    const text = messages.join("\n");
    expect(text).toMatch(/no-restricted-imports/);
    expect(text).toMatch(/no-restricted-globals: .*DOM/);
    expect(text).toMatch(/no-restricted-globals: .*chrome/);
    const zoneB = await messagesFor(
      "export const t = () => document.title;\n",
      `${EXT}/lib/dom/dom-utils.js`,
    );
    expect(zoneB).toEqual([]);
  });
});
