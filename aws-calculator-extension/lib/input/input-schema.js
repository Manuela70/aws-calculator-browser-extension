// lib/input/input-schema.js — Topes y tablas del esquema cerrado del Anexo A
// (BR2.5, BR2.7, BR3.1, BR3.6; NFR3.3, NFR3.4, NFR3.5).
// Dueño: U2. Datos puros, sin dependencias: los comparten el camino JSON y la
// validación de la respuesta del cerebro, así ambos aplican los mismos topes.

// Topes de tamaño del texto, evaluados antes de cualquier parseo (NFR3.4).
export const MAX_JSON_CHARS = 100000;
export const MAX_NL_CHARS = 2000;

// Topes de contenido de la configuración, iguales a los de C2 (BR2.7).
export const MAX_SERVICES = 20;
export const MAX_FIELDS = 30;
export const MAX_FIELD_CHARS = 100;
export const MAX_PROJECT_CHARS = 200;

// Topes de la rama "unresolved" de la respuesta del cerebro (BR3.6).
export const MAX_FRAGMENTS = 20;
export const MAX_FRAGMENT_CHARS = 200;

// Petición de interpretación (BR3.2) y tope de espera del puerto (NFR8.4).
export const NL_LOCALE = "es";
export const NL_SCHEMA_VERSION = 1;
export const NL_TIMEOUT_MS = 30000;

export const TOGGLE_PREFIX = "__switch__:";

export const INPUT_FORMATS = Object.freeze({
  JSON: "json",
  NATURAL_LANGUAGE: "natural_language",
});

export const WAF_REVIEW = Object.freeze({
  REQUIRED: "required",
  NOT_AVAILABLE: "not_available",
});

// Claves permitidas por nivel del esquema cerrado (BR2.5).
export const ROOT_KEYS = Object.freeze(["project", "region", "services"]);
export const SERVICE_KEYS = Object.freeze(["name", "search_term", "template", "fields"]);

// Claves rechazadas siempre, evaluadas antes de las permitidas (NFR3.5).
export const FORBIDDEN_KEYS = Object.freeze(["__proto__", "constructor", "prototype"]);

export const UNRESOLVED_REASONS = Object.freeze([
  "unknown_service",
  "ambiguous_service",
  "unknown_field",
  "ambiguous_field",
  "missing_value",
  "unsupported_component",
  "region_unavailable",
]);

export function isForbiddenKey(key) {
  return FORBIDDEN_KEYS.includes(key);
}
