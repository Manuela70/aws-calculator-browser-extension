// sw/call-registry.js: cancelación por dueño y callId únicos (NFR5.6 g).
import { describe, it, expect } from "vitest";
import {
  createCallRegistry,
  ownerKeyOf,
  isValidCallId,
} from "../../aws-calculator-extension/sw/call-registry.js";
import { contentScriptSender, panelSender } from "./fakes.js";

describe("sw/call-registry", () => {
  it("deriva la clave del dueño de la pestaña y marco, o del documento", () => {
    expect(ownerKeyOf(contentScriptSender({ frameId: 3 }))).toBe("tab:7:3");
    expect(ownerKeyOf(contentScriptSender({ frameId: undefined }))).toBe("tab:7:0");
    expect(ownerKeyOf(panelSender())).toBe("doc:doc-panel-1");
    expect(ownerKeyOf({ id: "x" })).toBeNull();
    expect(ownerKeyOf(null)).toBeNull();
  });

  it("registra una llamada y entrega su AbortController", () => {
    const registry = createCallRegistry();
    const registration = registry.register("c-1", "tab:7:0");
    expect(registration.ok).toBe(true);
    expect(registration.controller.signal.aborted).toBe(false);
    expect(registry.has("c-1")).toBe(true);
  });

  it("el dueño correcto cancela y aborta la señal", () => {
    const registry = createCallRegistry();
    const { controller } = registry.register("c-1", "tab:7:0");
    expect(registry.cancel("c-1", "tab:7:0")).toBe(true);
    expect(controller.signal.aborted).toBe(true);
  });

  it("ignora la cancelación de otro dueño o de un callId desconocido", () => {
    const registry = createCallRegistry();
    const { controller } = registry.register("c-1", "tab:7:0");
    expect(registry.cancel("c-1", "tab:8:0")).toBe(false);
    expect(registry.cancel("c-1", "doc:otro")).toBe(false);
    expect(registry.cancel("c-2", "tab:7:0")).toBe(false);
    expect(controller.signal.aborted).toBe(false);
  });

  it("rechaza un callId repetido, inválido o sin dueño con bad_request", () => {
    const registry = createCallRegistry();
    registry.register("c-1", "tab:7:0");
    expect(registry.register("c-1", "tab:7:0")).toEqual({ ok: false, code: "bad_request" });
    expect(registry.register("", "tab:7:0").ok).toBe(false);
    expect(registry.register("c-2", null).ok).toBe(false);
    expect(isValidCallId("x".repeat(129))).toBe(false);
  });

  it("libera la entrada al terminar y permite reutilizar el callId", () => {
    const registry = createCallRegistry();
    registry.register("c-1", "tab:7:0");
    registry.release("c-1");
    expect(registry.size()).toBe(0);
    expect(registry.cancel("c-1", "tab:7:0")).toBe(false);
    expect(registry.register("c-1", "tab:7:0").ok).toBe(true);
  });
});
