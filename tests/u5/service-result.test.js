// Armado de ServiceResult y ProgressEvent (NFR3.4, NFR5.5, NFR8.6; BR4.2, BR4.3).
import { describe, it, expect } from "vitest";
import {
  buildProgressEvent,
  buildServiceResult,
  clip,
  collectSubstitutions,
} from "../../aws-calculator-extension/lib/rpa/result-aggregator.js";
import { describeServiceResult } from "../../aws-calculator-extension/lib/messages-es.js";
import { makeAction, makeEc2Request, makeSubstitutedAction } from "./fixtures.js";

describe("buildServiceResult", () => {
  it("copia cada sustitución aplicada del cerebro, sin ninguna faltante (NFR3.4)", () => {
    const applied = [
      makeAction(),
      makeSubstitutedAction(),
      makeSubstitutedAction({
        requestKey: "Operating system",
        requestedValue: "linux server",
        value: "Linux",
      }),
    ];
    const result = buildServiceResult(makeEc2Request(), {
      status: "confirmed",
      durationMs: 1234.4,
      appliedActions: applied,
    });
    expect(result).toEqual({
      requestId: "svc-1",
      serviceName: "Amazon EC2",
      status: "confirmed",
      durationMs: 1234,
      brainSubstitutions: [
        { key: "Instance type", requestedValue: "t3.m", appliedValue: "t3.medium" },
        { key: "Operating system", requestedValue: "linux server", appliedValue: "Linux" },
      ],
    });
    expect(describeServiceResult(result)).toBe(
      "Amazon EC2: guardado y confirmado. Pediste t3.m; se usó t3.medium. Pediste linux server; se usó Linux.",
    );
  });

  it("una acción del cerebro con la opción exacta pedida no entra en las sustituciones", () => {
    expect(collectSubstitutions([makeAction({ source: "brain" })])).toEqual([]);
    expect(collectSubstitutions(undefined)).toEqual([]);
    const result = buildServiceResult(makeEc2Request(), {
      status: "confirmed",
      appliedActions: [makeAction({ source: "brain" })],
    });
    expect(result.brainSubstitutions).toBeUndefined();
  });

  it("copia brainErrorCode y conserva motivo, detalle y dónde se detuvo", () => {
    const result = buildServiceResult(makeEc2Request(), {
      status: "failed",
      reason: "field_not_recognized",
      detail: "Cantidad: no_match; brain_unavailable (unauthorized)",
      stoppedAtLabel: "EC2 specifications > Number of instances",
      brainErrorCode: "unauthorized",
      durationMs: 50,
    });
    expect(result).toMatchObject({
      status: "failed",
      reason: "field_not_recognized",
      brainErrorCode: "unauthorized",
      stoppedAtLabel: "EC2 specifications > Number of instances",
      durationMs: 50,
    });
  });

  it("recorta a 200 caracteres todo texto que viene del DOM (NFR5.5)", () => {
    const long = "x".repeat(500);
    const result = buildServiceResult(makeEc2Request(), {
      status: "failed",
      reason: "field_not_applied",
      detail: long,
      stoppedAtLabel: long,
      appliedActions: [makeSubstitutedAction({ value: long })],
    });
    expect(result.detail).toHaveLength(200);
    expect(result.stoppedAtLabel).toHaveLength(200);
    expect(result.brainSubstitutions[0].appliedValue).toHaveLength(200);
    expect(clip("corto")).toBe("corto");
    expect(clip(null)).toBe("");
    expect(clip("abcdef", 4)).toBe("abc…");
  });

  it("un fallo sin motivo válido es unexpected_error y la duración nunca es negativa", () => {
    const result = buildServiceResult(makeEc2Request(), {
      status: "failed",
      reason: "motivo_inventado",
      durationMs: -5,
      listedInEstimate: true,
    });
    expect(result.reason).toBe("unexpected_error");
    expect(result.durationMs).toBe(0);
    expect(result.listedInEstimate).toBe(true);
    expect(buildServiceResult(makeEc2Request()).durationMs).toBe(0);
  });
});

describe("buildProgressEvent (BR4.2, decisión 2)", () => {
  it("arma un evento estructurado por servicio y paso, sin pct ni text (decisión 7 de U6)", () => {
    const event = buildProgressEvent({
      runId: "r1",
      step: "applying_action",
      serviceIndex: 1,
      serviceCount: 3,
      requestId: "svc-2",
      label: "Number of requests",
      serviceStatus: "in_progress",
      pct: 40,
      text: "Aplicando Number of requests = 1000…",
    });
    expect(event).toEqual({
      runId: "r1",
      step: "applying_action",
      serviceIndex: 1,
      serviceCount: 3,
      requestId: "svc-2",
      label: "Number of requests",
      serviceStatus: "in_progress",
    });
  });

  it("recorta la etiqueta, ignora un estado desconocido y rechaza un paso que no existe", () => {
    const event = buildProgressEvent({
      runId: "r1",
      step: "saving",
      label: "y".repeat(300),
      serviceStatus: "raro",
    });
    expect(event.label).toHaveLength(200);
    expect(event.serviceStatus).toBeUndefined();
    expect(event.serviceCount).toBe(0);
    expect(() => buildProgressEvent({ runId: "r1", step: "volando" })).toThrow(RangeError);
  });
});
