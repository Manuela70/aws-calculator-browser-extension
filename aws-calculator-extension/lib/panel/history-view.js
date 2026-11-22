// lib/panel/history-view.js — RunHistory y LastRun plegables (BR1.1, BR5.3, NFR8.7).
// Dueño: U6. Zona B (smoke). Lee el historial una sola vez al desplegar, a través
// de lib/history-store.js (su dueño); arma hasta 200 filas en un DocumentFragment
// y las inserta de una vez. Exportar genera un JSON con Blob y un enlace
// download propio (blob:), sin permisos nuevos. Deshabilitado durante una corrida.

import { messageFor } from "../messages-es.js";
import { buildHistoryView, describeLastRun } from "./history-model.js";
import { el, link, setText } from "./render/dom.js";

function formatDate(value) {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toLocaleString("es") : "sin fecha";
}

function formatBytes(bytes) {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

function downloadJson(fileName, data) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function createHistoryView({ ui, historyStore, isLocked, onStatus }) {
  let index = [];

  function button(text, testId, onClick) {
    const node = el("button", { text, testId });
    node.type = "button";
    node.disabled = isLocked();
    node.addEventListener("click", onClick);
    return node;
  }

  function rowItem(row) {
    const item = el("li", { className: "run-row", testId: "history-row" });
    const verdict = messageFor(`verdict:${row.verdict}`);
    const services = Number.isInteger(row.serviceCount) ? ` · ${row.serviceCount} servicio(s)` : "";
    const degraded = row.degraded ? " · registro incompleto" : "";
    const text = `${formatDate(row.startedAt)} · ${verdict}${services} · ${formatBytes(row.bytes)}${degraded}`;
    item.append(el("span", { className: "run-text", text }));
    if (row.estimateUrl) item.append(link(row.estimateUrl, "Abrir estimado", "history-row-link"));
    const actions = el("span", { className: "run-actions" });
    actions.append(
      button("Exportar", "history-row-export-button", () => exportRows([row.source])),
      button("Borrar", "history-delete-button", () => deleteRow(row.source)),
    );
    item.append(actions);
    return item;
  }

  function renderRows(lastRunResult) {
    const view = buildHistoryView(index, { lastRunResult });
    const fragment = document.createDocumentFragment();
    fragment.append(...view.rows.map(rowItem));
    ui.historyList.replaceChildren(fragment);
    const summary =
      view.total === 0
        ? messageFor("panel:history_empty")
        : view.truncated
          ? messageFor("panel:history_truncated", { limit: view.limit, total: view.total })
          : `${view.total} corrida(s)`;
    setText(ui.historySummary, summary);
    setLocked(isLocked());
  }

  async function load() {
    const listed = await historyStore.listRuns();
    if (!listed.ok) {
      setText(ui.historySummary, messageFor("panel:history_error"));
      return;
    }
    index = listed.index;
    renderRows(listed.lastRunResult);
  }

  async function exportRows(rows) {
    const exported = await historyStore.exportRuns(rows);
    if (!exported.ok) return onStatus(messageFor("panel:history_action_failed"));
    const single = exported.runs.length === 1;
    const fileName = single
      ? `aws-calc-${exported.runs[0].runId}.json`
      : "aws-calc-registro-completo.json";
    downloadJson(fileName, single ? exported.runs[0] : exported.runs);
    return undefined;
  }

  async function runChange(action) {
    if (isLocked()) return;
    const changed = await action();
    if (!changed.ok) {
      onStatus(messageFor("panel:history_action_failed"));
      return;
    }
    await load();
  }

  function deleteRow(row) {
    return runChange(() => historyStore.deleteRun(row));
  }

  function setLocked(locked) {
    for (const node of ui.historyList.querySelectorAll("button")) node.disabled = locked;
    ui.historyDeleteAll.disabled = locked;
    ui.historyRepair.disabled = locked;
  }

  async function loadLastRun() {
    const listed = await historyStore.listRuns();
    const last = listed.ok ? describeLastRun(listed.lastRunResult) : null;
    if (!last) {
      ui.lastRunBody.replaceChildren(
        el("p", { className: "muted", text: messageFor("panel:last_run_none") }),
      );
      return;
    }
    const text = `${formatDate(last.finishedAt)} · ${messageFor(`verdict:${last.verdict}`)}`;
    const nodes = [el("p", { text })];
    if (last.estimateUrl) nodes.push(link(last.estimateUrl, last.estimateUrl, "last-run-link"));
    ui.lastRunBody.replaceChildren(...nodes);
  }

  function safely(action) {
    return () =>
      Promise.resolve()
        .then(action)
        .catch((error) => {
          console.error("[aws-calc] panel history", error);
          onStatus(messageFor("panel:history_action_failed"));
        });
  }

  ui.historyDetails.addEventListener(
    "toggle",
    safely(() => (ui.historyDetails.open ? load() : null)),
  );
  ui.lastRunDetails.addEventListener(
    "toggle",
    safely(() => (ui.lastRunDetails.open ? loadLastRun() : null)),
  );
  ui.historyExport.addEventListener(
    "click",
    safely(() => exportRows(index)),
  );
  ui.historyDeleteAll.addEventListener(
    "click",
    safely(() => runChange(() => historyStore.deleteAll())),
  );
  ui.historyRepair.addEventListener(
    "click",
    safely(() => runChange(() => historyStore.repairIndex())),
  );

  return {
    setLocked,
    // Recarga si la sección está abierta (por ejemplo, al terminar una corrida).
    refresh: safely(() => (ui.historyDetails.open ? load() : null)),
  };
}
