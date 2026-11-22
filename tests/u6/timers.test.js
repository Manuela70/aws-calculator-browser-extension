// timers.js: topes del panel con reloj inyectable (NFR8.4, NFR8.5).
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  TIMEOUTS,
  createTimers,
  systemClock,
  withTimeout,
} from "../../aws-calculator-extension/lib/panel/timers.js";

afterEach(() => vi.useRealTimers());

describe("TIMEOUTS", () => {
  it("fija 30 s, 35 s, 20 s, 2 s y 300 ms", () => {
    expect(TIMEOUTS).toMatchObject({
      INTERPRET_MS: 30000,
      BRAIN_CALL_MS: 35000,
      CANCEL_RUN_MS: 20000,
      SESSION_MS: 2000,
      RESUME_MS: 300,
    });
  });
});

describe("createTimers", () => {
  it("dispara al vencer, y arrancar el mismo nombre reemplaza al anterior", () => {
    vi.useFakeTimers();
    const timers = createTimers(systemClock);
    const fired = [];
    timers.start("review", TIMEOUTS.BRAIN_CALL_MS, () => fired.push("a"));
    vi.advanceTimersByTime(30000);
    timers.start("review", TIMEOUTS.BRAIN_CALL_MS, () => fired.push("b"));
    vi.advanceTimersByTime(34999);
    expect(fired).toEqual([]);
    expect(timers.has("review")).toBe(true);
    vi.advanceTimersByTime(1);
    expect(fired).toEqual(["b"]);
    expect(timers.has("review")).toBe(false);
  });

  it("stop y stopAll cancelan; every repite hasta stop", () => {
    vi.useFakeTimers();
    const timers = createTimers();
    const fired = [];
    timers.start("a", 100, () => fired.push("a"));
    timers.start("b", 100, () => fired.push("b"));
    expect(timers.stop("a")).toBe(true);
    expect(timers.stop("a")).toBe(false);
    timers.every("watch", 50, () => fired.push("w"));
    vi.advanceTimersByTime(160);
    expect(fired).toEqual(["w", "b", "w", "w"]);
    timers.stopAll();
    vi.advanceTimersByTime(500);
    expect(fired).toHaveLength(4);
  });
});

describe("withTimeout", () => {
  it("devuelve el valor si llega antes del tope", async () => {
    vi.useFakeTimers();
    const value = withTimeout(Promise.resolve({ authenticated: true }), TIMEOUTS.SESSION_MS);
    await expect(value).resolves.toEqual({ authenticated: true });
  });

  it("vencido el tope devuelve el respaldo; un rechazo se propaga", async () => {
    vi.useFakeTimers();
    const never = new Promise(() => {});
    const pending = withTimeout(never, TIMEOUTS.SESSION_MS, { fallback: "sin respuesta" });
    await vi.advanceTimersByTimeAsync(TIMEOUTS.SESSION_MS);
    await expect(pending).resolves.toBe("sin respuesta");
    await expect(withTimeout(Promise.reject(new Error("x")), 10)).rejects.toThrow("x");
  });
});
