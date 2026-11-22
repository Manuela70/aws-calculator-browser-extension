// effects.js con dobles: service worker simulado detrás del brain-port real de U7,
// handshake real de U1 sobre fake-chrome, historial en memoria y reloj simulado
// (NFR5.5, NFR8.4; contratos BRAIN_*, RUN_RPA, CANCEL_RPA). Zona B: sin piso de cobertura.
import { describe, it, expect, vi, afterEach } from "vitest";
import { createPanelEffects } from "../../aws-calculator-extension/lib/panel/effects.js";
import {
  INPUT_TABS,
  PANEL_EVENTS as E,
  PANEL_STATES as S,
  createInitialState,
  transition,
} from "../../aws-calculator-extension/lib/panel/panel-state.js";
import { createBrainPort } from "../../aws-calculator-extension/lib/connection/brain-port.js";
import { connectToCalculator } from "../../aws-calculator-extension/lib/connection/handshake.js";
import { createHistoryStore } from "../../aws-calculator-extension/lib/history-store.js";
import { createFakeChrome } from "../u1/fake-chrome.js";
import { createFakeStorage, createSilentConsole } from "../u1/fake-storage.js";
import { EXTENSION_ID } from "../u7/fakes.js";
import { EC2_JSON, makeDoneRunResult, makeProgress, makeWafResponse } from "./fixtures.js";

const CALC_TAB = { id: 7, url: "https://calculator.aws/#/estimate", status: "complete" };
const NEVER = new Promise(() => {});

// Service worker simulado: guarda cada mensaje del borde y deja las llamadas
// pendientes hasta que la prueba responda.
function createFakeWorker() {
  const sent = [];
  const pending = new Map();
  const worker = {
    sent,
    sessionReply: Promise.resolve({ authenticated: true, expiresAt: Date.now() + 3600000 }),
    loginReply: Promise.resolve({ ok: true, expiresAt: Date.now() + 3600000 }),
    sendMessage(message) {
      sent.push(message);
      if (message.type === "BRAIN_CALL") {
        return new Promise((resolve) => pending.set(message.callId, resolve));
      }
      if (message.type === "BRAIN_SESSION") return worker.sessionReply;
      if (message.type === "BRAIN_LOGIN") return worker.loginReply;
      return Promise.resolve({ ok: true });
    },
    calls: (operation) => sent.filter((m) => m.type === "BRAIN_CALL" && m.operation === operation),
    reply(callId, value) {
      pending.get(callId)({ callId, ok: true, value });
    },
    fail(callId, code) {
      pending.get(callId)({ callId, ok: false, error: { code } });
    },
  };
  return worker;
}

function setup({ tab = INPUT_TABS.JSON, pingResponses, storage = createFakeStorage() } = {}) {
  vi.useFakeTimers();
  const worker = createFakeWorker();
  let ids = 0;
  const brainPort = createBrainPort({
    sendMessage: (message) => worker.sendMessage(message),
    newCallId: () => `call-${++ids}`,
    onWarn: () => {},
  });
  const chromeApi = createFakeChrome({
    tabs: [CALC_TAB],
    pingResponses: pingResponses ?? [
      { ok: true, ready: true },
      { accepted: true },
      { cancelled: true },
    ],
  });
  const clock = {
    now: () => Date.now(),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (id) => clearTimeout(id),
  };
  const events = [];
  let model = createInitialState({
    texts: { json: JSON.stringify(EC2_JSON), natural_language: "dos EC2 t3.micro" },
    activeTab: tab,
  });
  const effects = createPanelEffects({
    dispatch: (event) => {
      events.push(event);
      const prev = model;
      model = transition(model, event);
      effects.onTransition(prev, model);
    },
    getModel: () => model,
    brainPort,
    tabsApi: chromeApi.tabs,
    connect: () => connectToCalculator({ chromeApi, sleepFn: async () => {} }),
    historyStore: createHistoryStore({ storage, onError: () => {} }),
    clock,
    newRunId: () => "run-1",
    logger: createSilentConsole(),
  });
  const dispatch = (event) => {
    const prev = model;
    model = transition(model, event);
    effects.onTransition(prev, model);
  };
  return { worker, chromeApi, effects, events, dispatch, model: () => model, storage };
}

const flush = () => vi.advanceTimersByTimeAsync(0);

afterEach(() => vi.useRealTimers());

async function toPreview(env) {
  env.dispatch({ type: E.GENERATE });
  await flush();
  expect(env.model().state).toBe(S.PREVIEW);
}

