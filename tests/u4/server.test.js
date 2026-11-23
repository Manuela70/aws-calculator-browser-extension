import { request as httpRequest } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createAuthFilter } from "../../brain/core/auth-filter.js";
import { InventoryLoadError } from "../../brain/core/errors.js";
import { createInventoryLoader } from "../../brain/core/inventory-loader.js";
import { createModelGateway } from "../../brain/core/model-gateway.js";
import { createOperations } from "../../brain/core/operations.js";
import { createUsageGuard } from "../../brain/core/usage-guard.js";
import { createBrainApp } from "../../brain/server/app.js";
import { readEnvConfig, slotsPerInstance } from "../../brain/server/config.js";
import { loadFixture, memoryLogger, readFixtureText, sha256 } from "./helpers.js";
import { EXTENSION_CLIENT, ISSUER, createKey, fakeJwks, signToken } from "./token-helpers.js";

const ORIGIN = "chrome-extension://abcdefghijklmnop";
const KEY = createKey("server-key");
const clock = { now: Date.now };

// Doble de Bedrock: responde según la operación (lo deduce del prompt de sistema).
function fakeModel(outputs) {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    async invoke({ system, user }) {
      calls += 1;
      if (system === "W") {
        const services = JSON.parse(user).services;
        const perService = services.map((s) => ({
          serviceIndex: s.serviceIndex,
          service: s.name,
          noFindings: true,
        }));
        return { text: JSON.stringify({ perService }), inputTokens: 40, outputTokens: 8 };
      }
      const text = JSON.stringify(system === "I" ? outputs.interpretValid : outputs.residueValid);
      return { text, inputTokens: 100, outputTokens: 20 };
    },
  };
}

// Doble de S3 para el inventario: puntero y versión del fixture.
function fakeInventoryStore({ empty = false } = {}) {
  const text = readFixtureText("inventory-small.json");
  return {
    async readPointer() {
      return empty ? null : { version: "2026-11-21", sha256: sha256(text), previous: null };
    },
    async readVersion(version, expected) {
      if (sha256(text) !== expected) throw new InventoryLoadError("sha256_mismatch");
      return text;
    },
  };
}

// Doble de DynamoDB para el uso.
function fakeUsageStore() {
  const counters = new Map();
  return {
    async increment(pk, amount) {
      counters.set(pk, (counters.get(pk) ?? 0) + amount);
      return counters.get(pk);
    },
    async get(pk) {
      return counters.get(pk) ?? 0;
    },
  };
}

const servers = [];

async function startServer({
  perMinute = 60,
  emptyInventory = false,
  operationsOverride,
  initDeadlineMs = 4_000,
} = {}) {
  const logger = memoryLogger();
  const model = fakeModel(loadFixture("model-outputs.json"));
  const loader = createInventoryLoader({
    store: fakeInventoryStore({ empty: emptyInventory }),
    parse: async (text) => JSON.parse(text),
    clock,
    config: { reloadMs: 300_000, startupRetryMs: 30_000, staleAfterDays: 14 },
  });
  await loader.loadInitial();
  const auth = createAuthFilter({
    jwks: fakeJwks([KEY]),
    issuer: ISSUER,
    allowedClientIds: [EXTENSION_CLIENT],
    clock,
  });
  await auth.init();
  const usage = createUsageGuard({
    store: fakeUsageStore(),
    clock,
    limits: {
      perMinute,
      dailyTokenCap: 100_000,
      globalDailyTokenCap: 1_000_000,
      maxInstances: 2,
    },
  });
  const gateway = createModelGateway({
    invoke: model.invoke,
    clock,
    config: {
      slots: 7,
      attemptTimeoutMs: 10_000,
      minSecondAttemptMs: 6_000,
      retryBackoffMinMs: 1_000,
      retryBackoffMaxMs: 2_000,
      secondAttemptMarginMs: 2_000,
      initialLatencyMs: 6_000,
      latencyWindow: 50,
      rateLimitedRetryAfterSeconds: 5,
    },
  });
  const operations =
    operationsOverride ??
    createOperations({
      gateway,
      getInventory: loader.getInventory,
      instructions: { interpret: "I", mapResidue: "R", waf: "W" },
      maxTokens: { interpret: 1200, map_residue: 600, waf_evaluate: 2200 },
      wafBatchSize: 5,
    });
  const server = createBrainApp({
    auth,
    usage,
    operations,
    loader,
    clock,
    log: logger.write,
    salt: "sal-de-prueba",
    config: {
      allowedOrigins: [ORIGIN],
      opDeadlineMs: 25_000,
      initDeadlineMs,
      maxBodyBytes: 256 * 1024,
    },
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push(server);
  return { port: server.address().port, logger, model };
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((resolve) => s.close(resolve))));
});

