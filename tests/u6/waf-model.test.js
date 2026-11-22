// waf-model.js: pedido de /waf-evaluate y validación de la respuesta (BR2.2, BR4.1, decisión 8).
import { describe, it, expect } from "vitest";
import {
  WAF_LIMITS,
  WAF_PHASES,
  buildWafRequest,
  validateWafResponse,
} from "../../aws-calculator-extension/lib/panel/waf-model.js";
import { makeDoneRunResult, makeJsonRun, makeWafResponse } from "./fixtures.js";

describe("buildWafRequest", () => {
  it("arma el pedido pre_fill con nombre y configuración de texto por servicio", async () => {
    const run = await makeJsonRun();
    const request = buildWafRequest(run, null, WAF_PHASES.PRE_FILL);
    expect(request.phase).toBe("pre_fill");
    expect(request.services).toHaveLength(2);
    expect(request.services[0]).toEqual({
      name: "Amazon EC2",
      config: { Region: "us-east-1", "Operating system": "Linux", "Instance type": "t3.micro" },
    });
  });

  it("sin configuración en memoria usa los nombres del RunResult; fase desconocida es post_fill", () => {
    const request = buildWafRequest(null, makeDoneRunResult(), "otra");
    expect(request).toEqual({
      phase: "post_fill",
      services: [
        { name: "Amazon EC2", config: {} },
        { name: "Amazon S3", config: {} },
      ],
    });
  });

  it("respeta los topes de C2 (30 claves, 100 caracteres, 20 servicios)", () => {
    const fields = Array.from({ length: 40 }, (_, i) => ({ key: `k${i}`, value: "v".repeat(150) }));
    const services = Array.from({ length: 25 }, (_, i) => ({
      serviceName: `S${i}`,
      fields,
      toggles: [{ label: "On", wantOn: true }],
    }));
    const request = buildWafRequest({ services }, null, WAF_PHASES.PRE_FILL);
    expect(request.services).toHaveLength(WAF_LIMITS.services);
    expect(Object.keys(request.services[0].config)).toHaveLength(WAF_LIMITS.configKeys);
    expect(request.services[0].config.k0).toHaveLength(WAF_LIMITS.keyOrValueChars);
  });
});

describe("validateWafResponse", () => {
  it("acepta una respuesta válida, la ordena por serviceIndex y dice si hay hallazgos", () => {
    const response = makeWafResponse();
    response.perService.reverse();
    const checked = validateWafResponse(response, { serviceCount: 2 });
    expect(checked.ok).toBe(true);
    expect(checked.value.hasFindings).toBe(true);
    expect(checked.value.perService.map((item) => item.serviceIndex)).toEqual([0, 1]);
    const clean = validateWafResponse(makeWafResponse({ withFindings: false }), {
      serviceCount: 2,
    });
    expect(clean.value.hasFindings).toBe(false);
  });

  it("pilar o severidad fuera de la lista es inválido", () => {
    const pillar = makeWafResponse();
    pillar.perService[0].recommendations[0].pillar = "Magic";
    expect(validateWafResponse(pillar, { serviceCount: 2 })).toEqual({
      ok: false,
      code: "empty_result",
    });
    const severity = makeWafResponse();
    severity.perService[0].recommendations[0].severity = "critical";
    expect(validateWafResponse(severity, { serviceCount: 2 }).ok).toBe(false);
  });

  it("serviceIndex fuera de rango o repetido es inválido", () => {
    const outOfRange = makeWafResponse();
    outOfRange.perService[1].serviceIndex = 5;
    expect(validateWafResponse(outOfRange, { serviceCount: 2 }).ok).toBe(false);
    const repeated = makeWafResponse();
    repeated.perService[1].serviceIndex = 0;
    expect(validateWafResponse(repeated, { serviceCount: 2 }).ok).toBe(false);
  });

  it("vacío sin noFindings, lista vacía o forma rara nunca es una lista vacía válida", () => {
    const empty = makeWafResponse();
    empty.perService[0].recommendations = [];
    expect(validateWafResponse(empty, { serviceCount: 2 }).ok).toBe(false);
    const contradictory = makeWafResponse({ withFindings: false });
    contradictory.perService[0].recommendations = [
      { pillar: "Security", severity: "low", text: "x" },
    ];
    expect(validateWafResponse(contradictory, { serviceCount: 2 }).ok).toBe(false);
    expect(validateWafResponse({ perService: [] }, { serviceCount: 2 }).ok).toBe(false);
    expect(validateWafResponse(null).ok).toBe(false);
    expect(validateWafResponse({ perService: "x" }).ok).toBe(false);
  });

  it("textos de más de 300 caracteres o más de 5 recomendaciones son inválidos", () => {
    const long = makeWafResponse();
    long.perService[0].recommendations[0].text = "x".repeat(301);
    expect(validateWafResponse(long, { serviceCount: 2 }).ok).toBe(false);
    const many = makeWafResponse();
    many.perService[0].recommendations = Array.from({ length: 6 }, () => ({
      pillar: "Security",
      severity: "low",
      text: "x",
    }));
    expect(validateWafResponse(many, { serviceCount: 2 }).ok).toBe(false);
  });
});
