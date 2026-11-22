// scripts/package-zip.js: selección de archivos y verificación de entradas del .zip (NFR7.2).
// No llama a tar ni a zip: prueba listas en memoria.
import { describe, it, expect } from "vitest";
import {
  selectFiles,
  verifyEntries,
  archiveCommand,
  listCommand,
} from "../../scripts/package-zip.js";

const bundle = [
  "manifest.json",
  "background.js",
  "sw/config.js",
  "lib/content-main.js",
  "lib/connection/brain-port.js",
  "icon16.png",
  "SMOKE.md",
  "REVIVAL_PLAN.md",
  "lib/rpa/orchestrator.test.js",
  "lib/__tests__/x.js",
  ".DS_Store",
  "lib/.cache/y.js",
];

describe("package-zip", () => {
  it("excluye pruebas, *.md y ocultos, y ordena la lista", () => {
    expect(selectFiles(bundle)).toEqual([
      "background.js",
      "icon16.png",
      "lib/connection/brain-port.js",
      "lib/content-main.js",
      "manifest.json",
      "sw/config.js",
    ]);
  });

  it("normaliza separadores de Windows", () => {
    expect(selectFiles(["sw\\config.js", "lib\\x.test.js"])).toEqual(["sw/config.js"]);
  });

  it("acepta entradas idénticas a la lista (ignorando directorios y ./)", () => {
    const expected = selectFiles(bundle);
    const listed = ["sw/", "./manifest.json", ...expected.filter((p) => p !== "manifest.json"), ""];
    expect(verifyEntries(listed, expected)).toEqual({ ok: true, missing: [], extra: [] });
  });

  it("detecta entradas de más o de menos", () => {
    const expected = selectFiles(bundle);
    const result = verifyEntries([...expected.slice(1), "SMOKE.md"], expected);
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual([expected[0]]);
    expect(result.extra).toEqual(["SMOKE.md"]);
  });

  it("usa tar -a en Windows y zip en otros sistemas, sin shell", () => {
    expect(archiveCommand("win32", "out.zip", ["a.js"])).toEqual({
      command: "tar",
      args: ["-a", "-c", "-f", "out.zip", "a.js"],
    });
    expect(archiveCommand("linux", "out.zip", ["a.js"]).command).toBe("zip");
    expect(listCommand("win32", "out.zip").args).toEqual(["-t", "-f", "out.zip"]);
    expect(listCommand("darwin", "out.zip")).toEqual({
      command: "unzip",
      args: ["-Z1", "out.zip"],
    });
  });
});
