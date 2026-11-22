import { describe, it, expect } from "vitest";
import {
  INVALID_JSON_MESSAGE,
  parseRunInput,
} from "../../aws-calculator-extension/lib/input/json-parser.js";
import { makeRunInput } from "./fixtures.js";

const toText = (value) => JSON.stringify(value);

describe("parseRunInput (BR1.1, BR1.2)", () => {
  it("acepta el caso canónico EC2", () => {
    const result = parseRunInput(toText(makeRunInput()));
    expect(result.ok).toBe(true);
    expect(result.value.services[0].name).toBe("Amazon EC2");
  });

  it('sintaxis inválida → "❌ JSON inválido."', () => {
    const result = parseRunInput('{"services": [');
    expect(result).toEqual({
      ok: false,
      error: { code: "invalid_json", message: INVALID_JSON_MESSAGE },
    });
    expect(INVALID_JSON_MESSAGE).toBe("❌ JSON inválido.");
  });

  it("rechaza la entrada sin services", () => {
    const input = makeRunInput();
    delete input.services;
    expect(parseRunInput(toText(input)).error.code).toBe("missing_services");
  });

  it("rechaza services vacío", () => {
    expect(parseRunInput(toText(makeRunInput({ services: [] }))).error.code).toBe("empty_services");
  });

  it("rechaza un servicio sin name, nombrándolo por posición", () => {
    const input = makeRunInput();
    delete input.services[0].name;
    const result = parseRunInput(toText(input));
    expect(result.error.code).toBe("missing_service_name");
    expect(result.error.message).toContain("#1");
  });

  it("rechaza un valor objeto en fields, nombrando el campo y el servicio", () => {
    const input = makeRunInput();
    input.services[0].fields["Number of instances"] = { value: 1 };
    const result = parseRunInput(toText(input));
    expect(result.error.code).toBe("invalid_field_value");
    expect(result.error.message).toContain("Number of instances");
    expect(result.error.message).toContain("Amazon EC2");
  });

  it("rechaza project de más de 200 caracteres", () => {
    const result = parseRunInput(toText(makeRunInput({ project: "x".repeat(201) })));
    expect(result.error.code).toBe("invalid_project");
  });

  it("rechaza search_term vacío, fields no objeto y raíz que no es objeto", () => {
    const blankSearch = makeRunInput();
    blankSearch.services[0].search_term = " ";
    expect(parseRunInput(toText(blankSearch)).error.code).toBe("invalid_search_term");

    const listFields = makeRunInput();
    listFields.services[0].fields = ["a"];
    expect(parseRunInput(toText(listFields)).error.code).toBe("invalid_fields");

    expect(parseRunInput("[1,2]").error.code).toBe("not_object");
  });
});
