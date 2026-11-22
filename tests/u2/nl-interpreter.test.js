import { afterEach, describe, it, expect, vi } from "vitest";
import {
  classifyPortError,
  classifyPortResponse,
  interpretText,
} from "../../aws-calculator-extension/lib/input/nl-interpreter.js";
import { NL_TIMEOUT_MS } from "../../aws-calculator-extension/lib/input/input-schema.js";
import {
  makeBrainCallError,
  makeDeferredPort,
  makeInterpretedResponse,
  makeRejectingPort,
  makeResolvingPort,
  makeS3RunInput,
  makeService,
  makeUnresolvedResponse,
} from "./fixtures.js";

const TEXT = "Un bucket S3 Standard de 100 GB en la región us-east-1";

afterEach(() => {
  vi.useRealTimers();
});

describe("interpretText — respuestas del puerto (BR3.2-BR3.4)", () => {
  it("envía solo texto, locale y versión, y devuelve el RunInput validado", async () => {
    const { port, calls } = makeResolvingPort(makeInterpretedResponse());
    const result = await interpretText(TEXT, { interpretNaturalLanguage: port });
    expect(calls[0].request).toEqual({ text: TEXT, locale: "es", schemaVersion: 1 });
    expect(calls[0].options.signal).toBeInstanceOf(AbortSignal);
    expect(result).toEqual({ ok: true, value: makeS3RunInput() });
  });

  it("unresolved → nl_unresolved con los fragmentos nombrados en dominio", async () => {
    const { port } = makeResolvingPort(makeUnresolvedResponse());
    const result = await interpretText("Un S3 de 100 GB", { interpretNaturalLanguage: port });
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe("nl_unresolved");
    expect(result.error.fragments).toEqual([
      { fragment: "100 GB", service: "S3 Standard", reason: "ambiguous_field" },
    ]);
    expect(result.error.message).toContain(
      'no sé a qué campo de S3 Standard corresponden "100 GB"',
    );
  });

  it("sin puerto → brain_unavailable sin intentar nada (BR3.5)", async () => {
    const result = await interpretText(TEXT, { interpretNaturalLanguage: null });
    expect(result.error.code).toBe("brain_unavailable");
  });
});

describe("classifyPortResponse — forma estricta (BR3.3, BR3.6)", () => {
  it.each([
    ["no es objeto", "interpreted"],
    ["status desconocido", { status: "done", runInput: makeS3RunInput() }],
    ["interpreted sin runInput", { status: "interpreted" }],
    [
      "interpreted con unresolved",
      { ...makeInterpretedResponse(), unresolved: makeUnresolvedResponse().unresolved },
    ],
    ["runInput con clave inventada", makeInterpretedResponse({ services: [{ name: "A", x: 1 }] })],
    [
      "runInput con 21 servicios",
      makeInterpretedResponse({ services: Array.from({ length: 21 }, (_, i) => makeService(i)) }),
    ],
    [
      "valor de 101 caracteres",
      makeInterpretedResponse({ services: [{ name: "A", fields: { K: "v".repeat(101) } }] }),
    ],
    ["unresolved vacío", makeUnresolvedResponse([])],
    ["unresolved con runInput", { ...makeUnresolvedResponse(), runInput: makeS3RunInput() }],
    ["motivo fuera del enum", makeUnresolvedResponse([{ fragment: "x", reason: "other" }])],
    [
      "fragmento de 201 caracteres",
      makeUnresolvedResponse([{ fragment: "x".repeat(201), reason: "unknown_service" }]),
    ],
    [
      "21 fragmentos",
      makeUnresolvedResponse(
        Array.from({ length: 21 }, () => ({ fragment: "x", reason: "missing_value" })),
      ),
    ],
  ])("%s → nl_invalid_response", (_label, response) => {
    expect(classifyPortResponse(response).error.code).toBe("nl_invalid_response");
  });
});

describe("classifyPortError — canal BrainCallError (NFR3.2)", () => {
  it.each([
    ["unauthorized", "unauthorized"],
    ["login_cancelled", "login_cancelled"],
    ["daily_quota_exceeded", "daily_quota_exceeded"],
    ["inventory_unavailable", "inventory_unavailable"],
    ["timeout", "timeout"],
    ["empty_result", "nl_invalid_response"],
    ["bad_request", "brain_unavailable"],
    ["internal_error", "brain_unavailable"],
    ["brain_unavailable", "brain_unavailable"],
    ["model_unavailable", "brain_unavailable"],
    ["something_new", "brain_unavailable"],
  ])("%s → %s", async (code, expected) => {
    const port = makeRejectingPort(makeBrainCallError(code));
    const result = await interpretText(TEXT, { interpretNaturalLanguage: port });
    expect(result.error.code).toBe(expected);
  });

  it("rate_limited conserva retryAfterSeconds y lo nombra en el mensaje", () => {
    const result = classifyPortError(makeBrainCallError("rate_limited", { retryAfterSeconds: 7 }));
    expect(result.error).toMatchObject({ code: "rate_limited", retryAfterSeconds: 7 });
    expect(result.error.message).toContain("7 s");
  });

  it("un error de red sin código o un rechazo no objeto → brain_unavailable", () => {
    expect(classifyPortError(new TypeError("Failed to fetch")).error.code).toBe(
      "brain_unavailable",
    );
    expect(classifyPortError(undefined).error.code).toBe("brain_unavailable");
  });
});

describe("interpretText — tope de 30 s y cancelación (NFR8.4, NFR8.5)", () => {
  it("sin respuesta en 30 s → timeout y aborta la señal del puerto", async () => {
    vi.useFakeTimers();
    const { port, calls } = makeDeferredPort();
    const pending = interpretText(TEXT, { interpretNaturalLanguage: port });
    await vi.advanceTimersByTimeAsync(NL_TIMEOUT_MS - 1);
    expect(calls[0].options.signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const result = await pending;
    expect(result.error.code).toBe("timeout");
    expect(calls[0].options.signal.aborted).toBe(true);
  });

  it("cancelación antes de la respuesta → cancelled y la respuesta tardía se descarta", async () => {
    vi.useFakeTimers();
    const run = new AbortController();
    const { port, calls, respond } = makeDeferredPort();
    const pending = interpretText(TEXT, { interpretNaturalLanguage: port, signal: run.signal });
    await vi.advanceTimersByTimeAsync(0);
    run.abort();
    respond(makeInterpretedResponse());
    const result = await pending;
    expect(result).toEqual({
      ok: false,
      error: { code: "cancelled", message: "Interpretación cancelada." },
    });
    expect(calls[0].options.signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("una señal ya abortada resuelve cancelled sin llamar al puerto", async () => {
    const run = new AbortController();
    run.abort();
    const { port, calls } = makeResolvingPort(makeInterpretedResponse());
    const result = await interpretText(TEXT, {
      interpretNaturalLanguage: port,
      signal: run.signal,
    });
    expect(result.error.code).toBe("cancelled");
    expect(calls).toHaveLength(0);
  });
});
