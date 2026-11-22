// messages-es.js: un texto en español para cada código que llega al panel (NFR3.1, BR3.4).
import { describe, it, expect } from "vitest";
import {
  FALLBACK_STEP_TEXT,
  MESSAGE_KINDS,
  describeFailure,
  describeServiceResult,
  describeServiceResultParts,
  knownCodes,
  messageFor,
  substitutionText,
} from "../../aws-calculator-extension/lib/messages-es.js";
import { INPUT_ERROR_CODES } from "../../aws-calculator-extension/lib/input/input-errors.js";
import { BRAIN_CALL_ERROR_CODES } from "../../aws-calculator-extension/lib/connection/brain-port.js";
import {
  FAILURE_STEPS,
  PROGRESS_STEPS,
  RUN_FAILURE_DETAILS,
  SERVICE_REASONS,
} from "../../aws-calculator-extension/lib/rpa/result-aggregator.js";
import { WAF_PILLARS, WAF_SEVERITIES } from "../../aws-calculator-extension/lib/panel/waf-model.js";
import { makeConnectionFailure, makeErrorRunResult } from "./fixtures.js";

const EMOJI = /\p{Extended_Pictographic}/u;
const FALLBACK = /^Ocurrió un problema \(/;

function expectRealText(code, params) {
  const text = messageFor(code, params);
  expect(text.trim().length, code).toBeGreaterThan(0);
  expect(text, code).not.toMatch(FALLBACK);
  expect(text, code).not.toMatch(EMOJI);
  return text;
}

describe("messageFor: cobertura de códigos (NFR3.1)", () => {
  it("cada código de InputError de U2 tiene texto propio", () => {
    const codes = Object.values(INPUT_ERROR_CODES);
    expect(codes).toHaveLength(28);
    for (const code of codes) expectRealText(`input:${code}`, { key: "k", service: "EC2" });
  });

  it("cada código del cerebro y de la sesión (U4/U7) tiene texto propio", () => {
    for (const code of BRAIN_CALL_ERROR_CODES) expectRealText(`brain:${code}`);
    expect(messageFor("brain:rate_limited", { retryAfterSeconds: 7 })).toContain("7 s");
    expect(messageFor("brain:input_limit_exceeded", { limit: "services" })).toContain(
      "20 servicios",
    );
  });

  it("cada reason, failureStep, failureDetail y step de U5 tiene texto propio", () => {
    for (const reason of SERVICE_REASONS) expectRealText(`reason:${reason}`, { field: "Campo" });
    for (const step of FAILURE_STEPS) expectRealText(`failure:${step}`);
    for (const detail of Object.values(RUN_FAILURE_DETAILS)) expectRealText(`detail:${detail}`);
    for (const detail of ["busy", "not_ready", "module_load_failed"]) {
      expectRealText(`detail:${detail}`);
    }
    for (const step of PROGRESS_STEPS) {
      const text = messageFor(`step:${step}`, {
        service: "Amazon EC2",
        field: "Region",
        seconds: 4,
      });
      expect(text).not.toBe(FALLBACK_STEP_TEXT);
    }
    expect(messageFor("step:asking_brain", { service: "Amazon EC2", seconds: 4 })).toBe(
      "Consultando el mapeo de Amazon EC2 (4 s)",
    );
  });

  it("pilares y severidades usan las etiquetas de la tabla", () => {
    for (const pillar of WAF_PILLARS) expectRealText(`pillar:${pillar}`);
    for (const severity of WAF_SEVERITIES) expectRealText(`severity:${severity}`);
    expect(messageFor("pillar:CostOptimization")).toBe("Optimización de costos");
    expect(messageFor("severity:high")).toBe("Alta");
  });

  it("ningún texto de ninguna tabla lleva emojis", () => {
    for (const kind of MESSAGE_KINDS) {
      for (const code of knownCodes(kind)) {
        expect(messageFor(`${kind}:${code}`, { service: "x", field: "y" })).not.toMatch(EMOJI);
      }
    }
  });
});

describe("messageFor: respaldo y parámetros", () => {
  it("un código desconocido usa el respaldo con el código como texto; un paso, Trabajando…", () => {
    expect(messageFor("reason:volando")).toBe("Ocurrió un problema (volando).");
    expect(messageFor("sin-espacio")).toBe("Ocurrió un problema (sin-espacio).");
    expect(messageFor("step:volando")).toBe(FALLBACK_STEP_TEXT);
    expect(messageFor(undefined)).toBe("Ocurrió un problema (desconocido).");
    expect(knownCodes("nada")).toEqual([]);
  });

  it("recorta cada parámetro a 200 caracteres y descarta objetos", () => {
    const text = messageFor("reason:field_not_resolved", { field: "a".repeat(500) });
    expect(text).toContain(`${"a".repeat(199)}…`);
    expect(text).not.toContain("a".repeat(201));
    expect(messageFor("reason:field_not_resolved", { field: { html: "<b>" } })).toBe(
      "No pude ubicar el campo pedido en la página.",
    );
    expect(messageFor("detail:timeout:abrir My Estimate")).toBe(
      "calculator.aws tardó demasiado en abrir My Estimate.",
    );
  });
});

describe("messageFor: variantes de los textos de entrada de U2", () => {
  it("nombra el servicio por nombre, por posición o como 'sin nombre'", () => {
    expect(messageFor("input:missing_service_name", { service: "EC2" })).toBe(
      'El servicio "EC2" no tiene "name".',
    );
    expect(messageFor("input:missing_service_name", { serviceIndex: 2 })).toBe(
      'El servicio #3 no tiene "name".',
    );
    expect(messageFor("input:invalid_fields", {})).toContain("sin nombre");
    expect(messageFor("input:unknown_key", { key: "x" })).toBe(
      'La configuración tiene una clave desconocida: "x".',
    );
    expect(messageFor("input:invalid_service", { key: "template", service: "EC2" })).toContain(
      '"template"',
    );
    expect(messageFor("input:invalid_toggle", { service: "EC2" })).toBe(
      'Hay un toggle sin nombre en el servicio "EC2".',
    );
    expect(messageFor("input:invalid_toggle", { service: "EC2", key: "On" })).toContain('"On"');
  });

  it("límites, longitudes, regiones y esperas con y sin parámetros", () => {
    expect(
      messageFor("input:input_limit_exceeded", { limit: "fields", serviceIndex: 0, key: "k" }),
    ).toBe(
      'La configuración supera el límite de 30 claves en "fields" por servicio (servicio 1, clave "k").',
    );
    expect(messageFor("input:input_limit_exceeded", {})).toContain("tamaño permitido");
    expect(messageFor("input:input_limit_exceeded", { limit: "raro" })).toContain("raro");
    expect(messageFor("input:input_too_long", { maxLength: 2000 })).toContain("2000 caracteres");
    expect(messageFor("input:input_too_long")).toContain("caracteres permitidos");
    expect(messageFor("input:unknown_region", { region: "mars-1" })).toContain("mars-1");
    expect(messageFor("input:unknown_region")).toContain("pedida");
    expect(messageFor("input:rate_limited")).toContain("unos segundos");
    expect(messageFor("panel:running", { current: 1, total: 3 })).toBe("Servicio 1 de 3");
    expect(messageFor("panel:running", {})).toBe("Corrida en curso en calculator.aws.");
    expect(messageFor("step:asking_brain", { seconds: Number.NaN })).toContain("(0 s)");
    expect(messageFor("detail:timeout:")).toBe("calculator.aws tardó demasiado en responder.");
    expect(messageFor("reason:option_ambiguous", {})).toContain("el valor pedido");
  });
});

describe("textos compuestos del resultado (BR3.2)", () => {
  it("la sustitución se dice como 'Pediste X; se usó Y.'", () => {
    expect(substitutionText({ requestedValue: "t3.m", appliedValue: "t3.medium" })).toBe(
      "Pediste t3.m; se usó t3.medium.",
    );
  });

  it("un servicio fallido lleva motivo, campo donde se detuvo y sin código técnico", () => {
    const result = makeErrorRunResult();
    const failed = describeServiceResultParts(result.perServiceResults[1]);
    expect(failed.isConfirmed).toBe(false);
    expect(failed.reasonText).toBe('"Plan 9" no es una opción del campo Operating system.');
    expect(failed.notes).toContain("Me detuve en Operating system.");
    const confirmed = describeServiceResult(result.perServiceResults[0]);
    expect(confirmed).toBe("Amazon EC2: guardado y confirmado. Pediste t3.m; se usó t3.medium.");
  });

  it("con servicios guardados el fallo pide abrir un estimado nuevo (R-13)", () => {
    expect(describeFailure(makeErrorRunResult())).toBe(
      "Algunos servicios no se completaron. Abre un estimado nuevo antes de volver a generar.",
    );
    expect(describeFailure(makeConnectionFailure())).toBe(
      "No pude conectar con calculator.aws. Recarga la pestaña y vuelve a intentar.",
    );
    expect(describeFailure({ failureStep: "lost", perServiceResults: [] })).toMatch(
      /^La corrida dejó de responder.*Abre un estimado nuevo en calculator.aws/,
    );
    expect(describeFailure({ failureStep: "services", failureDetail: "cancelled" })).toBe(
      "Cancelaste la corrida; los servicios pendientes no se procesaron.",
    );
  });
});
