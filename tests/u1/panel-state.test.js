import { describe, it, expect } from "vitest";
import {
  PANEL_EVENTS as E,
  PANEL_STATES as S,
  canDeleteLogs,
  isRunButtonEnabled,
  resolveInitialView,
  transition,
} from "../../aws-calculator-extension/lib/panel/panel-state.js";

function walk(state, events) {
  return events.reduce((current, event) => transition(current, event).state, state);
}

describe("panel-state (functional-spec §5)", () => {
  it("recorre el camino feliz Idle → Validating → Connecting → Running → Done", () => {
    expect(walk(S.IDLE, [E.SUBMIT, E.INPUT_VALID, E.RUN_ACCEPTED, E.RESULT_DONE])).toBe(S.DONE);
    expect(walk(S.IDLE, [E.SUBMIT, E.INPUT_INVALID])).toBe(S.IDLE);
  });

  it("RUN_RPA rechazado (accepted:false) o handshake agotado → Error", () => {
    expect(walk(S.IDLE, [E.SUBMIT, E.INPUT_VALID, E.RUN_REJECTED])).toBe(S.ERROR);
    expect(walk(S.IDLE, [E.SUBMIT, E.INPUT_VALID, E.HANDSHAKE_FAILED])).toBe(S.ERROR);
  });

  it("reabrir el panel con activeRun vigente → Running", () => {
    const view = resolveInitialView({
      activeRun: { runId: "r1", tabId: 7, updatedAt: 100000, lastProgress: { pct: 40, text: "x" } },
      now: 130000,
    });
    expect(view).toMatchObject({ event: E.RESUME_ACTIVE, runId: "r1", tabId: 7 });
    expect(transition(S.IDLE, view.event).state).toBe(S.RUNNING);
  });

  it("latido vencido al reabrir o durante la corrida → Error lost", () => {
    const view = resolveInitialView({ activeRun: { runId: "r1", updatedAt: 0 }, now: 60001 });
    expect(view.event).toBe(E.RUN_LOST);
    expect(transition(S.IDLE, E.RUN_LOST).state).toBe(S.ERROR);
    expect(transition(S.RUNNING, E.RUN_LOST).state).toBe(S.ERROR);
  });

  it("sin corrida en curso muestra la última corrida guardada", () => {
    const last = { runId: "r0", status: "DONE" };
    expect(resolveInitialView({ activeRun: undefined, lastRunResult: last, now: 1 })).toEqual({
      event: null,
      lastRunResult: last,
    });
    expect(resolveInitialView({ now: 1 }).lastRunResult).toBeNull();
  });

  it("permite una nueva corrida desde Done y Error", () => {
    expect(transition(S.DONE, E.SUBMIT).state).toBe(S.VALIDATING);
    expect(transition(S.ERROR, E.SUBMIT).state).toBe(S.VALIDATING);
  });

  it("ignora transiciones inválidas y deshabilita el botón y el borrado durante la corrida", () => {
    expect(transition(S.RUNNING, E.SUBMIT)).toEqual({ state: S.RUNNING, changed: false });
    expect(transition("Desconocido", E.SUBMIT).changed).toBe(false);
    for (const state of [S.VALIDATING, S.CONNECTING, S.RUNNING]) {
      expect(isRunButtonEnabled(state)).toBe(false);
      expect(canDeleteLogs(state)).toBe(false);
    }
    expect(isRunButtonEnabled(S.DONE)).toBe(true);
  });
});
