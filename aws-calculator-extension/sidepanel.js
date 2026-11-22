// sidepanel.js — Panel lateral: flujo W1 (BR6.1-BR6.6; NFR3.3, NFR3.4, NFR3.8, NFR5.3, NFR5.4).
// PROVISIONAL (U1, walking skeleton). Dueño final: U6.
// Zona B (smoke manual): la lógica pura vive en lib/** (panel-state, heartbeat,
// validation, json-parser, input-normalizer, messages-es).
// Seguridad: todo texto se inserta con textContent; el enlace solo si es
// https://calculator.aws/ (BR6.5).

import { normalize } from "./lib/input/input-normalizer.js";
import { INPUT_ERROR_CODES } from "./lib/input/input-errors.js";
import { INPUT_FORMATS } from "./lib/input/input-schema.js";
import { connectToCalculator } from "./lib/connection/handshake.js";
import { MESSAGE_TYPES, STORAGE_KEYS, makeRunRpa, makeStoredRunRecord } from "./lib/messages.js";
import { isCalculatorUrl, isMessageForRun, isRunResult } from "./lib/validation.js";
import { describeRunResult } from "./lib/messages-es.js";
import { buildErrorRunResult } from "./lib/rpa/result-aggregator.js";
import {
  PANEL_EVENTS,
  PANEL_STATES,
  canDeleteLogs,
  isRunButtonEnabled,
  resolveInitialView,
  transition,
} from "./lib/panel/panel-state.js";
import { HEARTBEAT_STALE_MS, isHeartbeatStale } from "./lib/panel/heartbeat.js";
import {
  chunkKeysForRow,
  durationMs,
  getRowState,
  rebuildIndex,
  removeRow,
  totalBytes,
} from "./lib/log/log-index.js";

const WATCH_INTERVAL_MS = 5000;
const storage = chrome.storage.local;

const EXAMPLE_JSON = {
  project: "Skeleton EC2",
  region: "us-east-1",
  services: [
    {
      name: "Amazon EC2",
      search_term: "Amazon EC2",
      fields: {
        "Operating system": "Linux",
        "Number of instances": "1",
        "Instance type": "t3.micro",
        "Pricing strategy": "On-Demand",
      },
    },
  ],
};

const ui = {
  input: document.getElementById("json-input"),
  example: document.getElementById("btn-example"),
  run: document.getElementById("btn-run"),
  progress: document.getElementById("progress"),
  progressFill: document.getElementById("progress-fill"),
  progressText: document.getElementById("progress-text"),
  status: document.getElementById("status"),
  logWarning: document.getElementById("log-warning"),
  result: document.getElementById("result"),
  resultCaption: document.getElementById("result-caption"),
  resultTitle: document.getElementById("result-title"),
  resultList: document.getElementById("result-list"),
  resultUrl: document.getElementById("result-url"),
  resultLink: document.getElementById("result-link"),
  copy: document.getElementById("btn-copy"),
  runsTotal: document.getElementById("runs-total"),
  runsList: document.getElementById("runs-list"),
  exportAll: document.getElementById("btn-export-all"),
  deleteAll: document.getElementById("btn-delete-all"),
  repair: document.getElementById("btn-repair"),
};

const panel = {
  state: PANEL_STATES.IDLE,
  runId: null,
  tabId: null,
  acceptedAt: 0,
  watchTimer: null,
  index: [],
  inputController: null,
};

// ─── Presentación ─────────────────────────────────────────────────────────────

function dispatch(event) {
  const next = transition(panel.state, event);
  panel.state = next.state;
  ui.run.disabled = !isRunButtonEnabled(panel.state);
  renderRuns();
  return next.changed;
}

function showStatus(text, kind = "info") {
  ui.status.textContent = text;
  ui.status.className = `box ${kind}`;
  ui.status.hidden = !text;
}

