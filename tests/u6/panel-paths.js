// Recorridos del reductor del panel hasta cada estado, con eventos reales y
// datos de fixtures.js. Cada llamada arma un modelo nuevo.

import {
  PANEL_EVENTS as E,
  createInitialState,
  transition,
} from "../../aws-calculator-extension/lib/panel/panel-state.js";
import {
  EC2_JSON,
  FIXED_NOW,
  makeDoneRunResult,
  makeJsonRun,
  makeSession,
  makeWafResponse,
} from "./fixtures.js";

export const RUN_ID = "run-1";

export function walk(model, ...events) {
  return events.reduce((current, event) => transition(current, event), model);
}

export function idle(tab = "json") {
  return createInitialState({
    texts: { json: JSON.stringify(EC2_JSON), natural_language: "dos EC2 t3.micro" },
    activeTab: tab,
  });
}

export async function preview() {
  const model = walk(idle(), { type: E.GENERATE });
  const run = await makeJsonRun();
  return walk(model, {
    type: E.NORMALIZED,
    requestId: model.requestId,
    result: { ok: true, value: run },
  });
}

export async function reviewing() {
  return walk(
    await preview(),
    { type: E.REVIEW_REQUESTED },
    { type: E.SESSION_CHECKED, session: makeSession(60), now: FIXED_NOW },
  );
}

export async function reviewFindings() {
  const model = await reviewing();
  return walk(model, {
    type: E.REVIEW_RESULT,
    requestId: model.requestId,
    response: makeWafResponse(),
  });
}

export async function connecting() {
  return walk(await reviewFindings(), { type: E.FILL_ANYWAY });
}

export async function running() {
  return walk(
    await connecting(),
    { type: E.RUN_REQUESTED, runId: RUN_ID },
    { type: E.CONNECTED, runId: RUN_ID, tabId: 7 },
  );
}

export async function done() {
  return walk(await running(), { type: E.RUN_RESULT, runResult: makeDoneRunResult(RUN_ID) });
}

export async function wafLoading() {
  return walk(await done(), { type: E.WAF_START });
}
