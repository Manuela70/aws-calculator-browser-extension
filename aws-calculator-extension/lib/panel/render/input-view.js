// lib/panel/render/input-view.js — InputTabs, InputArea, PrimaryAction, NoReviewNotice,
// StatusRegion y la barra de acciones (C1, C2; BR1.2, BR1.3, BR2.3, BR5.2, NFR8.4).
// Dueño: U6. Zona B (smoke). Solo texto plano, clases fijas y atributos literales.

import { NL_PRIVACY_NOTICE, messageFor } from "../../messages-es.js";
import {
  INPUT_TABS,
  PANEL_STATES as S,
  WAITING_STATES,
  canGenerate,
  isBusy,
} from "../panel-state.js";
import { setText, show } from "./dom.js";

const CANCELABLE = Object.freeze([S.INTERPRETING, S.REVIEWING, S.RUNNING, S.WAF_LOADING]);

function renderTabs(ui, model) {
  const isNl = model.activeTab === INPUT_TABS.NATURAL_LANGUAGE;
  const busy = isBusy(model);
  for (const [tab, active] of [
    [ui.tabJson, !isNl],
    [ui.tabNl, isNl],
  ]) {
    tab.setAttribute("aria-selected", active ? "true" : "false");
    tab.tabIndex = active ? 0 : -1;
    tab.classList.toggle("is-active", active);
    tab.disabled = busy;
  }
  ui.inputPanel.setAttribute("aria-labelledby", isNl ? "tab-nl" : "tab-json");
  return isNl;
}

export function renderInput(ui, model) {
  const isNl = renderTabs(ui, model);
  const busy = isBusy(model);
  setText(ui.inputLabel, isNl ? "Describe la arquitectura" : "Configuración en JSON");
  setText(ui.privacyNotice, NL_PRIVACY_NOTICE);
  show(ui.privacyNotice, isNl);
  show(ui.exampleButton, !isNl);
  ui.exampleButton.disabled = busy;
  const text = model.texts[model.activeTab] ?? "";
  if (ui.input.value !== text) ui.input.value = text;
  ui.input.disabled = busy;
  if (isNl) ui.input.setAttribute("aria-describedby", "nl-privacy-notice");
  else ui.input.removeAttribute("aria-describedby");
  ui.input.placeholder = isNl
    ? "Ejemplo: dos instancias EC2 t3.micro con Linux en us-east-1"
    : '{"project":"Mi Proyecto","region":"us-east-1","services":[...]}';
  ui.generateButton.disabled = !canGenerate(model);
  const cancelable = CANCELABLE.includes(model.state) && !model.cancelPending;
  show(ui.cancelButton, cancelable);
  ui.cancelButton.disabled = model.confirmingCancel;
  setText(ui.noReviewNotice, messageFor("panel:no_review"));
  show(ui.noReviewNotice, model.noReview === true);
}

function currentServiceName(progress) {
  const row = progress?.rows?.[progress.currentIndex];
  return row?.name ?? null;
}

// Texto del paso actual con el tiempo transcurrido en asking_brain.
export function stepText(progress, now) {
  if (!progress?.step) return "";
  const startedAt = progress.stepStartedAt;
  const seconds = Number.isFinite(startedAt)
    ? Math.max(0, Math.floor((now - startedAt) / 1000))
    : 0;
  const service = currentServiceName(progress) ?? progress.label;
  return messageFor(`step:${progress.step}`, { service, field: progress.label, seconds });
}

// En Running la región anuncia solo "Servicio N de M" (N = serviceIndex + 1); el
// paso actual va en la fila del servicio, sin anunciar cada acción (§7).
function runningText(model) {
  if (model.cancelPending) return messageFor("panel:cancelling_run");
  const progress = model.progress;
  const total = progress?.serviceCount ?? 0;
  const current = Number.isInteger(progress?.currentIndex) ? progress.currentIndex + 1 : 1;
  return messageFor("panel:running", { current, total });
}

const STATUS_CODES = Object.freeze({
  [S.VALIDATING]: "panel:validating",
  [S.INTERPRETING]: "panel:interpreting",
  [S.REVIEWING]: "panel:reviewing",
  [S.CONNECTING]: "panel:connecting",
  [S.DONE]: "panel:done",
  [S.FAILED]: "panel:failed",
  [S.WAF_LOADING]: "panel:waf_loading",
});

export function statusText(model) {
  if (model.state === S.RUNNING) return runningText(model);
  if (model.state === S.PREVIEW && model.checkingSession)
    return messageFor("panel:checking_session");
  const code = STATUS_CODES[model.state];
  return code ? messageFor(code) : "";
}

// StatusRegion (aria-live="polite"): estado actual y aria-busy en las esperas. La
// región nunca se oculta (un nodo oculto no se anuncia); vacía, el CSS la colapsa.
export function renderStatus(ui, model) {
  setText(ui.statusRegion, statusText(model));
  ui.statusRegion.setAttribute(
    "aria-busy",
    WAITING_STATES.includes(model.state) ? "true" : "false",
  );
  const notice = model.notice ? messageFor(`panel:${model.notice}`) : "";
  setText(ui.notice, notice);
  show(ui.notice, notice.length > 0);
}

function canOfferLogin(model) {
  if (model.state === S.PREVIEW && model.needsLogin) return true;
  return model.error?.canLogin === true;
}

// Barra de acciones: cada botón aparece solo en los estados que lo admiten.
export function renderActions(ui, model) {
  const s = model.state;
  show(ui.previewContinueButton, s === S.PREVIEW && !model.needsLogin);
  ui.previewContinueButton.disabled = model.checkingSession || model.loginPending;
  setText(
    ui.previewContinueButton,
    model.noReview || model.normalizedRun?.wafReview !== "required"
      ? "Generar en calculator.aws"
      : "Revisar y generar",
  );
  show(ui.loginButton, canOfferLogin(model));
  ui.loginButton.disabled = model.loginPending;
  show(ui.fillAnywayButton, s === S.REVIEW_FINDINGS);
  show(ui.correctButton, s === S.REVIEW_FINDINGS);
  show(ui.reviewRetryButton, s === S.REVIEW_ERROR);
  show(ui.connectionRetryButton, s === S.CONNECTION_ERROR);
  show(ui.retryButton, s === S.FAILED && model.canRetry);
  show(ui.retryWafButton, s === S.WAF_ERROR);
  show(ui.backButton, [S.INPUT_ERROR, S.REVIEW_ERROR, S.CONNECTION_ERROR, S.FAILED].includes(s));
  show(ui.newRunButton, [S.DONE, S.WAF_RESULT, S.WAF_ERROR].includes(s));
  const anyVisible = ui.actionButtons.some((button) => !button.hidden);
  show(ui.actions, anyVisible);
}