function call(port, { method = "POST", path, body, headers = {} }) {
  const payload =
    body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: "127.0.0.1", port, method, path, headers }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: text ? JSON.parse(text) : null,
        });
      });
    });
    req.on("error", reject);
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

const authHeaders = (claims) => ({
  authorization: `Bearer ${signToken(KEY, claims)}`,
  "content-type": "application/json",
  origin: ORIGIN,
});

const requests = () => loadFixture("requests.json");

describe("servidor HTTP del cerebro (integración)", () => {
  it("responde /interpret con 200, inventoryVersion, X-Request-Id y CORS del origen permitido", async () => {
    const { port, logger } = await startServer();
    const res = await call(port, {
      path: "/interpret",
      body: requests().interpret,
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "interpreted", inventoryVersion: "2026-11-21" });
    expect(res.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.headers["access-control-allow-origin"]).toBe(ORIGIN);
    const record = JSON.parse(logger.lines[0]);
    expect(record).toMatchObject({ operation: "interpret", code: "ok", status: 200, attempts: 1 });
    expect(record.requestId).toBe(res.headers["x-request-id"]);
  });

  it("responde /map-residue y /waf-evaluate con sus contratos", async () => {
    const { port, logger } = await startServer();
    const residue = await call(port, {
      path: "/map-residue",
      body: requests().mapResidue,
      headers: authHeaders(),
    });
    expect(residue.status).toBe(200);
    expect(residue.body.actions[0]).toHaveProperty("requestKey", "Storage amount");
    const waf = await call(port, {
      path: "/waf-evaluate",
      body: requests().waf,
      headers: authHeaders(),
    });
    expect(waf.status).toBe(200);
    expect(waf.body.perService).toHaveLength(2);
    expect(JSON.parse(logger.lines[1]).operation).toBe("waf_pre_fill");
  });

  it("el registro no contiene el cuerpo, la salida del modelo ni el token", async () => {
    const { port, logger } = await startServer();
    const body = { ...requests().interpret, text: "S3 Standard para el Proyecto Zafiro de 100 GB" };
    const res = await call(port, { path: "/interpret", body, headers: authHeaders() });
    expect(res.status).toBe(200);
    const text = logger.text();
    expect(text).not.toContain("Zafiro");
    expect(text).not.toContain("S3 Standard storage");
    expect(text).not.toContain("se-0001");
    expect(text).not.toContain("Bearer");
  });

  it("rechaza un origen no permitido y atiende el preflight del permitido", async () => {
    const { port, model } = await startServer();
    const res = await call(port, {
      path: "/interpret",
      body: requests().interpret,
      headers: { ...authHeaders(), origin: "chrome-extension://otro" },
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("bad_request");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
    expect(model.calls).toBe(0);
    const preflight = await call(port, {
      method: "OPTIONS",
      path: "/interpret",
      headers: { origin: ORIGIN, "access-control-request-method": "POST" },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers["access-control-allow-methods"]).toBe("POST");
    const badPreflight = await call(port, { method: "OPTIONS", path: "/interpret", headers: {} });
    expect(badPreflight.status).toBe(400);
  });

  it("rechaza un cuerpo de más de 256 KB con 400 antes de autenticar", async () => {
    const { port, logger } = await startServer();
    const big = JSON.stringify({ text: "x".repeat(256 * 1024), schemaVersion: 1 });
    const res = await call(port, {
      path: "/interpret",
      body: big,
      headers: { "content-type": "application/json", origin: ORIGIN },
    });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: "bad_request" });
    expect(res.body.requestId).toBe(res.headers["x-request-id"]);
    expect(JSON.parse(logger.lines[0]).seHash).toBeNull();
  });

  it("sin token responde 401 unauthorized", async () => {
    const { port } = await startServer();
    const headers = { "content-type": "application/json", origin: ORIGIN };
    const res = await call(port, { path: "/interpret", body: requests().interpret, headers });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("unauthorized");
  });

  it("al superar el límite por minuto responde 429 con retryAfterSeconds", async () => {
    const { port } = await startServer({ perMinute: 2 });
    const send = () =>
      call(port, { path: "/interpret", body: requests().interpret, headers: authHeaders() });
    expect((await send()).status).toBe(200);
    expect((await send()).status).toBe(200);
    const limited = await send();
    expect(limited.status).toBe(429);
    expect(limited.body.code).toBe("rate_limited");
    expect(Number.isInteger(limited.body.retryAfterSeconds)).toBe(true);
    expect(limited.headers["retry-after"]).toBe(String(limited.body.retryAfterSeconds));
  });

  it("sin inventario responde 503 inventory_unavailable y /health 503", async () => {
    const { port, model } = await startServer({ emptyInventory: true, initDeadlineMs: 30 });
    const res = await call(port, {
      path: "/interpret",
      body: requests().interpret,
      headers: authHeaders(),
    });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe("inventory_unavailable");
    expect(model.calls).toBe(0);
    const health = await call(port, { method: "GET", path: "/health" });
    expect(health.status).toBe(503);
  });

  it("/health responde 200 con la versión del inventario", async () => {
    const { port } = await startServer();
    const health = await call(port, { method: "GET", path: "/health" });
    expect(health.status).toBe(200);
    expect(health.body).toMatchObject({ status: "ok", inventoryVersion: "2026-11-21" });
    expect(health.headers["x-request-id"]).toBeDefined();
  });

  it("rechaza JSON inválido, esquema inválido, tipo de contenido y rutas desconocidas", async () => {
    const { port } = await startServer();
    const badJson = await call(port, { path: "/interpret", body: "{no", headers: authHeaders() });
    expect(badJson.status).toBe(400);
    const badSchema = await call(port, {
      path: "/interpret",
      body: { text: "x", schemaVersion: 9 },
      headers: authHeaders(),
    });
    expect(badSchema.status).toBe(400);
    const badType = await call(port, {
      path: "/interpret",
      body: requests().interpret,
      headers: { ...authHeaders(), "content-type": "text/plain" },
    });
    expect(badType.status).toBe(400);
    const unknown = await call(port, { path: "/admin", body: {}, headers: authHeaders() });
    expect(unknown.status).toBe(400);
  });

  it("una excepción no prevista responde 500 internal_error sin detalles", async () => {
    const operationsOverride = {
      interpret: async () => {
        throw new Error("detalle interno con /ruta/secreta");
      },
    };
    const { port } = await startServer({ operationsOverride });
    const res = await call(port, {
      path: "/interpret",
      body: requests().interpret,
      headers: authHeaders(),
    });
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain("secreta");
  });

  it("propaga el código de error de la operación con su estado HTTP", async () => {
    const operationsOverride = {
      interpret: async () => ({
        ok: false,
        code: "model_unavailable",
        usage: {
          operation: "interpret",
          inventoryVersion: "2026-11-21",
          attempts: 2,
          inputTokens: 10,
          outputTokens: 0,
        },
      }),
    };
    const { port, logger } = await startServer({ operationsOverride });
    const res = await call(port, {
      path: "/interpret",
      body: requests().interpret,
      headers: authHeaders(),
    });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe("model_unavailable");
    expect(JSON.parse(logger.lines[0])).toMatchObject({ attempts: 2, Errors5xx: 1 });
  });
});

describe("configuración del servidor", () => {
  const env = {
    ALLOWED_ORIGINS: `${ORIGIN}, `,
    ALLOWED_CLIENT_IDS: EXTENSION_CLIENT,
    COGNITO_ISSUER: ISSUER,
    INVENTORY_BUCKET: "brain-inventory-111111111111",
    USAGE_TABLE: "brain-usage",
    DAILY_TOKEN_CAP: "1000",
    GLOBAL_DAILY_TOKEN_CAP: "10000",
    SE_HASH_SALT: "sal",
  };

  it("lee las variables de entorno y calcula los lugares del semáforo", () => {
    const config = readEnvConfig(env);
    expect(config).toMatchObject({ port: 8080, allowedOrigins: [ORIGIN], dailyTokenCap: 1000 });
    expect(slotsPerInstance({ globalInFlight: 15, maxInstances: 2 })).toBe(7);
  });

  it("falla rápido si falta una variable, si un tope no es positivo o si hay origen *", () => {
    expect(() => readEnvConfig({ ...env, USAGE_TABLE: "" })).toThrow("USAGE_TABLE");
    expect(() => readEnvConfig({ ...env, DAILY_TOKEN_CAP: "-1" })).toThrow("DAILY_TOKEN_CAP");
    expect(() => readEnvConfig({ ...env, ALLOWED_ORIGINS: "*" })).toThrow("*");
  });

  it("acepta un rol de otra cuenta para Bedrock y rechaza un valor que no es ARN de rol", () => {
    expect(readEnvConfig(env).bedrockRoleArn).toBeUndefined();
    const arn = "arn:aws:iam::222222222222:role/brain-bedrock-invoke";
    expect(readEnvConfig({ ...env, BEDROCK_ROLE_ARN: arn }).bedrockRoleArn).toBe(arn);
    expect(() => readEnvConfig({ ...env, BEDROCK_ROLE_ARN: "brain-bedrock-invoke" })).toThrow(
      "BEDROCK_ROLE_ARN",
    );
  });
});
