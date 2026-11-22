// history-model.js: orden, recorte a 200 y filas del historial (NFR8.7, BR5.3, AC6.3.1).
import { describe, it, expect } from "vitest";
import {
  HISTORY_LIMIT,
  buildHistoryView,
  describeLastRun,
  sortRunsByDate,
  toHistoryRow,
} from "../../aws-calculator-extension/lib/panel/history-model.js";
import { createIndexRow } from "../../aws-calculator-extension/lib/log/log-index.js";
import { VALID_URL, makeDoneRunResult, makeErrorRunResult } from "./fixtures.js";

// Fila del índice de U1, cerrada con el estado dado.
function makeRow(runId, startedAt, status = "DONE") {
  return { ...createIndexRow(runId, startedAt), finishedAt: startedAt, status };
}

function syntheticIndex(count) {
  const base = Date.parse("2026-01-01T00:00:00.000Z");
  // Orden de inserción mezclado para que el orden por fecha no sea casual.
  return Array.from({ length: count }, (_, i) => {
    const n = (i * 7919) % count;
    return makeRow(`run-${n}`, new Date(base + n * 60000).toISOString());
  });
}

describe("buildHistoryView", () => {
  it("con 500 corridas muestra las 200 más recientes, en orden descendente", () => {
    const index = syntheticIndex(500);
    const view = buildHistoryView(index);
    expect(view.total).toBe(500);
    expect(view.truncated).toBe(true);
    expect(view.rows).toHaveLength(HISTORY_LIMIT);
    expect(view.rows[0].runId).toBe("run-499");
    expect(view.rows[199].runId).toBe("run-300");
    const times = view.rows.map((row) => Date.parse(row.startedAt));
    expect(times).toEqual([...times].sort((a, b) => b - a));
    expect(index[0].runId).toBe("run-0");
  });

  it("menos de 200 corridas no se recortan; filas sin fecha van al final", () => {
    const view = buildHistoryView([
      makeRow("sin-fecha", null),
      makeRow("vieja", "2026-01-01T00:00:00.000Z"),
      makeRow("nueva", "2026-02-01T00:00:00.000Z"),
    ]);
    expect(view.truncated).toBe(false);
    expect(view.rows.map((row) => row.runId)).toEqual(["nueva", "vieja", "sin-fecha"]);
    expect(buildHistoryView(undefined)).toMatchObject({ rows: [], total: 0 });
    expect(sortRunsByDate([null, 3])).toEqual([]);
  });

  it("solo pone enlace con URL válida y marca interrumpidas las filas sin cierre", () => {
    const good = toHistoryRow({ ...makeRow("a", "2026-01-01T00:00:00Z"), estimateUrl: VALID_URL });
    expect(good).toMatchObject({ verdict: "DONE", estimateUrl: VALID_URL });
    const bad = toHistoryRow({
      ...makeRow("b", "2026-01-01T00:00:00Z"),
      estimateUrl: "javascript:x",
    });
    expect(bad).toMatchObject({ verdict: "ERROR", estimateUrl: null });
    const open = toHistoryRow(createIndexRow("c", "2026-01-01T00:00:00Z"));
    expect(open.verdict).toBe("interrupted");
    expect(toHistoryRow(makeRow("d", "2026-01-01T00:00:00Z", "ERROR")).verdict).toBe("ERROR");
  });

  it("toma enlace y cantidad de servicios del lastRunResult de la misma corrida", () => {
    const last = makeDoneRunResult("run-x");
    const view = buildHistoryView([makeRow("run-x", "2026-01-01T00:00:00Z")], {
      lastRunResult: last,
    });
    expect(view.rows[0]).toMatchObject({ estimateUrl: VALID_URL, serviceCount: 2 });
    const tampered = { ...last, estimateUrl: "https://evil.example/" };
    const row = toHistoryRow(makeRow("run-x", "2026-01-01T00:00:00Z"), tampered);
    expect(row).toMatchObject({ verdict: "ERROR", estimateUrl: null });
  });
});

describe("describeLastRun (AC6.3.1)", () => {
  it("DONE con URL válida muestra el enlace; ERROR, sin enlace ni mensaje", () => {
    expect(describeLastRun(makeDoneRunResult("r1"))).toMatchObject({
      verdict: "DONE",
      estimateUrl: VALID_URL,
    });
    const failed = describeLastRun(makeErrorRunResult("r2"));
    expect(failed).toMatchObject({ verdict: "ERROR", estimateUrl: null });
    expect(Object.keys(failed)).not.toContain("message");
  });

  it("sin último resultado o con forma inválida devuelve null", () => {
    expect(describeLastRun(null)).toBeNull();
    expect(describeLastRun({ status: "DONE" })).toBeNull();
  });
});
