// eslint.config.js: el bloque del panel (decisión 12; NFR5.1, NFR5.4, NFR5.5, NFR6.1).
// ESLint tarda en cargar la primera vez: cada prueba tiene un tope propio de 30 s.
import { describe, it, expect } from "vitest";
import { ESLint } from "eslint";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const eslint = new ESLint({ cwd: ROOT });
const EXT = "aws-calculator-extension";
const SLOW = { timeout: 30000 };

async function ruleIds(code, filePath) {
  const [result] = await eslint.lintText(code, { filePath: `${ROOT}${filePath}` });
  return result.messages.map((message) => message.ruleId);
}

async function selectorsOf(filePath) {
  const config = await eslint.calculateConfigForFile(`${ROOT}${filePath}`);
  return config.rules["no-restricted-syntax"].slice(1).map((entry) => entry.selector);
}

describe("eslint del panel lateral", () => {
  it(
    "sidepanel.js y lib/panel/** suman selectorSyntax y no pierden las prohibiciones base",
    SLOW,
    async () => {
      for (const file of [`${EXT}/sidepanel.js`, `${EXT}/lib/panel/effects.js`]) {
        const selectors = await selectorsOf(file);
        expect(selectors.some((s) => s.includes("innerHTML"))).toBe(true);
        expect(selectors.some((s) => s.includes("awsui_"))).toBe(true);
        expect(selectors.some((s) => s.includes("'style'"))).toBe(true);
        expect(selectors.some((s) => s.includes("setAttribute"))).toBe(true);
        expect(selectors.some((s) => s.includes("'session'"))).toBe(true);
      }
    },
  );

  it(
    "prohíbe HTML, estilos en línea, on* asignados y setAttribute con nombre variable",
    SLOW,
    async () => {
      const file = `${EXT}/lib/panel/render/dom.js`;
      const cases = [
        "export const a = (el, v) => { el.innerHTML = v; };\n",
        "export const b = (el) => { el.style.width = '1px'; };\n",
        "export const c = (el, f) => { el.onclick = f; };\n",
        "export const d = (el, n, v) => el.setAttribute(n, v);\n",
        "export const e = (el, v) => el.insertAdjacentHTML('beforeend', v);\n",
      ];
      for (const code of cases)
        expect(await ruleIds(code, file), code).toContain("no-restricted-syntax");
      const literal = 'export const ok = (el) => el.setAttribute("aria-busy", "true");\n';
      expect(await ruleIds(literal, file)).toEqual([]);
      const dynamic = 'export const run = () => [eval("1"), new Function("return 1")];\n';
      expect(await ruleIds(dynamic, `${EXT}/sidepanel.js`)).toEqual(
        expect.arrayContaining(["no-eval", "no-new-func"]),
      );
    },
  );

  it("sin fetch ni red propia y sin chrome.storage.local/sync en el panel", SLOW, async () => {
    const net = 'export const go = () => fetch("https://calculator.aws");\n';
    expect(await ruleIds(net, `${EXT}/sidepanel.js`)).toContain("no-restricted-globals");
    const xhr = "export const go = () => new XMLHttpRequest();\n";
    expect(await ruleIds(xhr, `${EXT}/lib/panel/effects.js`)).toContain("no-restricted-globals");
    const local = 'export const r = () => chrome.storage.local.get("k");\n';
    expect(await ruleIds(local, `${EXT}/sidepanel.js`)).toContain("no-restricted-syntax");
    const sync = 'export const r = () => chrome.storage.sync.get("k");\n';
    expect(await ruleIds(sync, `${EXT}/lib/panel/tab-store.js`)).toContain("no-restricted-syntax");
  });

  it("chrome.storage.session solo en tab-store.js", SLOW, async () => {
    const code = 'export const r = () => chrome.storage.session.get("brain:session");\n';
    expect(await ruleIds(code, `${EXT}/lib/panel/effects.js`)).toContain("no-restricted-syntax");
    expect(await ruleIds(code, `${EXT}/sidepanel.js`)).toContain("no-restricted-syntax");
    expect(await ruleIds(code, `${EXT}/lib/panel/tab-store.js`)).toEqual([]);
  });

  it(
    "la Zona A del panel no usa document ni chrome; el service worker conserva su bloque",
    SLOW,
    async () => {
      const dom = "export const t = () => document.title;\n";
      const api = "export const id = () => chrome.runtime.id;\n";
      for (const file of ["panel-state", "waf-model", "history-model", "timers"]) {
        expect(await ruleIds(dom, `${EXT}/lib/panel/${file}.js`)).toContain(
          "no-restricted-globals",
        );
      }
      expect(await ruleIds(api, `${EXT}/lib/messages-es.js`)).toContain("no-restricted-globals");
      expect(await ruleIds(dom, `${EXT}/lib/panel/effects.js`)).toEqual([]);
      const swSelectors = await selectorsOf(`${EXT}/sw/router.js`);
      expect(swSelectors.some((s) => s.includes("storage"))).toBe(true);
      expect(swSelectors.some((s) => s.includes("awsui_"))).toBe(true);
    },
  );
});
