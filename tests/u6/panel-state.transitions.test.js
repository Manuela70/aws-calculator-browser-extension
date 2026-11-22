// panel-state.js: transiciones de functional-spec §2 (BR1.1-BR4.1, R-11, R-17, decisión 3).
import { describe, it, expect } from "vitest";
import {
  INPUT_TABS,
  PANEL_EVENTS as E,
  PANEL_STATES as S,
  canDeleteLogs,
  canGenerate,
  createInitialState,
  isInputEnabled,
  resolveInitialView,
  transition,
} from "../../aws-calculator-extension/lib/panel/panel-state.js";
import {
  makeConnectionFailure,
  makeErrorRunResult,
  makeInputErrors,
  makeNaturalLanguageRun,
  makeProgress,
  makeWafResponse,
} from "./fixtures.js";
import {
  RUN_ID,
  connecting,
  done,
  idle,
  preview,
  reviewFindings,
  reviewing,
  running,
  walk,
  wafLoading,
} from "./panel-paths.js";

describe("entrada: validación e interpretación", () => {
  it("Generar va a Validating (JSON) o Interpreting (lenguaje natural) con un requestId nuevo", () => {
    const json = walk(idle(), { type: E.GENERATE });
    expect(json).toMatchObject({ state: S.VALIDATING, requestId: "req-1" });
    const nl = walk(idle(INPUT_TABS.NATURAL_LANGUAGE), { type: E.GENERATE });
    expect(nl.state).toBe(S.INTERPRETING);
    expect(isInputEnabled(nl)).toBe(false);
    expect(canDeleteLogs(nl)).toBe(false);
  });

  it("normalize válido → Preview; inválido → InputError con el texto intacto", async () => {
    const model = walk(idle(INPUT_TABS.NATURAL_LANGUAGE), { type: E.GENERATE });
    const value = await makeNaturalLanguageRun();
    const ok = walk(model, { type: E.NORMALIZED, requestId: "req-1", result: { ok: true, value } });
    expect(ok).toMatchObject({ state: S.PREVIEW, normalizedRun: value, noReview: false });
    const errors = makeInputErrors();
    const bad = walk(model, {
      type: E.NORMALIZED,
      requestId: "req-1",
      result: { ok: false, error: errors.unresolved },
    });
    expect(bad.state).toBe(S.INPUT_ERROR);
    expect(bad.error).toMatchObject({ code: "input:nl_unresolved", canLogin: false });
    expect(bad.error.fragments).toHaveLength(1);
    expect(bad.texts).toEqual(model.texts);
    expect(canGenerate(bad)).toBe(true);
  });

  it("Cancelar en Interpreting vuelve a Idle; el resultado cancelled también", () => {
    const model = walk(idle(INPUT_TABS.NATURAL_LANGUAGE), { type: E.GENERATE });
    expect(walk(model, { type: E.CANCEL }).state).toBe(S.IDLE);
    const cancelled = walk(model, {
      type: E.NORMALIZED,
      requestId: "req-1",
      result: { ok: false, error: makeInputErrors().cancelled },
    });
    expect(cancelled).toMatchObject({ state: S.IDLE, error: null });
  });

  it("editar el texto en InputError, Preview o ReviewFindings vuelve a Idle (R-17)", async () => {
    const edit = { type: E.TEXT_CHANGE, tab: "json", text: "{}" };
    expect(walk(await preview(), edit)).toMatchObject({ state: S.IDLE, normalizedRun: null });
    expect(walk(await reviewFindings(), edit).state).toBe(S.IDLE);
    const tab = walk(await preview(), { type: E.TAB_CHANGE, tab: INPUT_TABS.NATURAL_LANGUAGE });
    expect(tab).toMatchObject({ state: S.IDLE, activeTab: INPUT_TABS.NATURAL_LANGUAGE });
    const loading = await wafLoading();
    const edited = walk(loading, edit);
    expect(edited).toMatchObject({ state: S.WAF_LOADING, requestId: loading.requestId });
    expect(edited.texts.json).toBe("{}");
  });
});

