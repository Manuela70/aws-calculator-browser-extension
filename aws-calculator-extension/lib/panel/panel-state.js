// lib/panel/panel-state.js — Máquina de estados pura del panel lateral (functional-spec §5).
// PROVISIONAL (U1, walking skeleton). Dueño final: U6 (estados M1-M8 sobre este módulo).
// Idle → Validating → Connecting → Running → Done | Error. Una transición no
// prevista se ignora (el estado no cambia).

import { isHeartbeatStale } from "./heartbeat.js";

export const PANEL_STATES = Object.freeze({
  IDLE: "Idle",
  VALIDATING: "Validating",
  CONNECTING: "Connecting",
  RUNNING: "Running",
  DONE: "Done",
  ERROR: "Error",
});

export const PANEL_EVENTS = Object.freeze({
  SUBMIT: "SUBMIT",
  INPUT_INVALID: "INPUT_INVALID",
  INPUT_VALID: "INPUT_VALID",
  HANDSHAKE_FAILED: "HANDSHAKE_FAILED",
  RUN_REJECTED: "RUN_REJECTED",
  RUN_ACCEPTED: "RUN_ACCEPTED",
  RESUME_ACTIVE: "RESUME_ACTIVE",
  RESULT_DONE: "RESULT_DONE",
  RESULT_ERROR: "RESULT_ERROR",
  RUN_LOST: "RUN_LOST",
});

const S = PANEL_STATES;
const E = PANEL_EVENTS;

const TRANSITIONS = Object.freeze({
  [S.IDLE]: { [E.SUBMIT]: S.VALIDATING, [E.RESUME_ACTIVE]: S.RUNNING, [E.RUN_LOST]: S.ERROR },
  [S.VALIDATING]: { [E.INPUT_INVALID]: S.IDLE, [E.INPUT_VALID]: S.CONNECTING },
  [S.CONNECTING]: {
    [E.HANDSHAKE_FAILED]: S.ERROR,
    [E.RUN_REJECTED]: S.ERROR,
    [E.RUN_ACCEPTED]: S.RUNNING,
  },
  [S.RUNNING]: { [E.RESULT_DONE]: S.DONE, [E.RESULT_ERROR]: S.ERROR, [E.RUN_LOST]: S.ERROR },
  [S.DONE]: { [E.SUBMIT]: S.VALIDATING, [E.RESUME_ACTIVE]: S.RUNNING },
  [S.ERROR]: { [E.SUBMIT]: S.VALIDATING, [E.RESUME_ACTIVE]: S.RUNNING },
});

export function transition(state, event) {
  const next = TRANSITIONS[state]?.[event];
  return next ? { state: next, changed: true } : { state, changed: false };
}

// El botón "Generar Estimado" solo está habilitado sin corrida en curso (BR6.1).
export function isRunButtonEnabled(state) {
  return state === S.IDLE || state === S.DONE || state === S.ERROR;
}

// Borrar el registro está deshabilitado mientras hay una corrida (security-design §5).
export function canDeleteLogs(state) {
  return isRunButtonEnabled(state);
}

// Estado al abrir el panel (W1 paso 1, BR6.3, BR6.6): corrida vigente →
// Running; latido vencido → cerrar como lost; si no, Idle con la última corrida.
export function resolveInitialView({ activeRun, lastRunResult, now }) {
  if (activeRun && typeof activeRun.runId === "string") {
    if (isHeartbeatStale(activeRun.updatedAt, now)) {
      return {
        event: E.RUN_LOST,
        runId: activeRun.runId,
        lastProgress: activeRun.lastProgress ?? null,
      };
    }
    return {
      event: E.RESUME_ACTIVE,
      runId: activeRun.runId,
      tabId: activeRun.tabId,
      lastProgress: activeRun.lastProgress ?? null,
    };
  }
  return { event: null, lastRunResult: lastRunResult ?? null };
}
