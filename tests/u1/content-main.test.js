// Integración content-main ↔ chrome/almacenamiento (dobles) y orquestador falso.
import { describe, it, expect, vi } from "vitest";
import { createContentMain } from "../../aws-calculator-extension/lib/content-main.js";
import { makeCancelRpa, makeRunRpa } from "../../aws-calculator-extension/lib/messages.js";
import { createFakeChrome } from "./fake-chrome.js";
import { createSilentConsole } from "./fake-storage.js";
import { makeRunRequest } from "./fixtures.js";

const OWN = { id: "ext-123" };
const DONE_URL = "https://calculator.aws/#/estimate?id=abc";

function setup({ runEstimateFn } = {}) {
  const chromeApi = createFakeChrome();
  const storage = chromeApi.storage.local;
  const consoleApi = createSilentConsole();
  const main = createContentMain({
    chromeApi,
    storage,
    createDom: () => ({}),
    consoleApi,
    now: () => new Date("2026-11-21T10:00:00.000Z"),
    runEstimateFn:
      runEstimateFn ??
      (async (runRequest, deps) => {
        deps.progress(50, "Configurando Amazon EC2 (1/1)…");
        return {
          runId: runRequest.runId,
          status: "DONE",
          estimateUrl: DONE_URL,
          perServiceResults: [
            { requestId: "svc-1", serviceName: "Amazon EC2", status: "confirmed" },
          ],
          finishedAt: "2026-11-21T10:01:00.000Z",
        };
      }),
  });
  return { chromeApi, storage, consoleApi, main };
}

