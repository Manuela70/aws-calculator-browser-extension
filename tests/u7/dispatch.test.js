// Integración del borde: mensaje → autorización → cliente → respuesta
// (NFR5.2, NFR5.3, NFR5.5, NFR5.6 g; contrato BRAIN_CALL, BRAIN_CANCEL, BRAIN_LOGIN, BRAIN_SESSION).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createDispatcher } from "../../aws-calculator-extension/sw/dispatch.js";
import { createCallRegistry } from "../../aws-calculator-extension/sw/call-registry.js";
import { createSession, SESSION_KEY } from "../../aws-calculator-extension/sw/session.js";
import { callBrain } from "../../aws-calculator-extension/sw/brain-client.js";
import {
  EXTENSION_ID,
  TEST_CONFIG,
  contentScriptSender,
  panelSender,
  createSessionStorage,
  createCountingKeepalive,
  createFakeFetch,
  makeResponse,
  silentLogger,
} from "./fakes.js";

const NOW = Date.UTC(2026, 10, 22, 12);
const residueOk = { actions: [], inventoryVersion: "v1" };

function setup({ queue = [], withToken = true, startLogin } = {}) {
  const storage = createSessionStorage(
    withToken ? { [SESSION_KEY]: { accessToken: "tok", expiresAt: NOW + 3_600_000 } } : {},
  );
  const keepalive = createCountingKeepalive();
  const session = createSession({
    storage,
    keepalive,
    now: () => Date.now(),
    startLogin: startLogin ?? (async () => ({ ok: false, code: "login_cancelled" })),
  });
  const fetchFn = createFakeFetch(queue);
  const logger = silentLogger();
  const dispatcher = createDispatcher({
    extensionId: EXTENSION_ID,
    session,
    registry: createCallRegistry(),
    logger,
    callBrain: (request) =>
      callBrain(request, {
        config: TEST_CONFIG,
        session,
        keepalive,
        fetchFn,
        logger,
        clock: { now: () => Date.now(), setTimeout, clearTimeout },
      }),
  });
  return { dispatcher, fetchFn, storage, logger };
}

