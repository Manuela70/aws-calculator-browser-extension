// sw/router.js: lista permitida por contexto y límites del pedido (NFR5.3, NFR5.5, NFR5.6 a).
import { describe, it, expect } from "vitest";
import {
  authorize,
  senderContext,
  bodySizeBytes,
  isBrainMessage,
  MAX_BODY_BYTES,
  SENDER_CONTEXTS,
} from "../../aws-calculator-extension/sw/router.js";
import { EXTENSION_ID, contentScriptSender, panelSender } from "./fakes.js";

const opts = { extensionId: EXTENSION_ID };
const call = (operation, body = { a: 1 }) => ({
  type: "BRAIN_CALL",
  callId: "c-1",
  operation,
  body,
});

describe("sw/router", () => {
  it("content script de calculator.aws (con subruta) solo puede pedir map-residue", () => {
    const sender = contentScriptSender({ url: "https://calculator.aws/#/createCalculator/EC2" });
    expect(senderContext(sender, EXTENSION_ID)).toBe(SENDER_CONTEXTS.CONTENT_SCRIPT);
    expect(authorize(sender, call("map-residue"), opts)).toEqual({ ok: true });
    for (const operation of ["interpret", "waf-evaluate"]) {
      expect(authorize(sender, call(operation), opts)).toMatchObject({
        ok: false,
        code: "bad_request",
        reason: "operation_not_allowed",
      });
    }
  });

  it("la página de la extensión puede pedir interpret y waf-evaluate, no map-residue", () => {
    const sender = panelSender();
    expect(authorize(sender, call("interpret"), opts)).toEqual({ ok: true });
    expect(authorize(sender, call("waf-evaluate"), opts)).toEqual({ ok: true });
    expect(authorize(sender, call("map-residue"), opts).ok).toBe(false);
  });

  it("descarta un remitente ajeno antes de todo, sin respuesta", () => {
    expect(authorize({ ...panelSender(), id: "otra" }, call("interpret"), opts)).toEqual({
      ignore: true,
    });
    expect(authorize(null, call("interpret"), opts)).toEqual({ ignore: true });
  });

  it("ignora mensajes que no son del borde (PROGRESS va al panel)", () => {
    expect(isBrainMessage({ type: "PROGRESS" })).toBe(false);
    expect(isBrainMessage(null)).toBe(false);
    expect(authorize(contentScriptSender(), { type: "PROGRESS" }, opts)).toEqual({ ignore: true });
  });

  it("rechaza un content script de otro origen o con URL inválida", () => {
    for (const url of ["https://calculator.aws.evil.test/", "https://example.test/", "no-url"]) {
      const sender = contentScriptSender({ url });
      expect(senderContext(sender, EXTENSION_ID)).toBe(SENDER_CONTEXTS.OTHER);
      expect(authorize(sender, call("map-residue"), opts).ok).toBe(false);
    }
    const pageOfOther = panelSender({ url: "chrome-extension://otra/sidepanel.html" });
    expect(authorize(pageOfOther, { type: "BRAIN_CANCEL", callId: "c-1" }, opts).ok).toBe(false);
  });

  it("rechaza operación desconocida, callId inválido y body que no es objeto", () => {
    const sender = panelSender();
    expect(authorize(sender, call("borrar-todo"), opts).reason).toBe("unknown_operation");
    expect(authorize(sender, { ...call("interpret"), callId: "" }, opts).reason).toBe(
      "invalid_call_id",
    );
    expect(authorize(sender, call("interpret", [1]), opts).reason).toBe("invalid_body");
    expect(authorize(sender, call("interpret", null), opts).reason).toBe("invalid_body");
    const cyclic = {};
    cyclic.self = cyclic;
    expect(bodySizeBytes(cyclic)).toBeNull();
    expect(authorize(sender, call("interpret", cyclic), opts).reason).toBe("invalid_body");
  });

  it("rechaza un body de más de 256 KB medido en bytes UTF-8", () => {
    const sender = panelSender();
    // "ñ" ocupa 2 bytes: 140 000 caracteres superan 256 KB aunque sean menos de 262 144.
    const big = { text: "ñ".repeat(140000) };
    expect(bodySizeBytes(big)).toBeGreaterThan(MAX_BODY_BYTES);
    expect(authorize(sender, call("interpret", big), opts).reason).toBe("body_too_large");
    expect(authorize(sender, call("interpret", { text: "a".repeat(1000) }), opts).ok).toBe(true);
  });

  it("BRAIN_LOGIN y BRAIN_SESSION solo desde páginas de la extensión", () => {
    expect(authorize(panelSender(), { type: "BRAIN_LOGIN" }, opts)).toEqual({ ok: true });
    expect(authorize(panelSender(), { type: "BRAIN_SESSION" }, opts)).toEqual({ ok: true });
    expect(authorize(contentScriptSender(), { type: "BRAIN_LOGIN" }, opts)).toMatchObject({
      ok: false,
      code: "bad_request",
      reason: "sender_not_allowed",
    });
    expect(authorize(contentScriptSender(), { type: "BRAIN_SESSION" }, opts).ok).toBe(false);
    expect(authorize(contentScriptSender(), { type: "BRAIN_CANCEL", callId: "c" }, opts).ok).toBe(
      true,
    );
    expect(authorize(panelSender(), { type: "BRAIN_CANCEL" }, opts).ok).toBe(false);
  });
});
