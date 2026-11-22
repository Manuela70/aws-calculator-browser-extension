// lib/panel/panel-state.js — Máquina de estados pura del panel lateral (functional-spec §2-§3;
// BR1.1-BR1.3, BR2.1-BR2.3, BR3.1-BR3.4, BR4.1; NFR3.2, NFR5.5, NFR8.4).
// Dueño: U6 (completa el provisional de U1). Zona A: sin DOM, sin chrome y sin
// reloj; los ids de corrida y la hora llegan en los eventos.
//
// transition(model, event) → model. Un evento sin transición desde el estado
// actual, o con un requestId/runId que no es el vigente, se ignora: devuelve el
// MISMO objeto (la vista lo cuenta para diagnóstico). La vista nunca decide si
// algo fue éxito: Done exige DONE con URL válida (BR3.4).

import { isHeartbeatStale } from "./heartbeat.js";
import { isValidEstimateUrl } from "./url-check.js";
import { needsLogin } from "./session-rule.js";
import { validateWafResponse } from "./waf-model.js";

export const PANEL_STATES = Object.freeze({
  IDLE: "Idle",
  VALIDATING: "Validating",
  INTERPRETING: "Interpreting",
  INPUT_ERROR: "InputError",
  PREVIEW: "Preview",
  REVIEWING: "Reviewing",
  REVIEW_FINDINGS: "ReviewFindings",
  REVIEW_ERROR: "ReviewError",
  CONNECTING: "Connecting",
  CONNECTION_ERROR: "ConnectionError",
  RUNNING: "Running",
  DONE: "Done",
  FAILED: "Failed",
  WAF_LOADING: "WafLoading",
  WAF_RESULT: "WafResult",
  WAF_ERROR: "WafError",
});

export const PANEL_EVENTS = Object.freeze({
  HYDRATE: "hydrate",
  TAB_CHANGE: "tab-change",
  TEXT_CHANGE: "text-change",
  GENERATE: "generate",
  NORMALIZED: "normalized",
  CANCEL: "cancel",
  CANCEL_CONFIRMED: "cancel-confirmed",
  CANCEL_DISMISSED: "cancel-dismissed",
  CANCEL_TIMEOUT: "cancel-timeout",
  REVIEW_REQUESTED: "review-requested",
  SESSION_CHECKED: "session-checked",
  REVIEW_RESULT: "review-result",
  REVIEW_FAILED: "review-failed",
  FILL_ANYWAY: "fill-anyway",
  CORRECT: "correct",
  RETRY: "retry",
  BACK: "back",
  RUN_REQUESTED: "run-requested",
  CONNECTED: "connected",
  CONNECTION_FAILED: "connection-failed",
  PROGRESS: "progress",
  RUN_RESULT: "run-result",
  RUN_LOST: "run-lost",
  RESUME_ACTIVE: "resume-active",
  WAF_START: "waf-start",
  WAF_RESULT: "waf-result",
  WAF_FAILED: "waf-failed",
  RETRY_WAF: "retry-waf",
  NEW_RUN: "new-run",
  TIMEOUT: "timeout",
  LOGIN_REQUESTED: "login-requested",
  LOGIN_OK: "login-ok",
  LOGIN_CANCELLED: "login-cancelled",
});

export const INPUT_TABS = Object.freeze({ JSON: "json", NATURAL_LANGUAGE: "natural_language" });

const S = PANEL_STATES;
const E = PANEL_EVENTS;
const TABS = Object.values(INPUT_TABS);

// Estados con la entrada, "Generar" y el historial deshabilitados (§3).
export const BUSY_STATES = Object.freeze([
  S.VALIDATING,
  S.INTERPRETING,
  S.REVIEWING,
  S.CONNECTING,
  S.RUNNING,
]);

// Estados de espera: cada uno tiene salida por timeout o por cancelación (NFR8.4).
export const WAITING_STATES = Object.freeze([...BUSY_STATES, S.WAF_LOADING]);

