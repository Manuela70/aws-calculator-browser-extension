import { describe, it, expect, vi, afterEach } from "vitest";
import {
  CALCULATOR_START_URL,
  connectToCalculator,
} from "../../aws-calculator-extension/lib/connection/handshake.js";
import { createFakeChrome } from "./fake-chrome.js";

const READY = { ok: true, ready: true };
const LOADING = { ok: true, ready: false };
const noSleep = vi.fn(async () => true);

afterEach(() => {
  vi.useRealTimers();
  noSleep.mockClear();
});

describe("connectToCalculator (US1.0, BR2.1-BR2.5)", () => {
  it("reutiliza la pestaña existente y conecta al primer PING listo", async () => {
    const chromeApi = createFakeChrome({
      tabs: [{ id: 5, status: "complete" }],
      pingResponses: [READY],
    });
    const result = await connectToCalculator({ chromeApi, sleepFn: noSleep });
    expect(result).toEqual({
      tabId: 5,
      origin: "reused",
      injected: false,
      pingAttempts: 1,
      status: "connected",
    });
    expect(chromeApi.executed).toHaveLength(0);
  });

  it("abre la pestaña, espera a que cargue y conecta", async () => {
    const chromeApi = createFakeChrome({ pingResponses: [READY] });
    chromeApi.setCreatedTabStatus("loading");
    const pending = connectToCalculator({ chromeApi, sleepFn: noSleep });
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    chromeApi.fireTabUpdated(100, { status: "complete" });
    const result = await pending;
    expect(result).toMatchObject({ tabId: 100, origin: "opened", status: "connected" });
    expect(chromeApi.tabsList[0].url).toBe(CALCULATOR_START_URL);
  });

  it("sin respuesta inicial: inyecta content.js y reintenta hasta estar listo", async () => {
    const chromeApi = createFakeChrome({ tabs: [{ id: 5 }], pingResponses: [null, null, READY] });
    const result = await connectToCalculator({ chromeApi, sleepFn: noSleep });
    expect(result).toMatchObject({ status: "connected", injected: true, pingAttempts: 3 });
    expect(chromeApi.executed).toEqual([{ target: { tabId: 5 }, files: ["content.js"] }]);
    expect(noSleep).toHaveBeenCalledWith(1000);
  });

  it("ready:false consume intentos y se agota en 4 PING", async () => {
    const chromeApi = createFakeChrome({
      tabs: [{ id: 5 }],
      pingResponses: [LOADING, LOADING, LOADING, LOADING, READY],
    });
    const result = await connectToCalculator({ chromeApi, sleepFn: noSleep });
    expect(result).toMatchObject({
      status: "unreachable",
      failure: "not_ready",
      pingAttempts: 4,
      injected: false,
    });
    expect(chromeApi.sent).toHaveLength(4);
  });

  it("ok:false (el módulo no cargó) → unreachable sin más intentos", async () => {
    const chromeApi = createFakeChrome({
      tabs: [{ id: 5 }],
      pingResponses: [{ ok: false, ready: false }],
    });
    const result = await connectToCalculator({ chromeApi, sleepFn: noSleep });
    expect(result).toMatchObject({
      status: "unreachable",
      failure: "module_load_failed",
      pingAttempts: 1,
    });
  });

  it("falla de inyección o 4 PING sin receptor → unreachable", async () => {
    const injectFails = createFakeChrome({ tabs: [{ id: 5 }], pingResponses: [null] });
    injectFails.failInjection(new Error("Cannot access contents"));
    expect(await connectToCalculator({ chromeApi: injectFails, sleepFn: noSleep })).toMatchObject({
      status: "unreachable",
      failure: "inject_failed",
    });

    const silent = createFakeChrome({ tabs: [{ id: 5 }], pingResponses: [null, null, null, null] });
    expect(await connectToCalculator({ chromeApi: silent, sleepFn: noSleep })).toMatchObject({
      status: "unreachable",
      failure: "no_response",
      pingAttempts: 4,
    });
  });

  it("la pestaña abierta tarda más de 20 s en cargar → unreachable", async () => {
    vi.useFakeTimers();
    const chromeApi = createFakeChrome({ pingResponses: [READY] });
    const pending = connectToCalculator({ chromeApi, sleepFn: noSleep });
    await vi.advanceTimersByTimeAsync(20000);
    await expect(pending).resolves.toMatchObject({
      status: "unreachable",
      failure: "tab_load_timeout",
    });
    expect(chromeApi.sent).toHaveLength(0);
  });

  it("si abrir la pestaña falla → unreachable open_failed", async () => {
    const chromeApi = createFakeChrome();
    chromeApi.tabs.create = async () => {
      throw new Error("bloqueado");
    };
    expect(await connectToCalculator({ chromeApi, sleepFn: noSleep })).toMatchObject({
      status: "unreachable",
      failure: "open_failed",
    });
  });
});
