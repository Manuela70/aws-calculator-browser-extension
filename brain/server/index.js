// brain/server/index.js — Punto de entrada del contenedor `brain-api`: arma los
// adaptadores reales de AWS (identidad IAM de la tarea, sin claves), arranca la
// carga del inventario y del JWKS y abre el puerto. El chequeo de salud responde
// 503 hasta que haya inventario, así el ALB no envía tráfico a una tarea vacía.

import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";
import { createBedrockClient } from "../adapters/bedrock-client.js";
import { parseInventoryInWorker } from "../adapters/inventory-parser.js";
import { createInventoryStore } from "../adapters/inventory-store.js";
import { createJwksClient } from "../adapters/jwks-client.js";
import { createUsageStore } from "../adapters/usage-store.js";
import { createAuthFilter } from "../core/auth-filter.js";
import { createInventoryLoader } from "../core/inventory-loader.js";
import { MAX_BODY_BYTES } from "../core/limits.js";
import { operationalMetric } from "../core/log-record.js";
import { createModelGateway } from "../core/model-gateway.js";
import { createOperations } from "../core/operations.js";
import { createUsageGuard } from "../core/usage-guard.js";
import { createBrainApp } from "./app.js";
import { loadPrompts, loadStaticConfig, readEnvConfig, slotsPerInstance } from "./config.js";

const clock = { now: Date.now };
const log = (record) => process.stdout.write(`${JSON.stringify(record)}\n`);
const emitMetric = (name, value) => log(operationalMetric(name, value, clock.now()));

function main() {
  const staticConfig = loadStaticConfig();
  const env = readEnvConfig(process.env);
  const { timing, concurrency, usage: usageConfig, model, inventory } = staticConfig;
  const region = env.region ?? model.region;

  const bedrock = createBedrockClient({
    runtime: new BedrockRuntimeClient({ region: model.region }),
    modelId: model.modelId,
    anthropicVersion: model.anthropicVersion,
  });
  const inventoryStore = createInventoryStore({
    s3: new S3Client({ region }),
    bucket: env.inventoryBucket,
  });
  const usageStore = createUsageStore({
    dynamo: new DynamoDBClient({ region, maxAttempts: 1 }),
    table: env.usageTable,
    timeoutMs: timing.usageStoreTimeoutMs,
  });

  const auth = createAuthFilter({
    jwks: createJwksClient({ issuer: env.issuer }),
    issuer: env.issuer,
    allowedClientIds: env.allowedClientIds,
    probeClientId: env.probeClientId,
    clock,
    refreshMs: timing.jwksRefreshMs,
    unknownKidMinIntervalMs: timing.jwksUnknownKidMinIntervalMs,
    clockToleranceSec: timing.clockToleranceSec,
  });
  const usage = createUsageGuard({
    store: usageStore,
    clock,
    emitMetric,
    limits: {
      perMinute: usageConfig.perMinute,
      probePerMinute: usageConfig.probePerMinute,
      dailyTokenCap: env.dailyTokenCap,
      globalDailyTokenCap: env.globalDailyTokenCap,
      probeDailyTokenCap: env.probeDailyTokenCap,
      maxInstances: concurrency.maxInstances,
    },
  });
  const loader = createInventoryLoader({
    store: inventoryStore,
    parse: parseInventoryInWorker,
    clock,
    emitMetric,
    config: {
      reloadMs: timing.inventoryReloadMs,
      startupRetryMs: timing.inventoryStartupRetryMs,
      staleAfterDays: inventory.staleAfterDays,
    },
  });
  const gateway = createModelGateway({
    invoke: bedrock.invoke,
    clock,
    config: {
      slots: slotsPerInstance(concurrency),
      attemptTimeoutMs: timing.attemptTimeoutMs,
      minSecondAttemptMs: timing.minSecondAttemptMs,
      retryBackoffMinMs: timing.retryBackoffMinMs,
      retryBackoffMaxMs: timing.retryBackoffMaxMs,
      secondAttemptMarginMs: timing.secondAttemptMarginMs,
      initialLatencyMs: concurrency.initialLatencyMs,
      latencyWindow: concurrency.latencyWindow,
      rateLimitedRetryAfterSeconds: usageConfig.rateLimitedRetryAfterSeconds,
    },
  });
  const operations = createOperations({
    gateway,
    getInventory: loader.getInventory,
    instructions: loadPrompts(),
    maxTokens: model.maxTokens,
    wafBatchSize: concurrency.wafBatchSize,
  });

  const server = createBrainApp({
    auth,
    usage,
    operations,
    loader,
    clock,
    log,
    salt: env.seHashSalt,
    config: {
      allowedOrigins: env.allowedOrigins,
      opDeadlineMs: timing.opDeadlineMs,
      initDeadlineMs: timing.initDeadlineMs,
      maxBodyBytes: MAX_BODY_BYTES,
    },
  });
  // El ALB cierra conexiones inactivas a los 35 s; el servidor las mantiene un poco más.
  server.keepAliveTimeout = 40_000;
  server.headersTimeout = 41_000;

  auth.init(); // carga del JWKS; si falla, se reintenta en la primera petición
  loader.start();
  server.listen(env.port, () => log({ event: "listening", port: env.port }));

  const shutdown = () => {
    loader.stop();
    server.close(() => process.exit(0));
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

try {
  main();
} catch (error) {
  log({ event: "startup_failed", reason: error.message });
  process.exit(1);
}