// Estados donde editar el texto descarta lo mostrado y vuelve a Idle (R-17).
const DISCARD_ON_EDIT = Object.freeze([
  S.INPUT_ERROR,
  S.PREVIEW,
  S.REVIEW_FINDINGS,
  S.REVIEW_ERROR,
]);

const BRAIN_CODES = Object.freeze([
  "unauthorized",
  "login_cancelled",
  "rate_limited",
  "daily_quota_exceeded",
  "inventory_unavailable",
  "model_unavailable",
  "timeout",
  "brain_unavailable",
  "bad_request",
  "empty_result",
  "internal_error",
]);

const CONNECTION_FAILURES = Object.freeze([
  "open_failed",
  "tab_load_timeout",
  "inject_failed",
  "no_response",
  "not_ready",
  "busy",
  "module_load_failed",
]);

const RETRYABLE_FAILURE_STEPS = Object.freeze(["connection", "preconditions"]);
const INPUT_ERROR_PARAMS = Object.freeze([
  "service",
  "serviceIndex",
  "key",
  "limit",
  "maxLength",
  "region",
  "retryAfterSeconds",
]);

// Datos de una corrida que se borran al volver a Idle o al generar de nuevo;
// los textos de las pestañas nunca se borran.
const RUN_DATA = Object.freeze({
  requestId: null,
  runId: null,
  tabId: null,
  normalizedRun: null,
  noReview: false,
  reviewNotice: null,
  reviewFindings: null,
  progress: null,
  runResult: null,
  waf: null,
  error: null,
  canRetry: false,
  needsLogin: false,
  checkingSession: false,
  loginPending: false,
  confirmingCancel: false,
  cancelPending: false,
  notice: null,
});

function asText(value) {
  return typeof value === "string" ? value : "";
}

export function createInitialState({ texts = {}, activeTab = INPUT_TABS.JSON } = {}) {
  return {
    state: S.IDLE,
    activeTab: TABS.includes(activeTab) ? activeTab : INPUT_TABS.JSON,
    texts: {
      [INPUT_TABS.JSON]: asText(texts[INPUT_TABS.JSON]),
      [INPUT_TABS.NATURAL_LANGUAGE]: asText(texts[INPUT_TABS.NATURAL_LANGUAGE]),
    },
    seq: 0,
    ...RUN_DATA,
  };
}

// ─── Consultas para la vista ──────────────────────────────────────────────────

function stateOf(modelOrState) {
  return typeof modelOrState === "string" ? modelOrState : modelOrState?.state;
}

export function isBusy(modelOrState) {
  return BUSY_STATES.includes(stateOf(modelOrState));
}

export function isInputEnabled(modelOrState) {
  return !isBusy(modelOrState);
}

export function canGenerate(modelOrState) {
  const state = stateOf(modelOrState);
  return state === S.IDLE || state === S.INPUT_ERROR;
}

// Borrar el historial está deshabilitado mientras hay una corrida (BR5.3).
export function canDeleteLogs(modelOrState) {
  return !isBusy(modelOrState);
}

// ─── Ayudantes puros ──────────────────────────────────────────────────────────

function enter(model, state, patch = {}) {
  return { ...model, ...patch, state };
}

function toIdle(model, patch = {}) {
  return enter(model, S.IDLE, { ...RUN_DATA, ...patch });
}

function nextRequest(model) {
  const seq = model.seq + 1;
  return { seq, requestId: `req-${seq}` };
}

function matchesRequest(model, event) {
  return typeof event.requestId === "string" && event.requestId === model.requestId;
}

function matchesRun(model, runId) {
  return typeof runId === "string" && runId.length > 0 && runId === model.runId;
}

function brainCode(code) {
  return BRAIN_CODES.includes(code) ? code : "internal_error";
}

function brainError(code, extra = {}) {
  const known = brainCode(code);
  const params = Number.isInteger(extra.retryAfterSeconds)
    ? { retryAfterSeconds: extra.retryAfterSeconds }
    : {};
  return { code: `brain:${known}`, params, canLogin: known === "unauthorized" };
}

