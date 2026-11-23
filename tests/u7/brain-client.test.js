// sw/brain-client.js: traducción de códigos, plazo de 30 s, reintento y 401 (NFR3.1, NFR5.3, NFR5.4, NFR8.1).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  callBrain,
  translateResponse,
  CALL_DEADLINE_MS,
} from "../../aws-calculator-extension/sw/brain-client.js";
import { SERVER_ERROR_CODES } from "../../aws-calculator-extension/sw/messages.js";
import {
  TEST_CONFIG,
  NULL_CONFIG,
  BRAIN_URL,
  createFakeFetch,
  createFakeSession,
  createCountingKeepalive,
  makeResponse,
  silentLogger,
} from "./fakes.js";

const TOKEN = "token-secreto-de-prueba";
const residueOk = { actions: [], inventoryVersion: "v1" };

function setup({ queue = [], config = TEST_CONFIG, token = TOKEN } = {}) {
  const fetchFn = createFakeFetch(queue);
  const session = createFakeSession({ token });
  const keepalive = createCountingKeepalive();
  const logger = silentLogger();
  const clock = { now: () => Date.now(), setTimeout, clearTimeout };
  const run = (request) =>
    callBrain(
      { operation: "map-residue", body: { service: "Amazon EC2" }, ...request },
      { config, session, keepalive, fetchFn, clock, logger },
    );
  return { fetchFn, session, keepalive, logger, run };
}

