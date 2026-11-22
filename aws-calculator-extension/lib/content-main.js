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
  isCancelRpaMessage,
  makeCancelRpaResponse,
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
  let activeController = null;
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
    // La señal de cancelación viaja en el contexto de la corrida (decisión 7).
    const controller = new AbortController();
    activeController = controller;
    const context = { step: "preconditions", signal: controller.signal };
    let lastPct = 0;
    let lastText = "";
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
    // Acepta el ProgressEvent estructurado del orquestador (decisión 2) o la
    // forma de U1 (pct, text, extra). Sin texto nuevo se conserva el último.
    emitProgress = (pctOrEvent, text, extra) => {
      if (closedRunIds.has(runId)) return;
      const structured = pctOrEvent !== null && typeof pctOrEvent === "object";
      const fields = structured ? pctOrEvent : (extra ?? {});
      const pct = structured ? (pctOrEvent.pct ?? lastPct) : pctOrEvent;
      const message = (structured ? pctOrEvent.text : text) ?? lastText;
      const event = makeProgressEvent(runId, pct, message, fields);
      lastPct = event.pct;
      lastText = event.text;
      logger.updateActiveRun(event);
      logger.log({ level: "debug", step: context.step, event: "progress", message: event.text });
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
    activeController = null;
    send(makeRunResultMessage(result));
    return result;
  }

  // CANCEL_RPA (decisión 7): aborta la señal de la corrida en curso; el
  // orquestador sale sin guardar, limpia el overlay y termina en ERROR con los
  // servicios restantes not_attempted. Otro runId no cancela nada.
  function cancelRun(message) {
    if (!isCancelRpaMessage(message) || message.runId !== activeRunId || !activeController) {
      return makeCancelRpaResponse(false);
    }
    activeController.abort("cancelled");
    return makeCancelRpaResponse(true);
  }

  // Devuelve la respuesta para sendResponse, o null si el mensaje se ignora.
  function handleMessage(message, sender) {
    const check = validateIncomingMessage(message, sender, chromeApi.runtime.id);
    if (!check.ok) {
      consoleApi.warn(formatConsolePrefix("-", "warn"), "Mensaje ignorado:", check.reason);
      return null;
    }
    if (check.type === MESSAGE_TYPES.PING) return makePingResponse("ready");
    if (check.type === MESSAGE_TYPES.CANCEL_RPA) return cancelRun(message);
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