function showProgress(pct, text) {
  ui.progress.hidden = false;
  ui.progressFill.style.width = `${Math.min(100, Math.max(0, Number(pct) || 0))}%`;
  ui.progressText.textContent = text;
}

function clearResultView() {
  ui.result.hidden = true;
  ui.resultList.replaceChildren();
  ui.resultUrl.hidden = true;
  ui.resultLink.removeAttribute("href");
  ui.resultLink.textContent = "";
  ui.logWarning.hidden = true;
}

function renderResult(runResult, caption) {
  const view = describeRunResult(runResult);
  ui.result.hidden = false;
  ui.result.className = `box ${view.showUrl ? "success" : "error"}`;
  ui.resultCaption.textContent = caption;
  ui.resultTitle.textContent = view.title;
  ui.resultList.replaceChildren(
    ...view.lines.map((line) => {
      const item = document.createElement("li");
      item.textContent = line;
      return item;
    }),
  );
  // URL solo si DONE y validada (BR5.4, BR6.5).
  const showUrl = view.showUrl && isCalculatorUrl(runResult.estimateUrl);
  ui.resultUrl.hidden = !showUrl;
  if (showUrl) {
    ui.resultLink.href = runResult.estimateUrl;
    ui.resultLink.textContent = runResult.estimateUrl;
  }
}

// ─── Persistencia del resultado ───────────────────────────────────────────────

async function saveLastRunResult(runResult) {
  try {
    await storage.set({ [STORAGE_KEYS.LAST_RUN_RESULT]: makeStoredRunRecord(runResult) });
  } catch (error) {
    console.error("[aws-calc] panel error", "No pude guardar el último resultado", error);
  }
}

function stopWatch() {
  if (panel.watchTimer !== null) clearInterval(panel.watchTimer);
  panel.watchTimer = null;
}

function presentResult(runResult) {
  if (!isRunResult(runResult) || runResult.runId !== panel.runId) return;
  stopWatch();
  dispatch(runResult.status === "DONE" ? PANEL_EVENTS.RESULT_DONE : PANEL_EVENTS.RESULT_ERROR);
  showStatus("");
  renderResult(runResult, "Resultado de la corrida");
  panel.runId = null;
  panel.tabId = null;
  loadRuns();
}

async function finishLocally(runResult, event) {
  await saveLastRunResult(runResult);
  stopWatch();
  dispatch(event);
  showStatus("");
  renderResult(runResult, "Resultado de la corrida");
  panel.runId = null;
  panel.tabId = null;
  loadRuns();
}

// BR6.6: corrida que dejó de responder → ERROR lost guardado en lastRunResult.
async function closeAsLost(runId) {
  const result = buildErrorRunResult({ runId, failureStep: "lost", now: () => new Date() });
  try {
    const stored = await storage.get(STORAGE_KEYS.ACTIVE_RUN);
    if (stored[STORAGE_KEYS.ACTIVE_RUN]?.runId === runId)
      await storage.remove(STORAGE_KEYS.ACTIVE_RUN);
  } catch (error) {
    console.error("[aws-calc] panel error", "No pude limpiar la corrida activa", error);
  }
  panel.runId = runId;
  await finishLocally(result, PANEL_EVENTS.RUN_LOST);
}

// ─── Vigilancia de la corrida (latido y pestaña) ──────────────────────────────

async function checkHeartbeat() {
  if (panel.state !== PANEL_STATES.RUNNING || !panel.runId) return;
  const runId = panel.runId;
  const stored = await storage.get([STORAGE_KEYS.ACTIVE_RUN, STORAGE_KEYS.LAST_RUN_RESULT]);
  const last = stored[STORAGE_KEYS.LAST_RUN_RESULT]?.value;
  if (last?.runId === runId) {
    presentResult(last);
    return;
  }
  const active = stored[STORAGE_KEYS.ACTIVE_RUN];
  const updatedAt = active?.runId === runId ? active.updatedAt : panel.acceptedAt;
  if (isHeartbeatStale(updatedAt, Date.now(), HEARTBEAT_STALE_MS)) await closeAsLost(runId);
}

