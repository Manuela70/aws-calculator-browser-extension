import { describe, it, expect } from "vitest";
import {
  MAX_PASSES,
  actionTypeFor,
  closeOutcome,
  describeUnresolved,
  fieldNamePart,
  mapDeterministic,
  toLogEntry,
} from "../../aws-calculator-extension/lib/mapping/deterministic-mapper.js";
import {
  EBS,
  makeCanonicalEc2Values,
  makeEc2DomFields,
  makeEc2DomFieldsWithIops,
  makeS3DomFields,
  makeS3Values,
} from "./fixtures.js";

const reasons = (outcome) => outcome.unresolved.map((v) => [v.key, v.reason, v.sendable]);

describe("mapDeterministic — coincidencia de etiquetas (BR1.1-BR1.4)", () => {
  it("mapea el caso canónico EC2 en una pasada y sin residuo", () => {
    const outcome = mapDeterministic(makeEc2DomFields(), makeCanonicalEc2Values());
    expect(outcome).toMatchObject({
      pass: 1,
      newActionsInLastPass: 4,
      residueStatus: "none",
      unresolved: [],
      pending: [],
    });
    expect(outcome.actions.map((a) => [a.actionId, a.fieldLabel, a.actionType, a.value])).toEqual([
      ["act-1", "Operating system", "dropdown", "Linux"],
      ["act-2", "EC2 specifications > Number of instances", "fill", "1"],
      ["act-3", "Instance type", "instance_radio", "t3.micro"],
      ["act-4", "Pricing strategy", "radio", "On-Demand"],
    ]);
    expect(outcome.actions[0]).toMatchObject({
      source: "deterministic",
      requestKey: "Operating system",
      substituted: false,
    });
  });

  it('coincide por "Sección > Campo" ignorando mayúsculas y espacios', () => {
    const outcome = mapDeterministic(makeEc2DomFields(), [
      {
        key: `  ${EBS.toLowerCase()} >  storage for each EC2 INSTANCE `,
        value: "Provisioned IOPS SSD (io2)",
      },
    ]);
    expect(outcome.actions[0]).toMatchObject({
      fieldLabel: `${EBS} > Storage for each EC2 instance`,
      value: "Provisioned IOPS SSD (io2)",
    });
  });

  it("etiqueta repetida sin sección → ambiguous_label, no enviable y servicio cerrado sin acciones", () => {
    const outcome = mapDeterministic(makeEc2DomFields(), [
      { key: "Operating system", value: "Linux" },
      { key: "Storage for each EC2 instance", value: "Standard" },
    ]);
    expect(reasons(outcome)).toEqual([["Storage for each EC2 instance", "ambiguous_label", false]]);
    expect(outcome.residueStatus).toBe("still_unresolved");
    expect(outcome.actions).toEqual([]);
  });

  it("etiqueta inexistente → no_match enviable al cerrar las pasadas", () => {
    const first = mapDeterministic(makeS3DomFields(), makeS3Values());
    expect(first.residueStatus).toBe("pending_passes");
    expect(first.unresolved).toEqual([]);
    const outcome = mapDeterministic(makeS3DomFields(), makeS3Values(), first);
    expect(outcome.pass).toBe(2);
    expect(outcome.newActionsInLastPass).toBe(0);
    expect(reasons(outcome)).toEqual([["Number of requests", "no_match", true]]);
    expect(outcome.residueStatus).toBe("still_unresolved");
    expect(outcome.actions.map((a) => a.fieldLabel)).toEqual([
      "S3 Standard > S3 Standard storage",
      "S3 Standard > S3 Standard storage unit",
    ]);
  });

  it("dos claves al mismo campo → la segunda queda duplicate_target", () => {
    const outcome = mapDeterministic(makeEc2DomFields(), [
      { key: "Number of instances", value: "1" },
      { key: "EC2 specifications > Number of instances", value: "2" },
    ]);
    expect(outcome.actions).toEqual([]);
    expect(reasons(outcome)).toEqual([
      ["EC2 specifications > Number of instances", "duplicate_target", false],
    ]);
  });
});

describe("mapDeterministic — tipos y valores (BR2.1-BR2.5)", () => {
  it("slider o tipo desconocido → unsupported_type (NFR2.2)", () => {
    const outcome = mapDeterministic(
      [...makeEc2DomFields(), { label: "Mystery", type: "color_picker" }],
      [
        { key: "Utilization", value: "50" },
        { key: "Mystery", value: "red" },
      ],
    );
    expect(reasons(outcome)).toEqual([
      ["Utilization", "unsupported_type", false],
      ["Mystery", "unsupported_type", false],
    ]);
  });

  it("número con unidad → invalid_number; unidad con su propia clave → dropdown", () => {
    const bad = mapDeterministic(makeEc2DomFields(), [{ key: "Storage amount", value: "30 GB" }]);
    expect(reasons(bad)).toEqual([["Storage amount", "invalid_number", false]]);
    const good = mapDeterministic(makeEc2DomFields(), [
      { key: "Storage amount", value: "30" },
      { key: "Storage amount unit", value: "gb" },
    ]);
    expect(good.actions.map((a) => [a.actionType, a.value])).toEqual([
      ["fill", "30"],
      ["dropdown", "GB"],
    ]);
  });

  it("opción inexistente → option_no_match enviable; unidad hacia un campo no selector → invalid_value", () => {
    const outcome = mapDeterministic(
      [...makeEc2DomFields(), { label: "Hours unit", type: "number" }],
      [
        { key: "Operating system", value: "Ubuntu" },
        { key: "Hours unit", value: "hours" },
      ],
    );
    expect(reasons(outcome)).toEqual([
      ["Operating system", "option_no_match", true],
      ["Hours unit", "invalid_value", false],
    ]);
  });

  it("toggle y checkbox normalizan el valor; un toggle inválido → invalid_value", () => {
    const outcome = mapDeterministic(makeEc2DomFields(), [
      { key: "Detailed monitoring", value: "ON" },
    ]);
    expect(outcome.actions[0]).toMatchObject({ actionType: "toggle_on", value: "on" });
    const s3 = mapDeterministic(makeS3DomFields(), [{ key: "Versioning", value: "False" }]);
    expect(s3.actions[0]).toMatchObject({ actionType: "checkbox", value: "false" });
    const bad = mapDeterministic(makeEc2DomFields(), [{ key: "Detailed monitoring", value: "x" }]);
    expect(reasons(bad)).toEqual([["Detailed monitoring", "invalid_value", false]]);
  });

  it("deriva el tipo de acción con la tabla cerrada y conserva fieldNamePart", () => {
    expect(actionTypeFor("search", "x")).toBe("fill");
    expect(actionTypeFor("radiogroup", "x")).toBe("radio");
    expect(actionTypeFor("toggle", "false")).toBe("toggle_off");
    expect(actionTypeFor("toggle", "maybe")).toBeNull();
    expect(actionTypeFor("slider", "1")).toBeNull();
    expect(actionTypeFor("constructor", "1")).toBeNull();
    expect(fieldNamePart("A > B > C")).toBe("C");
    expect(fieldNamePart(undefined)).toBe("");
  });
});

