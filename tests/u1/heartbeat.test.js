import { describe, it, expect } from "vitest";
import {
  HEARTBEAT_STALE_MS,
  isHeartbeatStale,
} from "../../aws-calculator-extension/lib/panel/heartbeat.js";

describe("isHeartbeatStale (BR6.6)", () => {
  it("un latido de hace menos de 60 s está vigente", () => {
    expect(isHeartbeatStale(1000, 1000 + HEARTBEAT_STALE_MS)).toBe(false);
  });

  it("un latido de hace más de 60 s está vencido (también con fechas ISO)", () => {
    expect(isHeartbeatStale(1000, 1001 + HEARTBEAT_STALE_MS)).toBe(true);
    expect(
      isHeartbeatStale("2026-11-21T10:00:00.000Z", Date.parse("2026-11-21T10:01:01.000Z")),
    ).toBe(true);
  });

  it("un latido ausente o ilegible cuenta como vencido", () => {
    expect(isHeartbeatStale(undefined, 0)).toBe(true);
    expect(isHeartbeatStale("no es fecha", 0)).toBe(true);
  });
});