function startWatch() {
  stopWatch();
  panel.watchTimer = setInterval(() => {
    checkHeartbeat().catch((error) => console.error("[aws-calc] panel error", error));
  }, WATCH_INTERVAL_MS);
}

// ─── W1: iniciar una corrida ──────────────────────────────────────────────────

function newRunId() {
  return `run-${new Date().toISOString().replace(/[:.]/g, "-")}-${crypto.randomUUID().slice(0, 8)}`;
}

// Cada "Generar Estimado" normaliza desde cero con su propia señal (BR5.2).
// El puerto del cerebro es null hasta que U7 lo conecte: el camino JSON corre
// sin revisión Well-Architected y el de lenguaje natural respondería
// brain_unavailable (BR3.5, BR5.4).
function validateInput() {
  panel.inputController?.abort();
  panel.inputController = new AbortController();
  return normalize(
    { format: INPUT_FORMATS.JSON, text: ui.input.value },
    { interpretNaturalLanguage: null, signal: panel.inputController.signal },
  );
}

async function sendRunRequest(runRequest, tabId) {
  try {
    return await chrome.tabs.sendMessage(tabId, makeRunRpa(runRequest, tabId));
  } catch (error) {
    console.error("[aws-calc] panel error", "RUN_RPA sin respuesta", error);
    return null;
  }
}

async function startRun() {
  if (!dispatch(PANEL_EVENTS.SUBMIT)) return;
  const input = await validateInput();
  if (!input.ok) {
    dispatch(PANEL_EVENTS.INPUT_INVALID);
    // El texto del error lo fija input-errors.js; se pinta con textContent.
    // Una cancelación no se muestra como error (BR3.6).
    const isCancelled = input.error.code === INPUT_ERROR_CODES.CANCELLED;
    showStatus(isCancelled ? "" : input.error.message, "error");
    return;
  }
  const runRequest = { runId: newRunId(), services: input.value.services };
  if (input.value.project) runRequest.project = input.value.project;
  dispatch(PANEL_EVENTS.INPUT_VALID);
  panel.runId = runRequest.runId;
  clearResultView();
  showStatus("Conectando con calculator.aws…", "info");
  showProgress(1, "Buscando la pestaña de calculator.aws…");

  const connection = await connectToCalculator({ chromeApi: chrome });
  const now = () => new Date();
  if (connection.status !== "connected") {
    const failureDetail =
      connection.failure === "module_load_failed" ? "module_load_failed" : undefined;
    const result = buildErrorRunResult({
      runId: runRequest.runId,
      failureStep: "connection",
      failureDetail,
      now,
    });
    await finishLocally(result, PANEL_EVENTS.HANDSHAKE_FAILED);
    return;
  }
  panel.tabId = connection.tabId;
  const response = await sendRunRequest(runRequest, connection.tabId);
  if (!response?.accepted) {
    const failureDetail = response?.reason ?? "not_ready";
    const result = buildErrorRunResult({
      runId: runRequest.runId,
      failureStep: "connection",
      failureDetail,
      now,
    });
    await finishLocally(result, PANEL_EVENTS.RUN_REJECTED);
    return;
  }
  panel.acceptedAt = Date.now();
  dispatch(PANEL_EVENTS.RUN_ACCEPTED);
  showStatus("Corrida en curso en calculator.aws.", "info");
  startWatch();
}

// ─── Mensajes y cambios de almacenamiento ─────────────────────────────────────