function inputError(error, resumeTo) {
  const code = typeof error?.code === "string" ? error.code : "unexpected_error";
  const params = {};
  for (const key of INPUT_ERROR_PARAMS) {
    if (error?.[key] !== undefined) params[key] = error[key];
  }
  return {
    code: `input:${code}`,
    params,
    fragments: Array.isArray(error?.fragments) ? error.fragments : null,
    canLogin: code === "unauthorized",
    resumeTo,
  };
}

function serviceCountOf(model) {
  if (Array.isArray(model.normalizedRun?.services)) return model.normalizedRun.services.length;
  return Array.isArray(model.runResult?.perServiceResults)
    ? model.runResult.perServiceResults.length
    : 0;
}

// ─── Progreso (BR3.1) ─────────────────────────────────────────────────────────

function initialProgress(normalizedRun) {
  const names = (normalizedRun?.services ?? []).map((svc) => svc.serviceName);
  return {
    serviceCount: names.length,
    currentIndex: null,
    step: null,
    label: null,
    stepStartedAt: null,
    logDegraded: false,
    rows: names.map((name) => ({ name, status: "queued", step: null })),
  };
}

function resizeRows(rows, count) {
  const next = rows.slice(0, Math.max(count, rows.length));
  while (next.length < count) next.push({ name: null, status: "queued", step: null });
  return next;
}

function updateRow(row, event) {
  const status = ["confirmed", "failed"].includes(event.serviceStatus)
    ? event.serviceStatus
    : "in_progress";
  const name = row.name ?? (event.step === "adding_service" ? event.label : null) ?? null;
  return { ...row, name, status, step: event.step };
}

export function applyProgress(progress, event) {
  const base = progress ?? initialProgress(null);
  const count =
    Number.isInteger(event.serviceCount) && event.serviceCount > 0
      ? event.serviceCount
      : base.serviceCount;
  const rows = resizeRows(base.rows, count);
  const index = event.serviceIndex;
  const hasIndex = Number.isInteger(index) && index >= 0 && index < rows.length;
  if (hasIndex) rows[index] = updateRow(rows[index], event);
  const stepChanged = event.step !== base.step || (hasIndex && index !== base.currentIndex);
  return {
    ...base,
    serviceCount: Math.max(count, rows.length),
    currentIndex: hasIndex ? index : base.currentIndex,
    step: typeof event.step === "string" ? event.step : base.step,
    label: typeof event.label === "string" ? event.label : null,
    stepStartedAt: stepChanged ? (event.receivedAt ?? null) : base.stepStartedAt,
    logDegraded: base.logDegraded || event.logDegraded === true,
    rows,
  };
}

// ─── Resultado (BR3.2, BR3.4) ─────────────────────────────────────────────────

function isRunResultShape(runResult) {
  return (
    runResult !== null &&
    typeof runResult === "object" &&
    typeof runResult.runId === "string" &&
    Array.isArray(runResult.perServiceResults ?? [])
  );
}

export function isSuccessfulRun(runResult) {
  return runResult?.status === "DONE" && isValidEstimateUrl(runResult.estimateUrl);
}

// Un DONE sin URL válida se muestra como fallo del enlace (share), sin URL.
function asFailedResult(runResult) {
  if (runResult.status === "ERROR") return runResult;
  const rest = { ...runResult };
  delete rest.estimateUrl;
  return {
    ...rest,
    status: "ERROR",
    failureStep: "share",
    perServiceResults: rest.perServiceResults ?? [],
  };
}

function failedPatch(model, runResult) {
  const failed = asFailedResult(runResult);
  const unauthorized = (failed.perServiceResults ?? []).some(
    (result) => result?.brainErrorCode === "unauthorized",
  );
  return {
    runResult: failed,
    canRetry: RETRYABLE_FAILURE_STEPS.includes(failed.failureStep) && Boolean(model.normalizedRun),
    error: unauthorized ? brainError("unauthorized") : null,
    confirmingCancel: false,
    cancelPending: false,
    requestId: null,
  };
}

function lostRunResult(runId, runResult) {
  if (isRunResultShape(runResult) && runResult.runId === runId) return runResult;
  return { runId, status: "ERROR", failureStep: "lost", perServiceResults: [], missing: [] };
}

