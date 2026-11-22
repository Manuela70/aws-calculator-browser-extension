import { describe, expect, it } from "vitest";
import { indexInventory } from "../../brain/core/inventory-model.js";
import {
  isPlainText,
  parseModelJson,
  validateInterpretOutput,
  validateResidueOutput,
  validateWafOutput,
} from "../../brain/core/output-validators.js";
import { loadFixture, smallInventory } from "./helpers.js";

const outputs = () => loadFixture("model-outputs.json");
const requests = () => loadFixture("requests.json");

function context(names) {
  const index = indexInventory(smallInventory());
  return { candidates: names.map((n) => index.byName.get(n)) };
}

function wafBatch() {
  return requests().waf.services.map((service, serviceIndex) => ({ serviceIndex, service }));
}

describe("parseModelJson y texto plano", () => {
  it("extrae el JSON aunque venga en un bloque de código y rechaza lo que no es JSON", () => {
    expect(parseModelJson('```json\n{"a":1}\n```').value).toEqual({ a: 1 });
    expect(parseModelJson("sin objeto").ok).toBe(false);
    expect(parseModelJson("{no: json}").ok).toBe(false);
    expect(parseModelJson(undefined).ok).toBe(false);
  });

  it("isPlainText rechaza marcado, URL y caracteres de control", () => {
    expect(isPlainText("Usa cifrado en reposo.")).toBe(true);
    expect(isPlainText("Usa <b>cifrado</b>")).toBe(false);
    expect(isPlainText("Ver https://aws.amazon.com")).toBe(false);
    expect(isPlainText("línea\u0007")).toBe(false);
  });
});

