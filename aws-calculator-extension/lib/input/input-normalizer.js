// lib/input/input-normalizer.js — Interfaz pública de U2 (functional-spec §3):
// normalize({ format, text }, { interpretNaturalLanguage, signal })
//   → Promise<{ ok: true, value: NormalizedRun } | { ok: false, error: InputError }>
// y toLogEntry(rawInput, result, { durationMs }) para el registro técnico.
// Dueño: U2 (completa en sitio el provisional de U1, que era síncrono).
// Grupo 1 (camino por pestaña), Grupo 4 (normalización común) y Grupo 5
// (resultado único tipado, revisión Well-Architected): BR1.1-BR1.2, BR4.1-BR4.6,
// BR5.3-BR5.4; NFR3.1, NFR3.5, NFR5.3, NFR5.4.

import { DEFAULT_REGION, isKnownRegion } from "../mapping/region-map.js";
import { INPUT_ERROR_CODES as E, failInput } from "./input-errors.js";
import {
  INPUT_FORMATS,
  MAX_JSON_CHARS,
  MAX_NL_CHARS,
  TOGGLE_PREFIX,
  WAF_REVIEW,
} from "./input-schema.js";
import { parseJsonText } from "./json-parser.js";
import { interpretText } from "./nl-interpreter.js";

export { TOGGLE_PREFIX };

const TOGGLE_ON = ["on", "true"];
const TOGGLE_OFF = ["off", "false"];

