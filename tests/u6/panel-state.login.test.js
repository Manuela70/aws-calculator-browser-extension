// panel-state.js: login con unauthorized, LOGIN_OK, LOGIN_CANCELLED y la regla de 15 min (NFR5.5).
import { describe, it, expect } from "vitest";
import {
  INPUT_TABS,
  PANEL_EVENTS as E,
  PANEL_STATES as S,
  transition,
} from "../../aws-calculator-extension/lib/panel/panel-state.js";
import { FIXED_NOW, makeErrorRunResult, makeInputErrors, makeSession } from "./fixtures.js";
import { RUN_ID, idle, preview, reviewing, running, walk, wafLoading } from "./panel-paths.js";

describe("antes de Reviewing (regla de 15 minutos)", () => {
  it("con menos de 15 minutos de token se queda en Preview con needsLogin", async () => {
    const model = walk(await preview(), { type: E.REVIEW_REQUESTED });
    expect(model).toMatchObject({ state: S.PREVIEW, checkingSession: true });
    expect(transition(model, { type: E.REVIEW_REQUESTED })).toBe(model);
    const short = walk(model, {
      type: E.SESSION_CHECKED,
      session: makeSession(14),
      now: FIXED_NOW,
    });
    expect(short).toMatchObject({ state: S.PREVIEW, needsLogin: true, checkingSession: false });
    const none = walk(model, { type: E.SESSION_CHECKED, session: null, now: FIXED_NOW });
    expect(none.needsLogin).toBe(true);
  });

  it("LOGIN_OK desde Preview limpia la marca y pasa a Reviewing; LOGIN_CANCELLED deja el texto", async () => {
    const model = walk(
      await preview(),
      { type: E.REVIEW_REQUESTED },
      { type: E.SESSION_CHECKED, session: makeSession(5), now: FIXED_NOW },
      { type: E.LOGIN_REQUESTED },
    );
    expect(model.loginPending).toBe(true);
    expect(transition(model, { type: E.LOGIN_REQUESTED })).toBe(model);
    expect(walk(model, { type: E.LOGIN_OK })).toMatchObject({
      state: S.REVIEWING,
      needsLogin: false,
      loginPending: false,
    });
    const cancelled = walk(model, { type: E.LOGIN_CANCELLED, code: "login_cancelled" });
    expect(cancelled).toMatchObject({ state: S.PREVIEW, needsLogin: true });
    expect(cancelled.error.code).toBe("brain:login_cancelled");
  });

  it("sin cerebro desplegado el login responde brain_unavailable y la corrida sigue sin revisión", async () => {
    const model = walk(
      await preview(),
      { type: E.REVIEW_REQUESTED },
      { type: E.SESSION_CHECKED, session: makeSession(null), now: FIXED_NOW },
      { type: E.LOGIN_REQUESTED },
      { type: E.LOGIN_CANCELLED, code: "brain_unavailable" },
    );
    expect(model).toMatchObject({ state: S.CONNECTING, noReview: true });
  });
});

describe("unauthorized tras una llamada al cerebro", () => {
  it("en Interpreting: InputError con Iniciar sesión; LOGIN_OK repite la interpretación", () => {
    const model = walk(idle(INPUT_TABS.NATURAL_LANGUAGE), { type: E.GENERATE });
    const failed = walk(model, {
      type: E.NORMALIZED,
      requestId: model.requestId,
      result: { ok: false, error: makeInputErrors().unauthorized },
    });
    expect(failed.error).toMatchObject({ code: "input:unauthorized", canLogin: true });
    const retried = walk(failed, { type: E.LOGIN_REQUESTED }, { type: E.LOGIN_OK });
    expect(retried).toMatchObject({ state: S.INTERPRETING, requestId: "req-2", error: null });
  });

  it("en Reviewing y WafLoading: el error ofrece login y LOGIN_OK vuelve a llamar", async () => {
    const review = await reviewing();
    const reviewError = walk(review, {
      type: E.REVIEW_FAILED,
      requestId: review.requestId,
      code: "unauthorized",
    });
    expect(reviewError.error.canLogin).toBe(true);
    expect(walk(reviewError, { type: E.LOGIN_REQUESTED }, { type: E.LOGIN_OK }).state).toBe(
      S.REVIEWING,
    );
    const loading = await wafLoading();
    const wafError = walk(loading, {
      type: E.WAF_FAILED,
      requestId: loading.requestId,
      code: "unauthorized",
    });
    const again = walk(wafError, { type: E.LOGIN_REQUESTED }, { type: E.LOGIN_OK });
    expect(again).toMatchObject({ state: S.WAF_LOADING, error: null });
    const stillFailed = walk(
      wafError,
      { type: E.LOGIN_REQUESTED },
      { type: E.LOGIN_CANCELLED, code: "login_cancelled" },
    );
    expect(stillFailed).toMatchObject({
      state: S.WAF_ERROR,
      error: { code: "brain:login_cancelled", canLogin: true },
    });
  });

  it("un error que no es unauthorized no ofrece login", async () => {
    const review = await reviewing();
    const failed = walk(review, {
      type: E.REVIEW_FAILED,
      requestId: review.requestId,
      code: "timeout",
    });
    expect(failed.error.canLogin).toBe(false);
    expect(transition(failed, { type: E.LOGIN_REQUESTED })).toBe(failed);
    expect(transition(failed, { type: E.LOGIN_OK })).toBe(failed);
  });

  it("Failed con brainErrorCode = unauthorized ofrece login y luego pide un estimado nuevo", async () => {
    const model = await running();
    const failed = walk(model, {
      type: E.RUN_RESULT,
      runResult: makeErrorRunResult(RUN_ID, { brainErrorCode: "unauthorized" }),
    });
    expect(failed).toMatchObject({
      state: S.FAILED,
      error: { code: "brain:unauthorized", canLogin: true },
    });
    const after = walk(failed, { type: E.LOGIN_REQUESTED }, { type: E.LOGIN_OK });
    expect(after).toMatchObject({ state: S.FAILED, notice: "login_ok", error: null });
    const plain = walk(model, { type: E.RUN_RESULT, runResult: makeErrorRunResult(RUN_ID) });
    expect(plain.error).toBeNull();
  });
});
