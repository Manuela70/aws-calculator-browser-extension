// scripts/check-bundle.js: política del bundle (NFR1.1, NFR4.1-NFR4.4, NFR5.1, NFR7.3).
// Cada caso parte del manifest y la política reales con una sola desviación.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  loadPolicy,
  loadBrainConfig,
  readBundle,
  runChecks,
  checkManifest,
  expectedHosts,
  scanSecrets,
  scanForeignUrls,
  checkBrainHostPlacement,
  checkDependencies,
  checkForbiddenEntries,
} from "../../scripts/check-bundle.js";

const manifestPath = fileURLToPath(
  new URL("../../aws-calculator-extension/manifest.json", import.meta.url),
);
const realManifest = () => JSON.parse(readFileSync(manifestPath, "utf8"));
const policy = loadPolicy();
const NULLS = { BRAIN_BASE_URL: null, COGNITO_DOMAIN: null, CLIENT_ID: null };
// Valores ficticios de prueba.
const CONFIGURED = {
  BRAIN_BASE_URL: "https://brain.example.test",
  COGNITO_DOMAIN: "https://login.auth.us-east-1.amazoncognito.com",
  CLIENT_ID: "fakeclient",
};
const file = (rel, text) => ({ rel, text });

describe("check-bundle", () => {
  it("el bundle y el manifest actuales pasan todos los chequeos", async () => {
    const config = await loadBrainConfig(policy);
    const { paths, files } = readBundle();
    expect(config.BRAIN_BASE_URL).toBeNull();
    expect(runChecks({ manifest: realManifest(), policy, config, files, paths })).toEqual([]);
  });

  it("host de más o de menos en host_permissions falla (conjunto exacto)", () => {
    const extra = {
      ...realManifest(),
      host_permissions: ["https://calculator.aws/*", "https://dnd5zrqcec4or.cloudfront.net/*"],
    };
    expect(checkManifest(extra, policy, NULLS).join()).toMatch(/host_permissions.*sobra/);
    expect(checkManifest(realManifest(), policy, CONFIGURED).join()).toMatch(
      /falta.*brain\.example/,
    );
    const complete = { ...realManifest(), host_permissions: expectedHosts(policy, CONFIGURED) };
    expect(checkManifest(complete, policy, CONFIGURED)).toEqual([]);
    expect(expectedHosts(policy, CONFIGURED)).toHaveLength(3);
  });

  it("un permiso extra, permisos opcionales o externally_connectable fallan", () => {
    const extra = { ...realManifest(), permissions: [...realManifest().permissions, "cookies"] };
    expect(checkManifest(extra, policy, NULLS).join()).toMatch(/permissions/);
    const optional = { ...realManifest(), optional_host_permissions: ["<all_urls>"] };
    expect(checkManifest(optional, policy, NULLS).join()).toMatch(/optional_host_permissions/);
    const external = {
      ...realManifest(),
      externally_connectable: { matches: ["https://x.test/*"] },
    };
    expect(checkManifest(external, policy, NULLS).join()).toMatch(/externally_connectable/);
  });

  it("una CSP con unsafe-eval o la versión mínima equivocada falla", () => {
    const csp = {
      ...realManifest(),
      content_security_policy: {
        extension_pages: "script-src 'self' 'unsafe-eval'; object-src 'self'",
      },
    };
    expect(checkManifest(csp, policy, NULLS).join()).toMatch(/código inseguro/);
    const old = { ...realManifest(), minimum_chrome_version: "116" };
    expect(checkManifest(old, policy, NULLS).join()).toMatch(/minimum_chrome_version/);
  });

  it("una clave key distinta de la política falla (null = ausente)", () => {
    const withKey = { ...realManifest(), key: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A" };
    expect(checkManifest(withKey, policy, NULLS).join()).toMatch(/key/);
    const pinned = { ...policy, key: "abc" };
    expect(checkManifest({ ...realManifest(), key: "abc" }, pinned, NULLS)).toEqual([]);
  });

  it("detecta secretos: JWT, clave de AWS, clave privada, clave de Anthropic", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.firma";
    const problems = scanSecrets([
      file("lib/x.js", `const t = "${jwt}";`),
      file("sw/y.js", `const k = "AKIA${"A".repeat(16)}";`),
      file("z.txt", "-----BEGIN PRIVATE KEY-----"),
      file("w.js", "sk-ant-api03-xyz"),
      file("ok.js", "const ok = 1;"),
    ]);
    expect(problems).toHaveLength(4);
    expect(problems[0]).toMatch(/JWT/);
  });

  it("una URL n8n en lib/** falla; la documentación exceptuada no", () => {
    const n8n = "https://alguien.app.n8n.cloud/webhook/x";
    expect(
      scanForeignUrls([file("lib/mapping/a.js", `fetchTo("${n8n}")`)], policy, NULLS),
    ).toHaveLength(1);
    expect(scanForeignUrls([file("REVIVAL_PLAN.md", n8n)], policy, NULLS)).toEqual([]);
    expect(
      scanForeignUrls([file("lib/b.js", '"https://calculator.aws/#/estimate"')], policy, NULLS),
    ).toEqual([]);
  });

  it("el host del cerebro en un tercer archivo falla; en sw/config.js y el manifest no", () => {
    const files = [
      file("sw/config.js", 'export const BRAIN_BASE_URL = "https://brain.example.test";'),
      file("manifest.json", '"https://brain.example.test/*"'),
      file("lib/connection/x.js", "// brain.example.test"),
    ];
    expect(checkBrainHostPlacement(files, policy, CONFIGURED)).toEqual([
      'lib/connection/x.js: contiene el host "brain.example.test"',
    ]);
    expect(scanForeignUrls(files.slice(0, 2), policy, CONFIGURED)).toEqual([]);
    const bad = { ...CONFIGURED, BRAIN_BASE_URL: "http://brain.example.test/api" };
    expect(checkManifest(realManifest(), policy, bad).join()).toMatch(/origen https/);
  });

  it("dependencias de runtime: paquete importado, script remoto, node_modules y package.json", () => {
    expect(checkDependencies([file("a.js", 'import x from "lodash";')])).toHaveLength(1);
    expect(
      checkDependencies([file("p.html", '<script src="https://cdn.test/x.js"></script>')]),
    ).toHaveLength(1);
    expect(checkDependencies([file("a.js", 'import { y } from "./y.js";')])).toEqual([]);
    expect(checkForbiddenEntries(["package.json", "node_modules/x/index.js"])).toHaveLength(2);
  });
});
