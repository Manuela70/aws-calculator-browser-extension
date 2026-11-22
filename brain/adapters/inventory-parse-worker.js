// brain/adapters/inventory-parse-worker.js — Cuerpo del hilo de trabajo: parsea el
// JSON de la versión y valida su esquema y tamaño. Devuelve la versión o el
// rechazo; los motivos detallados no salen del hilo.

import { parentPort, workerData } from "node:worker_threads";
import { validateSnapshot } from "../core/inventory-model.js";

let message;
try {
  const snapshot = JSON.parse(workerData.text);
  const check = validateSnapshot(snapshot, { byteLength: Buffer.byteLength(workerData.text) });
  message = check.ok ? { ok: true, snapshot } : { ok: false };
} catch {
  message = { ok: false };
}
parentPort.postMessage(message);
