// lib/history-store.js con chrome.storage.local simulado (decisión 1; BR5.3, NFR5.4).
import { describe, it, expect } from "vitest";
import { createHistoryStore } from "../../aws-calculator-extension/lib/history-store.js";
import { chunkKey, createIndexRow } from "../../aws-calculator-extension/lib/log/log-index.js";
import { makeStoredRunRecord } from "../../aws-calculator-extension/lib/messages.js";
import { createFakeStorage } from "../u1/fake-storage.js";
import { makeConnectionFailure, makeDoneRunResult } from "./fixtures.js";

function rowOf(runId, chunks = 1) {
  return { ...createIndexRow(runId, "2026-11-22T10:00:00.000Z"), chunks };
}

function seeded() {
  const a = rowOf("run-a", 2);
  const b = rowOf("run-b");
  return createFakeStorage({
    runLogIndex: [a, b],
    [chunkKey("run-a", 0)]: [{ seq: 1 }],
    [chunkKey("run-a", 1)]: [{ seq: 2 }],
    [chunkKey("run-b", 0)]: [{ seq: 1 }],
    lastRunResult: makeStoredRunRecord(makeDoneRunResult("run-b")),
    activeRun: { runId: "run-c", tabId: 7, updatedAt: 1 },
  });
}

function makeStore(storage) {
  const errors = [];
  return {
    errors,
    store: createHistoryStore({ storage, onError: (...args) => errors.push(args) }),
  };
}

describe("history-store", () => {
  it("lista el índice y el último resultado en una sola lectura", async () => {
    const storage = seeded();
    const { store } = makeStore(storage);
    const listed = await store.listRuns();
    expect(listed.ok).toBe(true);
    expect(listed.index.map((row) => row.runId)).toEqual(["run-a", "run-b"]);
    expect(listed.lastRunResult.runId).toBe("run-b");
    const exported = await store.exportRuns([listed.index[0]]);
    expect(exported.runs[0].entries).toEqual([{ seq: 1 }, { seq: 2 }]);
    expect((await store.readEntries(listed.index[1])).entries).toEqual([{ seq: 1 }]);
  });

  it("borra una corrida con sus fragmentos y actualiza el índice", async () => {
    const storage = seeded();
    const { store } = makeStore(storage);
    const result = await store.deleteRun(rowOf("run-a", 2));
    expect(result.index.map((row) => row.runId)).toEqual(["run-b"]);
    expect(storage.data.has(chunkKey("run-a", 1))).toBe(false);
    expect(storage.data.has(chunkKey("run-b", 0))).toBe(true);
  });

  it("borra todo: fragmentos, índice y último resultado; repara el índice desde runLog:*", async () => {
    const storage = seeded();
    const { store } = makeStore(storage);
    expect((await store.deleteAll()).ok).toBe(true);
    expect([...storage.data.keys()]).toEqual(["activeRun"]);
    storage.data.set(chunkKey("run-z", 0), [{ event: "run_start", ts: "2026-11-22T10:00:00Z" }]);
    const repaired = await store.repairIndex();
    expect(repaired.index.map((row) => row.runId)).toEqual(["run-z"]);
  });

  it("lee la corrida activa presente y ausente", async () => {
    const storage = seeded();
    const { store } = makeStore(storage);
    expect((await store.readActiveRun()).activeRun.runId).toBe("run-c");
    const empty = await makeStore(createFakeStorage()).store.readActiveRun();
    expect(empty).toEqual({ ok: true, activeRun: null, lastRunResult: null });
  });

  it("cierra una corrida perdida solo si activeRun sigue siendo la misma", async () => {
    const storage = seeded();
    const { store } = makeStore(storage);
    await store.closeLostRun(makeConnectionFailure("otra"));
    expect(storage.data.has("activeRun")).toBe(true);
    await store.closeLostRun({ ...makeConnectionFailure("run-c"), failureStep: "lost" });
    expect(storage.data.has("activeRun")).toBe(false);
    expect(storage.data.get("lastRunResult").value.failureStep).toBe("lost");
  });

  it("un error de almacenamiento devuelve un resultado tipado y se anota", async () => {
    const storage = seeded();
    storage.failNextWrites(1);
    const { store, errors } = makeStore(storage);
    expect(await store.deleteRun(rowOf("run-a"))).toEqual({ ok: false, code: "storage_error" });
    expect(errors).toHaveLength(1);
    const missing = createHistoryStore({ storage: null, onError: () => {} });
    expect(await missing.listRuns()).toEqual({ ok: false, code: "storage_error" });
  });
});
