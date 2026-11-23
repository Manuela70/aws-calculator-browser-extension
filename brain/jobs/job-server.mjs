// brain/jobs/job-server.mjs — Entrada del InventoryJob en Lambda. AWS Lambda Web
// Adapter entrega el evento del calendario (EventBridge Scheduler) como
// POST /events (AWS_LWA_PASS_THROUGH_PATH); este servidor corre el job una vez por
// evento. Un job rechazado por la validación responde 200 (ya emitió
// InventoryJobFailed); una excepción responde 500, la invocación falla y la alarma
// brain-inventory-job-errors avisa.

import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { operationalMetric } from "../core/log-record.js";
import { runFromEnvironment } from "./build-inventory.mjs";

export function createJobServer({ runJob, log, now = Date.now }) {
  let running = false;
  return createServer((req, res) => {
    const reply = (status, body) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (req.method === "GET" && req.url === "/health") return reply(200, { ok: true });
    if (req.method !== "POST" || req.url !== "/events") return reply(404, { ok: false });
    req.resume(); // el cuerpo del evento no se usa
    if (running) return reply(409, { ok: false, reason: "already_running" });
    running = true;
    runJob()
      .then((result) => reply(200, { ok: true, status: result.status }))
      .catch((error) => {
        log({ event: "inventory_job_failed", reason: error.message });
        log(operationalMetric("InventoryJobFailed", 1, now()));
        reply(500, { ok: false, reason: "job_failed" });
      })
      .finally(() => {
        running = false;
      });
  });
}

const invokedDirectly = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invokedDirectly) {
  const log = (record) => process.stdout.write(`${JSON.stringify(record)}\n`);
  const port = Number(process.env.PORT ?? 8080);
  createJobServer({ runJob: () => runFromEnvironment(log), log }).listen(port, () =>
    log({ event: "listening", port }),
  );
}
