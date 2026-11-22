// scripts/sync-brain-config.js: salidas de u4 → sw/config.js y host_permissions (NFR1.1).
// Valores ficticios de prueba.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  parseOutputs,
  renderConfig,
  updateManifestHosts,
} from "../../scripts/sync-brain-config.js";
import { loadPolicy, checkManifest } from "../../scripts/check-bundle.js";

const configPath = fileURLToPath(
  new URL("../../aws-calculator-extension/sw/config.js", import.meta.url),
);
const manifestPath = fileURLToPath(
  new URL("../../aws-calculator-extension/manifest.json", import.meta.url),
);

const validOutputs = () => ({
  brain: {
    BrainUrl: "https://brain.example.test",
    CognitoDomain: "https://login.auth.us-east-1.amazoncognito.com",
    ExtensionClientId: "abc123fake",
    InventoryBucketName: "no-se-usa",
  },
});

describe("sync-brain-config", () => {
  it("toma los tres valores de outputs válidos y deja los orígenes normalizados", () => {
    const parsed = parseOutputs(validOutputs());
    expect(parsed).toEqual({
      ok: true,
      values: {
        BRAIN_BASE_URL: "https://brain.example.test",
        COGNITO_DOMAIN: "https://login.auth.us-east-1.amazoncognito.com",
        CLIENT_ID: "abc123fake",
      },
    });
  });

  it("rechaza una URL que no es https o que trae ruta", () => {
    const outputs = validOutputs();
    outputs.brain.BrainUrl = "http://brain.example.test";
    outputs.brain.CognitoDomain = "https://login.example.test/oauth2";
    const parsed = parseOutputs(outputs);
    expect(parsed.ok).toBe(false);
    expect(parsed.problems).toHaveLength(2);
  });

  it("falla si falta el stack o alguna salida", () => {
    expect(parseOutputs({}).ok).toBe(false);
    expect(parseOutputs(null).ok).toBe(false);
    const outputs = validOutputs();
    delete outputs.brain.ExtensionClientId;
    expect(parseOutputs(outputs).problems).toEqual([
      "ExtensionClientId ausente o con formato inválido",
    ]);
  });

  it("renderConfig con null reproduce el sw/config.js versionado", () => {
    const current = readFileSync(configPath, "utf8").replace(/\r\n/g, "\n");
    expect(renderConfig({})).toBe(current);
  });

  it("los valores sincronizados dejan el manifest coherente con check:bundle", () => {
    const { values } = parseOutputs(validOutputs());
    const policy = loadPolicy();
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const updated = updateManifestHosts(manifest, policy, values);
    expect(updated.host_permissions).toEqual([
      "https://calculator.aws/*",
      "https://brain.example.test/*",
      "https://login.auth.us-east-1.amazoncognito.com/*",
    ]);
    expect(checkManifest(updated, policy, values)).toEqual([]);
    expect(renderConfig(values)).toContain('export const CLIENT_ID = "abc123fake";');
  });
});