describe("revisión Well-Architected previa", () => {
  it("Preview → Reviewing tras la sesión; con hallazgos → ReviewFindings", async () => {
    const model = await reviewing();
    expect(model).toMatchObject({ state: S.REVIEWING, requestId: "req-2" });
    const findings = await reviewFindings();
    expect(findings.state).toBe(S.REVIEW_FINDINGS);
    expect(findings.reviewFindings.perService[0].recommendations).toHaveLength(2);
    expect(walk(findings, { type: E.FILL_ANYWAY }).state).toBe(S.CONNECTING);
    expect(walk(findings, { type: E.CORRECT }).state).toBe(S.IDLE);
  });

  it("sin hallazgos va directo a Connecting con el aviso de revisión limpia", async () => {
    const model = await reviewing();
    const next = walk(model, {
      type: E.REVIEW_RESULT,
      requestId: model.requestId,
      response: makeWafResponse({ withFindings: false }),
    });
    expect(next).toMatchObject({ state: S.CONNECTING, reviewNotice: "no_findings" });
  });

  it("error del cerebro → ReviewError con Reintentar o Volver; brain_unavailable no bloquea (decisión 3)", async () => {
    const model = await reviewing();
    const failed = walk(model, {
      type: E.REVIEW_FAILED,
      requestId: model.requestId,
      code: "rate_limited",
    });
    expect(failed).toMatchObject({ state: S.REVIEW_ERROR, error: { code: "brain:rate_limited" } });
    expect(walk(failed, { type: E.RETRY })).toMatchObject({
      state: S.REVIEWING,
      requestId: "req-3",
    });
    expect(walk(failed, { type: E.BACK }).state).toBe(S.IDLE);
    const invalid = walk(model, {
      type: E.REVIEW_RESULT,
      requestId: model.requestId,
      response: {},
    });
    expect(invalid.error.code).toBe("brain:empty_result");
    const noBrain = walk(model, {
      type: E.REVIEW_FAILED,
      requestId: model.requestId,
      code: "brain_unavailable",
    });
    expect(noBrain).toMatchObject({ state: S.CONNECTING, noReview: true });
    expect(walk(model, { type: E.CANCEL }).state).toBe(S.IDLE);
  });

  it("una configuración sin revisión disponible pasa de Preview a Connecting con aviso (BR2.3)", async () => {
    const model = await preview();
    const noReview = {
      ...model,
      normalizedRun: { ...model.normalizedRun, wafReview: "not_available" },
    };
    expect(walk(noReview, { type: E.REVIEW_REQUESTED })).toMatchObject({
      state: S.CONNECTING,
      noReview: true,
    });
  });
});

describe("conexión, corrida y resultado", () => {
  it("Connecting → Running con el handshake; agotado → ConnectionError con Reintentar", async () => {
    const model = await connecting();
    const requested = walk(model, { type: E.RUN_REQUESTED, runId: RUN_ID });
    const failed = walk(requested, { type: E.CONNECTION_FAILED, runId: RUN_ID, failure: "busy" });
    expect(failed).toMatchObject({ state: S.CONNECTION_ERROR, error: { code: "detail:busy" } });
    expect(walk(failed, { type: E.RETRY })).toMatchObject({ state: S.CONNECTING, runId: null });
    expect(walk(failed, { type: E.BACK }).state).toBe(S.IDLE);
    const odd = walk(requested, { type: E.CONNECTION_FAILED, runId: RUN_ID, failure: "raro" });
    expect(odd.error.code).toBe("failure:connection");
    const run = await running();
    expect(run).toMatchObject({ state: S.RUNNING, runId: RUN_ID, tabId: 7 });
    expect(run.progress.rows.map((row) => row.status)).toEqual(["queued", "queued"]);
  });

  it("el progreso marca la fila del servicio y deriva 'en cola' para el resto (BR3.1)", async () => {
    const model = await running();
    const next = walk(
      model,
      {
        type: E.PROGRESS,
        event: { ...makeProgress(RUN_ID, "adding_service", { serviceIndex: 0 }), receivedAt: 5 },
      },
      {
        type: E.PROGRESS,
        event: makeProgress(RUN_ID, "saving", { serviceIndex: 0, serviceStatus: "confirmed" }),
      },
    );
    expect(next.progress.currentIndex).toBe(0);
    expect(next.progress.rows.map((row) => row.status)).toEqual(["confirmed", "queued"]);
    expect(next.progress.step).toBe("saving");
  });

  it("DONE con URL válida → Done → WafLoading → WafResult; Nueva corrida vuelve a Idle", async () => {
    const model = await done();
    expect(model.state).toBe(S.DONE);
    const loading = walk(model, { type: E.WAF_START });
    expect(loading.state).toBe(S.WAF_LOADING);
    const result = walk(loading, {
      type: E.WAF_RESULT,
      requestId: loading.requestId,
      response: makeWafResponse(),
    });
    expect(result.state).toBe(S.WAF_RESULT);
    expect(result.runResult.estimateUrl).toBe(model.runResult.estimateUrl);
    expect(walk(result, { type: E.NEW_RUN })).toMatchObject({ state: S.IDLE, runResult: null });
    expect(walk(model, { type: E.NEW_RUN }).state).toBe(S.IDLE);
  });

  it("WafError ofrece reintentar; Cancelar en WafLoading vuelve a Done sin evaluación", async () => {
    const loading = await wafLoading();
    const failed = walk(loading, {
      type: E.WAF_FAILED,
      requestId: loading.requestId,
      code: "brain_unavailable",
    });
    expect(failed).toMatchObject({
      state: S.WAF_ERROR,
      error: { code: "brain:brain_unavailable" },
    });
    expect(walk(failed, { type: E.RETRY_WAF }).state).toBe(S.WAF_LOADING);
    expect(walk(failed, { type: E.NEW_RUN }).state).toBe(S.IDLE);
    expect(walk(loading, { type: E.CANCEL })).toMatchObject({ state: S.DONE, waf: null });
  });

  it("ERROR → Failed; Reintentar solo sin servicios guardados (connection/preconditions)", async () => {
    const model = await running();
    const failed = walk(model, { type: E.RUN_RESULT, runResult: makeErrorRunResult(RUN_ID) });
    expect(failed).toMatchObject({ state: S.FAILED, canRetry: false });
    expect(walk(failed, { type: E.RETRY })).toBe(failed);
    expect(walk(failed, { type: E.BACK }).state).toBe(S.IDLE);
    const conn = walk(model, {
      type: E.RUN_RESULT,
      runResult: makeConnectionFailure(RUN_ID, "preconditions"),
    });
    expect(conn.canRetry).toBe(true);
    expect(walk(conn, { type: E.RETRY })).toMatchObject({ state: S.CONNECTING, runResult: null });
  });

  it("Cancelar en Running pide confirmación (R-11) y vuelve a Idle con el RunResult de esa corrida", async () => {
    const model = await running();
    const asking = walk(model, { type: E.CANCEL });
    expect(asking).toMatchObject({ state: S.RUNNING, confirmingCancel: true });
    expect(walk(asking, { type: E.CANCEL_DISMISSED }).confirmingCancel).toBe(false);
    const pending = walk(asking, { type: E.CANCEL_CONFIRMED });
    expect(pending).toMatchObject({ state: S.RUNNING, cancelPending: true });
    const closed = walk(pending, { type: E.RUN_RESULT, runResult: makeErrorRunResult(RUN_ID) });
    expect(closed).toMatchObject({ state: S.IDLE, notice: "cancelled", runResult: null });
  });
});