chrome.runtime.onMessage.addListener((message) => {
  if (!isMessageForRun(message, panel.runId)) return false;
  if (message.type === MESSAGE_TYPES.PROGRESS) {
    showProgress(message.pct, message.text);
    if (message.logDegraded) {
      ui.logWarning.textContent = "No pude guardar parte del registro técnico.";
      ui.logWarning.hidden = false;
    }
  } else if (message.type === MESSAGE_TYPES.RUN_RESULT) {
    presentResult(message.runResult);
  }
  return false;
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  const last = changes[STORAGE_KEYS.LAST_RUN_RESULT]?.newValue?.value;
  if (last && panel.state === PANEL_STATES.RUNNING && last.runId === panel.runId)
    presentResult(last);
  const active = changes[STORAGE_KEYS.ACTIVE_RUN]?.newValue;
  if (active?.runId === panel.runId && active.lastProgress) {
    showProgress(active.lastProgress.pct, active.lastProgress.text);
  }
  if (changes[STORAGE_KEYS.RUN_LOG_INDEX]) loadRuns();
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (panel.state === PANEL_STATES.RUNNING && tabId === panel.tabId && panel.runId) {
    closeAsLost(panel.runId).catch((error) => console.error("[aws-calc] panel error", error));
  }
});

// ─── Registro técnico: lista, exportar, borrar, reparar ───────────────────────