describe("interpretación (lenguaje natural)", () => {
  it("Cancelar envía BRAIN_CANCEL con el mismo callId y la respuesta tardía se descarta", async () => {
    const env = setup({ tab: INPUT_TABS.NATURAL_LANGUAGE });
    env.dispatch({ type: E.GENERATE });
    await flush();
    const [call] = env.worker.calls("interpret");
    expect(call.body).toMatchObject({ text: "dos EC2 t3.micro", locale: "es" });
    env.dispatch({ type: E.CANCEL });
    await flush();
    expect(env.worker.sent).toContainEqual({ type: "BRAIN_CANCEL", callId: call.callId });
    env.worker.reply(call.callId, { status: "interpreted", runInput: EC2_JSON });
    await flush();
    expect(env.model().state).toBe(S.IDLE);
    expect(env.events.some((event) => event.type === E.NORMALIZED)).toBe(false);
  });

  it("a los 30 s sin respuesta pasa a InputError timeout y cancela la llamada", async () => {
    const env = setup({ tab: INPUT_TABS.NATURAL_LANGUAGE });
    env.dispatch({ type: E.GENERATE });
    await flush();
    const [call] = env.worker.calls("interpret");
    await vi.advanceTimersByTimeAsync(30000);
    expect(env.model()).toMatchObject({ state: S.INPUT_ERROR, error: { code: "input:timeout" } });
    expect(env.worker.sent).toContainEqual({ type: "BRAIN_CANCEL", callId: call.callId });
  });
});

describe("revisión previa y sesión", () => {
  it("BRAIN_SESSION sin respuesta en 2 s cuenta como sin sesión (needsLogin)", async () => {
    const env = setup();
    env.worker.sessionReply = NEVER;
    await toPreview(env);
    env.dispatch({ type: E.REVIEW_REQUESTED });
    await vi.advanceTimersByTimeAsync(1999);
    expect(env.model().checkingSession).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(env.model()).toMatchObject({
      state: S.PREVIEW,
      needsLogin: true,
      checkingSession: false,
    });
  });

  it("unauthorized en la revisión, login y LOGIN_OK repiten la llamada", async () => {
    const env = setup();
    await toPreview(env);
    env.dispatch({ type: E.REVIEW_REQUESTED });
    await flush();
    const [first] = env.worker.calls("waf-evaluate");
    expect(first.body.phase).toBe("pre_fill");
    env.worker.fail(first.callId, "unauthorized");
    await flush();
    expect(env.model()).toMatchObject({ state: S.REVIEW_ERROR, error: { canLogin: true } });
    env.dispatch({ type: E.LOGIN_REQUESTED });
    await flush();
    expect(env.worker.sent.some((m) => m.type === "BRAIN_LOGIN")).toBe(true);
    const calls = env.worker.calls("waf-evaluate");
    expect(calls).toHaveLength(2);
    expect(env.model().state).toBe(S.REVIEWING);
    env.worker.reply(calls[1].callId, makeWafResponse({ withFindings: false }));
    await flush();
    expect(env.model().state).toBe(S.RUNNING);
  });

  it("el tope de 35 s de la revisión termina en ReviewError y envía BRAIN_CANCEL", async () => {
    const env = setup();
    await toPreview(env);
    env.dispatch({ type: E.REVIEW_REQUESTED });
    await flush();
    const [call] = env.worker.calls("waf-evaluate");
    await vi.advanceTimersByTimeAsync(35000);
    expect(env.model()).toMatchObject({ state: S.REVIEW_ERROR, error: { code: "brain:timeout" } });
    expect(env.worker.sent).toContainEqual({ type: "BRAIN_CANCEL", callId: call.callId });
  });
});

