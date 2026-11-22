import { describe, it, expect } from "vitest";
import {
  aggregate,
  estimateMatchesRequest,
  finalizeRunResult,
} from "../../aws-calculator-extension/lib/rpa/result-aggregator.js";
import { makeServiceRequest, makeServiceResult } from "./fixtures.js";

const now = () => new Date("2026-11-21T10:00:00.000Z");
const URL_OK = "https://calculator.aws/#/estimate?id=abc";

function twoRequests() {
  return [
    makeServiceRequest(),
    makeServiceRequest({ requestId: "svc-2", serviceName: "AWS Lambda", searchTerm: "AWS Lambda" }),
  ];
}

describe("aggregate (BR5.1)", () => {
  it("todos confirmados → allConfirmed y DONE con URL tras las demás comprobaciones", () => {
    const aggregation = aggregate([makeServiceRequest()], [makeServiceResult()]);
    expect(aggregation.allConfirmed).toBe(true);
    const result = finalizeRunResult({
      runId: "r1",
      aggregation,
      estimateMatches: true,
      shareUrl: URL_OK,
      now,
    });
    expect(result).toMatchObject({ status: "DONE", estimateUrl: URL_OK });
  });

  it("uno faltante → ERROR services sin URL, conservando el motivo de cada fallo", () => {
    const failed = makeServiceResult({
      requestId: "svc-2",
      serviceName: "AWS Lambda",
      status: "failed",
      reason: "save_not_confirmed",
    });
    const aggregation = aggregate(twoRequests(), [makeServiceResult(), failed]);
    expect(aggregation.missingIds).toEqual(["svc-2"]);
    const result = finalizeRunResult({
      runId: "r1",
      aggregation,
      estimateMatches: true,
      shareUrl: URL_OK,
      now,
    });
    expect(result.status).toBe("ERROR");
    expect(result.failureStep).toBe("services");
    expect(result.estimateUrl).toBeUndefined();
    expect(result.perServiceResults[1].reason).toBe("save_not_confirmed");
  });

  it("un servicio pedido sin resultado cuenta como fallido", () => {
    const aggregation = aggregate(twoRequests(), [makeServiceResult()]);
    expect(aggregation.allConfirmed).toBe(false);
    expect(aggregation.perServiceResults[1]).toMatchObject({
      status: "failed",
      reason: "unexpected_error",
    });
  });

  it("cero servicios nunca es éxito", () => {
    expect(aggregate([], []).allConfirmed).toBe(false);
  });

  it("nunca produce PARTIAL ni DONE sin enlace válido, contenido exacto o renombrado", () => {
    const aggregation = aggregate([makeServiceRequest()], [makeServiceResult()]);
    const base = { runId: "r1", aggregation, now };
    expect(
      finalizeRunResult({ ...base, estimateMatches: false, shareUrl: URL_OK }).failureStep,
    ).toBe("estimate_check");
    expect(
      finalizeRunResult({ ...base, estimateMatches: true, renameOk: false, shareUrl: URL_OK })
        .failureStep,
    ).toBe("rename");
    expect(
      finalizeRunResult({ ...base, estimateMatches: true, shareUrl: "https://evil.com/x" })
        .failureStep,
    ).toBe("share");
    const statuses = [true, false].map(
      (m) => finalizeRunResult({ ...base, estimateMatches: m, shareUrl: URL_OK }).status,
    );
    expect(statuses.every((s) => s === "DONE" || s === "ERROR")).toBe(true);
  });

  it("verifica que el estimado contiene exactamente lo pedido (BR5.6)", () => {
    const requested = twoRequests();
    expect(estimateMatchesRequest(requested, ["AWS Lambda", "Amazon EC2"])).toBe(true);
    expect(estimateMatchesRequest(requested, ["Amazon EC2"])).toBe(false);
    expect(estimateMatchesRequest(requested, ["Amazon EC2", "Amazon EC2"])).toBe(false);
    expect(estimateMatchesRequest(requested, ["Amazon EC2", "AWS Lambda", "Amazon S3"])).toBe(
      false,
    );
    expect(estimateMatchesRequest(requested, undefined)).toBe(false);
  });
});
