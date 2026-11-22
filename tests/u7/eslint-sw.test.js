// eslint.config.js: el bloque del service worker extiende las reglas base (NFR5.2, NFR5.3, NFR7.3).
import { describe, it, expect } from "vitest";
import { ESLint } from "eslint";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const eslint = new ESLint({ cwd: ROOT });
const EXT = "aws-calculator-extension";

async function ruleIds(code, filePath) {
  const [result] = await eslint.lintText(code, { filePath: `${ROOT}${filePath}` });
  return result.messages.map((message) => message.ruleId);
}

describe("eslint del service worker", () => {
  it("fetch solo en sw/brain-client.js y sw/auth-flow.js", async () => {
    const code = 'export const go = () => fetch("https://calculator.aws");\n';
    expect(await ruleIds(code, `${EXT}/sw/router.js`)).toContain("no-restricted-globals");
    expect(await ruleIds(code, `${EXT}/background.js`)).toContain("no-restricted-globals");
    expect(await ruleIds(code, `${EXT}/sw/brain-client.js`)).not.toContain("no-restricted-globals");
    expect(await ruleIds(code, `${EXT}/sw/auth-flow.js`)).not.toContain("no-restricted-globals");
  });

  it("prohíbe chrome.storage.local y chrome.storage.sync en sw/** y background.js", async () => {
    const local = 'export const read = () => chrome.storage.local.get("k");\n';
    const sync = 'export const read = () => chrome.storage.sync.get("k");\n';
    const session = 'export const read = () => chrome.storage.session.get("k");\n';
    expect(await ruleIds(local, `${EXT}/sw/session.js`)).toContain("no-restricted-syntax");
    expect(await ruleIds(sync, `${EXT}/background.js`)).toContain("no-restricted-syntax");
    expect(await ruleIds(session, `${EXT}/sw/session.js`)).toEqual([]);
  });

  it("no pierde las prohibiciones base (innerHTML, eval, new Function) en los archivos con red", async () => {
    const html = "export const put = (el, v) => { el.innerHTML = v; };\n";
    const dynamic = 'export const run = () => [eval("1"), new Function("return 1")];\n';
    expect(await ruleIds(html, `${EXT}/sw/brain-client.js`)).toContain("no-restricted-syntax");
    const ids = await ruleIds(dynamic, `${EXT}/sw/auth-flow.js`);
    expect(ids).toEqual(expect.arrayContaining(["no-eval", "no-new-func"]));
    const config = await eslint.calculateConfigForFile(`${ROOT}${EXT}/sw/brain-client.js`);
    const selectors = config.rules["no-restricted-syntax"].slice(1).map((entry) => entry.selector);
    expect(selectors.some((selector) => selector.includes("innerHTML"))).toBe(true);
    expect(selectors.some((selector) => selector.includes("storage"))).toBe(true);
  });

  it("brain-port no puede usar fetch ni chrome.storage", async () => {
    const path = `${EXT}/lib/connection/brain-port.js`;
    expect(await ruleIds('export const go = () => fetch("x");\n', path)).toContain(
      "no-restricted-globals",
    );
    expect(await ruleIds("export const s = () => chrome.storage.session;\n", path)).toContain(
      "no-restricted-properties",
    );
  });

  it("el código real del service worker y de brain-port pasa el lint", async () => {
    const results = await eslint.lintFiles([
      `${EXT}/sw/`,
      `${EXT}/background.js`,
      `${EXT}/lib/connection/brain-port.js`,
    ]);
    const problems = results.flatMap((result) =>
      result.messages.map((m) => `${result.filePath}: ${m.ruleId}`),
    );
    expect(problems).toEqual([]);
  });
});