function formatBytes(bytes) {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

function describeRow(row) {
  const state = getRowState(row);
  const verdict = state === "interrupted" ? "interrumpida" : state;
  const date = row.startedAt ? new Date(row.startedAt).toLocaleString("es") : "sin fecha";
  const ms = durationMs(row);
  const duration = ms === null ? "" : ` · ${Math.round(ms / 1000)} s`;
  const degraded = row.degraded ? " · registro incompleto" : "";
  return `${date} · ${verdict}${duration} · ${formatBytes(Number(row.bytes) || 0)}${degraded}`;
}

function makeButton(text, testId, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = text;
  button.dataset.testid = testId;
  button.addEventListener("click", onClick);
  return button;
}

function renderRuns() {
  const deletable = canDeleteLogs(panel.state);
  ui.runsTotal.textContent = `${panel.index.length} corrida(s) · ${formatBytes(totalBytes(panel.index))}`;
  ui.runsList.replaceChildren(
    ...[...panel.index].reverse().map((row) => {
      const item = document.createElement("li");
      item.className = "run-row";
      item.dataset.testid = "sidepanel-runs-row";
      const text = document.createElement("span");
      text.textContent = describeRow(row);
      const actions = document.createElement("span");
      actions.className = "run-actions";
      const remove = makeButton("Borrar", "sidepanel-run-delete-button", () =>
        runSafely(() => deleteRun(row)),
      );
      remove.disabled = !deletable;
      actions.append(
        makeButton("Exportar", "sidepanel-run-export-button", () =>
          runSafely(() => exportRuns([row])),
        ),
        remove,
      );
      item.append(text, actions);
      return item;
    }),
  );
  ui.deleteAll.disabled = !deletable;
  ui.repair.disabled = !deletable;
}

async function loadRuns() {
  const stored = await storage.get(STORAGE_KEYS.RUN_LOG_INDEX);
  panel.index = Array.isArray(stored[STORAGE_KEYS.RUN_LOG_INDEX])
    ? stored[STORAGE_KEYS.RUN_LOG_INDEX]
    : [];
  renderRuns();
}

function downloadJson(fileName, data) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function readEntries(row) {
  const keys = chunkKeysForRow(row);
  const stored = await storage.get(keys);
  return keys.flatMap((key) => (Array.isArray(stored[key]) ? stored[key] : []));
}

async function exportRuns(rows) {
  const runs = [];
  for (const row of rows)
    runs.push({ runId: row.runId, index: row, entries: await readEntries(row) });
  const fileName =
    rows.length === 1 ? `aws-calc-${rows[0].runId}.json` : "aws-calc-registro-completo.json";
  downloadJson(fileName, rows.length === 1 ? runs[0] : runs);
}

async function deleteRun(row) {
  if (!canDeleteLogs(panel.state)) return;
  await storage.remove(chunkKeysForRow(row));
  const stored = await storage.get(STORAGE_KEYS.RUN_LOG_INDEX);
  await storage.set({
    [STORAGE_KEYS.RUN_LOG_INDEX]: removeRow(stored[STORAGE_KEYS.RUN_LOG_INDEX], row.runId),
  });
  await loadRuns();
}

async function deleteAll() {
  if (!canDeleteLogs(panel.state)) return;
  const keys = panel.index.flatMap(chunkKeysForRow);
  await storage.remove([...keys, STORAGE_KEYS.RUN_LOG_INDEX, STORAGE_KEYS.LAST_RUN_RESULT]);
  clearResultView();
  await loadRuns();
}

async function repairIndex() {
  if (!canDeleteLogs(panel.state)) return;
  const all = await storage.get(null);
  await storage.set({ [STORAGE_KEYS.RUN_LOG_INDEX]: rebuildIndex(all) });
  await loadRuns();
}

function runSafely(action) {
  action().catch((error) => {
    console.error("[aws-calc] panel error", error);
    showStatus("No pude completar la operación sobre el registro.", "error");
  });
}

// ─── Arranque ─────────────────────────────────────────────────────────────────

async function init() {
  const stored = await storage.get([STORAGE_KEYS.ACTIVE_RUN, STORAGE_KEYS.LAST_RUN_RESULT]);
  await loadRuns();
  const view = resolveInitialView({
    activeRun: stored[STORAGE_KEYS.ACTIVE_RUN],
    lastRunResult: stored[STORAGE_KEYS.LAST_RUN_RESULT]?.value,
    now: Date.now(),
  });
  if (view.event === PANEL_EVENTS.RESUME_ACTIVE) {
    panel.runId = view.runId;
    panel.tabId = view.tabId;
    panel.acceptedAt = Date.now();
    dispatch(PANEL_EVENTS.RESUME_ACTIVE);
    showStatus("Corrida en curso en calculator.aws.", "info");
    if (view.lastProgress) showProgress(view.lastProgress.pct, view.lastProgress.text);
    startWatch();
    return;
  }
  if (view.event === PANEL_EVENTS.RUN_LOST) {
    await closeAsLost(view.runId);
    return;
  }
  if (isRunResult(view.lastRunResult)) renderResult(view.lastRunResult, "Última corrida");
}

ui.example.addEventListener("click", () => {
  ui.input.value = JSON.stringify(EXAMPLE_JSON, null, 2);
});

ui.run.addEventListener("click", () => {
  startRun().catch(async (error) => {
    console.error("[aws-calc] panel error", error);
    // El panel nunca queda bloqueado en un estado intermedio (BR6.6).
    if (panel.state === PANEL_STATES.VALIDATING) {
      dispatch(PANEL_EVENTS.INPUT_INVALID);
      showStatus("No pude validar la entrada; revisa el JSON.", "error");
      return;
    }
    if (panel.runId && panel.state === PANEL_STATES.CONNECTING) {
      const result = buildErrorRunResult({
        runId: panel.runId,
        failureStep: "connection",
        now: () => new Date(),
      });
      await finishLocally(result, PANEL_EVENTS.HANDSHAKE_FAILED);
    }
  });
});

ui.copy.addEventListener("click", () => {
  const url = ui.resultLink.href;
  if (!isCalculatorUrl(url)) return;
  navigator.clipboard.writeText(url).then(
    () => showStatus("URL copiada.", "success"),
    () => showStatus("No pude copiar la URL; cópiala desde el enlace.", "warning"),
  );
});

ui.exportAll.addEventListener("click", () => runSafely(() => exportRuns(panel.index)));
ui.deleteAll.addEventListener("click", () => runSafely(deleteAll));
ui.repair.addEventListener("click", () => runSafely(repairIndex));

init().catch((error) => {
  console.error("[aws-calc] panel error", error);
  showStatus("No pude leer el estado guardado de la extensión.", "error");
});
