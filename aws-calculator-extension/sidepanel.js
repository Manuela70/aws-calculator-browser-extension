// sidepanel.js — Panel lateral (U6; US5.1, US6.1-US6.3; BR1.1-BR5.3; NFR5.1, NFR8.5, NFR8.6).
// Zona B (smoke manual en SMOKE.md). Cablea el reductor puro (lib/panel/panel-state.js),
// los efectos (lib/panel/effects.js), el texto de las pestañas (tab-store), el
// historial (history-view sobre lib/history-store.js) y las vistas de render.
// No hace fetch, no toca chrome.storage.local ni el token: el cerebro se usa
// solo por mensajes (brain-port de U7). Todo texto variable va por textContent.

import { createBrainPort, fromChromeRuntime } from "./lib/connection/brain-port.js";
import { connectToCalculator } from "./lib/connection/handshake.js";
import { createHistoryStore } from "./lib/history-store.js";
import { messageFor } from "./lib/messages-es.js";
import { createPanelEffects } from "./lib/panel/effects.js";
import { createHistoryView } from "./lib/panel/history-view.js";
import {
  INPUT_TABS,
  PANEL_EVENTS as E,
  PANEL_STATES as S,
  canDeleteLogs,
  createInitialState,
  transition,
} from "./lib/panel/panel-state.js";
import { renderActions, renderInput, renderStatus } from "./lib/panel/render/input-view.js";
import { renderCancelConfirm, renderPreview, renderProgress } from "./lib/panel/render/run-view.js";
import {
  renderError,
  renderFindings,
  renderResult,
  renderWaf,
} from "./lib/panel/render/result-view.js";
import { createTabStore } from "./lib/panel/tab-store.js";
import { TIMEOUTS, createTimers } from "./lib/panel/timers.js";
import { isValidEstimateUrl } from "./lib/panel/url-check.js";

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

const byId = (id) => document.getElementById(id);

const ui = {
  tabJson: byId("tab-json"),
  tabNl: byId("tab-nl"),
  inputPanel: byId("input-panel"),
  inputLabel: byId("input-label"),
  input: byId("input-area"),
  privacyNotice: byId("nl-privacy-notice"),
  exampleButton: byId("example-button"),
  generateButton: byId("generate-button"),
  cancelButton: byId("cancel-button"),
  noReviewNotice: byId("no-review-notice"),
  statusRegion: byId("status-region"),
  notice: byId("notice"),
  cancelConfirm: byId("cancel-confirm"),
  cancelConfirmText: byId("cancel-confirm-text"),
  cancelConfirmButton: byId("cancel-confirm-button"),
  cancelDismissButton: byId("cancel-dismiss-button"),
  errorView: byId("error-view"),
  errorMessage: byId("error-message"),
  errorFragments: byId("error-fragments"),
  preview: byId("preview"),
  previewMeta: byId("preview-meta"),
  previewList: byId("preview-list"),
  reviewNotice: byId("review-notice"),
  findings: byId("review-findings"),
  findingsList: byId("review-findings-list"),
  progress: byId("progress"),
  progressList: byId("progress-list"),
  logWarning: byId("log-warning"),
  result: byId("result"),
  resultTitle: byId("result-title"),
  resultMessage: byId("result-message"),
  resultUrlBox: byId("result-url"),
  copyButton: byId("copy-url-button"),
  copyStatus: byId("copy-status"),
  resultMissing: byId("result-missing"),
  resultServices: byId("result-services"),
  waf: byId("waf"),
  wafList: byId("waf-list"),
  actions: byId("actions"),
  previewContinueButton: byId("preview-continue-button"),
  loginButton: byId("login-button"),
  fillAnywayButton: byId("fill-anyway-button"),
  correctButton: byId("correct-button"),
  reviewRetryButton: byId("review-retry-button"),
  connectionRetryButton: byId("connection-retry-button"),
  retryButton: byId("retry-button"),
  retryWafButton: byId("retry-waf-button"),
  backButton: byId("back-button"),
  newRunButton: byId("new-run-button"),
  lastRunDetails: byId("last-run"),
  lastRunBody: byId("last-run-body"),
  historyDetails: byId("history"),
  historySummary: byId("history-summary"),
  historyList: byId("history-list"),
  historyExport: byId("history-export-button"),
  historyDeleteAll: byId("history-delete-all-button"),
  historyRepair: byId("history-repair-button"),
};
ui.actionButtons = [...ui.actions.querySelectorAll("button")];

