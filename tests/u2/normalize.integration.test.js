// Integración de normalize con dos dobles distintos del puerto del cerebro
// (NFR1.1): U2 depende solo de la firma interpretNaturalLanguage(request,
// { signal }), no de dónde vive el cerebro. La misma suite corre contra un
// doble "directo" (como un cerebro local) y uno "por mensajes" (como el borde
// BRAIN_CALL de U7, que traduce { ok: false, error } a BrainCallError).

import { describe, it, expect } from "vitest";
import { normalize } from "../../aws-calculator-extension/lib/input/input-normalizer.js";
import { makeBrainCallError, makeS3RunInput, toText } from "./fixtures.js";

const CANONICAL_TEXT = "Un bucket S3 Standard de 100 GB en la región us-east-1";
const AMBIGUOUS_TEXT = "Un S3 de 100 GB";
const QUOTA_TEXT = "Cualquier cosa cuando no queda cuota";

// Respuestas del cerebro simulado según el texto recibido.
function brainAnswer(text) {
  if (text === CANONICAL_TEXT) {
    return { ok: true, value: { status: "interpreted", runInput: makeS3RunInput() } };
  }
  if (text === AMBIGUOUS_TEXT) {
    const unresolved = [{ fragment: "100 GB", service: "S3 Standard", reason: "ambiguous_field" }];
    return { ok: true, value: { status: "unresolved", unresolved } };
  }
  if (text === QUOTA_TEXT) return { ok: false, error: { code: "daily_quota_exceeded" } };
  return { ok: false, error: { code: "empty_result" } };
}

function makeDirectPort() {
  return async (request) => {
    const answer = brainAnswer(request.text);
    if (!answer.ok) throw makeBrainCallError(answer.error.code);
    return answer.value;
  };
}

function makeMessagingPort() {
  let callId = 0;
  const sendMessage = (message) =>
    new Promise((resolve) => {
      setTimeout(() => resolve({ callId: message.callId, ...brainAnswer(message.body.text) }), 0);
    });
  return async (request, { signal }) => {
    callId += 1;
    const reply = await sendMessage({
      type: "BRAIN_CALL",
      callId,
      operation: "interpret",
      body: request,
    });
    if (signal.aborted) throw makeBrainCallError("brain_unavailable");
    if (!reply.ok) throw makeBrainCallError(reply.error.code);
    return reply.value;
  };
}

describe.each([
  ["doble directo", makeDirectPort],
  ["doble por mensajes", makeMessagingPort],
])("normalize con el puerto como %s (NFR1.1)", (_label, makePort) => {
  const run = (text) =>
    normalize(
      { format: "natural_language", text },
      { interpretNaturalLanguage: makePort(), signal: new AbortController().signal },
    );

  it("AC2.1.1: el lenguaje natural converge con el JSON equivalente salvo source (BR4.6)", async () => {
    const fromText = await run(CANONICAL_TEXT);
    const fromJson = await normalize(
      { format: "json", text: toText(makeS3RunInput()) },
      { interpretNaturalLanguage: makePort() },
    );
    expect(fromText.ok).toBe(true);
    expect(fromJson.ok).toBe(true);
    expect({ ...fromText.value, source: "json" }).toEqual(fromJson.value);
    expect(fromText.value.wafReview).toBe("required");
  });

  it("AC2.2.2: expresión ambigua → nl_unresolved, nada normalizado", async () => {
    const result = await run(AMBIGUOUS_TEXT);
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe("nl_unresolved");
    expect(result.error.fragments).toHaveLength(1);
  });

  it("código del contrato con texto propio pasa tal cual (NFR3.2)", async () => {
    expect((await run(QUOTA_TEXT)).error.code).toBe("daily_quota_exceeded");
  });

  it("respuesta vacía del cerebro → nl_invalid_response", async () => {
    expect((await run("texto sin interpretación")).error.code).toBe("nl_invalid_response");
  });
});
