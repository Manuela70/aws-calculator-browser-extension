import { describe, it, expect } from "vitest";
import {
  INPUT_ERROR_CODES,
  NL_PRIVACY_NOTICE,
  describeFragment,
  failInput,
  isInputErrorCode,
  makeInputError,
} from "../../aws-calculator-extension/lib/input/input-errors.js";

describe("input-errors (entities.md InputError; NFR3.1, NFR5.2)", () => {
  it("cubre los 28 códigos del enum con un mensaje en español", () => {
    const codes = Object.values(INPUT_ERROR_CODES);
    expect(codes).toHaveLength(28);
    for (const code of codes) {
      expect(isInputErrorCode(code)).toBe(true);
      expect(makeInputError(code).message.length).toBeGreaterThan(0);
    }
  });

  it("un código desconocido es unexpected_error y solo copia detalles conocidos", () => {
    const error = makeInputError("not_a_code", { key: "x", secret: "no" });
    expect(error.code).toBe("unexpected_error");
    expect(error.key).toBe("x");
    expect(error).not.toHaveProperty("secret");
    expect(failInput("empty_input")).toEqual({
      ok: false,
      error: { code: "empty_input", message: makeInputError("empty_input").message },
    });
  });

  it("describe cada motivo de fragmento en lenguaje de dominio (BR3.4)", () => {
    const cases = [
      ["unknown_service", 'no reconocí el servicio "almacenamiento frío"'],
      ["ambiguous_service", "puede referirse a más de un servicio"],
      ["unknown_field", 'no reconocí el campo "almacenamiento frío" de S3'],
      ["ambiguous_field", 'no sé a qué campo de S3 corresponden "almacenamiento frío"'],
      ["missing_value", "falta el valor de"],
      ["unsupported_component", "no se puede configurar en la calculadora"],
      ["region_unavailable", "no está disponible para S3"],
      ["other", 'no pude interpretar "almacenamiento frío"'],
    ];
    for (const [reason, expected] of cases) {
      const service =
        reason === "unknown_service" || reason === "ambiguous_service" ? undefined : "S3";
      expect(describeFragment({ fragment: "almacenamiento frío", service, reason })).toContain(
        expected,
      );
    }
    expect(describeFragment({ fragment: "100 GB", reason: "ambiguous_field" })).toBe(
      'no sé a qué campo del servicio corresponden "100 GB"',
    );
  });

  it("input_limit_exceeded nombra el límite, el servicio y la clave", () => {
    expect(
      makeInputError("input_limit_exceeded", { limit: "field_chars", serviceIndex: 2, key: "K" })
        .message,
    ).toBe(
      '❌ La configuración supera el límite de 100 caracteres por clave o valor (servicio 3, clave "K").',
    );
    expect(makeInputError("input_limit_exceeded", {}).message).toBe(
      "❌ La configuración supera el límite de tamaño permitido.",
    );
  });

  it("unknown_key distingue raíz y servicio; los servicios sin nombre van por posición", () => {
    expect(makeInputError("unknown_key", { key: "regions" }).message).toBe(
      '❌ La configuración tiene una clave desconocida: "regions".',
    );
    expect(makeInputError("unknown_key", { serviceIndex: 1, key: "x" }).message).toContain("#2");
    expect(makeInputError("missing_service_name", { service: "" }).message).toContain("sin nombre");
  });

  it("rate_limited sin retryAfterSeconds y toggles sin nombre tienen texto propio", () => {
    expect(makeInputError("rate_limited").message).toContain("en unos momentos");
    expect(makeInputError("invalid_toggle", { service: "Amazon Bedrock" }).message).toBe(
      '❌ Hay un toggle sin nombre en el servicio "Amazon Bedrock".',
    );
  });

  it("fija el aviso de privacidad de la pestaña de lenguaje natural (NFR5.2)", () => {
    expect(NL_PRIVACY_NOTICE).toBe(
      "No incluyas nombres de clientes ni datos personales; describe solo la arquitectura.",
    );
  });
});
