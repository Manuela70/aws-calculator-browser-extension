import { describe, it, expect } from "vitest";
import {
  ALLOWED_FIELDS,
  formatConsolePrefix,
  formatLogEntry,
  makeRunEndEntry,
  makeRunStartEntry,
} from "../../aws-calculator-extension/lib/log/log-format.js";
import { makeRunRequest } from "./fixtures.js";

const fixedNow = () => new Date("2026-11-21T20:40:12.345Z");

describe("log-format (NFR3.5, NFR3.10)", () => {
  it("formatea una entrada con seq, ts ISO, runId y nivel", () => {
    const entry = formatLogEntry(
      { level: "warn", step: "service:svc-1", event: "field_not_applied", label: "OS" },
      { seq: 17, runId: "run-1", now: fixedNow },
    );
    expect(entry).toEqual({
      seq: 17,
      ts: "2026-11-21T20:40:12.345Z",
      runId: "run-1",
      level: "warn",
      step: "service:svc-1",
      event: "field_not_applied",
      label: "OS",
    });
  });

  it("descarta campos fuera de la lista permitida (p. ej. un token)", () => {
    const entry = formatLogEntry(
      { message: "x", token: "secreto", apiKey: "abc" },
      { seq: 1, runId: "r", now: fixedNow },
    );
    expect(Object.keys(entry).every((k) => ALLOWED_FIELDS.includes(k))).toBe(true);
    expect(JSON.stringify(entry)).not.toContain("secreto");
  });

  it("usa info ante un nivel desconocido y no deja que la entrada pise seq/runId", () => {
    const entry = formatLogEntry(
      { level: "fatal", seq: 999, runId: "otro" },
      { seq: 2, runId: "r", now: fixedNow },
    );
    expect(entry.level).toBe("info");
    expect(entry.seq).toBe(2);
    expect(entry.runId).toBe("r");
  });

  it("run_start resume servicios sin copiar los valores pedidos", () => {
    const entry = makeRunStartEntry(makeRunRequest());
    expect(entry.event).toBe("run_start");
    expect(entry.detail).toContain("Amazon EC2 (4 valores, 0 toggles)");
    expect(entry.detail).not.toContain("t3.micro");
  });

  it("run_end lleva veredicto y paso fallido; el prefijo de consola es fijo", () => {
    const entry = makeRunEndEntry({ status: "ERROR", failureStep: "services" });
    expect(entry).toMatchObject({ event: "run_end", value: "ERROR", detail: "services" });
    expect(makeRunEndEntry({ status: "DONE" }).detail).toBeUndefined();
    expect(formatConsolePrefix("run-1", "info")).toBe("[aws-calc] run-1 info");
  });
});
