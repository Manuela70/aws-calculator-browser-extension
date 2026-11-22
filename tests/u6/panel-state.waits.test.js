// panel-state.js: integración que recorre la máquina; ningún estado de espera queda sin
// salida (NFR8.4), canRetry y nunca Done sin URL válida (BR3.4, NFR3.2).
import { describe, it, expect } from "vitest";
import {
  INPUT_TABS,
  PANEL_EVENTS as E,
  PANEL_STATES as S,
  WAITING_STATES,
  isSuccessfulRun,
  transition,
} from "../../aws-calculator-extension/lib/panel/panel-state.js";
import {
  makeConnectionFailure,
  makeDoneRunResult,
  makeDoneWithBadUrl,
  makeErrorRunResult,
} from "./fixtures.js";
import { RUN_ID, connecting, idle, reviewing, running, walk, wafLoading } from "./panel-paths.js";

// Un modelo en cada estado de espera, armado con eventos reales.
async function modelsInWaitingStates() {
  return {
    [S.VALIDATING]: walk(idle(), { type: E.GENERATE }),
    [S.INTERPRETING]: walk(idle(INPUT_TABS.NATURAL_LANGUAGE), { type: E.GENERATE }),
    [S.REVIEWING]: await reviewing(),
    [S.CONNECTING]: walk(await connecting(), { type: E.RUN_REQUESTED, runId: RUN_ID }),
    [S.RUNNING]: await running(),
    [S.WAF_LOADING]: await wafLoading(),
  };
}

// Salida de cada estado de espera: tope vencido o cancelación (con confirmación
// y tope de 20 s en Running).
function exitEvents(model) {
  if (model.state === S.RUNNING) {
    return [
      { type: E.CANCEL },
      { type: E.CANCEL_CONFIRMED },
      { type: E.CANCEL_TIMEOUT, runId: model.runId },
    ];
  }
  return [{ type: E.TIMEOUT, requestId: model.requestId, runId: model.runId }];
}

describe("NFR8.4: todo estado de espera tiene salida", () => {
  it("cubre los seis estados de espera y cada uno sale por timeout o cancelación", async () => {
    const models = await modelsInWaitingStates();
    expect(Object.keys(models).sort()).toEqual([...WAITING_STATES].sort());
    for (const [state, model] of Object.entries(models)) {
      expect(model.state).toBe(state);
      const after = walk(model, ...exitEvents(model));
      expect(WAITING_STATES, `${state} → ${after.state}`).not.toContain(after.state);
    }
  });

  it("las salidas por tope llevan al estado de error con su texto", async () => {
    const models = await modelsInWaitingStates();
    const out = (state) => walk(models[state], ...exitEvents(models[state]));
    expect(out(S.VALIDATING)).toMatchObject({
      state: S.INPUT_ERROR,
      error: { code: "input:timeout" },
    });
    expect(out(S.INTERPRETING).state).toBe(S.INPUT_ERROR);
    expect(out(S.REVIEWING)).toMatchObject({
      state: S.REVIEW_ERROR,
      error: { code: "brain:timeout" },
    });
    expect(out(S.WAF_LOADING)).toMatchObject({
      state: S.WAF_ERROR,
      error: { code: "brain:timeout" },
    });
    expect(out(S.CONNECTING)).toMatchObject({
      state: S.CONNECTION_ERROR,
      error: { code: "failure:connection" },
    });
    expect(out(S.RUNNING)).toMatchObject({ state: S.IDLE, notice: "cancel_unconfirmed" });
    expect(walk(models[S.CONNECTING], { type: E.TIMEOUT, runId: "otra" }).state).toBe(S.CONNECTING);
    for (const state of [S.VALIDATING, S.INTERPRETING, S.REVIEWING, S.WAF_LOADING]) {
      expect(walk(models[state], { type: E.CANCEL }).state).not.toBe(state);
    }
  });

  it("una corrida que deja de responder pasa a Failed lost sin reintento", async () => {
    const lost = walk(await running(), { type: E.RUN_LOST, runId: RUN_ID });
    expect(lost).toMatchObject({ state: S.FAILED, canRetry: false });
  });
});

describe("BR3.4: nunca Done sin URL válida", () => {
  it("DONE sin URL o con URL de otro host es Failed con el motivo share y sin URL", async () => {
    const model = await running();
    const bad = walk(model, { type: E.RUN_RESULT, runResult: makeDoneWithBadUrl(RUN_ID) });
    expect(bad.state).toBe(S.FAILED);
    expect(bad.runResult).toMatchObject({ status: "ERROR", failureStep: "share" });
    expect(bad.runResult.estimateUrl).toBeUndefined();
    const noUrl = { ...makeDoneRunResult(RUN_ID) };
    delete noUrl.estimateUrl;
    expect(walk(model, { type: E.RUN_RESULT, runResult: noUrl }).state).toBe(S.FAILED);
    expect(isSuccessfulRun(makeDoneWithBadUrl())).toBe(false);
    expect(isSuccessfulRun(makeDoneRunResult())).toBe(true);
  });

  it("recorre la máquina completa y solo Done/WafResult/WafError tienen URL", async () => {
    const results = [
      makeDoneRunResult(RUN_ID),
      makeDoneWithBadUrl(RUN_ID),
      makeErrorRunResult(RUN_ID),
      makeConnectionFailure(RUN_ID),
    ];
    for (const runResult of results) {
      const model = walk(await running(), { type: E.RUN_RESULT, runResult });
      const hasUrl = Boolean(model.runResult?.estimateUrl);
      expect(hasUrl).toBe(model.state === S.DONE);
      if (model.state === S.DONE)
        expect(transition(model, { type: E.WAF_START }).state).toBe(S.WAF_LOADING);
    }
  });
});

describe("canRetry", () => {
  it("solo con failureStep connection o preconditions y la configuración en memoria", async () => {
    const model = await running();
    const byStep = (step) =>
      walk(model, { type: E.RUN_RESULT, runResult: makeConnectionFailure(RUN_ID, step) });
    expect(byStep("connection").canRetry).toBe(true);
    expect(byStep("preconditions").canRetry).toBe(true);
    expect(byStep("share").canRetry).toBe(false);
    const resumed = { ...model, normalizedRun: null };
    const noConfig = walk(resumed, {
      type: E.RUN_RESULT,
      runResult: makeConnectionFailure(RUN_ID),
    });
    expect(noConfig.canRetry).toBe(false);
  });
});
