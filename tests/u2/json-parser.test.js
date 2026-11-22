import { describe, it, expect } from "vitest";
import {
  INVALID_JSON_MESSAGE,
  parseJsonText,
  parseRunInput,
} from "../../aws-calculator-extension/lib/input/json-parser.js";
import {
  MAX_FIELDS,
  MAX_JSON_CHARS,
  MAX_SERVICES,
} from "../../aws-calculator-extension/lib/input/input-schema.js";
import { makeRunInput, makeService, toText } from "./fixtures.js";

describe("parseJsonText — sintaxis y tope (BR2.1, NFR3.4)", () => {
  it("acepta el caso canónico EC2 y devuelve una copia", () => {
    const input = makeRunInput();
    const result = parseJsonText(toText(input));
    expect(result.ok).toBe(true);
    expect(result.value).toEqual(input);
  });

  it('sintaxis inválida → "❌ JSON inválido."', () => {
    const result = parseJsonText('{"services": [');
    expect(result).toEqual({
      ok: false,
      error: { code: "invalid_json", message: INVALID_JSON_MESSAGE },
    });
    expect(INVALID_JSON_MESSAGE).toBe("❌ JSON inválido.");
  });

  it("rechaza más de 100 000 caracteres sin parsear, y acepta el borde", () => {
    const base = toText(makeRunInput());
    const atLimit = base + " ".repeat(MAX_JSON_CHARS - base.length);
    expect(parseJsonText(atLimit).ok).toBe(true);
    const result = parseJsonText(`${atLimit} `);
    expect(result.error.code).toBe("input_too_long");
    expect(result.error.maxLength).toBe(MAX_JSON_CHARS);
  });

  it("raíz que no es objeto → not_object", () => {
    expect(parseJsonText("[1,2]").error.code).toBe("not_object");
    expect(parseJsonText("null").error.code).toBe("not_object");
    expect(parseJsonText('"texto"').error.code).toBe("not_object");
  });
});

describe("parseRunInput — esquema cerrado del Anexo A (BR2.2-BR2.5)", () => {
  it("rechaza la entrada sin services y services vacío", () => {
    const input = makeRunInput();
    delete input.services;
    expect(parseRunInput(input).error.code).toBe("missing_services");
    expect(parseRunInput(makeRunInput({ services: [] })).error.code).toBe("empty_services");
  });

  it('clave mal escrita "feilds" → unknown_key que nombra servicio y clave', () => {
    const result = parseRunInput({ services: [{ name: "Amazon S3", feilds: {} }] });
    expect(result.error).toEqual({
      code: "unknown_key",
      message: '❌ El servicio "Amazon S3" tiene una clave desconocida: "feilds".',
      service: "Amazon S3",
      serviceIndex: 0,
      key: "feilds",
    });
  });

  it("rechaza claves desconocidas en la raíz", () => {
    const result = parseRunInput(makeRunInput({ regions: "us-east-1" }));
    expect(result.error.code).toBe("unknown_key");
    expect(result.error.message).toContain('"regions"');
  });

  it("rechaza __proto__, constructor y prototype en raíz, servicio y fields (NFR3.5)", () => {
    const atRoot = JSON.parse('{"__proto__": {"x": 1}, "services": [{"name": "A"}]}');
    expect(parseRunInput(atRoot).error).toMatchObject({ code: "unknown_key", key: "__proto__" });
    const inService = JSON.parse('{"services": [{"name": "A", "constructor": "x"}]}');
    expect(parseRunInput(inService).error).toMatchObject({ key: "constructor" });
    const inFields = JSON.parse('{"services": [{"name": "A", "fields": {"prototype": "1"}}]}');
    expect(parseRunInput(inFields).error).toMatchObject({ code: "unknown_key", key: "prototype" });
  });

  it("admite template y rechaza template vacío", () => {
    const input = makeRunInput();
    input.services[0].template = "EC2 Instances";
    expect(parseRunInput(input).value.services[0].template).toBe("EC2 Instances");
    input.services[0].template = " ";
    const result = parseRunInput(input);
    expect(result.error).toMatchObject({ code: "invalid_service", key: "template" });
  });

  it("rechaza un servicio sin name, nombrándolo por posición", () => {
    const input = makeRunInput();
    delete input.services[0].name;
    const result = parseRunInput(input);
    expect(result.error.code).toBe("missing_service_name");
    expect(result.error.message).toContain("#1");
  });

  it("rechaza tipos inválidos nombrando servicio y campo (BR2.4)", () => {
    const objectValue = makeRunInput();
    objectValue.services[0].fields["Number of instances"] = { value: 1 };
    const result = parseRunInput(objectValue);
    expect(result.error.code).toBe("invalid_field_value");
    expect(result.error.message).toContain("Number of instances");
    expect(result.error.message).toContain("Amazon EC2");

    const blankSearch = makeRunInput();
    blankSearch.services[0].search_term = " ";
    expect(parseRunInput(blankSearch).error.code).toBe("invalid_search_term");

    const listFields = makeRunInput();
    listFields.services[0].fields = ["a"];
    expect(parseRunInput(listFields).error.code).toBe("invalid_fields");

    expect(parseRunInput(makeRunInput({ services: ["EC2"] })).error.code).toBe("invalid_service");
    expect(parseRunInput(makeRunInput({ project: "x".repeat(201) })).error.code).toBe(
      "invalid_project",
    );
    expect(parseRunInput(makeRunInput({ region: "" })).error.code).toBe("invalid_region");
  });
});

describe("parseRunInput — topes comunes con C2 (BR2.7)", () => {
  it("acepta 20 servicios y rechaza 21", () => {
    const services = Array.from({ length: MAX_SERVICES }, (_, i) => makeService(i));
    expect(parseRunInput({ services }).ok).toBe(true);
    const result = parseRunInput({ services: [...services, makeService(MAX_SERVICES)] });
    expect(result.error).toMatchObject({ code: "input_limit_exceeded", limit: "services" });
  });

  it("acepta 30 claves en fields y rechaza 31, nombrando el servicio", () => {
    const fields = Object.fromEntries(
      Array.from({ length: MAX_FIELDS }, (_, i) => [`Field ${i}`, i]),
    );
    expect(parseRunInput({ services: [{ name: "A", fields }] }).ok).toBe(true);
    const result = parseRunInput({ services: [{ name: "A", fields: { ...fields, Extra: 1 } }] });
    expect(result.error).toMatchObject({ limit: "fields", service: "A", serviceIndex: 0 });
    expect(result.error.message).toContain("servicio 1");
  });

  it("acepta valores de 100 caracteres y rechaza 101 en clave o valor", () => {
    const ok = parseRunInput({ services: [{ name: "A", fields: { K: "v".repeat(100) } }] });
    expect(ok.ok).toBe(true);
    const longValue = parseRunInput({ services: [{ name: "A", fields: { K: "v".repeat(101) } }] });
    expect(longValue.error).toMatchObject({ limit: "field_chars", key: "K" });
    const longKey = parseRunInput({ services: [{ name: "A", fields: { ["k".repeat(101)]: 1 } }] });
    expect(longKey.error.code).toBe("input_limit_exceeded");
  });
});
