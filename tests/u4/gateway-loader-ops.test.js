import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InventoryLoadError, ModelError } from "../../brain/core/errors.js";
import { createInventoryLoader } from "../../brain/core/inventory-loader.js";
import { createModelGateway } from "../../brain/core/model-gateway.js";
import { createOperations, toBatches } from "../../brain/core/operations.js";
import { loadFixture, sha256, smallInventory } from "./helpers.js";

const CONFIG = {
  slots: 1,
  attemptTimeoutMs: 10_000,
  minSecondAttemptMs: 6_000,
  retryBackoffMinMs: 1_000,
  retryBackoffMaxMs: 2_000,
  secondAttemptMarginMs: 2_000,
  initialLatencyMs: 6_000,
  latencyWindow: 50,
  rateLimitedRetryAfterSeconds: 5,
};

const clock = { now: () => Date.now() };

// Doble de Bedrock: cada llamada consume el siguiente guion
// ({ text } | { error: kind } | { hang: true } | { delay, text }).
function scriptedModel(script) {
  const calls = [];
  const invoke = vi.fn((request) => {
    calls.push(request);
    const step = script[Math.min(calls.length - 1, script.length - 1)];
    if (step.hang) return new Promise(() => {});
    if (step.error) return Promise.reject(new ModelError(step.error));
    const result = { text: step.text, inputTokens: 100, outputTokens: 20 };
    if (step.delay) return new Promise((resolve) => setTimeout(() => resolve(result), step.delay));
    return Promise.resolve(result);
  });
  return { invoke, calls };
}

function gatewayWith(script, config = CONFIG) {
  const model = scriptedModel(script);
  const gateway = createModelGateway({ invoke: model.invoke, clock, config, random: () => 0 });
  return { gateway, model };
}

const validJson = (text) =>
  text === "VALID" ? { ok: true, value: "ok" } : { ok: false, error: "salida inválida" };

function job(deadlineIn = 25_000) {
  return {
    deadline: Date.now() + deadlineIn,
    maxTokens: 600,
    buildPrompt: (previousError) => ({ system: "S", user: previousError ?? "U" }),
    validate: validJson,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.parse("2026-11-22T15:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ModelGateway (regla única de reintentos)", () => {
  it("responde en el primer intento válido", async () => {
    const { gateway } = gatewayWith([{ text: "VALID" }]);
    const result = await gateway.run(job());
    expect(result).toMatchObject({ ok: true, value: "ok", attempts: 1, inputTokens: 100 });
  });

  it("reintenta una salida inválida sin espera, pasando el motivo, y luego empty_result", async () => {
    const { gateway, model } = gatewayWith([{ text: "MALO" }, { text: "MALO" }]);
    const result = await gateway.run(job());
    expect(result).toMatchObject({
      ok: false,
      code: "empty_result",
      attempts: 2,
      inputTokens: 200,
    });
    expect(model.calls[1].user).toBe("salida inválida");
  });

  it("con salida inválida y sin 6 s restantes no hay segundo intento", async () => {
    const { gateway, model } = gatewayWith([{ text: "MALO", delay: 4_000 }]);
    const pending = gateway.run(job(9_000));
    await vi.advanceTimersByTimeAsync(4_000);
    expect(await pending).toMatchObject({ ok: false, code: "empty_result", attempts: 1 });
    expect(model.invoke).toHaveBeenCalledTimes(1);
  });

  it("reintenta un throttling tras la espera y responde; dos throttlings → 429 con 5 s", async () => {
    const recovered = gatewayWith([{ error: "throttled" }, { text: "VALID" }]);
    const pending = recovered.gateway.run(job());
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await pending).toMatchObject({ ok: true, attempts: 2 });
    const exhausted = gatewayWith([{ error: "throttled" }]);
    const failing = exhausted.gateway.run(job());
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await failing).toMatchObject({
      code: "rate_limited",
      retryAfterSeconds: 5,
      attempts: 2,
    });
  });

  it("5xx repetido → model_unavailable; error del cliente no se reintenta", async () => {
    const server = gatewayWith([{ error: "server" }]);
    const pending = server.gateway.run(job());
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await pending).toMatchObject({ code: "model_unavailable", attempts: 2 });
    const client = gatewayWith([{ error: "client" }]);
    expect(await client.gateway.run(job())).toMatchObject({
      code: "model_unavailable",
      attempts: 1,
    });
  });

  it("aborta al tope por intento y al plazo de 25 s responde timeout", async () => {
    const { gateway, model } = gatewayWith([{ hang: true }]);
    const pending = gateway.run(job());
    await vi.advanceTimersByTimeAsync(25_000);
    const result = await pending;
    expect(result).toMatchObject({ ok: false, code: "timeout", attempts: 2 });
    expect(model.calls[0].signal.aborted).toBe(true);
  });

  it("con el semáforo lleno rechaza con 429 y retryAfterSeconds si la espera no cabe", async () => {
    const { gateway } = gatewayWith([{ text: "VALID", delay: 8_000 }]);
    const first = gateway.run(job());
    const second = gateway.run(job(30_000)); // espera estimada 6 s + 10 s cabe en 30 s
    const third = await gateway.run(job(20_000)); // 2 en cola: 12 s + 10 s > 20 s
    expect(third).toMatchObject({ ok: false, code: "rate_limited", retryAfterSeconds: 12 });
    expect(gateway.stats()).toMatchObject({ active: 1, queued: 1 });
    await vi.advanceTimersByTimeAsync(16_000);
    expect((await first).ok).toBe(true);
    expect((await second).ok).toBe(true);
    expect(gateway.stats().active).toBe(0);
  });

  it("un pedido en cola se abandona al vencer su plazo con timeout", async () => {
    const { gateway } = gatewayWith([{ text: "VALID", delay: 20_000 }]);
    const first = gateway.run(job(25_000));
    const queued = gateway.run(job(17_000));
    await vi.advanceTimersByTimeAsync(17_000);
    expect(await queued).toMatchObject({ ok: false, code: "timeout", attempts: 0 });
    await vi.advanceTimersByTimeAsync(10_000);
    await first;
  });
});

