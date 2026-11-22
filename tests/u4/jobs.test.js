import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  collectInputs,
  fetchRawServices,
  nextVersion,
  runInventoryJob,
  toRawService,
} from "../../brain/jobs/build-inventory.mjs";
import { caseForMinute, handler, resetTokenCache } from "../../brain/probe/handler.mjs";
import { sha256 } from "./helpers.js";

// Servicio crudo con `fields` campos numéricos.
function rawService(code, fields) {
  return {
    serviceCode: code,
    name: `Service ${code}`,
    searchKeywords: [],
    regions: [],
    templates: ["T"],
    inputs: Array.from({ length: fields }, (_, i) => ({
      template: "T",
      card: "C",
      label: `Field ${i}`,
      subType: "numericInput",
      options: null,
      conditional: false,
    })),
  };
}

function catalog(services, fieldsEach = 2) {
  return Array.from({ length: services }, (_, i) => rawService(`svc${i}`, fieldsEach));
}

// Almacén S3 en memoria con la interfaz de inventory-store.
function memoryStore() {
  const objects = new Map();
  let pointer = null;
  return {
    objects,
    get pointer() {
      return pointer;
    },
    async readPointer() {
      return pointer;
    },
    async readVersion(version, expected) {
      const text = objects.get(version);
      if (sha256(text) !== expected) throw new Error("sha256_mismatch");
      return text;
    },
    async publishVersion(version, text) {
      objects.set(version, text);
      return sha256(text);
    },
    async writePointer(value) {
      pointer = value;
    },
  };
}

const NOW = Date.parse("2026-11-29T06:00:00.000Z");

describe("InventoryJob (BR5.1, BR5.2)", () => {
  it("acepta la primera versión, la publica con su SHA-256 y escribe el puntero", async () => {
    const store = memoryStore();
    const emit = vi.fn();
    const result = await runInventoryJob({
      store,
      loadRawServices: async () => ({ rawServices: catalog(10), missing: 0 }),
      now: () => NOW,
      emit,
    });
    expect(result).toMatchObject({ status: "active", version: "2026-11-29", serviceCount: 10 });
    expect(store.pointer).toEqual({ version: "2026-11-29", sha256: result.sha256, previous: null });
    expect(sha256(store.objects.get("2026-11-29"))).toBe(result.sha256);
    expect(emit.mock.calls[0][0]).toMatchObject({ InventoryJobFailed: 0 });
  });

  it("activa una versión con pérdida de 10 % y guarda la anterior como previous", async () => {
    const store = memoryStore();
    const base = { store, now: () => NOW };
    const first = await runInventoryJob({
      ...base,
      loadRawServices: async () => ({ rawServices: catalog(100), missing: 0 }),
    });
    const second = await runInventoryJob({
      ...base,
      loadRawServices: async () => ({ rawServices: catalog(90), missing: 10 }),
    });
    expect(second.status).toBe("active");
    expect(second.version).toBe("2026-11-29-2");
    expect(store.pointer.previous).toEqual({ version: first.version, sha256: first.sha256 });
  });

  it("rechaza una pérdida de 11 % sin tocar el puntero y emite InventoryJobFailed", async () => {
    const store = memoryStore();
    await runInventoryJob({
      store,
      now: () => NOW,
      loadRawServices: async () => ({ rawServices: catalog(100), missing: 0 }),
    });
    const pointerBefore = store.pointer;
    const emit = vi.fn();
    const result = await runInventoryJob({
      store,
      now: () => NOW + 7 * 86_400_000,
      loadRawServices: async () => ({ rawServices: catalog(89), missing: 11 }),
      emit,
    });
    expect(result).toMatchObject({ status: "rejected", version: "2026-12-06", serviceLoss: 0.11 });
    expect(store.pointer).toBe(pointerBefore);
    expect(JSON.parse(store.objects.get("2026-12-06")).status).toBe("rejected");
    expect(emit.mock.calls[0][0]).toMatchObject({ InventoryJobFailed: 1 });
  });

  it("rechaza una versión con esquema inválido (catálogo vacío)", async () => {
    const store = memoryStore();
    const result = await runInventoryJob({
      store,
      now: () => NOW,
      loadRawServices: async () => ({ rawServices: [], missing: 442 }),
    });
    expect(result.status).toBe("rejected");
    expect(store.pointer).toBeNull();
  });

  it("porta el recorrido de la definición y calcula la versión del día", () => {
    const definition = {
      templates: [
        {
          title: "Quick",
          cards: [
            {
              title: "Specs",
              inputSection: true,
              items: [
                {
                  type: "input",
                  id: "os",
                  label: " OS ",
                  subType: "dropdown",
                  options: [{ label: "Linux" }, "Windows"],
                },
                {
                  type: "input",
                  id: "q",
                  label: "Qty",
                  subType: "numericInput",
                  displayIf: { a: 1 },
                },
              ],
            },
          ],
        },
      ],
    };
    const raw = toRawService({ serviceCode: "x", name: " X ", searchKeywords: ["k"] }, definition);
    expect(raw.templates).toEqual(["Quick"]);
    expect(raw.inputs[0]).toMatchObject({
      template: "Quick",
      card: "Specs",
      label: "OS",
      options: ["Linux", "Windows"],
    });
    expect(raw.inputs[1].conditional).toBe(true);
    const acc = [];
    collectInputs(null, {}, acc);
    expect(acc).toEqual([]);
    expect(nextVersion(NOW, null)).toBe("2026-11-29");
    expect(nextVersion(NOW, "2026-11-22")).toBe("2026-11-29");
    expect(nextVersion(NOW, "2026-11-29-2")).toBe("2026-11-29-3");
  });

  it("descarga el catálogo y omite definiciones que fallan", async () => {
    const fetchImpl = vi.fn(async (url) => {
      if (url.endsWith("manifest.json")) {
        return {
          ok: true,
          json: async () => ({
            awsServices: [
              { serviceCode: "a", name: "A", serviceDefinitionLocation: "https://d/a.json" },
              { serviceCode: "b", name: "B", serviceDefinitionLocation: "https://d/b.json" },
              { serviceCode: "c", name: "C" },
            ],
          }),
        };
      }
      if (url.endsWith("b.json")) return { ok: false, status: 404 };
      return { ok: true, json: async () => ({ templates: [{ title: "T", cards: [] }] }) };
    });
    const result = await fetchRawServices({ fetchImpl, manifestUrl: "https://d/manifest.json" });
    expect(result.rawServices.map((s) => s.serviceCode)).toEqual(["a"]);
    expect(result.missing).toBe(1);
  });
});

