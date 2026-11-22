// lib/panel/effects.js — Dueño de los efectos del panel (NFR5.5, NFR8.4; decisión 2 del plan).
// Dueño: U6. Zona B (pruebas con dobles, sin piso de cobertura). Reacciona a
// cada transición del reductor: crea las llamadas con su AbortController (el
// brain-port de U7 traduce el abort en BRAIN_CANCEL con el mismo callId), arma
// los topes de 30 s, 35 s, 20 s y 2 s, hace el handshake de U1, envía RUN_RPA y
// CANCEL_RPA, vigila el latido y traduce todo a eventos del reductor. Una
// respuesta que llega tarde lleva un requestId viejo y el reductor la ignora;
// una llamada cancelada no despacha nada (descarte, no error).

import { normalize as defaultNormalize } from "../input/input-normalizer.js";
import { INPUT_FORMATS } from "../input/input-schema.js";
import { MESSAGE_TYPES, makeCancelRpa, makeRunRpa } from "../messages.js";
import { buildErrorRunResult } from "../rpa/result-aggregator.js";
import { isHeartbeatStale } from "./heartbeat.js";
import {
  INPUT_TABS,
  PANEL_EVENTS as E,
  PANEL_STATES as S,
  resolveInitialView,
} from "./panel-state.js";
import { TIMEOUTS, createTimers, systemClock, withTimeout } from "./timers.js";
import { WAF_PHASES, buildWafRequest } from "./waf-model.js";

const LOG_PREFIX = "[aws-calc] panel";

function defaultRunId(clock) {
  const stamp = new Date(clock.now()).toISOString().replace(/[:.]/g, "-");
  return `run-${stamp}-${crypto.randomUUID().slice(0, 8)}`;
}

// RunRequest para RUN_RPA desde la configuración normalizada (contrato de U1).
export function buildRunRequest(runId, normalizedRun) {
  const request = { runId, services: normalizedRun.services };
  if (typeof normalizedRun.project === "string") request.project = normalizedRun.project;
  return request;
}

function brainErrorEvent(type, requestId, error) {
  const event = { type, requestId, code: error?.code ?? "brain_unavailable" };
  if (Number.isInteger(error?.retryAfterSeconds)) event.retryAfterSeconds = error.retryAfterSeconds;
  return event;
}

