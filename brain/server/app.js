// brain/server/app.js — Servidor HTTP del cerebro con node:http, sin framework
// (C1 2.0.0, C2 1.1.0, C3 1.0.0). Cadena de filtros en el orden de
// security-design.md §1: CORS → tamaño (contador de 256 KB) → autenticación →
// límites → esquema → inventario → modelo → validación de salida → registro.
// - X-Request-Id en toda respuesta y requestId en el cuerpo de los errores (NFR3.9);
// - errores solo del catálogo fijo (BR7.2), nunca con datos del pedido;
// - plazo de 25 s desde la llegada, arranque en frío incluido (NFR8.4);
// - una línea de registro por operación, con lista blanca y métricas EMF (NFR3.6).

import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { errorResponse } from "../core/error-catalog.js";
import { toLogRecord, withRequestMetrics } from "../core/log-record.js";
import {
  validateInterpretRequest,
  validateResidueRequest,
  validateWafRequest,
} from "../core/request-validators.js";

const ROUTES = {
  "/interpret": { operation: "interpret", validate: validateInterpretRequest, run: "interpret" },
  "/map-residue": { operation: "map_residue", validate: validateResidueRequest, run: "mapResidue" },
  "/waf-evaluate": { operation: "waf_post_fill", validate: validateWafRequest, run: "wafEvaluate" },
};

class Rejection {
  constructor(code, extra = {}) {
    this.code = code;
    this.retryAfterSeconds = extra.retryAfterSeconds;
    this.closeConnection = Boolean(extra.closeConnection);
  }
}

// Lee el cuerpo con un contador: corta al pasar el tope sin bufferizar el resto
// (la conexión se cierra después de responder).
function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const tooLarge = () => new Rejection("bad_request", { closeConnection: true });
    const declared = Number(req.headers["content-length"]);
    if (Number.isFinite(declared) && declared > maxBytes) {
      reject(tooLarge());
      return;
    }
    const chunks = [];
    let total = 0;
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        req.removeAllListeners("data");
        req.pause();
        reject(tooLarge());
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", () => reject(new Rejection("bad_request")));
  });
}

function isJsonContentType(header) {
  return typeof header === "string" && /^application\/json\b/i.test(header);
}