// Números a su forma textual decimal, booleanos a "true"/"false" (BR4.3).
export function valueToText(value) {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function parseToggle(key, rawValue, details) {
  const label = key.slice(TOGGLE_PREFIX.length).trim();
  const text = (valueToText(rawValue) ?? "").trim().toLowerCase();
  if (!label) return failInput(E.INVALID_TOGGLE, details);
  if (TOGGLE_ON.includes(text)) return { ok: true, value: { label, wantOn: true } };
  if (TOGGLE_OFF.includes(text)) return { ok: true, value: { label, wantOn: false } };
  return failInput(E.INVALID_TOGGLE, { ...details, key: label });
}

// ServiceRequest nuevo, sin heredar objetos de la entrada (BR4.3-BR4.5, NFR3.5).
function normalizeService(raw, index, region) {
  const serviceName = raw.name.trim();
  const details = { service: serviceName, serviceIndex: index };
  const fields = [];
  const toggles = [];
  for (const [key, value] of Object.entries(raw.fields ?? {})) {
    if (key.startsWith(TOGGLE_PREFIX)) {
      const toggle = parseToggle(key, value, details);
      if (!toggle.ok) return toggle;
      toggles.push(toggle.value);
      continue;
    }
    fields.push({ key, value: valueToText(value) });
  }
  const searchTerm = typeof raw.search_term === "string" ? raw.search_term.trim() : serviceName;
  const service = {
    requestId: `svc-${index + 1}`,
    serviceName,
    searchTerm,
    region,
    fields,
    toggles,
  };
  // template es opcional (pedido de u5): solo viaja si la configuración lo trae.
  if (typeof raw.template === "string") service.template = raw.template.trim();
  return { ok: true, value: service };
}

// RunInput validado → NormalizedRun (W3). Una sola normalización para ambos
// formatos, así convergen salvo en source (BR4.6).
function buildNormalizedRun(runInput, { source, hasBrain }) {
  const regionDefaulted = runInput.region === undefined;
  const region = regionDefaulted ? DEFAULT_REGION : runInput.region.trim();
  if (!isKnownRegion(region)) return failInput(E.UNKNOWN_REGION, { region, key: "region" });
  const services = [];
  for (let i = 0; i < runInput.services.length; i++) {
    const normalized = normalizeService(runInput.services[i], i, region);
    if (!normalized.ok) return normalized;
    services.push(normalized.value);
  }
  const value = { source, region, regionDefaulted, services };
  if (typeof runInput.project === "string") value.project = runInput.project.trim();
  // La revisión es obligatoria si y solo si el puerto del cerebro existe (BR5.4).
  value.wafReview = hasBrain ? WAF_REVIEW.REQUIRED : WAF_REVIEW.NOT_AVAILABLE;
  return { ok: true, value };
}

async function normalizeNaturalLanguage(text, deps, hasBrain) {
  if (text.length > MAX_NL_CHARS) return failInput(E.INPUT_TOO_LONG, { maxLength: MAX_NL_CHARS });
  const interpreted = await interpretText(text, deps);
  if (!interpreted.ok) return interpreted;
  const run = buildNormalizedRun(interpreted.value, {
    source: INPUT_FORMATS.NATURAL_LANGUAGE,
    hasBrain,
  });
  // Un fallo de normalización sobre lo que devolvió el cerebro es una
  // respuesta inválida del cerebro, no un error del SE (BR3.6).
  return run.ok ? run : failInput(E.NL_INVALID_RESPONSE);
}

async function normalizeInput(rawInput, deps) {
  const format = rawInput?.format;
  if (format !== INPUT_FORMATS.JSON && format !== INPUT_FORMATS.NATURAL_LANGUAGE) {
    throw new TypeError(`Formato de entrada desconocido: ${String(format)}`);
  }
  const text = typeof rawInput.text === "string" ? rawInput.text : "";
  if (text.trim().length === 0) return failInput(E.EMPTY_INPUT);
  const hasBrain = typeof deps.interpretNaturalLanguage === "function";
  if (format === INPUT_FORMATS.NATURAL_LANGUAGE) {
    return normalizeNaturalLanguage(text.trim(), deps, hasBrain);
  }
  const parsed = parseJsonText(text);
  if (!parsed.ok) return parsed;
  return buildNormalizedRun(parsed.value, { source: INPUT_FORMATS.JSON, hasBrain });
}

// Única puerta de entrada (security-design §1). Nunca lanza: una excepción no
// prevista se informa como unexpected_error y se deja constancia en consola.
export async function normalize(rawInput, deps = {}) {
  try {
    return await normalizeInput(rawInput, deps ?? {});
  } catch (error) {
    console.error("[aws-calc] input error", "Fallo no previsto al normalizar la entrada", error);
    return failInput(E.UNEXPECTED_ERROR);
  }
}

// ─── Registro técnico (NFR5.3, NFR5.4) ────────────────────────────────────────

function outcomeFields(result) {
  if (result?.ok) return { ok: true, serviceCount: result.value.services.length };
  const error = result?.error ?? {};
  const entry = { ok: false, code: error.code ?? E.UNEXPECTED_ERROR };
  if (Array.isArray(error.fragments)) entry.fragmentCount = error.fragments.length;
  return entry;
}

// Rama de lenguaje natural: recibe solo la longitud, nunca el texto, para que
// no pueda filtrarse al registro ni por error (NFR5.3).
function naturalLanguageLogEntry(textLength, result, durationMs) {
  return {
    format: INPUT_FORMATS.NATURAL_LANGUAGE,
    textLength,
    ...outcomeFields(result),
    durationMs,
  };
}

// Rama JSON: aceptado → solo conteos; rechazado → código, ruta y texto completo
// para reproducir el fallo, salvo input_too_long, que guarda solo la longitud.
function jsonLogEntry(text, result, durationMs) {
  const entry = { format: INPUT_FORMATS.JSON, textLength: text.length, ...outcomeFields(result) };
  if (!result?.ok) {
    const error = result?.error ?? {};
    if (error.service !== undefined) entry.service = error.service;
    if (error.serviceIndex !== undefined) entry.serviceIndex = error.serviceIndex;
    if (error.key !== undefined) entry.key = error.key;
    if (entry.code !== E.INPUT_TOO_LONG) entry.text = text.slice(0, MAX_JSON_CHARS);
  }
  entry.durationMs = durationMs;
  return entry;
}

export function toLogEntry(rawInput, result, { durationMs = 0 } = {}) {
  const text = typeof rawInput?.text === "string" ? rawInput.text : "";
  if (rawInput?.format === INPUT_FORMATS.JSON) return jsonLogEntry(text, result, durationMs);
  return naturalLanguageLogEntry(text.length, result, durationMs);
}