describe("corrida: RUN_RPA, progreso, cancelación y evaluación final", () => {
  async function toRunning(env) {
    await toPreview(env);
    env.dispatch({ type: E.REVIEW_REQUESTED });
    await flush();
    const [call] = env.worker.calls("waf-evaluate");
    env.worker.reply(call.callId, makeWafResponse({ withFindings: false }));
    await flush();
    expect(env.model()).toMatchObject({ state: S.RUNNING, runId: "run-1", tabId: 7 });
  }

  it("envía RUN_RPA con el runId nuevo y aplica PROGRESS de la propia extensión", async () => {
    const env = setup();
    await toRunning(env);
    const runRpa = env.chromeApi.sent.find((entry) => entry.message.type === "RUN_RPA");
    expect(runRpa.message.runRequest).toMatchObject({ runId: "run-1", project: "Demo" });
    expect(runRpa.message.runRequest.services).toHaveLength(2);
    const progress = { type: "PROGRESS", ...makeProgress("run-1", "saving", { serviceIndex: 0 }) };
    expect(env.effects.handleRuntimeMessage(progress, { id: "otra" }, EXTENSION_ID)).toBe(false);
    expect(env.effects.handleRuntimeMessage(progress, { id: EXTENSION_ID }, EXTENSION_ID)).toBe(
      true,
    );
    await flush();
    expect(env.model().progress.rows[0].status).toBe("in_progress");
  });

  it("Cancelar confirmado envía CANCEL_RPA con el runId activo y a los 20 s vuelve a Idle", async () => {
    const env = setup();
    await toRunning(env);
    env.dispatch({ type: E.CANCEL });
    env.dispatch({ type: E.CANCEL_CONFIRMED });
    await flush();
    const cancel = env.chromeApi.sent.find((entry) => entry.message.type === "CANCEL_RPA");
    expect(cancel).toEqual({ tabId: 7, message: { type: "CANCEL_RPA", runId: "run-1" } });
    await vi.advanceTimersByTimeAsync(20000);
    expect(env.model()).toMatchObject({ state: S.IDLE, notice: "cancel_unconfirmed" });
  });

  it("DONE con URL válida lanza sola la evaluación final post_fill", async () => {
    const env = setup();
    await toRunning(env);
    const message = { type: "RUN_RESULT", runId: "run-1", runResult: makeDoneRunResult("run-1") };
    env.effects.handleRuntimeMessage(message, { id: EXTENSION_ID }, EXTENSION_ID);
    await flush();
    await flush();
    expect(env.model().state).toBe(S.WAF_LOADING);
    const calls = env.worker.calls("waf-evaluate");
    expect(calls.at(-1).body.phase).toBe("post_fill");
  });

  it("handshake agotado → ConnectionError; RUN_RPA rechazado busy → ConnectionError busy", async () => {
    const env = setup({ pingResponses: [null, null, null, null] });
    env.dispatch({ type: E.GENERATE });
    await flush();
    env.dispatch({ type: E.REVIEW_REQUESTED });
    env.dispatch({ type: E.SESSION_CHECKED, session: null, now: 0 });
    env.dispatch({ type: E.LOGIN_REQUESTED });
    env.worker.loginReply = Promise.resolve({ ok: false, error: { code: "brain_unavailable" } });
    await flush();
    await flush();
    expect(env.model()).toMatchObject({ state: S.CONNECTION_ERROR, noReview: true });
    const busy = setup({
      pingResponses: [
        { ok: true, ready: true },
        { accepted: false, reason: "busy" },
      ],
    });
    await toPreview(busy);
    busy.dispatch({ type: E.REVIEW_REQUESTED });
    await flush();
    busy.worker.fail(busy.worker.calls("waf-evaluate")[0].callId, "brain_unavailable");
    await flush();
    expect(busy.model()).toMatchObject({
      state: S.CONNECTION_ERROR,
      error: { code: "detail:busy" },
    });
  });
});

describe("apertura y latido (decisión 4, BR1.1)", () => {
  it("reanuda una corrida activa con latido vigente", async () => {
    const storage = createFakeStorage({
      activeRun: { runId: "run-9", tabId: 7, updatedAt: 0, lastProgress: { step: "saving" } },
    });
    const env = setup({ storage });
    vi.setSystemTime(10000);
    await env.effects.resume();
    expect(env.model()).toMatchObject({ state: S.RUNNING, runId: "run-9", tabId: 7 });
  });

  it("sin respuesta en 300 ms arranca en Idle y reanuda cuando la lectura llega", async () => {
    const storage = createFakeStorage();
    let release;
    storage.get = () =>
      new Promise((resolve) => {
        release = () => resolve({ activeRun: { runId: "run-9", tabId: 7, updatedAt: Date.now() } });
      });
    const env = setup({ storage });
    const ready = env.effects.resume();
    await vi.advanceTimersByTimeAsync(300);
    await expect(ready).resolves.toBeNull();
    expect(env.model().state).toBe(S.IDLE);
    release();
    await flush();
    expect(env.model().state).toBe(S.RUNNING);
  });

  it("latido vencido al abrir o durante la corrida → Failed lost guardado como último resultado", async () => {
    const storage = createFakeStorage({ activeRun: { runId: "run-9", tabId: 7, updatedAt: 0 } });
    const env = setup({ storage });
    vi.setSystemTime(120000);
    await env.effects.resume();
    expect(env.model()).toMatchObject({ state: S.FAILED, runResult: { failureStep: "lost" } });
    expect(storage.data.has("activeRun")).toBe(false);
    expect(storage.data.get("lastRunResult").value.runId).toBe("run-9");

    const live = setup();
    await live.effects.resume();
    live.dispatch({ type: E.RESUME_ACTIVE, runId: "run-8", tabId: 3 });
    await vi.advanceTimersByTimeAsync(65000);
    expect(live.model()).toMatchObject({ state: S.FAILED, runResult: { failureStep: "lost" } });
    live.effects.handleTabRemoved(3);
  });
});
