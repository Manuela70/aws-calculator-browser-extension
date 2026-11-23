import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildRequestBody,
  classifyBedrockError,
  createBedrockClient,
} from "../../brain/adapters/bedrock-client.js";
import { parseInventoryInWorker } from "../../brain/adapters/inventory-parser.js";
import {
  ACTIVE_KEY,
  createInventoryStore,
  sha256Hex,
  versionKey,
} from "../../brain/adapters/inventory-store.js";
import { createJwksClient, jwksUrl } from "../../brain/adapters/jwks-client.js";
import { createUsageStore } from "../../brain/adapters/usage-store.js";
import { InventoryLoadError, ModelError, StoreUnavailableError } from "../../brain/core/errors.js";
import { readFixtureText } from "./helpers.js";

// Doble de S3 en memoria con la interfaz send(command) del SDK.
function fakeS3(objects = {}) {
  const store = new Map(Object.entries(objects));
  return {
    store,
    async send(command) {
      const { Key, Body } = command.input;
      if (command.constructor.name === "PutObjectCommand") {
        store.set(Key, Body);
        return {};
      }
      if (!store.has(Key)) {
        const error = new Error("no existe");
        error.name = "NoSuchKey";
        throw error;
      }
      const text = store.get(Key);
      return { Body: { transformToString: async () => text } };
    },
  };
}

// Doble de DynamoDB en memoria; modo "hang" no responde nunca.
function fakeDynamo({ hang = false } = {}) {
  const counters = new Map();
  return {
    counters,
    send(command) {
      if (hang) return new Promise(() => {});
      const pk = command.input.Key.pk.S;
      if (command.constructor.name === "UpdateItemCommand") {
        const next =
          (counters.get(pk) ?? 0) + Number(command.input.ExpressionAttributeValues[":a"].N);
        counters.set(pk, next);
        return Promise.resolve({ Attributes: { count: { N: String(next) } } });
      }
      const value = counters.get(pk);
      return Promise.resolve(value === undefined ? {} : { Item: { count: { N: String(value) } } });
    },
  };
}

function bedrockPayload(text, usage = { input_tokens: 10, output_tokens: 5 }) {
  return {
    body: new TextEncoder().encode(JSON.stringify({ content: [{ type: "text", text }], usage })),
  };
}

