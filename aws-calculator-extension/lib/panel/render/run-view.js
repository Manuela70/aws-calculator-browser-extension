// lib/panel/render/run-view.js — PreviewView, ServiceList y CancelConfirm (C3; BR2.1, BR3.1,
// NFR8.6). Dueño: U6. Zona B (smoke). La lista de servicios se actualiza fila por
// fila (indexada por posición), sin repintar la lista completa.

import { messageFor } from "../../messages-es.js";
import { PANEL_STATES as S } from "../panel-state.js";
import { el, setText, show } from "./dom.js";
import { stepText } from "./input-view.js";

const PREVIEW_STATES = Object.freeze([S.PREVIEW, S.REVIEWING, S.CONNECTING]);
const PROGRESS_STATES = Object.freeze([S.CONNECTING, S.RUNNING]);
let renderedRun = null;

function previewLines(run) {
  const lines = [];
  if (run.project) lines.push(messageFor("panel:project", { project: run.project }));
  const regionCode = run.regionDefaulted ? "panel:region_default" : "panel:region";
  lines.push(messageFor(regionCode, { region: run.region }));
  return lines;
}

function serviceItem(svc) {
  const item = el("li", { className: "preview-service" });
  item.append(el("span", { className: "service-name", text: svc.serviceName }));
  if (svc.template) {
    item.append(
      el("span", {
        className: "muted",
        text: messageFor("panel:template", { template: svc.template }),
      }),
    );
  }
  return item;
}

// BR2.1: servicios, plantilla, región y "(por defecto)".
export function renderPreview(ui, model) {
  const run = model.normalizedRun;
  const visible = PREVIEW_STATES.includes(model.state) && Boolean(run);
  show(ui.preview, visible);
  const notice = model.reviewNotice === "no_findings" ? messageFor("panel:review_no_findings") : "";
  setText(ui.reviewNotice, notice);
  show(ui.reviewNotice, visible && notice.length > 0);
  if (!visible || run === renderedRun) return;
  renderedRun = run;
  ui.previewMeta.replaceChildren(...previewLines(run).map((text) => el("li", { text })));
  ui.previewList.replaceChildren(...run.services.map(serviceItem));
}

const ROW_STATUS_CODES = Object.freeze({
  queued: "panel:service_queued",
  in_progress: "panel:service_in_progress",
  confirmed: "panel:service_confirmed",
  failed: "panel:service_failed",
});

function rowText(row, index, progress, now) {
  const name = row.name ?? `Servicio ${index + 1}`;
  const status = messageFor(ROW_STATUS_CODES[row.status] ?? "panel:service_queued");
  const isCurrent = row.status === "in_progress" && index === progress.currentIndex;
  const step = isCurrent ? stepText(progress, now) : "";
  return step ? `${name}: ${status}. ${step}` : `${name}: ${status}`;
}

// Actualiza solo las filas cuyo texto o estado cambió.
function syncRows(list, progress, now) {
  const rows = progress.rows;
  while (list.children.length > rows.length) list.lastElementChild.remove();
  while (list.children.length < rows.length) list.append(el("li"));
  rows.forEach((row, index) => {
    const item = list.children[index];
    const className = `service-row service-row--${row.status}`;
    if (item.className !== className) item.className = className;
    setText(item, rowText(row, index, progress, now));
  });
}

export function renderProgress(ui, model, now) {
  const progress = model.progress;
  const visible = PROGRESS_STATES.includes(model.state) && Boolean(progress?.rows?.length);
  show(ui.progress, visible);
  show(ui.logWarning, Boolean(progress?.logDegraded) && PROGRESS_STATES.includes(model.state));
  setText(ui.logWarning, messageFor("panel:log_degraded"));
  if (visible) syncRows(ui.progressList, progress, now);
}

// Diálogo de confirmación de la cancelación (R-11).
export function renderCancelConfirm(ui, model) {
  const open = model.state === S.RUNNING && model.confirmingCancel === true;
  setText(ui.cancelConfirmText, messageFor("panel:cancel_confirm"));
  const wasHidden = ui.cancelConfirm.hidden;
  show(ui.cancelConfirm, open);
  return open && wasHidden;
}