// Almacén de inventario en memoria: versiones por nombre y puntero.
function memoryInventoryStore() {
  const versions = new Map();
  let pointer = null;
  return {
    versions,
    setPointer: (value) => {
      pointer = value;
    },
    async readPointer() {
      return pointer;
    },
    async readVersion(version, expected) {
      const text = versions.get(version);
      if (text === undefined) throw new InventoryLoadError("version_unreadable");
      if (sha256(text) !== expected) throw new InventoryLoadError("sha256_mismatch");
      return text;
    },
  };
}

function storedVersion(store, version, mutate = (s) => s) {
  const snapshot = mutate({ ...smallInventory(), version });
  const text = JSON.stringify(snapshot);
  store.versions.set(version, text);
  return { version, sha256: sha256(text) };
}

const parse = async (text) => {
  const snapshot = JSON.parse(text);
  if (snapshot.status !== "active") throw new InventoryLoadError("invalid_snapshot");
  return snapshot;
};

const LOADER_CONFIG = { reloadMs: 300_000, startupRetryMs: 30_000, staleAfterDays: 14 };

describe("InventoryLoader (NFR1.8)", () => {
  it("arranca con active, informa salud y espera lista", async () => {
    const store = memoryInventoryStore();
    store.setPointer({ ...storedVersion(store, "2026-11-21"), previous: null });
    const loader = createInventoryLoader({ store, parse, clock, config: LOADER_CONFIG });
    const ready = loader.waitReady(4_000);
    await loader.start();
    expect(await ready).toBe(true);
    expect(loader.getInventory().version).toBe("2026-11-21");
    expect(loader.health()).toMatchObject({ ready: true, ageDays: 1, stale: false });
    loader.stop();
  });

  it("si active está dañado al arrancar usa previous", async () => {
    const store = memoryInventoryStore();
    const previous = storedVersion(store, "2026-11-14");
    store.setPointer({ version: "2026-11-21", sha256: "dañado", previous });
    const emitMetric = vi.fn();
    const loader = createInventoryLoader({
      store,
      parse,
      clock,
      config: LOADER_CONFIG,
      emitMetric,
    });
    expect(await loader.loadInitial()).toBe(true);
    expect(loader.getInventory().version).toBe("2026-11-14");
    expect(emitMetric).toHaveBeenCalledWith("InventoryReloadFailed", 1);
  });

  it("sin versión buena queda sin inventario, reintenta cada 30 s y waitReady vence a los 4 s", async () => {
    const store = memoryInventoryStore();
    const loader = createInventoryLoader({ store, parse, clock, config: LOADER_CONFIG });
    await loader.start();
    const ready = loader.waitReady(4_000);
    await vi.advanceTimersByTimeAsync(4_000);
    expect(await ready).toBe(false);
    expect(loader.getInventory()).toBeNull();
    expect(loader.health()).toEqual({ ready: false });
    store.setPointer({ ...storedVersion(store, "2026-11-21"), previous: null });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(loader.getInventory().version).toBe("2026-11-21");
    loader.stop();
  });

  it("una versión activa dañada en la recarga conserva la última versión buena", async () => {
    const store = memoryInventoryStore();
    const good = storedVersion(store, "2026-11-21");
    store.setPointer({ ...good, previous: null });
    const emitMetric = vi.fn();
    const loader = createInventoryLoader({
      store,
      parse,
      clock,
      config: LOADER_CONFIG,
      emitMetric,
    });
    await loader.start();
    const broken = storedVersion(store, "2026-11-28", (s) => ({ ...s, status: "rejected" }));
    store.setPointer({ ...broken, previous: good });
    await vi.advanceTimersByTimeAsync(300_000);
    expect(loader.getInventory().version).toBe("2026-11-21");
    expect(emitMetric).toHaveBeenCalledWith("InventoryReloadFailed", 1);
    expect(emitMetric).toHaveBeenCalledWith("InventoryAgeDays", 1);
    const next = storedVersion(store, "2026-11-29");
    store.setPointer({ ...next, previous: good });
    expect(await loader.reload()).toBe(true);
    expect(loader.getInventory().version).toBe("2026-11-29");
    expect(await loader.reload()).toBe(false); // puntero sin cambios
    loader.stop();
  });

  it("marca la versión como desactualizada pasados 14 días y tolera un puntero ilegible", async () => {
    const store = memoryInventoryStore();
    const old = storedVersion(store, "2026-11-01", (s) => ({
      ...s,
      generatedAt: "2026-11-01T12:00:00.000Z",
    }));
    store.setPointer({ ...old, previous: null });
    const emitMetric = vi.fn();
    const loader = createInventoryLoader({
      store,
      parse,
      clock,
      config: LOADER_CONFIG,
      emitMetric,
    });
    await loader.loadInitial();
    expect(loader.health().stale).toBe(true);
    store.readPointer = async () => Promise.reject(new InventoryLoadError("pointer_unreadable"));
    expect(await loader.reload()).toBe(false);
    expect(await loader.loadInitial()).toBe(false);
    expect(loader.getInventory().version).toBe("2026-11-01");
  });
});

