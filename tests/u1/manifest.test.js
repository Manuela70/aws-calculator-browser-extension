// Revisión obligatoria del manifest (security-design §1; NFR4.1-NFR4.5, NFR7.2, NFR7.3).
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const extensionDir = fileURLToPath(new URL("../../aws-calculator-extension/", import.meta.url));
const manifest = JSON.parse(readFileSync(`${extensionDir}manifest.json`, "utf8"));

describe("manifest.json", () => {
  it("declara exactamente los permisos del skeleton (sin activeTab ni clipboardWrite)", () => {
    expect([...manifest.permissions].sort()).toEqual(
      ["scripting", "sidePanel", "storage", "tabs", "unlimitedStorage"].sort(),
    );
  });

  it("declara exactamente calculator.aws como host (sin CloudFront muerto ni n8n)", () => {
    expect(manifest.host_permissions).toEqual(["https://calculator.aws/*"]);
    expect(
      manifest.content_scripts.every((cs) => cs.matches.join() === "https://calculator.aws/*"),
    ).toBe(true);
    expect(manifest.web_accessible_resources).toEqual([
      {
        resources: ["lib/*", "lib/*/*"],
        matches: ["https://calculator.aws/*"],
        use_dynamic_url: true,
      },
    ]);
  });

  it("es MV3 con versión mínima de Chrome 116 y service worker como módulo", () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.minimum_chrome_version).toBe("116");
    expect(manifest.background).toEqual({ service_worker: "background.js", type: "module" });
    expect(manifest.content_security_policy).toBeUndefined();
  });

  it("no tiene popup: el icono abre el panel lateral y los archivos del popup no existen", () => {
    expect(manifest.action?.default_popup).toBeUndefined();
    expect(manifest.side_panel).toEqual({ default_path: "sidepanel.html" });
    expect(existsSync(`${extensionDir}popup.html`)).toBe(false);
    expect(existsSync(`${extensionDir}popup.js`)).toBe(false);
  });
});
