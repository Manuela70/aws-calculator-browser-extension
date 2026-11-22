// lib/log/run-logger.js — Registro técnico persistido con un solo escritor
// (NFR3.5, NFR3.6, NFR3.10, NFR3.11, NFR8.10, NFR8.11; observability-design §2).
// PROVISIONAL (U1, walking skeleton). Dueño final: U1 (compartido).
//
// - Una cola de promesas: la escritura N+1 empieza cuando termina la N.
// - Escritura inmediata por entrada (sin lotes), en trozos de ≤ 200 entradas
//   bajo runLog:<runId>:<n>; cada escritura reescribe solo el trozo actual.
// - Al abrir un trozo nuevo, el índice se escribe ANTES que el trozo, para que
//   un cierre no deje trozos huérfanos fuera del índice.
// - bytes se recalcula en cada escritura de trozo (en memoria) y se persiste
//   con el índice al cambiar de trozo y al cerrar la corrida.
// - Un fallo de escritura se reintenta una vez; si vuelve a fallar se marca
//   degraded en memoria, se imprime en consola y se avisa por onDegraded. No se
//   intenta escribir esa marca en el almacenamiento que acaba de fallar.
// - También escribe activeRun (latido) y lastRunResult, por la misma cola.
// - Tras close() no acepta más escrituras de esa corrida.

import { STORAGE_KEYS, makeActiveRunRecord, makeStoredRunRecord } from "../messages.js";
import {
  formatConsolePrefix,
  formatLogEntry,
  makeRunEndEntry,
  makeRunStartEntry,
} from "./log-format.js";
import { chunkKey, createIndexRow, upsertRow } from "./log-index.js";

export const CHUNK_SIZE = 200;
export const CLOSE_FLUSH_TIMEOUT_MS = 5000;

export function createRunLogger({
  storage,
  runId,
  tabId,
  now = () => new Date(),
  consoleApi = console,
  onDegraded = () => {},
  debugToConsole = false,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
  let seq = 0;
  let chunkIndex = 0;
  let chunkEntries = [];
  let completedBytes = 0;
  let closed = false;
  let degraded = false;
  let queue = Promise.resolve();
  const row = createIndexRow(runId, now().toISOString());

  function markDegraded(what, error) {
    consoleApi.error(formatConsolePrefix(runId, "error"), `No pude guardar ${what}:`, error);
    if (degraded) return;
    degraded = true;
    row.degraded = true;
    onDegraded();
  }

  // Un reintento ante fallo; el segundo fallo marca degraded (no lanza).
  async function runWithRetry(operation, what) {
    try {
      await operation();
      return true;
    } catch (firstError) {
      consoleApi.warn(
        formatConsolePrefix(runId, "warn"),
        `Reintento al guardar ${what}`,
        firstError,
      );
      try {
        await operation();
        return true;
      } catch (secondError) {
        markDegraded(what, secondError);
        return false;
      }
    }
  }

  function enqueue(operation) {
    queue = queue.then(operation).catch((error) => markDegraded("el registro", error));
    return queue;
  }

  function persistIndex() {
    return runWithRetry(async () => {
      const stored = await storage.get(STORAGE_KEYS.RUN_LOG_INDEX);
      const index = upsertRow(stored?.[STORAGE_KEYS.RUN_LOG_INDEX], row);
      await storage.set({ [STORAGE_KEYS.RUN_LOG_INDEX]: index });
    }, "el índice del registro");
  }

  async function writeEntry(entry) {
    if (chunkEntries.length >= CHUNK_SIZE) {
      completedBytes += JSON.stringify(chunkEntries).length;
      chunkIndex += 1;
      chunkEntries = [];
      row.chunks = chunkIndex + 1;
      row.bytes = completedBytes;
      await persistIndex();
    }
    chunkEntries.push(entry);
    row.bytes = completedBytes + JSON.stringify(chunkEntries).length;
    const key = chunkKey(runId, chunkIndex);
    const snapshot = chunkEntries.slice();
    await runWithRetry(() => storage.set({ [key]: snapshot }), "parte del registro");
  }

  function printToConsole(entry) {
    if (entry.level === "debug" && !debugToConsole) return;
    const method = typeof consoleApi[entry.level] === "function" ? entry.level : "log";
    consoleApi[method](
      formatConsolePrefix(runId, entry.level),
      entry.step ?? "",
      entry.event ?? "",
      entry.message ?? "",
    );
  }

  // Devuelve la entrada formateada, o null si la corrida ya se cerró.
  function log(rawEntry) {
    if (closed) return null;
    seq += 1;
    const entry = formatLogEntry(rawEntry, { seq, runId, now });
    printToConsole(entry);
    enqueue(() => writeEntry(entry));
    return entry;
  }

  function start(runRequest) {
    enqueue(() => persistIndex());
    enqueue(() =>
      runWithRetry(
        () =>
          storage.set({
            [STORAGE_KEYS.ACTIVE_RUN]: makeActiveRunRecord({
              runId,
              tabId,
              updatedAt: now().getTime(),
            }),
          }),
        "la corrida activa",
      ),
    );
    return log(makeRunStartEntry(runRequest));
  }

  // Latido: activeRun con el último progreso (BR6.6).
  function updateActiveRun(progressEvent) {
    if (closed) return false;
    const record = makeActiveRunRecord({
      runId,
      tabId,
      lastProgress: progressEvent,
      updatedAt: now().getTime(),
    });
    enqueue(() =>
      runWithRetry(() => storage.set({ [STORAGE_KEYS.ACTIVE_RUN]: record }), "el latido"),
    );
    return true;
  }

  async function waitForQueue(timeoutMs) {
    let timer;
    const timeout = new Promise((resolve) => {
      timer = setTimer(() => resolve(false), timeoutMs);
    });
    const drained = queue.then(() => true);
    const flushed = await Promise.race([drained, timeout]);
    clearTimer(timer);
    return flushed;
  }

  // Cierra la corrida: run_end, fila final del índice, lastRunResult y borrado
  // de activeRun; espera a vaciar la cola con un tope de 5 s.
  async function close(runResult, { timeoutMs = CLOSE_FLUSH_TIMEOUT_MS } = {}) {
    if (closed) return { flushed: true, degraded };
    const endEntry = log(makeRunEndEntry(runResult));
    closed = true;
    row.finishedAt = endEntry.ts;
    row.status = runResult.status;
    enqueue(() => persistIndex());
    enqueue(async () => {
      await runWithRetry(
        () => storage.set({ [STORAGE_KEYS.LAST_RUN_RESULT]: makeStoredRunRecord(runResult) }),
        "el último resultado",
      );
      await runWithRetry(() => storage.remove(STORAGE_KEYS.ACTIVE_RUN), "la corrida activa");
    });
    const flushed = await waitForQueue(timeoutMs);
    return { flushed, degraded };
  }

  return {
    start,
    log,
    updateActiveRun,
    close,
    flush: () => queue,
    isClosed: () => closed,
    isDegraded: () => degraded,
    getRow: () => ({ ...row }),
  };
}