describe("validateInterpretOutput (BR2.1-BR2.3, BR7.1)", () => {
  it("acepta la salida canónica y completa search_term con el nombre", () => {
    const result = validateInterpretOutput(outputs().interpretValid, context(["S3 Standard"]));
    expect(result.ok).toBe(true);
    expect(result.value).toEqual({
      status: "interpreted",
      runInput: {
        region: "us-east-1",
        services: [
          {
            name: "S3 Standard",
            search_term: "S3 Standard",
            fields: { "S3 Standard storage": "100", "S3 Standard storage unit": "GB" },
          },
        ],
      },
    });
  });

  it("convierte un servicio inexistente o fuera de candidatos en unknown_service", () => {
    const result = validateInterpretOutput(
      outputs().interpretUnknownService,
      context(["S3 Standard"]),
    );
    expect(result).toEqual({
      ok: true,
      value: {
        status: "unresolved",
        unresolved: [{ fragment: "Amazon Quantum Ledger", reason: "unknown_service" }],
      },
    });
  });

  it("exige template en servicios con varias plantillas y valida las claves de esa plantilla", () => {
    const ctx = context(["Amazon EC2"]);
    const base = { status: "interpreted", runInput: { services: [{ name: "Amazon EC2" }] } };
    expect(validateInterpretOutput(base, ctx).ok).toBe(false);
    const ok = {
      status: "interpreted",
      runInput: {
        region: "us-west-2",
        project: "Demo",
        services: [
          {
            name: "Amazon EC2",
            template: "Quick estimate",
            fields: { Quantity: 2, "Operating system": "Linux" },
          },
        ],
      },
    };
    const result = validateInterpretOutput(ok, ctx);
    expect(result.value.runInput.services[0].fields).toEqual({
      Quantity: "2",
      "Operating system": "Linux",
    });
    expect(result.value.runInput.project).toBe("Demo");
    const wrongTemplateKey = structuredClone(ok);
    wrongTemplateKey.runInput.services[0].fields = { "Advance EC2 instance": "x" };
    expect(validateInterpretOutput(wrongTemplateKey, ctx).ok).toBe(false);
  });

  it("rechaza campo complex, opción inexistente, número no decimal y template sobrante", () => {
    const ctx = context(["Amazon EC2", "S3 Standard"]);
    const make = (svc) => ({ status: "interpreted", runInput: { services: [svc] } });
    const cases = [
      { name: "Amazon EC2", template: "Quick estimate", fields: { "Instance type": "t3.micro" } },
      { name: "Amazon EC2", template: "Quick estimate", fields: { "Operating system": "BeOS" } },
      { name: "S3 Standard", fields: { "S3 Standard storage": "cien" } },
      { name: "S3 Standard", template: "Amazon S3 Standard", fields: {} },
      { name: "S3 Standard", search_term: "S3", fields: {} },
      { name: "S3 Standard", fields: { Inventado: "1" } },
      { name: "S3 Standard", fields: [] },
    ];
    for (const svc of cases) expect(validateInterpretOutput(make(svc), ctx).ok).toBe(false);
  });

  it("valida checkbox y toggle de un servicio con esos campos", () => {
    const service = {
      name: "Toggle Service",
      templates: [],
      regions: [],
      fields: [
        { label: "Feature", kind: "toggle", conditional: false },
        { label: "Enable", kind: "checkbox", conditional: false },
      ],
    };
    const make = (fields) => ({
      status: "interpreted",
      runInput: { services: [{ name: "Toggle Service", fields }] },
    });
    const ctx = { candidates: [service] };
    expect(
      validateInterpretOutput(make({ "__switch__:Feature": "on", Enable: true }), ctx).ok,
    ).toBe(true);
    expect(validateInterpretOutput(make({ "__switch__:Feature": "yes" }), ctx).ok).toBe(false);
    expect(validateInterpretOutput(make({ Enable: "true" }), ctx).ok).toBe(false);
  });

  it("informa region_unavailable si el servicio no está en la región pedida", () => {
    const out = {
      status: "interpreted",
      runInput: {
        region: "ap-south-2",
        services: [{ name: "Amazon EC2", template: "Quick estimate", fields: {} }],
      },
    };
    const result = validateInterpretOutput(out, context(["Amazon EC2"]));
    expect(result.value.unresolved[0]).toMatchObject({ reason: "region_unavailable" });
  });

  it("valida la forma coherente de unresolved e interpreted", () => {
    const ctx = context(["S3 Standard"]);
    const good = {
      status: "unresolved",
      unresolved: [{ fragment: "S3", service: "S3 Standard", reason: "ambiguous_service" }],
    };
    expect(validateInterpretOutput(good, ctx).ok).toBe(true);
    const invalids = [
      { status: "unresolved", unresolved: [] },
      { status: "unresolved", unresolved: [{ fragment: "S3", reason: "otra" }] },
      {
        status: "unresolved",
        unresolved: [{ fragment: "S3", service: "", reason: "missing_value" }],
      },
      {
        status: "unresolved",
        unresolved: [{ fragment: "S3", reason: "missing_value" }],
        runInput: {},
      },
      {
        status: "unresolved",
        unresolved: [{ fragment: "x".repeat(2001), reason: "missing_value" }],
      },
      { status: "unresolved", unresolved: ["S3"] },
      { ...outputs().interpretValid, unresolved: [{ fragment: "x", reason: "missing_value" }] },
      { status: "interpreted" },
      { status: "interpreted", runInput: { services: [] } },
      {
        status: "interpreted",
        runInput: { region: "Virginia", services: [{ name: "S3 Standard" }] },
      },
      { status: "interpreted", runInput: { project: "<b>", services: [{ name: "S3 Standard" }] } },
      { status: "interpreted", runInput: { services: [{}] } },
      {
        status: "interpreted",
        runInput: { services: Array.from({ length: 21 }, () => ({ name: "S3 Standard" })) },
      },
      { status: "done" },
      "texto",
    ];
    for (const out of invalids) expect(validateInterpretOutput(out, ctx).ok).toBe(false);
  });
});

