// lib/panel/heartbeat.js — Latido de la corrida en curso (BR6.6, NFR8.5).
// PROVISIONAL (U1, walking skeleton). Dueño final: U6.

export const HEARTBEAT_STALE_MS = 60000;

function toMillis(value) {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Date.parse(value);
  return Number.NaN;
}

// Un latido ausente o ilegible cuenta como vencido: el panel nunca queda
// bloqueado en una corrida que ya no avanza.
export function isHeartbeatStale(updatedAt, now, staleMs = HEARTBEAT_STALE_MS) {
  const last = toMillis(updatedAt);
  if (!Number.isFinite(last)) return true;
  return toMillis(now) - last > staleMs;
}