let model = createInitialState();
let renderedModel = null;
let frame = null;
let ignoredEvents = 0;
const viewTimers = createTimers();
const tabStore = createTabStore();
const historyStore = createHistoryStore();
const brainPort = createBrainPort({ sendMessage: fromChromeRuntime(chrome.runtime) });

const historyView = createHistoryView({
  ui,
  historyStore,
  isLocked: () => !canDeleteLogs(model),
  onStatus: (text) => showMessage(text),
});

const effects = createPanelEffects({
  dispatch,
  getModel: () => model,
  brainPort,
  tabsApi: chrome.tabs,
  connect: () => connectToCalculator({ chromeApi: chrome }),
  historyStore,
});

// ─── Despacho y persistencia ──────────────────────────────────────────────────

function persist(prev, next) {
  for (const tab of Object.values(INPUT_TABS)) {
    if (prev.texts[tab] !== next.texts[tab]) tabStore.saveText(tab, next.texts[tab]);
  }
  if (prev.activeTab !== next.activeTab) tabStore.saveActiveTab(next.activeTab);
}

function dispatch(event) {
  const prev = model;
  model = transition(model, event);
  if (model === prev) {
    ignoredEvents += 1;
    return;
  }
  effects.onTransition(prev, model);
  persist(prev, model);
  if (canDeleteLogs(prev) !== canDeleteLogs(model)) historyView.setLocked(!canDeleteLogs(model));
  if (prev.state === S.RUNNING && model.state !== S.RUNNING) historyView.refresh();
  scheduleRender();
}

// ─── Render agrupado por requestAnimationFrame (NFR8.6) ───────────────────────

function focusOnEntry(previous) {
  const enteredError = renderError(ui, model);
  if (renderCancelConfirm(ui, model)) ui.cancelConfirmButton.focus();
  else if (enteredError) ui.errorMessage.focus();
  else if (model.state === S.FAILED && previous?.state !== S.FAILED) ui.resultMessage.focus();
}

function render() {
  frame = null;
  const previous = renderedModel;
  renderedModel = model;
  const now = Date.now();
  renderInput(ui, model);
  renderStatus(ui, model);
  renderPreview(ui, model);
  renderFindings(ui, model);
  renderProgress(ui, model, now);
  renderResult(ui, model);
  renderWaf(ui, model);
  renderActions(ui, model);
  focusOnEntry(previous);
  syncTick();
}

function scheduleRender() {
  if (frame === null) frame = requestAnimationFrame(render);
}

// Repinta cada segundo mientras se consulta el cerebro (tiempo transcurrido).
function syncTick() {
  const asking = model.state === S.RUNNING && model.progress?.step === "asking_brain";
  if (asking && !viewTimers.has("tick")) viewTimers.every("tick", TIMEOUTS.TICK_MS, scheduleRender);
  if (!asking) viewTimers.stop("tick");
}

// ─── Interacción ──────────────────────────────────────────────────────────────

// Aviso puntual de la vista (historial, almacenamiento); el próximo render lo
// reemplaza por el aviso del modelo.
function showMessage(text) {
  ui.notice.textContent = text;
  ui.notice.hidden = false;
}

function copyUrl() {
  const url = model.runResult?.estimateUrl;
  if (!isValidEstimateUrl(url)) return;
  navigator.clipboard.writeText(url).then(
    () => (ui.copyStatus.textContent = messageFor("panel:copied")),
    () => (ui.copyStatus.textContent = messageFor("panel:copy_failed")),
  );
}

function selectTab(tab) {
  dispatch({ type: E.TAB_CHANGE, tab });
  (tab === INPUT_TABS.JSON ? ui.tabJson : ui.tabNl).focus();
}