const brainCall = (operation = "map-residue", callId = "c-1") => ({
  type: "BRAIN_CALL",
  callId,
  operation,
  body: { service: "Amazon EC2" },
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe("sw/dispatch", () => {
  it("BRAIN_CALL permitido devuelve { callId, ok, value, attempts }", async () => {
    const { dispatcher } = setup({ queue: [makeResponse(200, residueOk)] });
    const reply = await dispatcher.handle(brainCall(), contentScriptSender());
    expect(reply).toEqual({ callId: "c-1", ok: true, value: residueOk, attempts: 1 });
  });

  it("un error del cerebro viaja con code, message y requestId", async () => {
    const { dispatcher } = setup({
      queue: [makeResponse(503, { code: "inventory_unavailable", message: "x", requestId: "s-1" })],
    });
    const reply = await dispatcher.handle(brainCall(), contentScriptSender());
    expect(reply.ok).toBe(false);
    expect(reply.error).toMatchObject({ code: "inventory_unavailable", requestId: "s-1" });
  });

  it("un remitente ajeno o un mensaje que no es del borde no recibe respuesta", async () => {
    const { dispatcher, fetchFn } = setup();
    expect(await dispatcher.handle(brainCall(), { ...contentScriptSender(), id: "x" })).toBeNull();
    expect(await dispatcher.handle({ type: "PROGRESS" }, contentScriptSender())).toBeNull();
    expect(fetchFn.calls.length).toBe(0);
  });

  it("una operación prohibida para el contexto es bad_request sin fetch", async () => {
    const { dispatcher, fetchFn } = setup();
    const reply = await dispatcher.handle(brainCall("interpret"), contentScriptSender());
    expect(reply).toMatchObject({ callId: "c-1", ok: false, error: { code: "bad_request" } });
    expect(fetchFn.calls.length).toBe(0);
  });

  it("BRAIN_CANCEL del dueño aborta el fetch y la respuesta tardía se descarta", async () => {
    const { dispatcher, fetchFn } = setup({ queue: ["hang"] });
    const pending = dispatcher.handle(brainCall(), contentScriptSender());
    await vi.advanceTimersByTimeAsync(10);
    const otherOwner = await dispatcher.handle(
      { type: "BRAIN_CANCEL", callId: "c-1" },
      contentScriptSender({ tab: { id: 99 } }),
    );
    expect(otherOwner).toEqual({ callId: "c-1", ok: true, cancelled: false });
    const cancel = await dispatcher.handle(
      { type: "BRAIN_CANCEL", callId: "c-1" },
      contentScriptSender(),
    );
    expect(cancel).toEqual({ callId: "c-1", ok: true, cancelled: true });
    expect(await pending).toBeNull();
    expect(fetchFn.calls[0].init.signal.aborted).toBe(true);
  });

  it("un callId repetido mientras sigue en curso es bad_request", async () => {
    const { dispatcher } = setup({ queue: ["hang"] });
    const first = dispatcher.handle(brainCall(), contentScriptSender());
    const duplicate = await dispatcher.handle(brainCall(), contentScriptSender());
    expect(duplicate).toMatchObject({ callId: "c-1", ok: false, error: { code: "bad_request" } });
    await vi.advanceTimersByTimeAsync(30000);
    expect((await first).error.code).toBe("timeout");
  });

  it("BRAIN_SESSION responde con y sin token; desde un content script es bad_request", async () => {
    const withToken = setup();
    expect(await withToken.dispatcher.handle({ type: "BRAIN_SESSION" }, panelSender())).toEqual({
      authenticated: true,
      expiresAt: NOW + 3_600_000,
    });
    const withoutToken = setup({ withToken: false });
    expect(await withoutToken.dispatcher.handle({ type: "BRAIN_SESSION" }, panelSender())).toEqual({
      authenticated: false,
      expiresAt: null,
    });
    const fromTab = await withToken.dispatcher.handle(
      { type: "BRAIN_LOGIN" },
      contentScriptSender(),
    );
    expect(fromTab).toMatchObject({ ok: false, error: { code: "bad_request" } });
  });

  it("BRAIN_LOGIN concurrentes comparten la promesa; luego BRAIN_CALL usa el token", async () => {
    let finish;
    const startLogin = vi.fn(
      () =>
        new Promise(
          (resolve) =>
            (finish = () => resolve({ ok: true, accessToken: "n", expiresAt: NOW + 3_600_000 })),
        ),
    );
    const { dispatcher, fetchFn } = setup({
      withToken: false,
      startLogin,
      queue: [makeResponse(200, { perService: [], inventoryVersion: "v1" })],
    });
    const noToken = await dispatcher.handle(brainCall("interpret", "c-0"), panelSender());
    expect(noToken.error.code).toBe("unauthorized");
    const logins = [
      dispatcher.handle({ type: "BRAIN_LOGIN" }, panelSender()),
      dispatcher.handle({ type: "BRAIN_LOGIN" }, panelSender({ documentId: "doc-2" })),
    ];
    finish();
    expect(await Promise.all(logins)).toEqual([
      { ok: true, expiresAt: NOW + 3_600_000 },
      { ok: true, expiresAt: NOW + 3_600_000 },
    ]);
    expect(startLogin).toHaveBeenCalledTimes(1);
    const reply = await dispatcher.handle(brainCall("waf-evaluate", "c-2"), panelSender());
    expect(reply.ok).toBe(true);
    expect(fetchFn.calls[0].init.headers.Authorization).toBe("Bearer n");
  });

  it("una falla inesperada del cliente es internal_error, nunca silencio", async () => {
    const logger = silentLogger();
    const dispatcher = createDispatcher({
      extensionId: EXTENSION_ID,
      session: {},
      registry: createCallRegistry(),
      logger,
      callBrain: async () => Promise.reject(new Error("bug")),
    });
    const reply = await dispatcher.handle(brainCall(), contentScriptSender());
    expect(reply).toMatchObject({ ok: false, error: { code: "internal_error" } });
    expect(logger.warnings.length).toBe(1);
  });
});