describe("mapDeterministic — pasadas (BR3.1, NFR8.4)", () => {
  it("campo condicional: pasada 1 deja IOPS pendiente y la pasada 2 lo mapea", () => {
    const values = [
      { key: `${EBS} > Storage for each EC2 instance`, value: "Provisioned IOPS SSD (io2)" },
      { key: "Provisioning IOPS io2", value: "3000" },
    ];
    const first = mapDeterministic(makeEc2DomFields(), values);
    expect(first).toMatchObject({
      pass: 1,
      residueStatus: "pending_passes",
      newActionsInLastPass: 1,
    });
    expect(first.pending.map((v) => v.key)).toEqual(["Provisioning IOPS io2"]);
    const second = mapDeterministic(makeEc2DomFieldsWithIops(), values, first);
    expect(second).toMatchObject({ pass: 2, residueStatus: "none", newActionsInLastPass: 1 });
    expect(second.actions.map((a) => a.actionId)).toEqual(["act-1", "act-2"]);
  });

  it("cierre forzado tras 3 pasadas aunque el escaneo siga cambiando", () => {
    const scan = (n) => [
      ...Array.from({ length: n }, (_, i) => ({ label: `Step ${i + 1}`, type: "number" })),
    ];
    const values = [1, 2, 3, 4].map((n) => ({ key: `Step ${n}`, value: String(n) }));
    let outcome = mapDeterministic(scan(1), values);
    outcome = mapDeterministic(scan(2), values, outcome);
    expect(outcome.residueStatus).toBe("pending_passes");
    outcome = mapDeterministic(scan(3), values, outcome);
    expect(outcome.pass).toBe(MAX_PASSES);
    expect(outcome.residueStatus).toBe("still_unresolved");
    expect(reasons(outcome)).toEqual([["Step 4", "no_match", true]]);
    expect(mapDeterministic(scan(4), values, outcome)).toBe(outcome);
  });

  it("closeOutcome sin pendientes ni residuo → none; describeUnresolved arma 'clave: motivo'", () => {
    const closed = closeOutcome({
      actions: [],
      pending: [],
      unresolved: [],
      pass: 1,
      newActionsInLastPass: 0,
      residueStatus: "pending_passes",
    });
    expect(closed.residueStatus).toBe("none");
    expect(
      describeUnresolved({
        residueStatus: "brain_unavailable",
        brainErrorCode: "rate_limited",
        unresolved: [{ key: "A", reason: "no_match" }],
      }),
    ).toBe("A: no_match; brain_unavailable (rate_limited)");
    expect(describeUnresolved({ residueStatus: "brain_unavailable", unresolved: [] })).toBe(
      "brain_unavailable",
    );
    expect(describeUnresolved(undefined)).toBe("");
  });
});

describe("toLogEntry (NFR5.4)", () => {
  it("incluye conteos, claves con motivo, estado y duración; nunca valores ni opciones", () => {
    const outcome = mapDeterministic(makeEc2DomFields(), [
      { key: "Operating system", value: "Ubuntu-secreto" },
      { key: "Number of instances", value: "7777" },
    ]);
    const entry = toLogEntry(
      { ...outcome, residueStatus: "brain_unavailable", residueDetail: "no_port" },
      { durationMs: 12.4 },
    );
    expect(entry).toEqual({
      level: "warn",
      event: "mapping_outcome",
      message: "Mapeo: pasadas=1, acciones=1, residuo=1, duración=12 ms",
      value: "brain_unavailable",
      detail: "Operating system: option_no_match; brain: no_port",
    });
    const text = JSON.stringify(entry);
    for (const secret of ["Ubuntu-secreto", "7777", "Windows Server", "Linux"]) {
      expect(text).not.toContain(secret);
    }
  });

  it("un mapeo limpio produce una entrada info sin detalle", () => {
    const entry = toLogEntry(mapDeterministic(makeEc2DomFields(), makeCanonicalEc2Values()));
    expect(entry).toMatchObject({ level: "info", value: "none" });
    expect(entry.message).toContain("duración=0 ms");
    expect(entry.detail).toBeUndefined();
    expect(toLogEntry(undefined).message).toBe(
      "Mapeo: pasadas=0, acciones=0, residuo=0, duración=0 ms",
    );
  });
});
