// lib/panel/render/result-view.js — ResultBlock, WafPanel, ReviewFindingsView y las vistas de
// error (C4, C5; BR2.2, BR3.2, BR3.4, BR4.1, BR5.1, NFR5.2). Dueño: U6. Zona B (smoke).
// La URL solo se vuelve enlace o botón "Copiar" si el reductor dio Done con
// URL válida y isValidEstimateUrl la acepta de nuevo aquí.

import {
  describeFailure,
  describeFragment,
  describeServiceResultParts,
  messageFor,
} from "../../messages-es.js";
import { PANEL_STATES as S, isSuccessfulRun } from "../panel-state.js";
import { isValidEstimateUrl } from "../url-check.js";
import { WAF_PILLARS, WAF_SEVERITIES } from "../waf-model.js";
import { el, link, setText, show } from "./dom.js";

const RESULT_STATES = Object.freeze([S.DONE, S.FAILED, S.WAF_LOADING, S.WAF_RESULT, S.WAF_ERROR]);
const ERROR_STATES = Object.freeze([
  S.INPUT_ERROR,
  S.REVIEW_ERROR,
  S.CONNECTION_ERROR,
  S.WAF_ERROR,
  S.PREVIEW,
  S.FAILED,
]);
let renderedResult = null;
let renderedFindings = null;
let renderedWaf = null;

function serviceResultItem(result) {
  const parts = describeServiceResultParts(result);
  const item = el("li", {
    className: `service-row service-row--${parts.isConfirmed ? "confirmed" : "failed"}`,
  });
  item.append(el("span", { className: "service-name", text: `${parts.name}: ` }));
  item.append(el("span", { text: parts.isConfirmed ? parts.statusText : parts.reasonText }));
  for (const note of parts.notes)
    item.append(el("span", { className: "service-note", text: ` ${note}` }));
  return item;
}

function renderUrl(ui, runResult, visible) {
  const url = visible && isValidEstimateUrl(runResult?.estimateUrl) ? runResult.estimateUrl : null;
  show(ui.resultUrlBox, Boolean(url));
  if (!url) {
    if (ui.resultUrlBox.firstElementChild !== ui.copyButton) {
      ui.resultUrlBox.replaceChildren(ui.copyButton, ui.copyStatus);
    }
    return;
  }
  if (ui.resultUrlBox.firstElementChild?.getAttribute("href") !== url) {
    ui.resultUrlBox.replaceChildren(link(url, url, "result-link"), ui.copyButton, ui.copyStatus);
  }
}

// BR3.2: veredicto arriba; con DONE, URL copiable; con fallo, motivo y faltantes.
export function renderResult(ui, model) {
  const visible = RESULT_STATES.includes(model.state) && Boolean(model.runResult);
  show(ui.result, visible);
  const success = visible && isSuccessfulRun(model.runResult) && model.state !== S.FAILED;
  renderUrl(ui, model.runResult, success);
  if (!visible) return;
  ui.result.classList.toggle("box--success", success);
  ui.result.classList.toggle("box--error", !success);
  setText(ui.resultTitle, messageFor(success ? "panel:done" : "panel:failed"));
  setText(ui.resultMessage, success ? "" : describeFailure(model.runResult));
  show(ui.resultMessage, !success);
  if (model.runResult === renderedResult) return;
  renderedResult = model.runResult;
  const results = model.runResult.perServiceResults ?? [];
  ui.resultServices.replaceChildren(...results.map(serviceResultItem));
  const missing = success ? [] : (model.runResult.missing ?? []);
  setText(
    ui.resultMissing,
    missing.length ? messageFor("panel:missing", { names: missing.join(", ") }) : "",
  );
  show(ui.resultMissing, missing.length > 0);
}

const SEVERITY_ORDER = Object.freeze([...WAF_SEVERITIES]);

function recommendationItem(rec) {
  const item = el("li", { className: "finding" });
  const severity = messageFor(`severity:${rec.severity}`);
  item.append(el("span", { className: `severity severity--${rec.severity}`, text: severity }));
  item.append(el("span", { text: ` ${rec.text}` }));
  return item;
}

// Hallazgos agrupados por servicio y pilar, de mayor a menor severidad; "Sin
// hallazgos" explícito por servicio (BR4.1).
export function buildFindings(perService, names = []) {
  const fragment = document.createDocumentFragment();
  for (const service of perService) {
    const block = el("section", { className: "findings-service" });
    block.append(el("h3", { text: names[service.serviceIndex] ?? service.service }));
    if (service.noFindings) {
      block.append(el("p", { className: "muted", text: messageFor("panel:waf_no_findings") }));
    }
    for (const pillar of WAF_PILLARS) {
      const recs = service.recommendations
        .filter((rec) => rec.pillar === pillar)
        .sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));
      if (recs.length === 0) continue;
      block.append(el("h4", { text: messageFor(`pillar:${pillar}`) }));
      const list = el("ul", { className: "findings-list" });
      list.append(...recs.map(recommendationItem));
      block.append(list);
    }
    fragment.append(block);
  }
  return fragment;
}

function serviceNames(model) {
  if (model.normalizedRun?.services)
    return model.normalizedRun.services.map((svc) => svc.serviceName);
  return (model.runResult?.perServiceResults ?? []).map((result) => result.serviceName);
}

export function renderFindings(ui, model) {
  const visible = model.state === S.REVIEW_FINDINGS && Boolean(model.reviewFindings);
  show(ui.findings, visible);
  if (!visible || model.reviewFindings === renderedFindings) return;
  renderedFindings = model.reviewFindings;
  ui.findingsList.replaceChildren(
    buildFindings(model.reviewFindings.perService, serviceNames(model)),
  );
}

// WafPanel: cargando, resultado o error (el error va en la vista de error).
export function renderWaf(ui, model) {
  const visible = [S.WAF_LOADING, S.WAF_RESULT].includes(model.state);
  show(ui.waf, visible);
  if (!visible) return;
  if (model.state === S.WAF_LOADING) {
    renderedWaf = null;
    ui.wafList.replaceChildren(
      el("p", { className: "muted", text: messageFor("panel:waf_loading") }),
    );
    return;
  }
  if (model.waf === renderedWaf) return;
  renderedWaf = model.waf;
  ui.wafList.replaceChildren(buildFindings(model.waf.perService, serviceNames(model)));
}

function errorText(model) {
  if (model.error) return messageFor(model.error.code, model.error.params);
  if (model.state === S.PREVIEW && model.needsLogin) return messageFor("panel:login_required");
  return "";
}

// Mensaje de error con role="alert"; devuelve true si recién apareció (foco).
export function renderError(ui, model) {
  const text = ERROR_STATES.includes(model.state) ? errorText(model) : "";
  const wasHidden = ui.errorView.hidden;
  show(ui.errorView, text.length > 0);
  setText(ui.errorMessage, text);
  const fragments = model.error?.fragments ?? [];
  ui.errorFragments.replaceChildren(
    ...fragments.map((item) => el("li", { text: describeFragment(item) })),
  );
  show(ui.errorFragments, fragments.length > 0);
  return text.length > 0 && wasHidden;
}