const requests = () => loadFixture("requests.json");
const outputs = () => loadFixture("model-outputs.json");

function operationsWith(script, { inventory = true } = {}) {
  const store = memoryInventoryStore();
  const { gateway, model } = gatewayWith(script, { ...CONFIG, slots: 7 });
  let index = null;
  if (inventory) {
    store.setPointer({ ...storedVersion(store, "2026-11-21"), previous: null });
  }
  const loader = createInventoryLoader({ store, parse, clock, config: LOADER_CONFIG });
  const ops = createOperations({
    gateway,
    getInventory: () => index ?? loader.getInventory(),
    instructions: { interpret: "I", mapResidue: "R", waf: "W" },
    maxTokens: { interpret: 1200, map_residue: 600, waf_evaluate: 2200 },
    wafBatchSize: 5,
  });
  return { ops, model, loader, setIndex: (value) => (index = value) };
}

const deadline = () => ({ deadline: Date.now() + 25_000 });

describe("Operaciones B1-B3", () => {
  it("B1 sin candidatos responde unresolved sin invocar el modelo", async () => {
    const { ops, model, loader } = operationsWith([{ text: "{}" }]);
    await loader.loadInitial();
    const result = await ops.interpret({ text: "un servidor de correo" }, deadline());
    expect(result.body).toEqual({
      status: "unresolved",
      unresolved: [{ fragment: "un servidor de correo", reason: "unknown_service" }],
      inventoryVersion: "2026-11-21",
    });
    expect(model.invoke).not.toHaveBeenCalled();
  });

  it("B1 interpreta el caso canónico con la versión de inventario", async () => {
    const { ops, loader, model } = operationsWith([
      { text: JSON.stringify(outputs().interpretValid) },
    ]);
    await loader.loadInitial();
    const result = await ops.interpret(requests().interpret, deadline());
    expect(result.ok).toBe(true);
    expect(result.body.status).toBe("interpreted");
    expect(result.body.inventoryVersion).toBe("2026-11-21");
    expect(result.usage).toMatchObject({ operation: "interpret", attempts: 1, outcome: "ok" });
    expect(model.calls[0].maxTokens).toBe(1200);
  });

  it("las tres operaciones responden inventory_unavailable sin versión cargada", async () => {
    const { ops } = operationsWith([{ text: "{}" }], { inventory: false });
    for (const result of [
      await ops.interpret(requests().interpret, deadline()),
      await ops.mapResidue(requests().mapResidue, deadline()),
      await ops.wafEvaluate(requests().waf, deadline()),
    ]) {
      expect(result).toMatchObject({ ok: false, code: "inventory_unavailable" });
    }
  });

  it("B2 devuelve acciones con inventoryVersion y propaga empty_result", async () => {
    const good = operationsWith([{ text: JSON.stringify(outputs().residueValid) }]);
    await good.loader.loadInitial();
    const result = await good.ops.mapResidue(requests().mapResidue, deadline());
    expect(result.body.actions).toHaveLength(3);
    expect(result.body.inventoryVersion).toBe("2026-11-21");
    const bad = operationsWith([{ text: "nada" }]);
    await bad.loader.loadInitial();
    const failed = await bad.ops.mapResidue(requests().mapResidue, deadline());
    expect(failed).toMatchObject({ ok: false, code: "empty_result" });
    const b1bad = await bad.ops.interpret(requests().interpret, deadline());
    expect(b1bad).toMatchObject({ ok: false, code: "empty_result" });
  });

  it("B3 divide en lotes de 5 en paralelo y une en orden", async () => {
    const services = Array.from({ length: 7 }, (_, i) => ({ name: `Svc ${i}`, config: {} }));
    const model = scriptedModel([]);
    model.invoke.mockImplementation(async (request) => {
      const payload = JSON.parse(request.user);
      const perService = payload.services.map((s) => ({
        serviceIndex: s.serviceIndex,
        service: s.name,
        noFindings: true,
      }));
      return { text: JSON.stringify({ perService }), inputTokens: 50, outputTokens: 10 };
    });
    const gateway = createModelGateway({
      invoke: model.invoke,
      clock,
      config: { ...CONFIG, slots: 7 },
    });
    const ops = createOperations({
      gateway,
      getInventory: () => ({ version: "2026-11-21" }),
      instructions: { waf: "W" },
      maxTokens: { waf_evaluate: 2200 },
      wafBatchSize: 5,
    });
    const result = await ops.wafEvaluate({ phase: "post_fill", services }, deadline());
    expect(result.body.perService.map((p) => p.serviceIndex)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(result.usage).toMatchObject({ operation: "waf_post_fill", inputTokens: 100 });
    expect(model.invoke).toHaveBeenCalledTimes(2);
    expect(toBatches(services, 5).map((b) => b.length)).toEqual([5, 2]);
  });

  it("B3 falla entera si falla un lote", async () => {
    const services = Array.from({ length: 6 }, (_, i) => ({ name: `Svc ${i}`, config: {} }));
    const model = scriptedModel([]);
    model.invoke.mockImplementation(async (request) => {
      const payload = JSON.parse(request.user);
      if (payload.services[0].serviceIndex === 5)
        return { text: "{}", inputTokens: 1, outputTokens: 1 };
      const perService = payload.services.map((s) => ({
        serviceIndex: s.serviceIndex,
        service: s.name,
        noFindings: true,
      }));
      return { text: JSON.stringify({ perService }), inputTokens: 1, outputTokens: 1 };
    });
    const gateway = createModelGateway({
      invoke: model.invoke,
      clock,
      config: { ...CONFIG, slots: 7 },
    });
    const ops = createOperations({
      gateway,
      getInventory: () => ({ version: "2026-11-21" }),
      instructions: { waf: "W" },
      maxTokens: { waf_evaluate: 2200 },
      wafBatchSize: 5,
    });
    const result = await ops.wafEvaluate({ phase: "pre_fill", services }, deadline());
    expect(result).toMatchObject({ ok: false, code: "empty_result" });
    expect(result.usage.operation).toBe("waf_pre_fill");
    expect(result).not.toHaveProperty("body");
  });
});
