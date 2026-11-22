import { describe, expect, it } from "vitest";
import {
  containsBinary,
  validateInterpretRequest,
  validateResidueRequest,
  validateWafRequest,
} from "../../brain/core/request-validators.js";
import { loadFixture } from "./helpers.js";

const requests = () => loadFixture("requests.json");

describe("validateInterpretRequest (C3, BR1.1)", () => {
  it("acepta el pedido canónico, aplica locale es por defecto e ignora campos desconocidos", () => {
    const body = { ...requests().interpret, extra: "ignorado" };
    delete body.locale;
    const result = validateInterpretRequest(body);
    expect(result.ok).toBe(true);
    expect(result.value).toEqual({ text: body.text, locale: "es", schemaVersion: 1 });
  });

  it("acepta texto en el tope de 2000 caracteres y rechaza 2001", () => {
    const base = { locale: "es", schemaVersion: 1 };
    expect(validateInterpretRequest({ ...base, text: "a".repeat(2000) }).ok).toBe(true);
    expect(validateInterpretRequest({ ...base, text: "a".repeat(2001) })).toEqual({
      ok: false,
      reason: "text_too_long",
    });
  });

  it("rechaza schemaVersion no soportada, texto vacío, locale inválido y no-objeto", () => {
    expect(validateInterpretRequest({ text: "x", schemaVersion: 2 }).reason).toBe(
      "schema_version_unsupported",
    );
    expect(validateInterpretRequest({ text: "  ", schemaVersion: 1 }).reason).toBe("text_missing");
    expect(validateInterpretRequest({ text: "x", locale: 5, schemaVersion: 1 }).reason).toBe(
      "locale_invalid",
    );
    expect(validateInterpretRequest([]).reason).toBe("not_object");
  });

  it("rechaza imágenes embebidas como data URL (BR1.2)", () => {
    const body = { text: "data:image/png;base64,iVBORw0KGgo=", schemaVersion: 1 };
    expect(validateInterpretRequest(body).reason).toBe("binary_content");
    expect(containsBinary({ a: [{ b: "data:application/pdf;base64,AAAA" }] })).toBe(true);
    expect(containsBinary({ a: ["texto normal", 3, null] })).toBe(false);
  });
});

describe("validateResidueRequest (C1)", () => {
  it("acepta el pedido de ejemplo", () => {
    const result = validateResidueRequest(requests().mapResidue);
    expect(result.ok).toBe(true);
    expect(result.value.unresolved).toHaveLength(3);
  });

  it("acepta 500 campos escaneados y rechaza 501", () => {
    const body = requests().mapResidue;
    const field = { label: "F", type: "text" };
    body.domFields = Array.from({ length: 500 }, () => field);
    expect(validateResidueRequest(body).ok).toBe(true);
    body.domFields.push(field);
    expect(validateResidueRequest(body).reason).toBe("dom_fields_too_many");
  });

  it("rechaza residuo vacío, tipo de campo desconocido y opciones no textuales", () => {
    const empty = { ...requests().mapResidue, unresolved: [] };
    expect(validateResidueRequest(empty).reason).toBe("unresolved_invalid");
    const badType = requests().mapResidue;
    badType.domFields[0].type = "canvas";
    expect(validateResidueRequest(badType).reason).toBe("dom_field_type_invalid");
    const badOptions = requests().mapResidue;
    badOptions.domFields[1].options = [1, 2];
    expect(validateResidueRequest(badOptions).reason).toBe("dom_field_options_invalid");
    const badSection = requests().mapResidue;
    badSection.domFields[0].section = 3;
    expect(validateResidueRequest(badSection).reason).toBe("dom_field_section_invalid");
    expect(validateResidueRequest({ ...requests().mapResidue, service: "" }).reason).toBe(
      "service_missing",
    );
    const badItem = requests().mapResidue;
    badItem.requestedValues = [{ key: "k", value: 3 }];
    expect(validateResidueRequest(badItem).reason).toBe("requested_values_item_invalid");
  });
});

describe("validateWafRequest (C2)", () => {
  it("acepta el pedido y usa post_fill por defecto", () => {
    const body = requests().waf;
    expect(validateWafRequest(body).value.phase).toBe("pre_fill");
    delete body.phase;
    expect(validateWafRequest(body).value.phase).toBe("post_fill");
  });

  it("acepta 20 servicios con 30 claves de 100 caracteres y rechaza cada tope excedido", () => {
    const key = (i) => `${i}`.padEnd(100, "k");
    const config = Object.fromEntries(
      Array.from({ length: 30 }, (_, i) => [key(i), "v".repeat(100)]),
    );
    const services = Array.from({ length: 20 }, () => ({ name: "Amazon EC2", config }));
    expect(validateWafRequest({ services }).ok).toBe(true);
    expect(validateWafRequest({ services: [...services, services[0]] }).reason).toBe(
      "services_too_many",
    );
    const tooManyKeys = { ...config, extra: "v" };
    expect(validateWafRequest({ services: [{ name: "A", config: tooManyKeys }] }).reason).toBe(
      "config_too_many_keys",
    );
    expect(
      validateWafRequest({ services: [{ name: "A", config: { k: "v".repeat(101) } }] }).reason,
    ).toBe("config_value_too_long");
    expect(
      validateWafRequest({ services: [{ name: "A", config: { ["k".repeat(101)]: "v" } }] }).reason,
    ).toBe("config_key_too_long");
  });

  it("rechaza fase desconocida, lista vacía, valor no textual y nombre largo", () => {
    expect(validateWafRequest({ phase: "during", services: [{ name: "A" }] }).reason).toBe(
      "phase_invalid",
    );
    expect(validateWafRequest({ services: [] }).reason).toBe("services_missing");
    expect(validateWafRequest({ services: [{ name: "A", config: { k: 1 } }] }).reason).toBe(
      "config_value_not_string",
    );
    expect(validateWafRequest({ services: [{ name: "A".repeat(101) }] }).reason).toBe(
      "service_name_too_long",
    );
    expect(validateWafRequest({ services: [{ name: "A", config: [] }] }).reason).toBe(
      "config_invalid",
    );
    expect(validateWafRequest({ services: [{}] }).reason).toBe("service_invalid");
  });
});
