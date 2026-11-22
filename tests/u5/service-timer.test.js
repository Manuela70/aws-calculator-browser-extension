// Corte de 180 s por servicio con reloj inyectable y señal de la corrida (BR2.7; NFR8.4).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createServiceTimer,
  EXIT_TIMEOUT_MS,
  EXIT_TIMEOUT_REASON,
  raceWithSignal,
  SERVICE_TIMEOUT_MS,
} from "../../aws-calculator-extension/lib/rpa/service-timer.js";

// Reloj falso explícito: registra los temporizadores y los dispara a mano.
function createFakeClock() {
  const timers = new Map();
  let nextId = 1;
  return {
    timers,
    setTimeout(fn, ms) {
      const id = nextId++;
      timers.set(id, { fn, ms });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    fireAll() {
      for (const [id, timer] of [...timers]) {
        timers.delete(id);
        timer.fn();
      }
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createServiceTimer", () => {
  it("programa el corte de 180 s en el reloj inyectado y aborta con service_timeout", () => {
    const clock = createFakeClock();
    const timer = createServiceTimer({ clock });
    expect([...clock.timers.values()][0].ms).toBe(SERVICE_TIMEOUT_MS);
    expect(timer.isExpired()).toBe(false);
    clock.fireAll();
    expect(timer.isExpired()).toBe(true);
    expect(timer.abortReason()).toBe("service_timeout");
  });

  it("con temporizadores falsos, corta exactamente a los 180 s", async () => {
    const timer = createServiceTimer();
    await vi.advanceTimersByTimeAsync(SERVICE_TIMEOUT_MS - 1);
    expect(timer.signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(timer.signal.reason).toBe("service_timeout");
  });

  it("la cancelación de la corrida se propaga a la señal del servicio con su motivo", () => {
    const run = new AbortController();
    const timer = createServiceTimer({ clock: createFakeClock(), runSignal: run.signal });
    run.abort("cancelled");
    expect(timer.signal.aborted).toBe(true);
    expect(timer.abortReason()).toBe("cancelled");
    expect(timer.isExpired()).toBe(false);
  });

  it("una corrida ya cancelada aborta el servicio sin programar el corte", () => {
    const run = new AbortController();
    run.abort();
    const clock = createFakeClock();
    const timer = createServiceTimer({ clock, runSignal: run.signal });
    expect(timer.signal.aborted).toBe(true);
    expect(timer.abortReason()).toBe("cancelled");
    expect(clock.timers.size).toBe(0);
  });

  it("clear() quita el temporizador y el oyente: sin efecto tardío", () => {
    const run = new AbortController();
    const clock = createFakeClock();
    const timer = createServiceTimer({ clock, runSignal: run.signal });
    timer.clear();
    timer.clear();
    expect(clock.timers.size).toBe(0);
    run.abort("cancelled");
    expect(timer.signal.aborted).toBe(false);
    expect(timer.abortReason()).toBeUndefined();
  });

  it("la salida sin guardar usa su propia señal de 20 s, independiente del servicio", async () => {
    const service = createServiceTimer({ timeoutMs: 10 });
    await vi.advanceTimersByTimeAsync(10);
    const exit = createServiceTimer({ timeoutMs: EXIT_TIMEOUT_MS, reason: EXIT_TIMEOUT_REASON });
    expect(service.signal.aborted).toBe(true);
    expect(exit.signal.aborted).toBe(false);
    const race = raceWithSignal(new Promise(() => {}), exit.signal);
    await vi.advanceTimersByTimeAsync(EXIT_TIMEOUT_MS);
    await expect(race).resolves.toEqual({ timedOut: true, reason: "exit_timeout" });
  });
});
