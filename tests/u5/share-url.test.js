// Validación del enlace de Share (NFR5.4; decisión 3 del plan).
import { describe, it, expect } from "vitest";
import {
  aggregate,
  finalizeRunResult,
  validateShareUrl,
} from "../../aws-calculator-extension/lib/rpa/result-aggregator.js";
import { makeServiceRequest, makeServiceResult } from "../u1/fixtures.js";
import { SHARE_URL_OK } from "./fixtures.js";

const now = () => new Date("2026-11-22T10:00:00.000Z");

function finalize(shareUrl) {
  const aggregation = aggregate([makeServiceRequest()], [makeServiceResult()]);
  return finalizeRunResult({ runId: "r1", aggregation, estimateMatches: true, shareUrl, now });
}

describe("validateShareUrl", () => {
  it("acepta el formato exacto del estimado compartido", () => {
    expect(validateShareUrl(SHARE_URL_OK)).toBe(true);
    expect(validateShareUrl("https://calculator.aws/#/estimate?id=abc123")).toBe(true);
    expect(validateShareUrl(`https://calculator.aws/#/estimate?id=${"a".repeat(128)}`)).toBe(true);
  });

  it("rechaza otro host, otro esquema o una ruta distinta", () => {
    expect(validateShareUrl("https://evil.com/#/estimate?id=abc")).toBe(false);
    expect(validateShareUrl("https://calculator.aws.evil.com/#/estimate?id=abc")).toBe(false);
    expect(validateShareUrl("http://calculator.aws/#/estimate?id=abc")).toBe(false);
    expect(validateShareUrl("https://calculator.aws/#/addService")).toBe(false);
  });

  it("rechaza javascript:, vacío y valores que no son texto", () => {
    expect(validateShareUrl("javascript:alert(1)")).toBe(false);
    expect(validateShareUrl("")).toBe(false);
    expect(validateShareUrl(undefined)).toBe(false);
    expect(validateShareUrl(42)).toBe(false);
  });

  it("rechaza un id vacío, con caracteres extra o de más de 128", () => {
    expect(validateShareUrl("https://calculator.aws/#/estimate?id=")).toBe(false);
    expect(validateShareUrl("https://calculator.aws/#/estimate?id=abc&x=<script>")).toBe(false);
    expect(validateShareUrl(`https://calculator.aws/#/estimate?id=${"a".repeat(129)}`)).toBe(false);
  });

  it("un enlace inválido es ERROR share con share_invalid y sin URL; sin enlace no hay motivo", () => {
    const invalid = finalize("javascript:alert(1)");
    expect(invalid).toMatchObject({
      status: "ERROR",
      failureStep: "share",
      failureDetail: "share_invalid",
    });
    expect(invalid.estimateUrl).toBeUndefined();
    const absent = finalize(undefined);
    expect(absent.failureStep).toBe("share");
    expect(absent.failureDetail).toBeUndefined();
    expect(finalize(SHARE_URL_OK)).toMatchObject({ status: "DONE", estimateUrl: SHARE_URL_OK });
  });
});