// ─── Manejadores por evento ───────────────────────────────────────────────────

// Texto guardado en storage.session al abrir (BR1.2). Se aplica en cualquier
// estado porque la lectura corre en paralelo con la reanudación de la corrida;
// no pisa un texto que el SE ya escribió.
function onHydrate(model, { texts, activeTab }) {
  const next = { ...model.texts };
  let changed = false;
  for (const tab of TABS) {
    const saved = texts?.[tab];
    if (typeof saved === "string" && saved && !model.texts[tab]) {
      next[tab] = saved;
      changed = true;
    }
  }
  const tab = TABS.includes(activeTab) && !isBusy(model) ? activeTab : model.activeTab;
  if (!changed && tab === model.activeTab) return model;
  return { ...model, texts: next, activeTab: tab };
}

function onTabChange(model, { tab }) {
  if (!TABS.includes(tab) || tab === model.activeTab || isBusy(model)) return model;
  if (DISCARD_ON_EDIT.includes(model.state)) return toIdle(model, { activeTab: tab });
  return { ...model, activeTab: tab };
}

function onTextChange(model, { tab, text }) {
  if (!TABS.includes(tab) || typeof text !== "string" || isBusy(model)) return model;
  if (model.texts[tab] === text) return model;
  const texts = { ...model.texts, [tab]: text };
  if (DISCARD_ON_EDIT.includes(model.state)) return toIdle(model, { texts });
  return { ...model, texts };
}

function onGenerate(model) {
  if (!canGenerate(model)) return model;
  const target = model.activeTab === INPUT_TABS.JSON ? S.VALIDATING : S.INTERPRETING;
  return enter(model, target, { ...RUN_DATA, ...nextRequest(model) });
}

function onNormalized(model, event) {
  if (![S.VALIDATING, S.INTERPRETING].includes(model.state)) return model;
  if (!matchesRequest(model, event)) return model;
  const result = event.result;
  if (result?.ok === true && result.value && Array.isArray(result.value.services)) {
    return enter(model, S.PREVIEW, {
      requestId: null,
      normalizedRun: result.value,
      noReview: result.value.wafReview !== "required",
    });
  }
  if (result?.error?.code === "cancelled") return toIdle(model);
  return enter(model, S.INPUT_ERROR, {
    requestId: null,
    error: inputError(result?.error, model.state),
  });
}

function onCancel(model) {
  switch (model.state) {
    case S.VALIDATING:
    case S.INTERPRETING:
    case S.REVIEWING:
      return toIdle(model);
    case S.WAF_LOADING:
      return enter(model, S.DONE, { requestId: null, waf: null, error: null });
    case S.RUNNING:
      if (model.confirmingCancel || model.cancelPending) return model;
      return { ...model, confirmingCancel: true };
    default:
      return model;
  }
}

function onCancelConfirmed(model) {
  if (model.state !== S.RUNNING || !model.confirmingCancel) return model;
  return { ...model, confirmingCancel: false, cancelPending: true };
}

function onCancelDismissed(model) {
  if (model.state !== S.RUNNING || !model.confirmingCancel) return model;
  return { ...model, confirmingCancel: false };
}

function onCancelTimeout(model, { runId }) {
  if (model.state !== S.RUNNING || !model.cancelPending || !matchesRun(model, runId)) return model;
  return toIdle(model, { notice: "cancel_unconfirmed" });
}

function onReviewRequested(model) {
  if (model.state !== S.PREVIEW || model.checkingSession || model.loginPending) return model;
  if (model.noReview || model.normalizedRun?.wafReview !== "required") {
    return enter(model, S.CONNECTING, { noReview: true, error: null, needsLogin: false });
  }
  return { ...model, checkingSession: true, error: null };
}

function onSessionChecked(model, { session, now }) {
  if (model.state !== S.PREVIEW || !model.checkingSession) return model;
  if (needsLogin(session, now)) return { ...model, checkingSession: false, needsLogin: true };
  return enter(model, S.REVIEWING, {
    checkingSession: false,
    needsLogin: false,
    ...nextRequest(model),
  });
}

