// lib/content-main.js — Corrida en la pestaña de calculator.aws (W3; BR6.1, BR6.2, BR6.3, BR6.6, NFR8.12).
// PROVISIONAL (U1, walking skeleton). Dueño final: U5.
// content.js lo carga con import() y le pasa cada RUN_RPA ya con el módulo listo.
// - Guardián busy: una sola corrida a la vez por pestaña (BR6.1).
// - activeRun + latido con cada PROGRESS (BR6.6), por la cola única del registro.
// - Marca de corrida cerrada (closedRunIds): ninguna escritura ni PROGRESS tardío.
// - RUN_RESULT se envía después de guardar lastRunResult y borrar activeRun (BR6.3).

import {
  MESSAGE_TYPES,
  REJECT_REASONS,
  makePingResponse,
  makeProgressEvent,
  makeProgressMessage,
  makeRunResultMessage,
  makeRunRpaResponse,
} from "./messages.js";
import { validateIncomingMessage } from "./validation.js";
import { createRunLogger } from "./log/run-logger.js";
import { formatConsolePrefix } from "./log/log-format.js";
import { runEstimate, stepToFailure } from "./rpa/orchestrator.js";
import { buildErrorRunResult } from "./rpa/result-aggregator.js";
import { createDomResolver } from "./dom/dom-resolver.js";

export const DEGRADED_LOG_TEXT = "No pude guardar parte del registro técnico; la corrida sigue.";

export function createContentMain({
  chromeApi,
  storage,
  createDom,
  runEstimateFn = runEstimate,
  createLogger = createRunLogger,
  now = () => new Date(),
  consoleApi = console,
  debugToConsole = false,
}) {
  let activeRunId = null;
  let currentRun = Promise.resolve(null);
  const closedRunIds = new Set();

  // El panel puede estar cerrado: un envío fallido es esperado y solo se anota.
  function send(message) {
    try {
      Promise.resolve(chromeApi.runtime.sendMessage(message)).catch((error) =>
        consoleApi.debug(
          formatConsolePrefix(message.runId, "debug"),
          "Panel no disponible:",
          error?.message,
        ),
      );
    } catch (error) {
      consoleApi.debug(
        formatConsolePrefix(message.runId, "debug"),
        "Panel no disponible:",
        error?.message,
      );
    }
  }

  async function executeRun(runRequest, tabId) {
    const { runId } = runRequest;
    const context = { step: "preconditions" };
    let lastPct = 0;
    let emitProgress = () => {};
    const logger = createLogger({
      storage,
      runId,
      tabId,
      now,
      consoleApi,
      debugToConsole,
      onDegraded: () => emitProgress(lastPct, DEGRADED_LOG_TEXT, { logDegraded: true }),
    });
    emitProgress = (pct, text, extra) => {
      if (closedRunIds.has(runId)) return;
      const event = makeProgressEvent(runId, pct, text, extra);
      lastPct = event.pct;
      logger.updateActiveRun(event);
      logger.log({ level: "debug", step: context.step, event: "progress", message: text });
      send(makeProgressMessage(event));
    };

    logger.start(runRequest);
    emitProgress(2, "Corrida aceptada en calculator.aws…");
    let result;
    try {
      result = await runEstimateFn(runRequest, {
        dom: createDom(),
        log: logger.log,
        progress: emitProgress,
        now,
        context,
      });
    } catch (error) {
      logger.log({
        level: "error",
        step: context.step,
        event: "unexpected_error",
        message: String(error?.message ?? error),
      });
      result = buildErrorRunResult({ runId, failureStep: stepToFailure(context.step), now });
    }
    closedRunIds.add(runId);
    const closing = await logger.close(result);
    if (!closing.flushed) {
      consoleApi.error(
        formatConsolePrefix(runId, "error"),
        "El registro no terminó de guardarse en 5 s.",
      );
    }
    activeRunId = null;
    send(makeRunResultMessage(result));
    return result;
  }

  // Devuelve la respuesta para sendResponse, o null si el mensaje se ignora.
  function handleMessage(message, sender) {
    const check = validateIncomingMessage(message, sender, chromeApi.runtime.id);
    if (!check.ok) {
      consoleApi.warn(formatConsolePrefix("-", "warn"), "Mensaje ignorado:", check.reason);
      return null;
    }
    if (check.type === MESSAGE_TYPES.PING) return makePingResponse("ready");
    if (check.type !== MESSAGE_TYPES.RUN_RPA) return null;
    if (activeRunId) return makeRunRpaResponse(false, REJECT_REASONS.BUSY);
    activeRunId = message.runRequest.runId;
    currentRun = executeRun(message.runRequest, message.tabId);
    return makeRunRpaResponse(true);
  }

  return {
    handleMessage,
    getActiveRunId: () => activeRunId,
    isRunClosed: (runId) => closedRunIds.has(runId),
    whenIdle: () => currentRun,
  };
}

function readDebugFlag() {
  try {
    return globalThis.localStorage?.getItem("aws-calc-debug") === "1";
  } catch {
    return false;
  }
}

// Punto de entrada real: content.js lo llama tras el import().
export function init() {
  return createContentMain({
    chromeApi: chrome,
    storage: chrome.storage.local,
    createDom: () => createDomResolver(),
    debugToConsole: readDebugFlag(),
  });
}
