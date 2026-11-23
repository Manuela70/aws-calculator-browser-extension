import { describe, expect, it } from "vitest";
import { ERROR_CATALOG, errorResponse, isKnownCode } from "../../brain/core/error-catalog.js";
import {
  operationalMetric,
  seHash,
  toLogRecord,
  withRequestMetrics,
} from "../../brain/core/log-record.js";

describe("error-catalog (BR7.2)", () => {
  it("asigna a cada código su estado HTTP fijo", () => {
    const statuses = Object.fromEntries(
      Object.entries(ERROR_CATALOG).map(([k, v]) => [k, v.status]),
    );
    expect(statuses).toEqual({
      bad_request: 400,
      unauthorized: 401,
      rate_limited: 429,
      daily_quota_exceeded: 429,
      empty_result: 502,
      model_unavailable: 503,
      inventory_unavailable: 503,
      timeout: 504,
      internal_error: 500,
    });
  });

  it("agrega retryAfterSeconds entero solo a rate_limited y el requestId si existe", () => {
    expect(errorResponse("rate_limited", { requestId: "r1", retryAfterSeconds: 2.2 })).toEqual({
      status: 429,
      body: {
        code: "rate_limited",
        message: ERROR_CATALOG.rate_limited.message,
        requestId: "r1",
        retryAfterSeconds: 3,
      },
    });
    expect(errorResponse("rate_limited").body.retryAfterSeconds).toBe(1);
    expect(errorResponse("timeout", { retryAfterSeconds: 5 }).body).not.toHaveProperty(
      "retryAfterSeconds",
    );
  });

  it("trata un código desconocido como internal_error", () => {
    expect(isKnownCode("unknown_service")).toBe(false);
    expect(errorResponse("unknown_service")).toMatchObject({
      status: 500,
      body: { code: "internal_error" },
    });
  });
});

describe("toLogRecord (BR6.1, NFR5.5)", () => {
  it("nunca incluye cuerpo, salida del modelo ni sub en claro", () => {
    const record = toLogRecord(
      {
        requestId: "r-1",
        operation: "interpret",
        inventoryVersion: "2026-11-21",
        code: "ok",
        status: 200,
        latencyMs: 1234.6,
        attempts: 3,
        inputTokens: 900,
        outputTokens: 120,
        sub: "se-123",
        body: { text: "Proyecto secreto ACME" },
        modelOutput: "Amazon EC2 para ACME",
        authorization: "Bearer abc",
      },
      { salt: "sal" },
    );
    const text = JSON.stringify(record);
    expect(text).not.toContain("ACME");
    expect(text).not.toContain("Bearer");
    expect(text).not.toContain("se-123");
    expect(Object.keys(record).sort()).toEqual(
      [
        "attempts",
        "code",
        "inputTokens",
        "inventoryVersion",
        "latencyMs",
        "operation",
        "outputTokens",
        "requestId",
        "seHash",
        "status",
      ].sort(),
    );
    expect(record.attempts).toBe(2);
    expect(record.latencyMs).toBe(1235);
    expect(record.seHash).toBe(seHash("se-123", "sal"));
  });

  it("normaliza valores ausentes o fuera del dominio", () => {
    const record = toLogRecord({ operation: "drop table", inputTokens: -4 });
    expect(record).toMatchObject({
      requestId: null,
      operation: "unknown",
      inventoryVersion: null,
      code: "internal_error",
      inputTokens: 0,
      seHash: null,
    });
  });

  it("emite solo las métricas EMF necesarias, sin dimensiones", () => {
    const ok = withRequestMetrics(
      toLogRecord({ operation: "interpret", code: "ok", status: 200 }),
      1,
    );
    expect(ok._aws.CloudWatchMetrics).toHaveLength(1);
    expect(ok._aws.CloudWatchMetrics[0].Dimensions).toEqual([[]]);
    expect(ok).toMatchObject({ Requests: 1, Errors5xx: 0, Errors429: 0 });
    const err = withRequestMetrics(
      toLogRecord({ operation: "interpret", code: "timeout", status: 504 }),
      1,
    );
    expect(err).toMatchObject({ Errors5xx: 1, code: "timeout", operation: "interpret" });
    expect(err._aws.CloudWatchMetrics).toHaveLength(1);
    expect(err.Errors).toBeUndefined();
    const limited = withRequestMetrics(toLogRecord({ code: "rate_limited", status: 429 }), 1);
    expect(limited.Errors429).toBe(1);
    expect(operationalMetric("UsageGuardFallback", 1, 5)).toMatchObject({
      metric: "UsageGuardFallback",
      UsageGuardFallback: 1,
    });
  });
});