// Pestañas con flechas, Inicio y Fin (WAI-ARIA tabs).
function onTabKeydown(event) {
  const keys = { ArrowLeft: "prev", ArrowRight: "next", Home: "first", End: "last" };
  const move = keys[event.key];
  if (!move) return;
  event.preventDefault();
  const isJson = model.activeTab === INPUT_TABS.JSON;
  if (move === "first") selectTab(INPUT_TABS.JSON);
  else if (move === "last") selectTab(INPUT_TABS.NATURAL_LANGUAGE);
  else selectTab(isJson ? INPUT_TABS.NATURAL_LANGUAGE : INPUT_TABS.JSON);
}

// Escape cancela en Interpreting y Reviewing (y WafLoading) y cierra el diálogo de cancelar.
function onKeydown(event) {
  if (event.key !== "Escape") return;
  if (model.confirmingCancel) dispatch({ type: E.CANCEL_DISMISSED });
  else if ([S.INTERPRETING, S.REVIEWING, S.WAF_LOADING].includes(model.state)) {
    dispatch({ type: E.CANCEL });
  }
}

function on(node, type, handler) {
  node.addEventListener(type, handler);
}

function bindEvents() {
  on(ui.tabJson, "click", () => selectTab(INPUT_TABS.JSON));
  on(ui.tabNl, "click", () => selectTab(INPUT_TABS.NATURAL_LANGUAGE));
  on(ui.tabJson, "keydown", onTabKeydown);
  on(ui.tabNl, "keydown", onTabKeydown);
  on(ui.input, "input", () => {
    dispatch({ type: E.TEXT_CHANGE, tab: model.activeTab, text: ui.input.value });
  });
  on(ui.exampleButton, "click", () => {
    dispatch({
      type: E.TEXT_CHANGE,
      tab: INPUT_TABS.JSON,
      text: JSON.stringify(EXAMPLE_JSON, null, 2),
    });
  });
  const simple = [
    [ui.generateButton, E.GENERATE],
    [ui.cancelButton, E.CANCEL],
    [ui.cancelConfirmButton, E.CANCEL_CONFIRMED],
    [ui.cancelDismissButton, E.CANCEL_DISMISSED],
    [ui.previewContinueButton, E.REVIEW_REQUESTED],
    [ui.loginButton, E.LOGIN_REQUESTED],
    [ui.fillAnywayButton, E.FILL_ANYWAY],
    [ui.correctButton, E.CORRECT],
    [ui.reviewRetryButton, E.RETRY],
    [ui.connectionRetryButton, E.RETRY],
    [ui.retryButton, E.RETRY],
    [ui.retryWafButton, E.RETRY_WAF],
    [ui.backButton, E.BACK],
    [ui.newRunButton, E.NEW_RUN],
  ];
  for (const [button, type] of simple) on(button, "click", () => dispatch({ type }));
  on(ui.copyButton, "click", copyUrl);
  on(document, "keydown", onKeydown);
  tabStore.bindFlush(ui.input, ["blur"]);
  tabStore.bindFlush(window, ["pagehide"]);
  chrome.runtime.onMessage.addListener((message, sender) => {
    effects.handleRuntimeMessage(message, sender, chrome.runtime.id);
    return false;
  });
  chrome.tabs.onRemoved.addListener((tabId) => effects.handleTabRemoved(tabId));
}

// ─── Arranque (NFR8.5) ────────────────────────────────────────────────────────

// Texto de las pestañas y corrida activa en paralelo (tope de 300 ms para la
// corrida); el último resultado no se pinta al abrir (AC6.3.1).
async function init() {
  bindEvents();
  const [saved] = await Promise.all([tabStore.load(), effects.resume()]);
  dispatch({ type: E.HYDRATE, texts: saved.texts, activeTab: saved.activeTab });
  if (frame !== null) cancelAnimationFrame(frame);
  render();
  performance.mark("panel-ready");
}

init().catch((error) => {
  console.error("[aws-calc] panel error", error);
  showMessage(messageFor("panel:storage_error"));
  render();
});

// Diagnóstico: eventos ignorados por el reductor (sin transición o id ajeno).
globalThis.awsCalcPanelDiagnostics = () => ({ state: model.state, ignoredEvents });