export function createPanelEffects({
  dispatch,
  getModel,
  brainPort = null,
  tabsApi,
  connect,
  historyStore,
  normalizeFn = defaultNormalize,
  clock = systemClock,
  newRunId = () => defaultRunId(clock),
  logger = console,
}) {
  const timers = createTimers(clock);
  const controllers = new Map();
  let runningSince = 0;

  // Despacho diferido: nunca reentra en el reductor desde una reacción.
  function emit(event) {
    queueMicrotask(() => dispatch(event));
  }

  function warn(...args) {
    logger.warn(LOG_PREFIX, ...args);
  }

  function requestTimer(requestId) {
    return `request:${requestId}`;
  }

  function abandon(requestId) {
    const controller = controllers.get(requestId);
    controllers.delete(requestId);
    timers.stop(requestTimer(requestId));
    if (controller && !controller.signal.aborted) controller.abort("cancelled");
  }

  // Arranca una llamada con su señal y, si corresponde, su tope.
  function openRequest(requestId, timeoutMs) {
    const controller = new AbortController();
    controllers.set(requestId, controller);
    if (timeoutMs) {
      timers.start(requestTimer(requestId), timeoutMs, () => emit({ type: E.TIMEOUT, requestId }));
    }
    return controller.signal;
  }

  function startNormalize(model) {
    const { requestId } = model;
    const isJson = model.activeTab === INPUT_TABS.JSON;
    const signal = openRequest(requestId, isJson ? null : TIMEOUTS.INTERPRET_MS);
    const input = {
      format: isJson ? INPUT_FORMATS.JSON : INPUT_FORMATS.NATURAL_LANGUAGE,
      text: model.texts[model.activeTab],
    };
    const interpretNaturalLanguage = brainPort
      ? (request, options) => brainPort.interpret(request, options)
      : null;
    Promise.resolve()
      .then(() => normalizeFn(input, { interpretNaturalLanguage, signal }))
      .catch((error) => {
        warn("normalize falló:", error?.message);
        return { ok: false, error: { code: "unexpected_error" } };
      })
      .then((result) => {
        if (!signal.aborted) emit({ type: E.NORMALIZED, requestId, result });
      });
  }

  function startWafCall(model, phase) {
    const { requestId } = model;
    const signal = openRequest(requestId, TIMEOUTS.BRAIN_CALL_MS);
    const isReview = phase === WAF_PHASES.PRE_FILL;
    const okType = isReview ? E.REVIEW_RESULT : E.WAF_RESULT;
    const failType = isReview ? E.REVIEW_FAILED : E.WAF_FAILED;
    if (!brainPort) {
      emit(brainErrorEvent(failType, requestId, { code: "brain_unavailable" }));
      return;
    }
    const request = buildWafRequest(model.normalizedRun, model.runResult, phase);
    Promise.resolve()
      .then(() => brainPort.wafEvaluate(request, { signal }))
      .then(
        (response) => {
          if (!signal.aborted) emit({ type: okType, requestId, response });
        },
        (error) => {
          if (!signal.aborted) emit(brainErrorEvent(failType, requestId, error));
        },
      );
  }

  function startCall(model) {
    if (model.state === S.VALIDATING || model.state === S.INTERPRETING) startNormalize(model);
    else if (model.state === S.REVIEWING) startWafCall(model, WAF_PHASES.PRE_FILL);
    else if (model.state === S.WAF_LOADING) startWafCall(model, WAF_PHASES.POST_FILL);
  }

  // BRAIN_SESSION con tope de 2 s; sin respuesta o con error cuenta como no autenticado.
  function checkSession() {
    const asked = brainPort ? Promise.resolve().then(() => brainPort.session()) : null;
    withTimeout(asked, TIMEOUTS.SESSION_MS, { clock, fallback: null })
      .catch(() => null)
      .then((session) => emit({ type: E.SESSION_CHECKED, session, now: clock.now() }));
  }

  function login() {
    const asked = brainPort ? Promise.resolve().then(() => brainPort.login()) : null;
    Promise.resolve(asked)
      .catch(() => null)
      .then((reply) => {
        if (reply?.ok === true) emit({ type: E.LOGIN_OK });
        else emit({ type: E.LOGIN_CANCELLED, code: reply?.error?.code ?? "brain_unavailable" });
      });
  }

  async function connectAndRun(model, runId) {
    if (!model.normalizedRun) return { failure: "no_response" };
    const connection = await connect();
    if (connection?.status !== "connected") return { failure: connection?.failure };
    const runRequest = buildRunRequest(runId, model.normalizedRun);
    let response = null;
    try {
      response = await tabsApi.sendMessage(
        connection.tabId,
        makeRunRpa(runRequest, connection.tabId),
      );
    } catch (error) {
      warn("RUN_RPA sin respuesta:", error?.message);
    }
    if (response?.accepted === true) return { tabId: connection.tabId };
    return { failure: response?.reason ?? "not_ready" };
  }

  // Handshake de U1 (un PING más 3 reintentos) y RUN_RPA con un runId nuevo.
  function startConnection(model) {
    const runId = newRunId();
    emit({ type: E.RUN_REQUESTED, runId });
    connectAndRun(model, runId)
      .catch((error) => {
        warn("La conexión falló:", error?.message);
        return { failure: "no_response" };
      })
      .then((outcome) => {
        if (outcome.failure !== undefined) {
          emit({ type: E.CONNECTION_FAILED, runId, failure: outcome.failure });
        } else {
          emit({ type: E.CONNECTED, runId, tabId: outcome.tabId });
        }
      });
  }

  async function closeAsLost(runId) {
    const runResult = buildErrorRunResult({
      runId,
      failureStep: "lost",
      now: () => new Date(clock.now()),
    });
    const closed = await historyStore.closeLostRun(runResult);
    if (!closed.ok) warn("No pude guardar la corrida perdida.");
    dispatch({ type: E.RUN_LOST, runId, runResult });
  }

  // Latido (BR1.1): resultado guardado de esta corrida → RUN_RESULT; latido
  // vencido → lost. Cubre el caso de un RUN_RESULT que el panel no recibió.
  async function checkHeartbeat() {
    const model = getModel();
    if (model.state !== S.RUNNING || !model.runId) return;
    const read = await historyStore.readActiveRun();
    if (!read.ok) return;
    if (read.lastRunResult?.runId === model.runId) {
      dispatch({ type: E.RUN_RESULT, runResult: read.lastRunResult });
      return;
    }
    const active = read.activeRun?.runId === model.runId ? read.activeRun : null;
    const updatedAt = active ? active.updatedAt : runningSince;
    if (isHeartbeatStale(updatedAt, clock.now())) await closeAsLost(model.runId);
  }

  function startWatch() {
    runningSince = clock.now();
    timers.every("watch", TIMEOUTS.WATCH_INTERVAL_MS, () => {
      checkHeartbeat().catch((error) => warn("Vigilancia del latido:", error?.message));
    });
  }

  function cancelRun(model) {
    const { runId, tabId } = model;
    timers.start("cancel-run", TIMEOUTS.CANCEL_RUN_MS, () =>
      emit({ type: E.CANCEL_TIMEOUT, runId }),
    );
    if (!Number.isInteger(tabId)) return;
    Promise.resolve()
      .then(() => tabsApi.sendMessage(tabId, makeCancelRpa(runId)))
      .catch((error) => warn("CANCEL_RPA sin respuesta:", error?.message));
  }

  function onTransition(prev, next) {
    if (prev === next) return;
    if (prev.requestId && prev.requestId !== next.requestId) abandon(prev.requestId);
    if (next.requestId && next.requestId !== prev.requestId) startCall(next);
    if (next.checkingSession && !prev.checkingSession) checkSession();
    if (next.loginPending && !prev.loginPending) login();
    if (next.state === S.CONNECTING && prev.state !== S.CONNECTING) startConnection(next);
    if (next.state === S.RUNNING && prev.state !== S.RUNNING) startWatch();
    if (prev.state === S.RUNNING && next.state !== S.RUNNING) {
      timers.stop("watch");
      timers.stop("cancel-run");
    }
    if (next.cancelPending && !prev.cancelPending) cancelRun(next);
    // BR4.1: evaluación final automática al terminar bien, si hay cerebro.
    if (next.state === S.DONE && prev.state === S.RUNNING && !next.noReview) {
      emit({ type: E.WAF_START });
    }
  }

  // PROGRESS y RUN_RESULT de la propia extensión; el reductor filtra por runId.
  function handleRuntimeMessage(message, sender, extensionId) {
    if (!sender || sender.id !== extensionId) return false;
    if (message === null || typeof message !== "object") return false;
    if (message.type === MESSAGE_TYPES.PROGRESS) {
      emit({ type: E.PROGRESS, event: { ...message, receivedAt: clock.now() } });
      return true;
    }
    if (message.type === MESSAGE_TYPES.RUN_RESULT) {
      emit({ type: E.RUN_RESULT, runResult: message.runResult });
      return true;
    }
    return false;
  }

  function handleTabRemoved(tabId) {
    const model = getModel();
    if (model.state === S.RUNNING && model.runId && tabId === model.tabId) {
      closeAsLost(model.runId).catch((error) => warn("Cierre de la corrida:", error?.message));
    }
  }

  // Decisión 4: lectura de la corrida activa al abrir, con tope de 300 ms. Si
  // llega después, igual reanuda (el reductor solo lo acepta desde Idle).
  function resume() {
    const reading = Promise.resolve()
      .then(() => historyStore.readActiveRun())
      .then(async (read) => {
        if (!read?.ok) return read;
        const view = resolveInitialView({ ...read, now: clock.now() });
        if (view.event === E.RESUME_ACTIVE) {
          const lastProgress = view.lastProgress
            ? { ...view.lastProgress, receivedAt: clock.now() }
            : null;
          dispatch({ type: E.RESUME_ACTIVE, runId: view.runId, tabId: view.tabId, lastProgress });
        } else if (view.event === E.RUN_LOST) {
          await closeAsLost(view.runId);
        }
        return read;
      });
    return withTimeout(reading, TIMEOUTS.RESUME_MS, { clock, fallback: null }).catch((error) => {
      warn("No pude leer la corrida activa:", error?.message);
      return null;
    });
  }

  function dispose() {
    timers.stopAll();
    for (const requestId of [...controllers.keys()]) abandon(requestId);
  }

  return { onTransition, handleRuntimeMessage, handleTabRemoved, resume, dispose };
}
