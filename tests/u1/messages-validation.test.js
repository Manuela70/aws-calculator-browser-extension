import { describe, it, expect } from "vitest";
import {
  makeProgressEvent,
  makePingResponse,
  makeRunRpa,
  MESSAGE_TYPES,
} from "../../aws-calculator-extension/lib/messages.js";
import {
  isCalculatorUrl,
  isMessageForRun,
  isRunResult,
  validateIncomingMessage,
} from "../../aws-calculator-extension/lib/validation.js";
import { makeRunRequest } from "./fixtures.js";

const EXTENSION_ID = "ext-123";
const ownSender = { id: EXTENSION_ID };

describe("validateIncomingMessage", () => {
  it("acepta un RUN_RPA válido de la propia extensión", () => {
    const message = makeRunRpa(makeRunRequest(), 7);
    expect(validateIncomingMessage(message, ownSender, EXTENSION_ID)).toEqual({
      ok: true,
      type: MESSAGE_TYPES.RUN_RPA,
    });
  });

  it("rechaza un runId vacío", () => {
    const message = makeRunRpa(makeRunRequest({ runId: "  " }), 7);
    expect(validateIncomingMessage(message, ownSender, EXTENSION_ID).reason).toBe(
      "invalid_run_request",
    );
  });

  it("rechaza services vacío", () => {
    const message = makeRunRpa(makeRunRequest({ services: [] }), 7);
    expect(validateIncomingMessage(message, ownSender, EXTENSION_ID).ok).toBe(false);
  });

  it("rechaza un tipo de mensaje desconocido (p. ej. el DOM_FIELDS del v6)", () => {
    const result = validateIncomingMessage({ type: "DOM_FIELDS" }, ownSender, EXTENSION_ID);
    expect(result).toEqual({ ok: false, reason: "unknown_type" });
  });

  it("ignora mensajes de otro sender.id", () => {
    const message = makeRunRpa(makeRunRequest(), 7);
    const result = validateIncomingMessage(message, { id: "otra-extension" }, EXTENSION_ID);
    expect(result).toEqual({ ok: false, reason: "foreign_sender" });
  });

  it("rechaza RUN_RPA sin tabId entero", () => {
    const message = makeRunRpa(makeRunRequest(), "7");
    expect(validateIncomingMessage(message, ownSender, EXTENSION_ID).reason).toBe("invalid_tab_id");
  });
});

describe("isCalculatorUrl", () => {
  it("acepta un enlace https de calculator.aws", () => {
    expect(isCalculatorUrl("https://calculator.aws/#/estimate?id=abc")).toBe(true);
  });

  it("rechaza otro host, http: y texto que no es URL", () => {
    expect(isCalculatorUrl("https://calculator.aws.evil.com/x")).toBe(false);
    expect(isCalculatorUrl("http://calculator.aws/#/estimate")).toBe(false);
    expect(isCalculatorUrl("no es una url")).toBe(false);
    expect(isCalculatorUrl(undefined)).toBe(false);
  });
});

describe("mensajes del panel y forma de RunResult", () => {
  it("solo acepta PROGRESS/RUN_RESULT de la corrida en curso", () => {
    expect(isMessageForRun({ type: "PROGRESS", runId: "r1" }, "r1")).toBe(true);
    expect(isMessageForRun({ type: "PROGRESS", runId: "r2" }, "r1")).toBe(false);
    expect(isMessageForRun({ type: "PING", runId: "r1" }, "r1")).toBe(false);
  });

  it("un RunResult DONE sin URL válida no es válido; ERROR con URL tampoco", () => {
    const base = { runId: "r1", perServiceResults: [] };
    expect(
      isRunResult({ ...base, status: "DONE", estimateUrl: "https://calculator.aws/#/e" }),
    ).toBe(true);
    expect(isRunResult({ ...base, status: "DONE" })).toBe(false);
    expect(isRunResult({ ...base, status: "ERROR", estimateUrl: "https://calculator.aws/" })).toBe(
      false,
    );
  });

  it("el progreso lleva solo campos estructurados y PING responde según el módulo", () => {
    expect(
      makeProgressEvent("r1", { step: "saving", serviceIndex: 0, pct: 140, text: "x", extra: 1 }),
    ).toEqual({ runId: "r1", step: "saving", serviceIndex: 0 });
    expect(makeProgressEvent("r1", { logDegraded: true })).toEqual({
      runId: "r1",
      logDegraded: true,
    });
    expect(makeProgressEvent("r1")).toEqual({ runId: "r1" });
    expect(makePingResponse("ready")).toEqual({ ok: true, ready: true });
    expect(makePingResponse("loading")).toEqual({ ok: true, ready: false });
    expect(makePingResponse("failed")).toEqual({ ok: false, ready: false });
  });
});
