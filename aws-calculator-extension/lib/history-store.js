// lib/history-store.js — Dueño único de activeRun, lastRunResult y runLogIndex para el
// panel (decisión 1 del plan de U6; BR1.1, BR5.3, NFR5.4, NFR8.7).
// Zona B (chrome.storage.local con doble en las pruebas). sidepanel.js y
// lib/panel/** no tocan chrome.storage.local: leen y borran solo por aquí.
// Cada operación devuelve un resultado tipado { ok, ... } y nunca lanza.

import { STORAGE_KEYS, makeStoredRunRecord } from "./messages.js";
import { chunkKeysForRow, rebuildIndex, removeRow } from "./log/log-index.js";

export const STORAGE_ERROR = "storage_error";

function asIndex(value) {
  return Array.isArray(value) ? value : [];
}

function storedResult(record) {
  return record && typeof record === "object" ? (record.value ?? null) : null;
}

export function createHistoryStore({
  storage = globalThis.chrome?.storage?.local,
  onError = (...args) => console.error("[aws-calc] history", ...args),
} = {}) {
  async function guard(what, operation) {
    try {
      if (!storage) throw new Error("chrome.storage.local no disponible");
      return { ok: true, ...(await operation()) };
    } catch (error) {
      onError(`No pude ${what}:`, error?.message ?? error);
      return { ok: false, code: STORAGE_ERROR };
    }
  }

  // Lista del índice y último resultado (al desplegar el historial: una sola lectura).
  function listRuns() {
    return guard("leer el historial", async () => {
      const stored = await storage.get([STORAGE_KEYS.RUN_LOG_INDEX, STORAGE_KEYS.LAST_RUN_RESULT]);
      return {
        index: asIndex(stored[STORAGE_KEYS.RUN_LOG_INDEX]),
        lastRunResult: storedResult(stored[STORAGE_KEYS.LAST_RUN_RESULT]),
      };
    });
  }

  // Corrida activa (con su latido) y último resultado, para abrir el panel y vigilar.
  function readActiveRun() {
    return guard("leer la corrida activa", async () => {
      const stored = await storage.get([STORAGE_KEYS.ACTIVE_RUN, STORAGE_KEYS.LAST_RUN_RESULT]);
      return {
        activeRun: stored[STORAGE_KEYS.ACTIVE_RUN] ?? null,
        lastRunResult: storedResult(stored[STORAGE_KEYS.LAST_RUN_RESULT]),
      };
    });
  }

  function readEntries(row) {
    return guard("leer el registro de la corrida", async () => {
      const keys = chunkKeysForRow(row);
      const stored = await storage.get(keys);
      return { entries: keys.flatMap((key) => (Array.isArray(stored[key]) ? stored[key] : [])) };
    });
  }

  // Datos para exportar: { runId, index, entries } por corrida.
  function exportRuns(rows) {
    return guard("exportar el historial", async () => {
      const runs = [];
      for (const row of rows ?? []) {
        const keys = chunkKeysForRow(row);
        const stored = await storage.get(keys);
        const entries = keys.flatMap((key) => (Array.isArray(stored[key]) ? stored[key] : []));
        runs.push({ runId: row.runId, index: row, entries });
      }
      return { runs };
    });
  }

  function deleteRun(row) {
    return guard("borrar la corrida", async () => {
      await storage.remove(chunkKeysForRow(row));
      const stored = await storage.get(STORAGE_KEYS.RUN_LOG_INDEX);
      const index = removeRow(stored[STORAGE_KEYS.RUN_LOG_INDEX], row.runId);
      await storage.set({ [STORAGE_KEYS.RUN_LOG_INDEX]: index });
      return { index };
    });
  }

  function deleteAll() {
    return guard("borrar el historial", async () => {
      const stored = await storage.get(STORAGE_KEYS.RUN_LOG_INDEX);
      const keys = asIndex(stored[STORAGE_KEYS.RUN_LOG_INDEX]).flatMap(chunkKeysForRow);
      await storage.remove([...keys, STORAGE_KEYS.RUN_LOG_INDEX, STORAGE_KEYS.LAST_RUN_RESULT]);
      return { index: [] };
    });
  }

  // "Reparar índice": reconstruye runLogIndex desde las claves runLog:*.
  function repairIndex() {
    return guard("reparar el índice", async () => {
      const index = rebuildIndex(await storage.get(null));
      await storage.set({ [STORAGE_KEYS.RUN_LOG_INDEX]: index });
      return { index };
    });
  }

  // Corrida perdida (latido vencido): borra activeRun si sigue siendo la misma
  // y guarda el RunResult lost como último resultado (BR1.1).
  function closeLostRun(runResult) {
    return guard("cerrar la corrida perdida", async () => {
      const stored = await storage.get(STORAGE_KEYS.ACTIVE_RUN);
      if (stored[STORAGE_KEYS.ACTIVE_RUN]?.runId === runResult.runId) {
        await storage.remove(STORAGE_KEYS.ACTIVE_RUN);
      }
      await storage.set({ [STORAGE_KEYS.LAST_RUN_RESULT]: makeStoredRunRecord(runResult) });
      return {};
    });
  }

  return {
    listRuns,
    readActiveRun,
    readEntries,
    exportRuns,
    deleteRun,
    deleteAll,
    repairIndex,
    closeLostRun,
  };
}