function canRequestLogin(model) {
  if (model.loginPending) return false;
  if (model.state === S.PREVIEW) return model.needsLogin;
  return model.error?.canLogin === true;
}

function onLoginRequested(model) {
  return canRequestLogin(model) ? { ...model, loginPending: true } : model;
}

// LOGIN_OK vuelve al estado previo a la llamada para repetirla (NFR5.5).
function onLoginOk(model) {
  if (!model.loginPending) return model;
  const base = { loginPending: false, needsLogin: false, error: null };
  switch (model.state) {
    case S.PREVIEW:
    case S.REVIEW_ERROR:
      return enter(model, S.REVIEWING, { ...base, ...nextRequest(model) });
    case S.INPUT_ERROR:
      return enter(model, model.error?.resumeTo ?? S.INTERPRETING, {
        ...base,
        ...nextRequest(model),
      });
    case S.WAF_ERROR:
      return enter(model, S.WAF_LOADING, { ...base, ...nextRequest(model) });
    case S.FAILED:
      return { ...model, ...base, notice: "login_ok" };
    default:
      return { ...model, loginPending: false };
  }
}

function onLoginCancelled(model, { code }) {
  if (!model.loginPending) return model;
  const known = code === "login_cancelled" ? "login_cancelled" : "brain_unavailable";
  // Decisión 3: sin cerebro desplegado la revisión previa no bloquea la corrida JSON.
  if (model.state === S.PREVIEW && known === "brain_unavailable") {
    return enter(model, S.CONNECTING, {
      loginPending: false,
      needsLogin: false,
      noReview: true,
      error: null,
    });
  }
  return {
    ...model,
    loginPending: false,
    error: { ...brainError(known), canLogin: true, resumeTo: model.error?.resumeTo },
  };
}

function onReviewResult(model, event) {
  if (model.state !== S.REVIEWING || !matchesRequest(model, event)) return model;
  const checked = validateWafResponse(event.response, { serviceCount: serviceCountOf(model) });
  if (!checked.ok)
    return enter(model, S.REVIEW_ERROR, { requestId: null, error: brainError(checked.code) });
  if (!checked.value.hasFindings) {
    return enter(model, S.CONNECTING, { requestId: null, reviewNotice: "no_findings" });
  }
  return enter(model, S.REVIEW_FINDINGS, { requestId: null, reviewFindings: checked.value });
}

function onReviewFailed(model, event) {
  if (model.state !== S.REVIEWING || !matchesRequest(model, event)) return model;
  // Decisión 3: brain_unavailable en la revisión previa → Connecting con aviso BR2.3.
  if (event.code === "brain_unavailable") {
    return enter(model, S.CONNECTING, { requestId: null, noReview: true });
  }
  return enter(model, S.REVIEW_ERROR, { requestId: null, error: brainError(event.code, event) });
}

function onTimeout(model, event) {
  const byRequest = matchesRequest(model, event);
  switch (model.state) {
    case S.VALIDATING:
    case S.INTERPRETING:
      if (!byRequest) return model;
      return enter(model, S.INPUT_ERROR, {
        requestId: null,
        error: inputError({ code: "timeout" }, model.state),
      });
    case S.REVIEWING:
      return byRequest
        ? enter(model, S.REVIEW_ERROR, { requestId: null, error: brainError("timeout") })
        : model;
    case S.WAF_LOADING:
      return byRequest
        ? enter(model, S.WAF_ERROR, { requestId: null, error: brainError("timeout") })
        : model;
    case S.CONNECTING:
      if (event.runId !== undefined && event.runId !== model.runId) return model;
      return enter(model, S.CONNECTION_ERROR, {
        runId: null,
        error: { code: "failure:connection", params: {}, canLogin: false },
      });
    default:
      return model;
  }
}

function onFillAnyway(model) {
  return model.state === S.REVIEW_FINDINGS ? enter(model, S.CONNECTING) : model;
}

function onCorrect(model) {
  return model.state === S.REVIEW_FINDINGS ? toIdle(model) : model;
}