function probeDeps({
  brainStatus = 200,
  secret = { clientId: "probe", clientSecret: "s3cr3t" },
} = {}) {
  const logs = [];
  const fetchImpl = vi.fn(async (url) => {
    if (url.endsWith("/oauth2/token")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ access_token: "tok", expires_in: 3600 }),
      };
    }
    return { ok: brainStatus === 200, status: brainStatus };
  });
  return {
    logs,
    fetchImpl,
    deps: {
      env: {
        BRAIN_URL: "https://brain.example.org",
        TOKEN_URL: "https://auth.example.org/oauth2/token",
        PROBE_SECRET_ARN: "arn:aws:secretsmanager:us-east-1:111111111111:secret:probe",
        PROBE_SCOPE: "brain/probe",
      },
      now: () => NOW,
      fetchImpl,
      log: (record) => logs.push(record),
      getSecret: async () => {
        if (secret instanceof Error) throw secret;
        return secret;
      },
    },
  };
}

describe("Probe (NFR1.4)", () => {
  beforeEach(() => resetTokenCache());

  it("sonda feliz: obtiene token, llama a una operación real y emite ProbeSuccess = 1", async () => {
    const { deps, logs, fetchImpl } = probeDeps();
    const result = await handler({}, {}, deps);
    expect(result).toEqual({ success: true, operation: caseForMinute(NOW).operation, status: 200 });
    expect(logs[0]).toMatchObject({ ProbeSuccess: 1 });
    const tokenCall = fetchImpl.mock.calls[0][1];
    expect(tokenCall.body).toContain("grant_type=client_credentials");
    expect(fetchImpl.mock.calls[1][1].headers.authorization).toBe("Bearer tok");
    await handler({}, {}, deps); // reutiliza el token
    expect(fetchImpl.mock.calls.filter(([url]) => url.endsWith("/oauth2/token"))).toHaveLength(1);
  });

  it("sonda con 5xx del cerebro emite ProbeSuccess = 0", async () => {
    const { deps, logs } = probeDeps({ brainStatus: 503 });
    const result = await handler({}, {}, deps);
    expect(result).toMatchObject({ success: false, status: 503, reason: "http_503" });
    expect(logs[0].ProbeSuccess).toBe(0);
  });

  it("secreto ilegible: no llama al cerebro y emite ProbeSuccess = 0", async () => {
    const { deps, logs, fetchImpl } = probeDeps({ secret: new Error("AccessDenied detalle") });
    const result = await handler({}, {}, deps);
    expect(result).toEqual({
      success: false,
      operation: caseForMinute(NOW).operation,
      status: 0,
      reason: "secret_unreadable",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(logs[0].ProbeSuccess).toBe(0);
    const { deps: partial } = probeDeps({ secret: { clientId: "x" } });
    expect((await handler({}, {}, partial)).reason).toBe("secret_unreadable");
  });

  it("rota entre las tres operaciones por minuto", () => {
    const ops = [0, 1, 2].map((m) => caseForMinute(m * 60_000).operation);
    expect(ops).toEqual(["map_residue", "interpret", "waf_post_fill"]);
  });
});