describe("validateResidueOutput (BR3.1, BR3.2)", () => {
  it("acepta acciones válidas, incluida la opción distinta del valor pedido en un selector", () => {
    const result = validateResidueOutput(outputs().residueValid, requests().mapResidue);
    expect(result.ok).toBe(true);
    expect(result.value.actions).toHaveLength(3);
  });

  it("acepta omitir una clave sin campo (BR3.2)", () => {
    const out = { actions: outputs().residueValid.actions.slice(0, 1) };
    expect(validateResidueOutput(out, requests().mapResidue).value.actions).toHaveLength(1);
  });

  it("rechaza requestKey ausente o fuera del residuo y claves repetidas", () => {
    const request = requests().mapResidue;
    const [first] = outputs().residueValid.actions;
    const missingKey = { ...first };
    delete missingKey.requestKey;
    expect(validateResidueOutput({ actions: [missingKey] }, request).ok).toBe(false);
    expect(validateResidueOutput({ actions: [{ ...first, requestKey: "Otra" }] }, request).ok).toBe(
      false,
    );
    expect(validateResidueOutput({ actions: [first, first] }, request).ok).toBe(false);
  });

  it("rechaza campo no recibido, tipo de acción incorrecto y valores no permitidos", () => {
    const request = requests().mapResidue;
    const [fill, dropdown, toggle] = outputs().residueValid.actions;
    const invalids = [
      { ...fill, fieldLabel: "Storage amount" },
      { ...fill, actionType: "select" },
      { ...fill, value: "200" },
      { ...fill, value: 100 },
      { ...dropdown, value: "PB" },
      { ...toggle, actionType: "toggle_off", value: "on" },
      "acción",
    ];
    for (const action of invalids) {
      expect(validateResidueOutput({ actions: [action] }, request).ok).toBe(false);
    }
    expect(validateResidueOutput({}, request).ok).toBe(false);
  });
});

describe("validateWafOutput (BR4.2)", () => {
  it("acepta un lote válido con hallazgos y sin hallazgos", () => {
    const result = validateWafOutput(outputs().wafValid, wafBatch());
    expect(result.ok).toBe(true);
    expect(result.value.perService[1]).toEqual({
      serviceIndex: 1,
      service: "S3 Standard",
      noFindings: true,
    });
  });

  it("rechaza un serviceIndex repetido o faltante", () => {
    const repeated = outputs().wafValid;
    repeated.perService[1].serviceIndex = 0;
    expect(validateWafOutput(repeated, wafBatch()).error).toBe("serviceIndex repetido");
    const shifted = outputs().wafValid;
    shifted.perService[1].serviceIndex = 7;
    expect(validateWafOutput(shifted, wafBatch()).ok).toBe(false);
  });

  it("rechaza texto con marcado o URL, y más de 300 caracteres", () => {
    for (const text of ["Usa <script>", "Lee https://example.com", "a".repeat(301)]) {
      const out = outputs().wafValid;
      out.perService[0].recommendations[0].text = text;
      expect(validateWafOutput(out, wafBatch()).ok).toBe(false);
    }
  });

  it("rechaza pilar o severidad desconocidos, recomendaciones de más y formas incoherentes", () => {
    const mutate = (fn) => {
      const out = outputs().wafValid;
      fn(out.perService);
      return validateWafOutput(out, wafBatch()).ok;
    };
    expect(mutate((p) => (p[0].recommendations[0].pillar = "Speed"))).toBe(false);
    expect(mutate((p) => (p[0].recommendations[0].severity = "critical"))).toBe(false);
    expect(mutate((p) => (p[0].recommendations = Array(6).fill(p[0].recommendations[0])))).toBe(
      false,
    );
    expect(mutate((p) => (p[0].recommendations = []))).toBe(false);
    expect(mutate((p) => (p[0].recommendations[0] = "texto"))).toBe(false);
    expect(mutate((p) => (p[1].recommendations = p[0].recommendations))).toBe(false);
    expect(mutate((p) => (p[1].noFindings = "no"))).toBe(false);
    expect(mutate((p) => (p[1].service = "Otro"))).toBe(false);
    expect(mutate((p) => p.pop())).toBe(false);
    expect(mutate((p) => (p[0] = "x"))).toBe(false);
    expect(validateWafOutput({ perService: "x" }, wafBatch()).ok).toBe(false);
  });
});