function sdkError(name, status) {
  const error = new Error("detalle del proveedor con datos internos");
  error.name = name;
  error.$metadata = { httpStatusCode: status };
  return error;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("inventory-store (S3)", () => {
  it("lee el puntero y la versión verificando su SHA-256", async () => {
    const text = readFixtureText("inventory-small.json");
    const pointer = { version: "2026-11-21", sha256: sha256Hex(text), previous: null };
    const s3 = fakeS3({ [ACTIVE_KEY]: JSON.stringify(pointer), [versionKey("2026-11-21")]: text });
    const store = createInventoryStore({ s3, bucket: "b" });
    expect(await store.readPointer()).toEqual(pointer);
    expect(await store.readVersion(pointer.version, pointer.sha256)).toBe(text);
  });

  it("rechaza una versión cuyo SHA-256 no coincide", async () => {
    const s3 = fakeS3({ [versionKey("v")]: "{}" });
    const store = createInventoryStore({ s3, bucket: "b" });
    await expect(store.readVersion("v", "0".repeat(64))).rejects.toMatchObject({
      reason: "sha256_mismatch",
    });
    await expect(store.readVersion("otra", "x")).rejects.toMatchObject({
      reason: "version_unreadable",
    });
  });

  it("devuelve null si el puntero no existe y falla si es inválido", async () => {
    expect(await createInventoryStore({ s3: fakeS3(), bucket: "b" }).readPointer()).toBeNull();
    const broken = createInventoryStore({ s3: fakeS3({ [ACTIVE_KEY]: "no json" }), bucket: "b" });
    await expect(broken.readPointer()).rejects.toBeInstanceOf(InventoryLoadError);
    const partial = createInventoryStore({ s3: fakeS3({ [ACTIVE_KEY]: "{}" }), bucket: "b" });
    await expect(partial.readPointer()).rejects.toMatchObject({ reason: "pointer_invalid" });
    const failing = { send: async () => Promise.reject(sdkError("AccessDenied", 403)) };
    await expect(
      createInventoryStore({ s3: failing, bucket: "b" }).readPointer(),
    ).rejects.toMatchObject({ reason: "pointer_unreadable" });
  });

  it("publica una versión y reescribe el puntero", async () => {
    const s3 = fakeS3();
    const store = createInventoryStore({ s3, bucket: "b" });
    const sha = await store.publishVersion("2026-11-22", '{"a":1}');
    await store.writePointer({ version: "2026-11-22", sha256: sha, previous: "2026-11-21" });
    expect(sha).toBe(sha256Hex('{"a":1}'));
    expect(JSON.parse(s3.store.get(ACTIVE_KEY)).previous).toBe("2026-11-21");
  });
});

describe("usage-store (DynamoDB)", () => {
  it("incrementa y lee contadores; el valor puede superar el tope y lo decide UsageGuard", async () => {
    const store = createUsageStore({ dynamo: fakeDynamo(), table: "t" });
    for (let i = 0; i < 61; i++) await store.increment("se#a#min#1", 1, 100);
    expect(await store.get("se#a#min#1")).toBe(61);
    expect(await store.get("se#otro#min#1")).toBe(0);
  });

  it("lanza StoreUnavailableError si el almacén no responde en 50 ms", async () => {
    vi.useFakeTimers();
    const store = createUsageStore({
      dynamo: fakeDynamo({ hang: true }),
      table: "t",
      timeoutMs: 50,
    });
    const pending = store.get("k");
    const assertion = expect(pending).rejects.toMatchObject({ reason: "timeout" });
    await vi.advanceTimersByTimeAsync(51);
    await assertion;
  });

  it("traduce un error del SDK a StoreUnavailableError", async () => {
    const dynamo = {
      send: () => Promise.reject(sdkError("ProvisionedThroughputExceededException", 400)),
    };
    const store = createUsageStore({ dynamo, table: "t" });
    await expect(store.increment("k", 1, 1)).rejects.toBeInstanceOf(StoreUnavailableError);
  });
});

describe("bedrock-client", () => {
  it("invoca con max_tokens y devuelve texto y tokens", async () => {
    const runtime = { send: vi.fn(async () => bedrockPayload('{"ok":true}')) };
    const client = createBedrockClient({ runtime, modelId: "m", anthropicVersion: "v" });
    const result = await client.invoke({ system: "S", user: "U", maxTokens: 600 });
    expect(result).toEqual({ text: '{"ok":true}', inputTokens: 10, outputTokens: 5 });
    const body = JSON.parse(runtime.send.mock.calls[0][0].input.body);
    expect(body).toMatchObject({ max_tokens: 600, system: "S", anthropic_version: "v" });
  });

  it("no envía parámetros de muestreo; agrega el esfuerzo solo si la configuración lo fija", () => {
    const base = { anthropicVersion: "v", maxTokens: 10, system: "S", user: "U" };
    const plain = buildRequestBody(base);
    expect(plain).not.toHaveProperty("temperature");
    expect(plain).not.toHaveProperty("top_p");
    expect(plain).not.toHaveProperty("output_config");
    expect(buildRequestBody({ ...base, effort: "low" }).output_config).toEqual({ effort: "low" });
  });

  it("el cliente pasa el esfuerzo configurado en cada invocación", async () => {
    const runtime = { send: vi.fn(async () => bedrockPayload("x")) };
    const client = createBedrockClient({
      runtime,
      modelId: "m",
      anthropicVersion: "v",
      effort: "low",
    });
    await client.invoke({ system: "S", user: "U", maxTokens: 5 });
    const body = JSON.parse(runtime.send.mock.calls[0][0].input.body);
    expect(body.output_config).toEqual({ effort: "low" });
    expect(body).not.toHaveProperty("temperature");
  });

  it("clasifica throttling, 5xx, aborto y errores del cliente sin copiar el mensaje", async () => {
    const cases = [
      [sdkError("ThrottlingException", 429), "throttled"],
      [sdkError("ServiceUnavailableException", 503), "server"],
      [sdkError("Whatever", 500), "server"],
      [sdkError("ValidationException", 400), "client"],
    ];
    for (const [error, kind] of cases) {
      const client = createBedrockClient({ runtime: { send: async () => Promise.reject(error) } });
      const failure = await client.invoke({ system: "", user: "", maxTokens: 1 }).catch((e) => e);
      expect(failure).toBeInstanceOf(ModelError);
      expect(failure.kind).toBe(kind);
      expect(failure.message).not.toContain("proveedor");
    }
    const controller = new AbortController();
    controller.abort();
    expect(classifyBedrockError(new Error("x"), controller.signal)).toBe("aborted");
    expect(classifyBedrockError({ name: "AbortError" })).toBe("aborted");
  });

  it("trata una respuesta ilegible como falla del servidor", async () => {
    const client = createBedrockClient({
      runtime: { send: async () => ({ body: new Uint8Array([1]) }) },
    });
    await expect(client.invoke({ system: "", user: "", maxTokens: 1 })).rejects.toMatchObject({
      kind: "server",
    });
  });
});

describe("jwks-client", () => {
  it("descarga solo claves RSA con kid del user pool", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        keys: [{ kid: "a", kty: "RSA" }, { kty: "RSA" }, { kid: "b", kty: "EC" }],
      }),
    }));
    const client = createJwksClient({ issuer: "https://idp.example/pool/", fetchImpl });
    expect(await client.fetchKeys()).toEqual([{ kid: "a", kty: "RSA" }]);
    expect(fetchImpl.mock.calls[0][0]).toBe(jwksUrl("https://idp.example/pool"));
  });

  it("falla con HTTP de error o cuerpo sin keys", async () => {
    const bad = createJwksClient({
      issuer: "i",
      fetchImpl: async () => ({ ok: false, status: 503 }),
    });
    await expect(bad.fetchKeys()).rejects.toThrow("jwks_http_503");
    const empty = createJwksClient({
      issuer: "i",
      fetchImpl: async () => ({ ok: true, json: async () => ({}) }),
    });
    await expect(empty.fetchKeys()).rejects.toThrow("jwks_invalid");
  });
});

describe("inventory-parser (worker_threads)", () => {
  it("parsea y valida una versión en un hilo de trabajo", async () => {
    const snapshot = await parseInventoryInWorker(readFixtureText("inventory-small.json"));
    expect(snapshot.serviceCount).toBe(5);
  });

  it("rechaza un JSON dañado o con esquema inválido", async () => {
    await expect(parseInventoryInWorker("{dañado")).rejects.toMatchObject({
      reason: "invalid_snapshot",
    });
    await expect(parseInventoryInWorker('{"version":"x"}')).rejects.toBeInstanceOf(
      InventoryLoadError,
    );
  });
});
