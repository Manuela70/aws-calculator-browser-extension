import { describe, it, expect, vi, afterEach } from "vitest";
import { createRunLogger, CHUNK_SIZE } from "../../aws-calculator-extension/lib/log/run-logger.js";
import { createFakeStorage, createSilentConsole } from "./fake-storage.js";
import { makeRunRequest } from "./fixtures.js";

function makeLogger(storage, overrides = {}) {
  return createRunLogger({
    storage,
    runId: "r1",
    tabId: 7,
    now: () => new Date("2026-11-21T10:00:00.000Z"),
    consoleApi: createSilentConsole(),
    ...overrides,
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("run-logger (NFR3.6, NFR8.11)", () => {
  it("escribe cada entrada de inmediato y en orden de seq", async () => {
    const storage = createFakeStorage();
    const logger = makeLogger(storage);
    logger.start(makeRunRequest());
    logger.log({ level: "info", step: "preconditions", message: "a" });
    logger.log({ level: "info", step: "preconditions", message: "b" });
    await logger.flush();
    const chunk = storage.data.get("runLog:r1:0");
    expect(chunk.map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(chunk[0].event).toBe("run_start");
    expect(storage.data.get("activeRun")).toMatchObject({ runId: "r1", tabId: 7 });
  });

  it(`parte el registro en trozos de ${CHUNK_SIZE} entradas`, async () => {
    const storage = createFakeStorage();
    const logger = makeLogger(storage);
    logger.start(makeRunRequest());
    for (let i = 0; i < CHUNK_SIZE; i++) logger.log({ message: `e${i}` });
    await logger.flush();
    expect(storage.data.get("runLog:r1:0")).toHaveLength(CHUNK_SIZE);
    expect(storage.data.get("runLog:r1:1")).toHaveLength(1);
    expect(storage.data.get("runLogIndex")[0].chunks).toBe(2);
  });

  it("escribe el índice antes que el trozo nuevo", async () => {
    const storage = createFakeStorage();
    const logger = makeLogger(storage);
    logger.start(makeRunRequest());
    for (let i = 0; i < CHUNK_SIZE; i++) logger.log({ message: `e${i}` });
    await logger.flush();
    const writes = storage.operations.filter((op) => op.kind === "set").map((op) => op.key);
    const firstChunk1 = writes.indexOf("runLog:r1:1");
    expect(writes.lastIndexOf("runLogIndex", firstChunk1)).toBe(firstChunk1 - 1);
  });

  it("reintenta una vez ante un fallo de escritura sin marcar degraded", async () => {
    const storage = createFakeStorage();
    const onDegraded = vi.fn();
    const logger = makeLogger(storage, { onDegraded });
    storage.failNextWrites(1);
    logger.log({ message: "a" });
    await logger.flush();
    expect(storage.data.get("runLog:r1:0")).toHaveLength(1);
    expect(logger.isDegraded()).toBe(false);
    expect(onDegraded).not.toHaveBeenCalled();
  });

  it("un segundo fallo marca degraded, avisa una vez y la corrida sigue", async () => {
    const storage = createFakeStorage();
    const onDegraded = vi.fn();
    const logger = makeLogger(storage, { onDegraded });
    storage.failNextWrites(2);
    logger.log({ message: "a" });
    logger.log({ message: "b" });
    await logger.flush();
    expect(logger.isDegraded()).toBe(true);
    expect(onDegraded).toHaveBeenCalledTimes(1);
    expect(storage.data.get("runLog:r1:0").map((e) => e.message)).toEqual(["a", "b"]);
    expect(logger.getRow().degraded).toBe(true);
  });

  it("al cerrar guarda run_end, lastRunResult, borra activeRun y no acepta más escrituras", async () => {
    const storage = createFakeStorage();
    const logger = makeLogger(storage);
    logger.start(makeRunRequest());
    logger.updateActiveRun({ runId: "r1", pct: 10, text: "x" });
    const runResult = {
      runId: "r1",
      status: "ERROR",
      failureStep: "services",
      perServiceResults: [],
    };
    const closing = await logger.close(runResult);
    expect(closing.flushed).toBe(true);
    const writesBefore = storage.operations.length;
    expect(logger.log({ message: "tarde" })).toBeNull();
    expect(logger.updateActiveRun({ runId: "r1", pct: 50, text: "tarde" })).toBe(false);
    await logger.flush();
    expect(storage.operations.length).toBe(writesBefore);
    expect(storage.data.has("activeRun")).toBe(false);
    expect(storage.data.get("lastRunResult")).toEqual({ schemaVersion: 1, value: runResult });
    const chunk = storage.data.get("runLog:r1:0");
    expect(chunk[chunk.length - 1]).toMatchObject({ event: "run_end", value: "ERROR" });
    expect(storage.data.get("runLogIndex")[0]).toMatchObject({ status: "ERROR" });
    expect(await logger.close(runResult)).toEqual({ flushed: true, degraded: false });
  });

  it("el vaciado de la cola en run_end tiene un tope de 5 s", async () => {
    vi.useFakeTimers();
    const storage = createFakeStorage();
    const logger = makeLogger(storage);
    const release = storage.holdNextWrite();
    logger.log({ message: "colgada" });
    const closing = logger.close({ runId: "r1", status: "DONE", perServiceResults: [] });
    await vi.advanceTimersByTimeAsync(5000);
    await expect(closing).resolves.toEqual({ flushed: false, degraded: false });
    release();
    await logger.flush();
  });
});