const errorBody = (code, extra = {}) => ({ code, message: "x", requestId: "srv-1", ...extra });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("sw/brain-client reloj por defecto", () => {
  it("no llama a setTimeout como método de otro objeto (Chrome: Illegal invocation)", async () => {
    const realSet = globalThis.setTimeout;
    const realClear = globalThis.clearTimeout;
    function strict(fn) {
      return function (...args) {
        if (this !== undefined && this !== globalThis) throw new TypeError("Illegal invocation");
        return fn(...args);
      };
    }
    vi.stubGlobal("setTimeout", strict(realSet));
    vi.stubGlobal("clearTimeout", strict(realClear));
    try {
      const result = await callBrain(
        { operation: "map-residue", body: { service: "Amazon EC2" } },
        {
          config: TEST_CONFIG,
          session: createFakeSession({ token: TOKEN }),
          keepalive: createCountingKeepalive(),
          fetchFn: createFakeFetch([makeResponse(200, residueOk)]),
          logger: silentLogger(),
        },
      );
      expect(result.ok).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("sw/brain-client translateResponse", () => {
  it("traduce cada código del cerebro a su mensaje en español con requestId", () => {
    for (const code of SERVER_ERROR_CODES) {
      const result = translateResponse(500, errorBody(code), { operation: "interpret" });
      expect(result.ok).toBe(false);
      expect(result.error.code).toBe(code);
      expect(result.error.requestId).toBe("srv-1");
      expect(result.error.message).toMatch(/[a-záéíóúñ]/);
    }
  });

  it("un código desconocido es internal_error; acepta body.error.code y model_unavailable", () => {
    expect(translateResponse(418, errorBody("teapot")).error.code).toBe("internal_error");
    expect(translateResponse(503, { error: { code: "model_unavailable" } }).error.code).toBe(
      "model_unavailable",
    );
    expect(translateResponse(500, null, { requestId: "hdr" }).error).toMatchObject({
      code: "internal_error",
      requestId: "hdr",
    });
  });

  it("un 200 que no valida la forma de su operación es internal_error, nunca ok", () => {
    expect(translateResponse(200, { actions: "x" }, { operation: "map-residue" }).ok).toBe(false);
    expect(translateResponse(200, { status: "interpreted" }, { operation: "interpret" }).ok).toBe(
      false,
    );
    expect(translateResponse(200, { perService: [] }, { operation: "waf-evaluate" }).ok).toBe(true);
    expect(
      translateResponse(200, { status: "unresolved", unresolved: [] }, { operation: "interpret" })
        .ok,
    ).toBe(true);
    expect(translateResponse(200, residueOk, { operation: "desconocida" }).ok).toBe(false);
  });
});

describe("sw/brain-client callBrain", () => {
  it("POST con Bearer y JSON a la ruta de la operación; devuelve el valor validado", async () => {
    const { run, fetchFn, keepalive } = setup({
      queue: [makeResponse(200, residueOk, { requestId: "srv-9" })],
    });
    const result = await run();
    expect(result).toMatchObject({ ok: true, value: residueOk, attempts: 1 });
    const [{ url, init }] = fetchFn.calls;
    expect(url).toBe(`${BRAIN_URL}/map-residue`);
    expect(init.headers).toEqual({
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    });
    expect(init.headers["X-Request-Id"]).toBeUndefined();
    expect(JSON.parse(init.body)).toEqual({ service: "Amazon EC2" });
    expect(keepalive.maxActive).toBe(1);
    expect(keepalive.active).toBe(0);
  });

  it("TypeError de red es brain_unavailable", async () => {
    const { run } = setup({ queue: [new TypeError("Failed to fetch")] });
    expect((await run()).error.code).toBe("brain_unavailable");
  });

  it("HTML de un gateway: 502 → brain_unavailable, 400 → internal_error", async () => {
    const html = "<html><body>Bad Gateway</body></html>";
    const bad502 = setup({ queue: [makeResponse(502, html, { raw: true, requestId: "gw" })] });
    expect((await bad502.run()).error).toMatchObject({
      code: "brain_unavailable",
      requestId: "gw",
    });
    const bad400 = setup({ queue: [makeResponse(400, html, { raw: true })] });
    expect((await bad400.run()).error.code).toBe("internal_error");
  });

  it("401 borra el token y responde unauthorized sin reintentar", async () => {
    const { run, session, fetchFn } = setup({
      queue: [makeResponse(401, errorBody("unauthorized")), makeResponse(200, residueOk)],
    });
    const result = await run();
    expect(result.error.code).toBe("unauthorized");
    expect(session.cleared).toBe(1);
    expect(fetchFn.calls.length).toBe(1);
  });

  it("rate_limited con 5 s reintenta una vez y registra ambos requestId", async () => {
    const { run, fetchFn } = setup({
      queue: [
        makeResponse(429, errorBody("rate_limited", { retryAfterSeconds: 5, requestId: "r-1" })),
        makeResponse(429, errorBody("rate_limited", { retryAfterSeconds: 5, requestId: "r-2" })),
      ],
    });
    const pending = run();
    await vi.advanceTimersByTimeAsync(5000);
    const result = await pending;
    expect(fetchFn.calls.length).toBe(2);
    expect(result.attempts).toBe(2);
    expect(result.requestIds).toEqual(["r-1", "r-2"]);
    expect(result.error).toMatchObject({ code: "rate_limited", retryAfterSeconds: 5 });
  });

  it("rate_limited con 25 s no reintenta (25 + 12 > 30)", async () => {
    const { run, fetchFn } = setup({
      queue: [makeResponse(429, errorBody("rate_limited", { retryAfterSeconds: 25 }))],
    });
    const result = await run();
    expect(fetchFn.calls.length).toBe(1);
    expect(result.error).toMatchObject({ code: "rate_limited", retryAfterSeconds: 25 });
  });

  it("un cerebro que no responde aborta el fetch a los 30 s y responde timeout", async () => {
    const { run, fetchFn } = setup({ queue: ["hang"] });
    const pending = run();
    await vi.advanceTimersByTimeAsync(CALL_DEADLINE_MS - 1);
    expect(fetchFn.calls[0].init.signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const result = await pending;
    expect(fetchFn.calls[0].init.signal.aborted).toBe(true);
    expect(result.error.code).toBe("timeout");
  });

  it("BRAIN_CANCEL durante la espera del reintento cancela sin segundo fetch", async () => {
    const controller = new AbortController();
    const { run, fetchFn } = setup({
      queue: [makeResponse(429, errorBody("rate_limited", { retryAfterSeconds: 5 }))],
    });
    const pending = run({ signal: controller.signal });
    await vi.advanceTimersByTimeAsync(1000);
    controller.abort();
    await vi.advanceTimersByTimeAsync(10000);
    expect(await pending).toMatchObject({ cancelled: true, attempts: 1 });
    expect(fetchFn.calls.length).toBe(1);
  });

  it("una señal ya abortada cancela sin fetch", async () => {
    const controller = new AbortController();
    controller.abort();
    const { run, fetchFn } = setup({ queue: [makeResponse(200, residueOk)] });
    expect((await run({ signal: controller.signal })).cancelled).toBe(true);
    expect(fetchFn.calls.length).toBe(0);
  });

  it("sin configuración responde brain_unavailable sin fetch; sin token, unauthorized", async () => {
    const unconfigured = setup({ config: NULL_CONFIG });
    expect((await unconfigured.run()).error.code).toBe("brain_unavailable");
    expect(unconfigured.fetchFn.calls.length).toBe(0);
    const noToken = setup({ token: null });
    expect((await noToken.run()).error.code).toBe("unauthorized");
    expect(noToken.fetchFn.calls.length).toBe(0);
    expect((await noToken.run({ operation: "otra" })).error.code).toBe("bad_request");
  });

  it("ni la respuesta ni el registro contienen el token", async () => {
    const { run, logger } = setup({
      queue: [makeResponse(500, errorBody("internal_error"))],
    });
    const result = await run();
    expect(logger.warnings.length).toBe(1);
    expect(JSON.stringify(result)).not.toContain(TOKEN);
    expect(JSON.stringify(logger.warnings)).not.toContain(TOKEN);
    expect(JSON.stringify(logger.warnings)).not.toContain("Amazon EC2");
  });
});
