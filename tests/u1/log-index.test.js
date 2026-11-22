import { describe, it, expect } from "vitest";
import {
  chunkKey,
  chunkKeysForRow,
  createIndexRow,
  durationMs,
  getRowState,
  parseChunkKey,
  rebuildIndex,
  removeRow,
  totalBytes,
  updateRow,
  upsertRow,
} from "../../aws-calculator-extension/lib/log/log-index.js";

describe("log-index (NFR3.11)", () => {
  it("da de alta una fila y la reemplaza sin duplicar", () => {
    const row = createIndexRow("r1", "2026-11-21T10:00:00.000Z");
    const once = upsertRow([], row);
    const twice = upsertRow(once, { ...row, bytes: 50 });
    expect(twice).toHaveLength(1);
    expect(twice[0].bytes).toBe(50);
  });

  it("actualiza chunks y bytes al cambiar de trozo, sin mutar la lista", () => {
    const index = [createIndexRow("r1", "t0")];
    const next = updateRow(index, "r1", { chunks: 2, bytes: 900 });
    expect(next[0]).toMatchObject({ chunks: 2, bytes: 900 });
    expect(index[0].chunks).toBe(1);
    expect(chunkKeysForRow(next[0])).toEqual(["runLog:r1:0", "runLog:r1:1"]);
  });

  it("cierra la fila con finishedAt y status, y calcula la duración", () => {
    const index = updateRow([createIndexRow("r1", "2026-11-21T10:00:00.000Z")], "r1", {
      finishedAt: "2026-11-21T10:01:30.000Z",
      status: "DONE",
    });
    expect(getRowState(index[0])).toBe("DONE");
    expect(durationMs(index[0])).toBe(90000);
  });

  it("una fila sin run_end se muestra como interrumpida y sin duración", () => {
    const row = createIndexRow("r1", "2026-11-21T10:00:00.000Z");
    expect(getRowState(row)).toBe("interrupted");
    expect(durationMs(row)).toBeNull();
  });

  it("da de baja una fila y suma bytes del índice", () => {
    const index = [
      { ...createIndexRow("r1", "t0"), bytes: 100 },
      { ...createIndexRow("r2", "t1"), bytes: 250 },
    ];
    expect(removeRow(index, "r1").map((r) => r.runId)).toEqual(["r2"]);
    expect(totalBytes(index)).toBe(350);
    expect(totalBytes(undefined)).toBe(0);
  });

  it("parsea claves de trozo y rechaza claves ajenas", () => {
    expect(parseChunkKey(chunkKey("run-a:b", 3))).toEqual({ runId: "run-a:b", chunkIndex: 3 });
    expect(parseChunkKey("lastRunResult")).toBeNull();
    expect(parseChunkKey("runLog:r1:x")).toBeNull();
    expect(parseChunkKey("runLog::1")).toBeNull();
  });

  it("repara el índice desde las claves runLog:* (con y sin run_end)", () => {
    const all = {
      lastRunResult: { value: {} },
      "runLog:r1:0": [
        { seq: 1, ts: "2026-11-21T10:00:00.000Z", event: "run_start" },
        { seq: 2, ts: "2026-11-21T10:00:05.000Z", event: "step" },
      ],
      "runLog:r1:1": [{ seq: 3, ts: "2026-11-21T10:02:00.000Z", event: "run_end", value: "ERROR" }],
      "runLog:r2:0": [{ seq: 1, ts: "2026-11-21T11:00:00.000Z", event: "run_start" }],
    };
    const index = rebuildIndex(all);
    expect(index.map((r) => r.runId)).toEqual(["r1", "r2"]);
    expect(index[0]).toMatchObject({
      chunks: 2,
      status: "ERROR",
      finishedAt: "2026-11-21T10:02:00.000Z",
    });
    expect(index[0].bytes).toBeGreaterThan(0);
    expect(getRowState(index[1])).toBe("interrupted");
  });
});
