// sw/keepalive.js: ping cada 20 s mientras haya trabajos en curso (NFR8.1).
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  createKeepalive,
  KEEPALIVE_INTERVAL_MS,
} from "../../aws-calculator-extension/sw/keepalive.js";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("sw/keepalive", () => {
  it("hace ping cada 20 s mientras hay un trabajo", () => {
    const ping = vi.fn(async () => ({}));
    const keepalive = createKeepalive({ ping });
    keepalive.acquire();
    vi.advanceTimersByTime(KEEPALIVE_INTERVAL_MS * 3);
    expect(ping).toHaveBeenCalledTimes(3);
    keepalive.release();
  });

  it("se detiene cuando el contador vuelve a cero", () => {
    const ping = vi.fn();
    const keepalive = createKeepalive({ ping });
    keepalive.acquire();
    keepalive.release();
    vi.advanceTimersByTime(KEEPALIVE_INTERVAL_MS * 3);
    expect(ping).not.toHaveBeenCalled();
    expect(keepalive.activeCount()).toBe(0);
  });

  it("con trabajos anidados mantiene un solo intervalo hasta que termina el último", async () => {
    const ping = vi.fn();
    const keepalive = createKeepalive({ ping });
    let finishFirst;
    const first = keepalive.run(() => new Promise((resolve) => (finishFirst = resolve)));
    const second = keepalive.run(async () => "listo");
    expect(await second).toBe("listo");
    expect(keepalive.activeCount()).toBe(1);
    vi.advanceTimersByTime(KEEPALIVE_INTERVAL_MS);
    expect(ping).toHaveBeenCalledTimes(1);
    finishFirst();
    await first;
    vi.advanceTimersByTime(KEEPALIVE_INTERVAL_MS * 2);
    expect(ping).toHaveBeenCalledTimes(1);
  });

  it("no baja de cero con release de más", () => {
    const keepalive = createKeepalive({ ping: vi.fn() });
    keepalive.release();
    keepalive.release();
    expect(keepalive.activeCount()).toBe(0);
    keepalive.acquire();
    expect(keepalive.activeCount()).toBe(1);
    keepalive.release();
  });

  it("suelta el contador aunque el trabajo falle", async () => {
    const keepalive = createKeepalive({ ping: vi.fn() });
    await expect(keepalive.run(async () => Promise.reject(new Error("x")))).rejects.toThrow("x");
    expect(keepalive.activeCount()).toBe(0);
  });

  it("un ping que falla o lanza se avisa sin detener el intervalo", async () => {
    const onError = vi.fn();
    let calls = 0;
    const ping = () => {
      calls += 1;
      if (calls === 1) throw new Error("sin runtime");
      return Promise.reject(new Error("rechazado"));
    };
    const keepalive = createKeepalive({ ping, onError });
    keepalive.acquire();
    await vi.advanceTimersByTimeAsync(KEEPALIVE_INTERVAL_MS * 2);
    expect(onError).toHaveBeenCalledTimes(2);
    keepalive.release();
  });
});
