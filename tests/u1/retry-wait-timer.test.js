import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sleep, waitFor } from "../../aws-calculator-extension/lib/rpa/wait.js";
import { canAttempt, retry } from "../../aws-calculator-extension/lib/rpa/retry.js";
import {
  createServiceTimer,
  raceWithSignal,
  SERVICE_TIMEOUT_MS,
} from "../../aws-calculator-extension/lib/rpa/service-timer.js";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("waitFor y sleep (BR4.10)", () => {
  it("devuelve el valor en cuanto la condición se cumple", async () => {
    let ready = false;
    setTimeout(() => {
      ready = true;
    }, 600);
    const pending = waitFor(() => ready && "listo");
    await vi.advanceTimersByTimeAsync(750);
    await expect(pending).resolves.toEqual({ ok: true, value: "listo" });
  });

  it("se agota a los 20 s con un resultado tipado, sin lanzar", async () => {
    const pending = waitFor(() => false, { label: "formulario" });
    await vi.advanceTimersByTimeAsync(20000);
    await expect(pending).resolves.toEqual({ ok: false, reason: "timeout", label: "formulario" });
  });

  it("termina en cuanto se cancela el signal", async () => {
    const controller = new AbortController();
    const pending = waitFor(() => false, { signal: controller.signal });
    await vi.advanceTimersByTimeAsync(300);
    controller.abort("service_timeout");
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toMatchObject({ ok: false, reason: "cancelled" });
    expect(await sleep(100, controller.signal)).toBe(false);
  });

  it("una condición que lanza se reporta como error tipado", async () => {
    const result = await waitFor(() => {
      throw new Error("nodo desconectado");
    });
    expect(result).toMatchObject({ ok: false, reason: "error", error: "nodo desconectado" });
  });
});

describe("retry (BR4.6, NFR8.4)", () => {
  it("hace como máximo 3 intentos y reporta agotado", async () => {
    const attempt = vi.fn(async () => ({ status: "retry", reason: "not_confirmed" }));
    const result = await retry(attempt, { operation: "save" });
    expect(attempt).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({
      ok: false,
      reason: "exhausted",
      lastReason: "not_confirmed",
      attempts: 3,
    });
    expect(canAttempt(3, 3)).toBe(false);
  });

  it("corta sin más intentos ante un fallo definitivo", async () => {
    const attempt = vi.fn(async () => ({
      status: "fail",
      reason: "validation_required",
      detail: "OS",
    }));
    const result = await retry(attempt, { maxAttempts: 3 });
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: false, reason: "validation_required", detail: "OS", attempts: 1 });
  });

  it("espera entre intentos y se detiene si se cancela", async () => {
    const controller = new AbortController();
    const attempt = vi.fn(async (n) =>
      n === 2 ? { status: "success", value: n } : { status: "retry" },
    );
    const ok = retry(attempt, { maxAttempts: 4, delayMs: 1000 });
    await vi.advanceTimersByTimeAsync(1000);
    await expect(ok).resolves.toEqual({ ok: true, value: 2, attempts: 2 });

    const cancelled = retry(async () => ({ status: "retry" }), {
      maxAttempts: 4,
      delayMs: 1000,
      signal: controller.signal,
    });
    controller.abort();
    await vi.advanceTimersByTimeAsync(1000);
    await expect(cancelled).resolves.toMatchObject({ ok: false, reason: "cancelled" });
  });
});

describe("service-timer (NFR8.6)", () => {
  it("dispara service_timeout a los 180 s, con precisión ≤ 1 s", async () => {
    const timer = createServiceTimer();
    await vi.advanceTimersByTimeAsync(SERVICE_TIMEOUT_MS - 1);
    expect(timer.isExpired()).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(timer.isExpired()).toBe(true);
    expect(timer.signal.reason).toBe("service_timeout");
    expect(timer.elapsedMs()).toBeLessThanOrEqual(SERVICE_TIMEOUT_MS + 1000);
  });

  it("un resultado tardío tras el corte se ignora", async () => {
    const timer = createServiceTimer({ timeoutMs: 1000 });
    const slow = new Promise((resolve) => setTimeout(() => resolve("banner tardío"), 5000));
    const race = raceWithSignal(slow, timer.signal);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(race).resolves.toEqual({ timedOut: true, reason: "service_timeout" });
    await vi.advanceTimersByTimeAsync(5000);
  });

  it("limpia el temporizador al terminar el servicio", async () => {
    const timer = createServiceTimer({ timeoutMs: 1000 });
    const race = raceWithSignal(Promise.resolve("ok"), timer.signal);
    await expect(race).resolves.toEqual({ timedOut: false, value: "ok" });
    timer.clear();
    timer.clear();
    await vi.advanceTimersByTimeAsync(2000);
    expect(timer.isExpired()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("propaga el error de la promesa como dato y respeta un signal ya cancelado", async () => {
    const controller = new AbortController();
    const failing = raceWithSignal(Promise.reject(new Error("x")), controller.signal);
    await expect(failing).resolves.toMatchObject({ timedOut: false });
    controller.abort("cancelled");
    await expect(raceWithSignal(new Promise(() => {}), controller.signal)).resolves.toEqual({
      timedOut: true,
      reason: "cancelled",
    });
  });
});
