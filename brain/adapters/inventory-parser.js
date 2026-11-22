// brain/adapters/inventory-parser.js — Parseo y validación de una versión del
// inventario en un hilo de trabajo (worker_threads), para no bloquear las
// peticiones en curso durante la recarga (NFR1.8, NFR8.7).

import { Worker } from "node:worker_threads";
import { InventoryLoadError } from "../core/errors.js";

const WORKER_URL = new URL("./inventory-parse-worker.js", import.meta.url);

export function parseInventoryInWorker(text) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER_URL, { workerData: { text } });
    worker.once("message", (message) => {
      if (message.ok) resolve(message.snapshot);
      else reject(new InventoryLoadError("invalid_snapshot"));
    });
    worker.once("error", (error) =>
      reject(new InventoryLoadError("parse_failed", { cause: error })),
    );
    worker.once("exit", (code) => {
      if (code !== 0) reject(new InventoryLoadError("parse_failed"));
    });
  });
}