function onRetry(model) {
  switch (model.state) {
    case S.REVIEW_ERROR:
      return enter(model, S.REVIEWING, { error: null, ...nextRequest(model) });
    case S.CONNECTION_ERROR:
      return enter(model, S.CONNECTING, { error: null, runId: null, tabId: null });
    case S.FAILED:
      if (!model.canRetry || !model.normalizedRun) return model;
      return enter(model, S.CONNECTING, {
        error: null,
        runId: null,
        tabId: null,
        runResult: null,
        progress: null,
        canRetry: false,
        notice: null,
      });
    default:
      return model;
  }
}

function onBack(model) {
  const allowed = [S.INPUT_ERROR, S.REVIEW_ERROR, S.CONNECTION_ERROR, S.FAILED];
  return allowed.includes(model.state) ? toIdle(model) : model;
}

function onNewRun(model) {
  const allowed = [S.DONE, S.WAF_RESULT, S.WAF_ERROR, S.FAILED];
  return allowed.includes(model.state) ? toIdle(model) : model;
}

function onRunRequested(model, { runId }) {
  if (model.state !== S.CONNECTING || model.runId || typeof runId !== "string" || !runId) {
    return model;
  }
  return { ...model, runId };
}

function onConnected(model, { runId, tabId }) {
  if (model.state !== S.CONNECTING || !matchesRun(model, runId)) return model;
  return enter(model, S.RUNNING, {
    tabId: Number.isInteger(tabId) ? tabId : null,
    progress: model.progress ?? initialProgress(model.normalizedRun),
    error: null,
  });
}

function onConnectionFailed(model, { runId, failure }) {
  if (model.state !== S.CONNECTING) return model;
  if (model.runId && runId !== model.runId) return model;
  const code = CONNECTION_FAILURES.includes(failure) ? `detail:${failure}` : "failure:connection";
  return enter(model, S.CONNECTION_ERROR, {
    runId: null,
    tabId: null,
    error: { code, params: {}, canLogin: false },
  });
}

function onProgress(model, { event }) {
  if (![S.CONNECTING, S.RUNNING].includes(model.state)) return model;
  if (!event || typeof event !== "object" || !matchesRun(model, event.runId)) return model;
  const base = model.progress ?? initialProgress(model.normalizedRun);
  return { ...model, progress: applyProgress(base, event) };
}

function onRunResult(model, { runResult }) {
  if (model.state !== S.RUNNING || !isRunResultShape(runResult)) return model;
  if (!matchesRun(model, runResult.runId)) return model;
  // Cancelación confirmada: el RunResult de esa corrida se ignora como resultado.
  if (model.cancelPending) return toIdle(model, { notice: "cancelled" });
  if (isSuccessfulRun(runResult)) {
    return enter(model, S.DONE, {
      runResult,
      confirmingCancel: false,
      error: null,
      requestId: null,
    });
  }
  return enter(model, S.FAILED, failedPatch(model, runResult));
}

function onRunLost(model, { runId, runResult }) {
  const fromRunning = model.state === S.RUNNING && matchesRun(model, runId);
  const atOpen = model.state === S.IDLE && !model.runId && typeof runId === "string" && runId;
  if (!fromRunning && !atOpen) return model;
  return enter(model, S.FAILED, {
    ...failedPatch({ ...model, normalizedRun: null }, lostRunResult(runId, runResult)),
    runId,
    canRetry: false,
  });
}

// Decisión 4: RESUME_ACTIVE sale de readActiveRun() al abrir (tope de 300 ms).
function onResumeActive(model, { runId, tabId, lastProgress }) {
  if (model.state !== S.IDLE || model.runId || typeof runId !== "string" || !runId) return model;
  const progress =
    lastProgress && typeof lastProgress === "object"
      ? applyProgress(null, { ...lastProgress, runId })
      : null;
  return enter(model, S.RUNNING, {
    ...RUN_DATA,
    runId,
    tabId: Number.isInteger(tabId) ? tabId : null,
    progress,
  });
}

