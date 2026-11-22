// lib/input/input-normalizer.js — normalize(RunInput) → ServiceRequest[] (BR1.3, BR1.4).
// PROVISIONAL (U1, walking skeleton). Dueño final: U2 (InputNormalizer).
// Recibe un RunInput ya validado por json-parser. La región se toma de la raíz
// del JSON (corrige el v6, que la leía desde el servicio).

import { DEFAULT_REGION, isKnownRegion } from "../mapping/region-map.js";

export const TOGGLE_PREFIX = "__switch__:";

const TOGGLE_ON = ["on", "true"];
const TOGGLE_OFF = ["off", "false"];

function fail(code, message) {
  return { ok: false, error: { code, message } };
}

// Números a su forma textual decimal, booleanos a "true"/"false" (BR1.4).
export function valueToText(value) {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function parseToggle(key, rawValue, serviceName) {
  const label = key.slice(TOGGLE_PREFIX.length).trim();
  const text = (valueToText(rawValue) ?? "").trim().toLowerCase();
  if (!label) {
    return fail("invalid_toggle", `❌ Hay un toggle sin nombre en el servicio "${serviceName}".`);
  }
  if (TOGGLE_ON.includes(text)) return { ok: true, value: { label, wantOn: true } };
  if (TOGGLE_OFF.includes(text)) return { ok: true, value: { label, wantOn: false } };
  return fail(
    "invalid_toggle",
    `❌ El toggle "${label}" del servicio "${serviceName}" debe ser on, off, true o false.`,
  );
}

function normalizeService(raw, index, region) {
  const serviceName = raw.name.trim();
  const fields = [];
  const toggles = [];
  for (const [key, value] of Object.entries(raw.fields ?? {})) {
    if (key.startsWith(TOGGLE_PREFIX)) {
      const toggle = parseToggle(key, value, serviceName);
      if (!toggle.ok) return toggle;
      toggles.push(toggle.value);
      continue;
    }
    fields.push({ key, value: valueToText(value) });
  }
  const searchTerm = typeof raw.search_term === "string" ? raw.search_term.trim() : serviceName;
  return {
    ok: true,
    value: { requestId: `svc-${index + 1}`, serviceName, searchTerm, region, fields, toggles },
  };
}

export function normalize(runInput) {
  const region = runInput.region === undefined ? DEFAULT_REGION : String(runInput.region).trim();
  if (!isKnownRegion(region)) {
    return fail("unknown_region", `❌ No reconozco la región ${region}.`);
  }
  const services = [];
  for (let i = 0; i < runInput.services.length; i++) {
    const normalized = normalizeService(runInput.services[i], i, region);
    if (!normalized.ok) return normalized;
    services.push(normalized.value);
  }
  const value = { region, services };
  if (typeof runInput.project === "string") value.project = runInput.project.trim();
  return { ok: true, value };
}