describe("content-main (W3, BR6.1, BR6.3, BR6.6)", () => {
  it("acepta RUN_RPA, emite PROGRESS y cierra con RUN_RESULT", async () => {
    const { chromeApi, main } = setup();
    expect(main.handleMessage(makeRunRpa(makeRunRequest(), 7), OWN)).toEqual({ accepted: true });
    await main.whenIdle();
    const types = chromeApi.runtime.messages.map((m) => m.type);
    expect(types).toContain("PROGRESS");
    expect(types[types.length - 1]).toBe("RUN_RESULT");
    expect(chromeApi.runtime.messages.at(-1).runResult.status).toBe("DONE");
    expect(main.getActiveRunId()).toBeNull();
  });

  it("responde busy si ya hay una corrida en curso en la pestaña", async () => {
    let release;
    const { main } = setup({
      runEstimateFn: (runRequest) =>
        new Promise((resolve) => {
          release = () =>
            resolve({
              runId: runRequest.runId,
              status: "ERROR",
              failureStep: "services",
              perServiceResults: [],
            });
        }),
    });
    main.handleMessage(makeRunRpa(makeRunRequest(), 7), OWN);
    expect(main.handleMessage(makeRunRpa(makeRunRequest({ runId: "otra" }), 7), OWN)).toEqual({
      accepted: false,
      reason: "busy",
    });
    release();
    await main.whenIdle();
  });

  it("ignora mensajes de otro sender.id", () => {
    const { main, consoleApi } = setup();
    expect(main.handleMessage(makeRunRpa(makeRunRequest(), 7), { id: "intrusa" })).toBeNull();
    expect(main.getActiveRunId()).toBeNull();
    expect(consoleApi.calls.some((c) => c.level === "warn")).toBe(true);
  });

  it("crea activeRun durante la corrida y lo borra al terminar", async () => {
    let seenActiveRun = null;
    const { storage, main } = setup({
      runEstimateFn: async (runRequest, deps) => {
        deps.progress(40, "Aplicando…");
        await new Promise((resolve) => setTimeout(resolve, 0));
        seenActiveRun = storage.data.get("activeRun");
        return {
          runId: runRequest.runId,
          status: "ERROR",
          failureStep: "services",
          perServiceResults: [],
        };
      },
    });
    main.handleMessage(makeRunRpa(makeRunRequest(), 7), OWN);
    await main.whenIdle();
    expect(seenActiveRun).toMatchObject({
      runId: "run-test-1",
      tabId: 7,
      lastProgress: { pct: 40 },
    });
    expect(storage.data.has("activeRun")).toBe(false);
  });

  it("RUN_RESULT se envía después de guardar lastRunResult", async () => {
    const { chromeApi, storage, main } = setup();
    const send = chromeApi.runtime.sendMessage;
    let storedWhenSent = null;
    chromeApi.runtime.sendMessage = async (message) => {
      if (message.type === "RUN_RESULT") storedWhenSent = storage.data.get("lastRunResult");
      return send(message);
    };
    main.handleMessage(makeRunRpa(makeRunRequest(), 7), OWN);
    await main.whenIdle();
    expect(storedWhenSent).toMatchObject({ schemaVersion: 1, value: { status: "DONE" } });
  });

  it("sin PROGRESS ni escrituras tras cerrar la corrida; una excepción se vuelve ERROR", async () => {
    let lateProgress;
    const { chromeApi, storage, main } = setup({
      runEstimateFn: async (runRequest, deps) => {
        lateProgress = deps.progress;
        deps.context.step = "service:svc-1";
        throw new Error("inesperado");
      },
    });
    main.handleMessage(makeRunRpa(makeRunRequest(), 7), OWN);
    const result = await main.whenIdle();
    expect(result).toMatchObject({ status: "ERROR", failureStep: "services" });
    const countBefore = chromeApi.runtime.messages.length;
    const writesBefore = storage.operations.length;
    lateProgress(99, "tarde");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(chromeApi.runtime.messages.length).toBe(countBefore);
    expect(storage.operations.length).toBe(writesBefore);
    expect(main.isRunClosed("run-test-1")).toBe(true);
  });

  it("responde PING listo y anota (sin fallar) cuando el panel está cerrado", async () => {
    const { chromeApi, consoleApi, main } = setup();
    expect(main.handleMessage({ type: "PING" }, OWN)).toEqual({ ok: true, ready: true });
    chromeApi.runtime.sendMessage = vi.fn(async () => {
      throw new Error("Receiving end does not exist.");
    });
    main.handleMessage(makeRunRpa(makeRunRequest(), 7), OWN);
    await main.whenIdle();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(consoleApi.calls.some((c) => c.level === "debug")).toBe(true);
  });

  it("CANCEL_RPA aborta solo la corrida en curso y el progreso estructurado conserva el texto (U5)", async () => {
    let seenSignal;
    const { chromeApi, main } = setup({
      runEstimateFn: async (runRequest, deps) => {
        seenSignal = deps.context.signal;
        deps.progress({ step: "adding_service", pct: 20, text: "Configurando…", serviceCount: 1 });
        deps.progress({ step: "mapping_pass", serviceIndex: 0, serviceCount: 1 });
        await new Promise((resolve) => deps.context.signal.addEventListener("abort", resolve));
        return {
          runId: runRequest.runId,
          status: "ERROR",
          failureStep: "services",
          failureDetail: "cancelled",
          perServiceResults: [],
          finishedAt: "2026-11-21T10:01:00.000Z",
        };
      },
    });
    main.handleMessage(makeRunRpa(makeRunRequest(), 7), OWN);
    expect(main.handleMessage(makeCancelRpa("otra-corrida"), OWN)).toEqual({ cancelled: false });
    expect(seenSignal.aborted).toBe(false);
    expect(main.handleMessage(makeCancelRpa("run-test-1"), { id: "otra-ext" })).toBeNull();
    expect(main.handleMessage(makeCancelRpa("run-test-1"), OWN)).toEqual({ cancelled: true });
    const result = await main.whenIdle();
    expect(result.failureDetail).toBe("cancelled");
    const progress = chromeApi.runtime.messages.filter((m) => m.type === "PROGRESS");
    expect(progress.at(-1)).toMatchObject({ step: "mapping_pass", pct: 20, text: "Configurando…" });
    expect(main.handleMessage(makeCancelRpa("run-test-1"), OWN)).toEqual({ cancelled: false });
  });
});