function onWafStart(model) {
  return model.state === S.DONE
    ? enter(model, S.WAF_LOADING, { error: null, ...nextRequest(model) })
    : model;
}

function onWafResult(model, event) {
  if (model.state !== S.WAF_LOADING || !matchesRequest(model, event)) return model;
  const checked = validateWafResponse(event.response, { serviceCount: serviceCountOf(model) });
  if (!checked.ok)
    return enter(model, S.WAF_ERROR, { requestId: null, error: brainError(checked.code) });
  return enter(model, S.WAF_RESULT, { requestId: null, waf: checked.value, error: null });
}

function onWafFailed(model, event) {
  if (model.state !== S.WAF_LOADING || !matchesRequest(model, event)) return model;
  return enter(model, S.WAF_ERROR, { requestId: null, error: brainError(event.code, event) });
}

function onRetryWaf(model) {
  return model.state === S.WAF_ERROR
    ? enter(model, S.WAF_LOADING, { error: null, ...nextRequest(model) })
    : model;
}

const HANDLERS = Object.freeze({
  [E.HYDRATE]: onHydrate,
  [E.TAB_CHANGE]: onTabChange,
  [E.TEXT_CHANGE]: onTextChange,
  [E.GENERATE]: onGenerate,
  [E.NORMALIZED]: onNormalized,
  [E.CANCEL]: onCancel,
  [E.CANCEL_CONFIRMED]: onCancelConfirmed,
  [E.CANCEL_DISMISSED]: onCancelDismissed,
  [E.CANCEL_TIMEOUT]: onCancelTimeout,
  [E.REVIEW_REQUESTED]: onReviewRequested,
  [E.SESSION_CHECKED]: onSessionChecked,
  [E.REVIEW_RESULT]: onReviewResult,
  [E.REVIEW_FAILED]: onReviewFailed,
  [E.FILL_ANYWAY]: onFillAnyway,
  [E.CORRECT]: onCorrect,
  [E.RETRY]: onRetry,
  [E.BACK]: onBack,
  [E.RUN_REQUESTED]: onRunRequested,
  [E.CONNECTED]: onConnected,
  [E.CONNECTION_FAILED]: onConnectionFailed,
  [E.PROGRESS]: onProgress,
  [E.RUN_RESULT]: onRunResult,
  [E.RUN_LOST]: onRunLost,
  [E.RESUME_ACTIVE]: onResumeActive,
  [E.WAF_START]: onWafStart,
  [E.WAF_RESULT]: onWafResult,
  [E.WAF_FAILED]: onWafFailed,
  [E.RETRY_WAF]: onRetryWaf,
  [E.NEW_RUN]: onNewRun,
  [E.TIMEOUT]: onTimeout,
  [E.LOGIN_REQUESTED]: onLoginRequested,
  [E.LOGIN_OK]: onLoginOk,
  [E.LOGIN_CANCELLED]: onLoginCancelled,
});

export function transition(model, event) {
  if (!model || typeof model !== "object" || !event || typeof event !== "object") return model;
  const handler = Object.hasOwn(HANDLERS, event.type) ? HANDLERS[event.type] : null;
  return handler ? handler(model, event) : model;
}

// Estado al abrir el panel (P2; BR1.1): corrida vigente → RESUME_ACTIVE;
// latido vencido → RUN_LOST; si no, Idle. El último resultado solo se devuelve
// para la sección plegada "Última corrida" (AC6.3.1).
export function resolveInitialView({ activeRun, lastRunResult, now }) {
  if (activeRun && typeof activeRun.runId === "string" && activeRun.runId) {
    if (isHeartbeatStale(activeRun.updatedAt, now)) {
      return { event: E.RUN_LOST, runId: activeRun.runId, lastRunResult: lastRunResult ?? null };
    }
    return {
      event: E.RESUME_ACTIVE,
      runId: activeRun.runId,
      tabId: activeRun.tabId,
      lastProgress: activeRun.lastProgress ?? null,
      lastRunResult: lastRunResult ?? null,
    };
  }
  return { event: null, lastRunResult: lastRunResult ?? null };
}
