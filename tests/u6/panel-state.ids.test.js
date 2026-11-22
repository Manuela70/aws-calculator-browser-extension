// panel-state.js: filtro por requestId/runId y eventos sin transición (BR3.3, NFR3.2).
import { describe, it, expect } from "vitest";
import {
  PANEL_EVENTS as E,
  PANEL_STATES as S,
  transition,
} from "../../aws-calculator-extension/lib/panel/panel-state.js";
import {
  makeDoneRunResult,
  makeInputErrors,
  makeJsonRun,
  makeProgress,
  makeWafResponse,
} from "./fixtures.js";
import { RUN_ID, idle, reviewing, running, walk, wafLoading } from "./panel-paths.js";

describe("eventos de otra petición o corrida se ignoran (BR3.3)", () => {
  it("una respuesta de normalize con otro requestId no mueve el panel", async () => {
    const model = walk(idle(), { type: E.GENERATE });
    const value = await makeJsonRun();
    const stale = { type: E.NORMALIZED, requestId: "req-0", result: { ok: true, value } };
    expect(transition(model, stale)).toBe(model);
    const noId = { type: E.NORMALIZED, result: { ok: false, error: makeInputErrors().json } };
    expect(transition(model, noId)).toBe(model);
  });

  it("una respuesta tardía tras Cancelar se descarta", async () => {
    const model = walk(idle(), { type: E.GENERATE });
    const cancelled = walk(model, { type: E.CANCEL });
    const late = {
      type: E.NORMALIZED,
      requestId: model.requestId,
      result: { ok: true, value: {} },
    };
    expect(transition(cancelled, late)).toBe(cancelled);
    const review = await reviewing();
    const afterCancel = walk(review, { type: E.CANCEL });
    const lateReview = {
      type: E.REVIEW_RESULT,
      requestId: review.requestId,
      response: makeWafResponse(),
    };
    expect(transition(afterCancel, lateReview)).toBe(afterCancel);
  });

  it("PROGRESS y RUN_RESULT de otra corrida se ignoran (NFR3.2)", async () => {
    const model = await running();
    expect(transition(model, { type: E.PROGRESS, event: makeProgress("otra", "saving") })).toBe(
      model,
    );
    expect(transition(model, { type: E.PROGRESS, event: null })).toBe(model);
    const foreign = { type: E.RUN_RESULT, runResult: makeDoneRunResult("otra") };
    expect(transition(model, foreign)).toBe(model);
    expect(transition(model, { type: E.RUN_RESULT, runResult: "x" })).toBe(model);
    expect(transition(model, { type: E.RUN_LOST, runId: "otra" })).toBe(model);
    expect(transition(model, { type: E.CANCEL_TIMEOUT, runId: RUN_ID })).toBe(model);
  });

  it("WAF_RESULT y TIMEOUT de una evaluación anterior se ignoran", async () => {
    const model = await wafLoading();
    const old = { type: E.WAF_RESULT, requestId: "req-1", response: makeWafResponse() };
    expect(transition(model, old)).toBe(model);
    expect(transition(model, { type: E.TIMEOUT, requestId: "req-1" })).toBe(model);
    expect(transition(model, { type: E.WAF_FAILED, requestId: "req-1", code: "timeout" })).toBe(
      model,
    );
  });
});

describe("eventos sin transición desde el estado actual se ignoran", () => {
  it("devuelve el mismo objeto ante eventos ajenos al estado o desconocidos", async () => {
    const model = idle();
    for (const type of [
      E.CANCEL,
      E.RETRY,
      E.BACK,
      E.FILL_ANYWAY,
      E.WAF_START,
      E.CONNECTED,
      E.LOGIN_OK,
    ]) {
      expect(transition(model, { type })).toBe(model);
    }
    expect(transition(model, { type: "volar" })).toBe(model);
    expect(transition(model, null)).toBe(model);
    expect(transition(model, { type: E.TAB_CHANGE, tab: "otra" })).toBe(model);
    expect(transition(model, { type: E.TEXT_CHANGE, tab: "json", text: model.texts.json })).toBe(
      model,
    );
  });

  it("con la entrada bloqueada no se edita ni se cambia de pestaña ni se genera otra vez", async () => {
    const model = await running();
    expect(transition(model, { type: E.TEXT_CHANGE, tab: "json", text: "x" })).toBe(model);
    expect(transition(model, { type: E.TAB_CHANGE, tab: "natural_language" })).toBe(model);
    expect(transition(model, { type: E.GENERATE })).toBe(model);
    expect(transition(model, { type: E.RESUME_ACTIVE, runId: "r2" })).toBe(model);
    const generating = walk(idle(), { type: E.GENERATE });
    expect(transition(generating, { type: E.GENERATE })).toBe(generating);
    expect(generating.state).toBe(S.VALIDATING);
  });
});