describe("apertura del panel (BR1.1, decisión 4)", () => {
  it("corrida activa con latido → RESUME_ACTIVE → Running; vencido → Failed lost", () => {
    const view = resolveInitialView({
      activeRun: {
        runId: "r9",
        tabId: 3,
        updatedAt: 100000,
        lastProgress: { step: "saving", serviceIndex: 0, serviceCount: 1 },
      },
      lastRunResult: null,
      now: 130000,
    });
    expect(view).toMatchObject({ event: E.RESUME_ACTIVE, runId: "r9", tabId: 3 });
    const resumed = transition(createInitialState(), { type: view.event, ...view });
    expect(resumed).toMatchObject({ state: S.RUNNING, runId: "r9", tabId: 3 });
    expect(resumed.progress.rows[0].status).toBe("in_progress");
    const stale = resolveInitialView({ activeRun: { runId: "r9", updatedAt: 0 }, now: 60001 });
    expect(stale.event).toBe(E.RUN_LOST);
    const lost = transition(createInitialState(), { type: E.RUN_LOST, runId: "r9" });
    expect(lost).toMatchObject({ state: S.FAILED, canRetry: false });
    expect(lost.runResult.failureStep).toBe("lost");
  });

  it("HYDRATE aplica el texto guardado sin pisar lo escrito, también durante una corrida", async () => {
    const saved = { json: "{guardado}", natural_language: "texto guardado" };
    const fresh = transition(createInitialState(), {
      type: E.HYDRATE,
      texts: saved,
      activeTab: INPUT_TABS.NATURAL_LANGUAGE,
    });
    expect(fresh).toMatchObject({ texts: saved, activeTab: INPUT_TABS.NATURAL_LANGUAGE });
    const typed = idle();
    const kept = transition(typed, { type: E.HYDRATE, texts: saved, activeTab: "json" });
    expect(kept).toBe(typed);
    const run = { ...(await running()), texts: { json: "", natural_language: "" } };
    const hydrated = transition(run, {
      type: E.HYDRATE,
      texts: saved,
      activeTab: "natural_language",
    });
    expect(hydrated).toMatchObject({ state: S.RUNNING, texts: saved, activeTab: "json" });
    expect(transition(run, { type: E.HYDRATE, texts: null })).toBe(run);
  });

  it("sin corrida empieza en Idle sin mensajes; el último resultado solo se devuelve (AC6.3.1)", () => {
    const view = resolveInitialView({ activeRun: null, lastRunResult: { runId: "x" }, now: 1 });
    expect(view).toEqual({ event: null, lastRunResult: { runId: "x" } });
    const model = createInitialState({ texts: { json: 3 }, activeTab: "otra" });
    expect(model).toMatchObject({ state: S.IDLE, error: null, runResult: null, activeTab: "json" });
    expect(model.texts).toEqual({ json: "", natural_language: "" });
  });
});