export function createBrainApp({
  auth,
  usage,
  operations,
  loader,
  config,
  clock = { now: Date.now },
  log = (record) => process.stdout.write(`${JSON.stringify(record)}\n`),
  salt = "",
  newRequestId = randomUUID,
}) {
  const allowedOrigins = new Set(config.allowedOrigins);

  function corsHeaders(origin) {
    if (!origin || !allowedOrigins.has(origin)) return {};
    return {
      "access-control-allow-origin": origin,
      "access-control-expose-headers": "X-Request-Id",
      vary: "Origin",
    };
  }

  function send(res, status, body, headers = {}) {
    if (res.headersSent) return;
    res.writeHead(status, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    });
    res.end(body === undefined ? undefined : JSON.stringify(body));
  }

  function writeLog(entry) {
    log(withRequestMetrics(toLogRecord(entry, { salt }), clock.now()));
  }

  function handleHealth(res, requestId) {
    const health = loader.health();
    const headers = { "x-request-id": requestId };
    if (!health.ready) {
      send(res, 503, { status: "inventory_unavailable", requestId }, headers);
      return;
    }
    send(
      res,
      200,
      {
        status: "ok",
        inventoryVersion: health.version,
        inventoryAgeDays: health.ageDays,
        inventoryStale: health.stale,
      },
      headers,
    );
  }

  function handlePreflight(req, res, requestId) {
    const origin = req.headers.origin;
    if (!origin || !allowedOrigins.has(origin)) {
      send(res, 400, errorResponse("bad_request", { requestId }).body, {
        "x-request-id": requestId,
      });
      return;
    }
    res.writeHead(204, {
      ...corsHeaders(origin),
      "access-control-allow-methods": "POST",
      "access-control-allow-headers": "authorization, content-type",
      "access-control-max-age": "600",
      "x-request-id": requestId,
    });
    res.end();
  }

  // Ejecuta la cadena de filtros y la operación; devuelve { status, body, usage, principal }.
  async function runChain(req, route, deadline, entry) {
    const origin = req.headers.origin;
    if (origin !== undefined && !allowedOrigins.has(origin)) throw new Rejection("bad_request");
    if (!isJsonContentType(req.headers["content-type"])) throw new Rejection("bad_request");
    const raw = await readBody(req, config.maxBodyBytes);
    const authResult = await auth.authenticate(req.headers.authorization);
    if (!authResult.ok) throw new Rejection("unauthorized");
    const principal = authResult.principal;
    entry.sub = principal.sub;
    const allowed = await usage.check(principal);
    if (!allowed.ok) throw new Rejection(allowed.code, allowed);
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new Rejection("bad_request");
    }
    const checked = route.validate(body);
    if (!checked.ok) throw new Rejection("bad_request");
    if (route.run === "wafEvaluate" && checked.value.phase === "pre_fill") {
      entry.operation = "waf_pre_fill";
    }
    if (!loader.getInventory()) {
      // Arranque en frío: espera la carga con tope de 4 s dentro del mismo plazo.
      const ready = await loader.waitReady(Math.min(config.initDeadlineMs, deadline - clock.now()));
      if (!ready) throw new Rejection("inventory_unavailable");
    }
    const result = await operations[route.run](checked.value, { deadline });
    Object.assign(entry, result.usage);
    const tokens = (result.usage?.inputTokens ?? 0) + (result.usage?.outputTokens ?? 0);
    if (tokens > 0) await usage.record(principal, tokens);
    if (!result.ok) throw new Rejection(result.code, result);
    return result.body;
  }

  function withDeadline(promise, deadline) {
    let timer;
    const expired = new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Rejection("timeout")),
        Math.max(0, deadline - clock.now()),
      );
    });
    return Promise.race([promise, expired]).finally(() => clearTimeout(timer));
  }

  async function handleOperation(req, res, route, requestId, arrival) {
    const deadline = arrival + config.opDeadlineMs;
    const entry = { requestId, operation: route.operation };
    const headers = { ...corsHeaders(req.headers.origin), "x-request-id": requestId };
    try {
      const body = await withDeadline(runChain(req, route, deadline, entry), deadline);
      send(res, 200, body, headers);
      writeLog({ ...entry, code: "ok", status: 200, latencyMs: clock.now() - arrival });
    } catch (error) {
      const code = error instanceof Rejection ? error.code : "internal_error";
      const response = errorResponse(code, {
        requestId,
        retryAfterSeconds: error?.retryAfterSeconds,
      });
      const extra = response.body.retryAfterSeconds
        ? { "retry-after": String(response.body.retryAfterSeconds) }
        : {};
      if (error?.closeConnection) {
        extra.connection = "close";
        res.once("finish", () => req.destroy());
      }
      send(res, response.status, response.body, { ...headers, ...extra });
      writeLog({
        ...entry,
        code: response.body.code,
        status: response.status,
        latencyMs: clock.now() - arrival,
      });
    }
  }

  return createServer((req, res) => {
    const arrival = clock.now();
    const requestId = newRequestId();
    const path = (req.url ?? "").split("?")[0];
    if (req.method === "GET" && path === "/health") {
      handleHealth(res, requestId);
      return;
    }
    const route = Object.hasOwn(ROUTES, path) ? ROUTES[path] : null;
    if (req.method === "OPTIONS" && route) {
      handlePreflight(req, res, requestId);
      return;
    }
    if (req.method !== "POST" || !route) {
      send(res, 400, errorResponse("bad_request", { requestId }).body, {
        "x-request-id": requestId,
      });
      return;
    }
    handleOperation(req, res, route, requestId, arrival);
  });
}
