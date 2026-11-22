// RetryCounter puro (BR4.1; NFR8.5; AC6.2.2).
import { describe, it, expect, vi } from "vitest";
import { RETRY_LIMITS, RetryCounter, retry } from "../../aws-calculator-extension/lib/rpa/retry.js";

describe("RetryCounter", () => {
  it.each([
    ["save", 3],
    ["search_service", 2],
    ["dropdown_open", 2],
    ["page_wait", 1],
  ])("%s permite exactamente %i intentos", (operation, max) => {
    const counter = new RetryCounter(operation);
    let allowed = 0;
    while (counter.next()) allowed += 1;
    expect(allowed).toBe(max);
    expect(counter.exhausted).toBe(true);
    expect(counter.next()).toBe(false);
    expect(counter.attempt).toBe(max);
    expect(RETRY_LIMITS[operation]).toBe(max);
  });

  it("guarda el código del último fallo y lo expone en la instantánea", () => {
    const counter = new RetryCounter("save");
    counter.next();
    counter.fail("not_confirmed");
    counter.next();
    counter.fail("timeout");
    expect(counter.snapshot()).toEqual({
      operation: "save",
      attempt: 2,
      maxAttempts: 3,
      exhausted: false,
      lastCode: "timeout",
    });
    expect(counter.fail().lastCode).toBeNull();
  });

  it("una operación desconocida o un tope inválido es un error de programación", () => {
    expect(() => new RetryCounter("volar")).toThrow(RangeError);
    expect(() => new RetryCounter("save", 0)).toThrow(RangeError);
    expect(new RetryCounter("custom", 5).maxAttempts).toBe(5);
  });
});

describe("retry() sobre RetryCounter", () => {
  it("usa el tope de la operación y devuelve el último código al agotarse", async () => {
    const attempt = vi.fn(async (n) => ({ status: "retry", reason: `fallo-${n}` }));
    const result = await retry(attempt, { operation: "search_service" });
    expect(attempt).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ ok: false, reason: "exhausted", lastReason: "fallo-2", attempts: 2 });
  });

  it("un éxito en el segundo intento corta y no consume el tercero", async () => {
    const attempt = vi.fn(async (n) => (n === 2 ? { status: "success", value: "ok" } : {}));
    await expect(retry(attempt, { operation: "save" })).resolves.toEqual({
      ok: true,
      value: "ok",
      attempts: 2,
    });
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it("una señal ya cancelada no hace ningún intento", async () => {
    const controller = new AbortController();
    controller.abort();
    const attempt = vi.fn();
    const result = await retry(attempt, { operation: "save", signal: controller.signal });
    expect(result).toEqual({ ok: false, reason: "cancelled", attempts: 0 });
    expect(attempt).not.toHaveBeenCalled();
  });
});
