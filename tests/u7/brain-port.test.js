// lib/connection/brain-port.js: adaptador de página del borde, y cableado de mapResidue
// en content-main (contrato C1 /map-residue; BrainCallError).
import { describe, it, expect, vi } from "vitest";
import {
  createBrainPort,
  fromChromeRuntime,
  BrainCallError,
  BRAIN_MESSAGE,
} from "../../aws-calculator-extension/lib/connection/brain-port.js";
import { BRAIN_MESSAGE_TYPES } from "../../aws-calculator-extension/sw/messages.js";
import { createContentMain } from "../../aws-calculator-extension/lib/content-main.js";
import { makeRunRpa } from "../../aws-calculator-extension/lib/messages.js";
import { createFakeChrome } from "../u1/fake-chrome.js";
import { createSilentConsole } from "../u1/fake-storage.js";
import { makeRunRequest } from "../u1/fixtures.js";

function ids() {
  let next = 0;
  return () => `call-${++next}`;
}

// sendMessage falso: responde según el tipo con la función dada; registra todo.
function fakeSend(respond) {
  const sent = [];
  const send = (message) => {
    sent.push(message);
    return respond(message);
  };
  send.sent = sent;
  return send;
}

const silent = () => {};

describe("lib/connection/brain-port", () => {
  it("usa los mismos tipos de mensaje que el service worker", () => {
    expect(BRAIN_MESSAGE).toEqual(BRAIN_MESSAGE_TYPES);
  });

  it("respuesta exitosa: resuelve con el value y envía operation, body y callId", async () => {
    const send = fakeSend(async (m) => ({ callId: m.callId, ok: true, value: { actions: [] } }));
    const port = createBrainPort({ sendMessage: send, newCallId: ids() });
    await expect(port.mapResidue({ service: "Amazon EC2" })).resolves.toEqual({ actions: [] });
    expect(send.sent[0]).toEqual({
      type: "BRAIN_CALL",
      callId: "call-1",
      operation: "map-residue",
      body: { service: "Amazon EC2" },
    });
  });

  it("error → BrainCallError con code, requestId y retryAfterSeconds", async () => {
    const send = fakeSend(async (m) => ({
      callId: m.callId,
      ok: false,
      error: { code: "rate_limited", message: "Espera", requestId: "s-1", retryAfterSeconds: 25 },
    }));
    const port = createBrainPort({ sendMessage: send, newCallId: ids() });
    const error = await port.interpret({ text: "ec2" }).catch((e) => e);
    expect(error).toBeInstanceOf(BrainCallError);
    expect(error).toMatchObject({ code: "rate_limited", requestId: "s-1", retryAfterSeconds: 25 });
    expect(new BrainCallError("raro").code).toBe("internal_error");
  });

  it("AbortSignal envía BRAIN_CANCEL con el mismo callId y rechaza", async () => {
    const send = fakeSend((m) =>
      m.type === "BRAIN_CALL" ? new Promise(() => {}) : Promise.resolve(),
    );
    const port = createBrainPort({ sendMessage: send, newCallId: ids(), onWarn: silent });
    const controller = new AbortController();
    const pending = port.wafEvaluate({ services: [] }, { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toBeDefined();
    await Promise.resolve();
    expect(send.sent.map((m) => [m.type, m.callId])).toEqual([
      ["BRAIN_CALL", "call-1"],
      ["BRAIN_CANCEL", "call-1"],
    ]);
    const already = new AbortController();
    already.abort();
    await expect(port.mapResidue({}, { signal: already.signal })).rejects.toBeDefined();
    expect(send.sent.length).toBe(2);
  });

  it("canal perdido (lastError, promesa rechazada o sin respuesta) → brain_unavailable", async () => {
    const runtime = {
      lastError: null,
      sendMessage(message, callback) {
        runtime.lastError = { message: "Receiving end does not exist." };
        callback(undefined);
        runtime.lastError = null;
      },
    };
    const viaLastError = createBrainPort({
      sendMessage: fromChromeRuntime(runtime),
      newCallId: ids(),
    });
    await expect(viaLastError.mapResidue({})).rejects.toMatchObject({ code: "brain_unavailable" });
    const rejected = createBrainPort({
      sendMessage: async () => Promise.reject(new Error("x")),
      newCallId: ids(),
    });
    await expect(rejected.mapResidue({})).rejects.toMatchObject({ code: "brain_unavailable" });
    const empty = createBrainPort({ sendMessage: async () => undefined, newCallId: ids() });
    await expect(empty.mapResidue({})).rejects.toMatchObject({ code: "brain_unavailable" });
    const throwing = fromChromeRuntime({
      sendMessage() {
        throw new Error("Extension context invalidated.");
      },
    });
    await expect(throwing({})).rejects.toThrow("invalidated");
  });

  it("cada llamada usa un callId único y una respuesta con otro callId se rechaza", async () => {
    const send = fakeSend(async (m) => ({ callId: m.callId, ok: true, value: {} }));
    const port = createBrainPort({ sendMessage: send });
    await port.mapResidue({});
    await port.mapResidue({});
    expect(send.sent[0].callId).not.toBe(send.sent[1].callId);
    const mismatched = createBrainPort({
      sendMessage: async () => ({ callId: "otro", ok: true, value: {} }),
      newCallId: ids(),
    });
    await expect(mismatched.mapResidue({})).rejects.toMatchObject({ code: "brain_unavailable" });
  });

  it("login y session devuelven la respuesta o un valor seguro si el canal falla", async () => {
    const ok = createBrainPort({
      sendMessage: async (m) =>
        m.type === "BRAIN_LOGIN"
          ? { ok: true, expiresAt: 5 }
          : { authenticated: true, expiresAt: 5 },
    });
    expect(await ok.login()).toEqual({ ok: true, expiresAt: 5 });
    expect(await ok.session()).toEqual({ authenticated: true, expiresAt: 5 });
    const broken = createBrainPort({
      sendMessage: async () => Promise.reject(new Error("x")),
      onWarn: silent,
    });
    expect(await broken.login()).toEqual({ ok: false, error: { code: "brain_unavailable" } });
    expect(await broken.session()).toEqual({ authenticated: false, expiresAt: null });
  });

  it("casos límite: error sin detalle, motivo de aborto propio, BRAIN_CANCEL que falla", async () => {
    const noDetail = createBrainPort({
      sendMessage: async (m) => ({ callId: m.callId, ok: false }),
      newCallId: ids(),
    });
    const error = await noDetail.mapResidue({}).catch((e) => e);
    expect(error).toMatchObject({ code: "internal_error", message: "internal_error" });
    expect(error.requestId).toBeUndefined();

    const onWarn = vi.fn();
    const failingCancel = createBrainPort({
      sendMessage: (m) =>
        m.type === "BRAIN_CALL" ? new Promise(() => {}) : Promise.reject(new Error("sin canal")),
      newCallId: ids(),
      onWarn,
    });
    const controller = new AbortController();
    const pending = failingCancel.mapResidue({}, { signal: controller.signal });
    controller.abort(new Error("corrida cancelada"));
    await expect(pending).rejects.toThrow("corrida cancelada");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onWarn).toHaveBeenCalledWith("No se pudo enviar BRAIN_CANCEL:", "sin canal");

    const runtime = {
      lastError: null,
      sendMessage(_message, callback) {
        runtime.lastError = {};
        callback(undefined);
      },
    };
    await expect(fromChromeRuntime(runtime)({})).rejects.toThrow("canal perdido");
    const odd = createBrainPort({ sendMessage: async () => "texto", onWarn: silent });
    expect(await odd.login()).toEqual({ ok: false, error: { code: "brain_unavailable" } });
    expect(await odd.session()).toEqual({ authenticated: false, expiresAt: null });
  });
});

describe("content-main ↔ brain-port", () => {
  it("el orquestador recibe mapResidue en sus dependencias", async () => {
    const mapResidue = vi.fn();
    let receivedDeps;
    const chromeApi = createFakeChrome();
    const main = createContentMain({
      chromeApi,
      storage: chromeApi.storage.local,
      createDom: () => ({}),
      consoleApi: createSilentConsole(),
      mapResidue,
      runEstimateFn: async (runRequest, deps) => {
        receivedDeps = deps;
        return {
          runId: runRequest.runId,
          status: "ERROR",
          failureStep: "services",
          perServiceResults: [],
        };
      },
    });
    main.handleMessage(makeRunRpa(makeRunRequest(), 7), { id: "ext-123" });
    await main.whenIdle();
    expect(receivedDeps.mapResidue).toBe(mapResidue);
  });
});
