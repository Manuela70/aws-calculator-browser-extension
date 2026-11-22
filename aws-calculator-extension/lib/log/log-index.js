// lib/log/log-index.js — Filas del índice runLogIndex (NFR3.11, NFR8.10, NFR8.11).
// PROVISIONAL (U1, walking skeleton). Dueño final: U1 (compartido).
// Funciones puras sobre la lista del índice: nunca mutan la lista recibida.

import { STORAGE_KEYS } from "../messages.js";
import { LOG_EVENTS } from "./log-format.js";

export const INTERRUPTED = "interrupted";

export function chunkKey(runId, chunkIndex) {
  return `${STORAGE_KEYS.RUN_LOG_PREFIX}${runId}:${chunkIndex}`;
}

// "runLog:<runId>:<n>" → { runId, chunkIndex } o null si la clave no es de registro.
export function parseChunkKey(key) {
  if (typeof key !== "string" || !key.startsWith(STORAGE_KEYS.RUN_LOG_PREFIX)) return null;
  const rest = key.slice(STORAGE_KEYS.RUN_LOG_PREFIX.length);
  const sep = rest.lastIndexOf(":");
  if (sep <= 0) return null;
  const chunkIndex = Number(rest.slice(sep + 1));
  if (!Number.isInteger(chunkIndex) || chunkIndex < 0) return null;
  return { runId: rest.slice(0, sep), chunkIndex };
}

export function chunkKeysForRow(row) {
  const keys = [];
  for (let i = 0; i < row.chunks; i++) keys.push(chunkKey(row.runId, i));
  return keys;
}

export function createIndexRow(runId, startedAt) {
  return { runId, startedAt, finishedAt: null, status: null, chunks: 1, bytes: 0, degraded: false };
}

function asList(index) {
  return Array.isArray(index) ? index : [];
}

// Alta o reemplazo de la fila de una corrida.
export function upsertRow(index, row) {
  const list = asList(index).filter((existing) => existing.runId !== row.runId);
  return [...list, { ...row }];
}

// Actualiza campos de una fila (chunks, bytes, finishedAt, status, degraded).
export function updateRow(index, runId, patch) {
  return asList(index).map((row) => (row.runId === runId ? { ...row, ...patch } : row));
}

export function removeRow(index, runId) {
  return asList(index).filter((row) => row.runId !== runId);
}

export function findRow(index, runId) {
  return asList(index).find((row) => row.runId === runId) ?? null;
}

// Una fila sin finishedAt (sin run_end) se muestra como "interrumpida".
export function getRowState(row) {
  return row.finishedAt ? row.status : INTERRUPTED;
}

export function totalBytes(index) {
  return asList(index).reduce((sum, row) => sum + (Number(row.bytes) || 0), 0);
}

export function durationMs(row) {
  if (!row.startedAt || !row.finishedAt) return null;
  const ms = Date.parse(row.finishedAt) - Date.parse(row.startedAt);
  return Number.isFinite(ms) ? ms : null;
}

function summarizeRun(runId, chunks) {
  const ordered = [...chunks].sort((a, b) => a.chunkIndex - b.chunkIndex);
  const entries = ordered.flatMap((c) => (Array.isArray(c.entries) ? c.entries : []));
  const start = entries.find((e) => e.event === LOG_EVENTS.RUN_START) ?? entries[0];
  const end = entries.find((e) => e.event === LOG_EVENTS.RUN_END);
  return {
    ...createIndexRow(runId, start?.ts ?? null),
    finishedAt: end?.ts ?? null,
    status: end?.value ?? null,
    chunks: ordered[ordered.length - 1].chunkIndex + 1,
    bytes: ordered.reduce((sum, c) => sum + JSON.stringify(c.entries ?? []).length, 0),
  };
}

// "Reparar índice": reconstruye el índice desde todas las claves runLog:*
// (resultado de get(null)). Es la única operación que lee todo el almacenamiento.
export function rebuildIndex(allItems) {
  const byRun = new Map();
  for (const [key, entries] of Object.entries(allItems ?? {})) {
    const parsed = parseChunkKey(key);
    if (!parsed) continue;
    if (!byRun.has(parsed.runId)) byRun.set(parsed.runId, []);
    byRun.get(parsed.runId).push({ chunkIndex: parsed.chunkIndex, entries });
  }
  const rows = [...byRun.entries()].map(([runId, chunks]) => summarizeRun(runId, chunks));
  return rows.sort((a, b) => String(a.startedAt).localeCompare(String(b.startedAt)));
}
