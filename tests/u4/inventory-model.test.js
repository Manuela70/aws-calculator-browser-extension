import { describe, expect, it } from "vitest";
import {
  MAX_SNAPSHOT_BYTES,
  buildFields,
  buildSnapshot,
  classifySubType,
  compareWithActive,
  fieldKeysByTemplate,
  indexInventory,
  snapshotAgeDays,
  validateSnapshot,
} from "../../brain/core/inventory-model.js";
import { smallInventory } from "./helpers.js";

function rawInput(overrides) {
  return {
    template: null,
    card: "Card",
    label: "Field",
    subType: "numericInput",
    options: null,
    conditional: false,
    ...overrides,
  };
}

describe("inventory-model", () => {
  it("acepta el inventario de ejemplo con esquema válido", () => {
    const snapshot = smallInventory();
    const result = validateSnapshot(snapshot, { byteLength: 10_000 });
    expect(result).toEqual({ ok: true, errors: [] });
  });

  it("clasifica un subType desconocido como complex y omite los de presentación", () => {
    expect(classifySubType("brandNewWidget", false)).toBe("complex");
    expect(classifySubType("alert", false)).toBe("display");
    expect(classifySubType("dropdown", false)).toBe("complex");
    const fields = buildFields(
      [
        rawInput({ label: "Nuevo", subType: "brandNewWidget" }),
        rawInput({ label: "Aviso", subType: "alert" }),
        rawInput({ label: null, subType: "numericInput" }),
      ],
      [],
    );
    expect(fields).toEqual([{ label: "Nuevo", conditional: false, kind: "complex" }]);
  });

  it("rechaza un campo con kind fuera del enum", () => {
    const snapshot = smallInventory();
    snapshot.services[2].fields[0].kind = "slider";
    const result = validateSnapshot(snapshot);
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain('kind desconocido "slider"');
  });

  it("antepone la sección a una etiqueta repetida en dos secciones y agrega la clave de unidad", () => {
    const fields = buildFields(
      [
        rawInput({ card: "Storage", label: "Amount", subType: "fileSize" }),
        rawInput({ card: "Snapshots", label: "Amount", subType: "fileSize" }),
        rawInput({ card: "Settings", label: "OS", subType: "dropdown", options: ["Linux"] }),
      ],
      ["Only"],
    );
    expect(fields.map((f) => f.label)).toEqual([
      "Storage > Amount",
      "Storage > Amount unit",
      "Snapshots > Amount",
      "Snapshots > Amount unit",
      "OS",
    ]);
    expect(fields[1]).toMatchObject({ kind: "unit", options: ["KB", "MB", "GB", "TB", "PB"] });
    expect(fields.every((f) => f.template === undefined)).toBe(true);
  });

  it("detecta una etiqueta repetida dentro de la misma plantilla del servicio", () => {
    const snapshot = smallInventory();
    snapshot.services[2].fields.push({ ...snapshot.services[2].fields[0] });
    snapshot.fieldCount += 1;
    const result = validateSnapshot(snapshot);
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("etiqueta repetida");
  });

  it("rechaza una versión que excede 50 MB", () => {
    const result = validateSnapshot(smallInventory(), { byteLength: MAX_SNAPSHOT_BYTES + 1 });
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain("supera");
  });

  it("rechaza versión, conteos y canónicas incoherentes", () => {
    const snapshot = smallInventory();
    snapshot.version = "v1";
    snapshot.serviceCount = 99;
    snapshot.services[1].canonical = true;
    const result = validateSnapshot(snapshot);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        "version inválida",
        "serviceCount no coincide",
        'más de una entrada canónica para "Amazon EC2"',
      ]),
    );
    expect(validateSnapshot(null).ok).toBe(false);
    expect(validateSnapshot({ ...smallInventory(), services: [] }).errors).toContain(
      "services vacío",
    );
  });

  it("indexa por nombre solo las entradas canónicas", () => {
    const index = indexInventory(smallInventory());
    expect(index.byName.get("Amazon EC2").serviceCode).toBe("eC2Next");
    expect(index.canonicalNames).toHaveLength(4);
    const keys = fieldKeysByTemplate(index.byName.get("Amazon EC2"));
    expect([...keys.keys()]).toEqual(["Quick estimate", "Advanced estimate"]);
    expect(keys.get("Quick estimate").get("Storage amount unit").kind).toBe("unit");
  });

  it("arma la versión con canónica preferida, sinónimos y conteos", () => {
    const rawServices = [
      { serviceCode: "a1", name: "Svc ", templates: [null], inputs: [rawInput({})] },
      { serviceCode: "a2", name: "Svc", templates: ["T"], inputs: [] },
      {
        serviceCode: "b",
        name: "Other",
        templates: ["T"],
        inputs: [rawInput({ subType: "condition", label: "Toggle" })],
      },
    ];
    const snapshot = buildSnapshot({
      version: "2026-11-22",
      generatedAt: "2026-11-22T00:00:00.000Z",
      rawServices,
      preferences: { Svc: "a2" },
      synonyms: { Other: ["otro"] },
    });
    expect(snapshot.services.map((s) => s.canonical)).toEqual([false, true, true]);
    expect(snapshot.services[2].synonymsEs).toEqual(["otro"]);
    expect(snapshot.fieldCount).toBe(2);
    expect(validateSnapshot(snapshot).ok).toBe(true);
    expect(fieldKeysByTemplate(snapshot.services[2]).get("").has("__switch__:Toggle")).toBe(true);
  });

  it("compara pérdidas contra la versión activa y calcula la antigüedad", () => {
    const active = { serviceCount: 100, fieldCount: 1000 };
    expect(compareWithActive({ serviceCount: 90, fieldCount: 950 }, active).ok).toBe(true);
    expect(compareWithActive({ serviceCount: 89, fieldCount: 1000 }, active).ok).toBe(false);
    expect(compareWithActive({ serviceCount: 1, fieldCount: 1 }, null).ok).toBe(true);
    const age = snapshotAgeDays(
      { generatedAt: "2026-11-01T00:00:00.000Z" },
      Date.parse("2026-11-16T01:00:00.000Z"),
    );
    expect(age).toBe(15);
  });
});
