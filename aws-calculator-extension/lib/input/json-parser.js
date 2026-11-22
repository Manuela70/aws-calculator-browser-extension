// lib/input/json-parser.js — Grupo 2: JSON del Anexo A con esquema cerrado
// (BR2.1-BR2.7, BR3.3; NFR3.1, NFR3.3, NFR3.4, NFR3.5).
// Dueño: U2 (completa en sitio el provisional de U1).
// - parseJsonText(text): tope de tamaño, JSON.parse y validación.
// - parseRunInput(data): validador común; lo reutiliza la respuesta del cerebro
//   para que ninguna de las dos fuentes pueda colar claves ni pasar los topes.
// Devuelve { ok: true, value: RunInput } o { ok: false, error: InputError };
// nunca lanza ni devuelve servicios parciales.

import { INPUT_ERROR_CODES as E, INVALID_JSON_MESSAGE, failInput } from "./input-errors.js";
import {
  MAX_FIELD_CHARS,
  MAX_FIELDS,
  MAX_JSON_CHARS,
  MAX_PROJECT_CHARS,
  MAX_SERVICES,
  ROOT_KEYS,
  SERVICE_KEYS,
  isForbiddenKey,
} from "./input-schema.js";

export { INVALID_JSON_MESSAGE };

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

// Primera clave fuera de la tabla permitida; las rechazadas se evalúan antes.
function findUnknownKey(object, allowed) {
  const keys = Object.keys(object);
  return keys.find(isForbiddenKey) ?? keys.find((key) => !allowed.includes(key));
}

function serviceDetails(svc, index) {
  const service = isPlainObject(svc) && isNonEmptyString(svc.name) ? svc.name : undefined;
  return { service, serviceIndex: index };
}

function validateRoot(data) {
  const unknownKey = findUnknownKey(data, ROOT_KEYS);
  if (unknownKey !== undefined) return failInput(E.UNKNOWN_KEY, { key: unknownKey });
  if (data.project !== undefined) {
    const project = data.project;
    const isValid =
      typeof project === "string" &&
      project.trim().length > 0 &&
      project.length <= MAX_PROJECT_CHARS;
    if (!isValid) return failInput(E.INVALID_PROJECT, { key: "project" });
  }
  if (data.region !== undefined && !isNonEmptyString(data.region)) {
    return failInput(E.INVALID_REGION, { key: "region" });
  }
  if (!Array.isArray(data.services)) return failInput(E.MISSING_SERVICES, { key: "services" });
  if (data.services.length === 0) return failInput(E.EMPTY_SERVICES, { key: "services" });
  if (data.services.length > MAX_SERVICES) {
    return failInput(E.INPUT_LIMIT_EXCEEDED, { limit: "services", key: "services" });
  }
  return null;
}

// Valor de fields como texto, igual que lo hará la normalización (BR4.3).
function fieldValueText(value) {
  const type = typeof value;
  if (type === "string") return value;
  if (type === "number" && Number.isFinite(value)) return String(value);
  if (type === "boolean") return String(value);
  return null;
}

function validateFields(fields, details) {
  if (fields === undefined) return null;
  if (!isPlainObject(fields)) return failInput(E.INVALID_FIELDS, { ...details, key: "fields" });
  const forbidden = Object.keys(fields).find(isForbiddenKey);
  if (forbidden !== undefined) return failInput(E.UNKNOWN_KEY, { ...details, key: forbidden });
  const entries = Object.entries(fields);
  if (entries.length > MAX_FIELDS) {
    return failInput(E.INPUT_LIMIT_EXCEEDED, { ...details, limit: "fields", key: "fields" });
  }
  for (const [key, value] of entries) {
    const text = fieldValueText(value);
    if (text === null) return failInput(E.INVALID_FIELD_VALUE, { ...details, key });
    if (key.length > MAX_FIELD_CHARS || text.length > MAX_FIELD_CHARS) {
      return failInput(E.INPUT_LIMIT_EXCEEDED, { ...details, limit: "field_chars", key });
    }
  }
  return null;
}

function validateService(svc, index) {
  const details = serviceDetails(svc, index);
  if (!isPlainObject(svc)) return failInput(E.INVALID_SERVICE, details);
  const unknownKey = findUnknownKey(svc, SERVICE_KEYS);
  if (unknownKey !== undefined) return failInput(E.UNKNOWN_KEY, { ...details, key: unknownKey });
  if (!isNonEmptyString(svc.name)) {
    return failInput(E.MISSING_SERVICE_NAME, { ...details, key: "name" });
  }
  if (svc.search_term !== undefined && !isNonEmptyString(svc.search_term)) {
    return failInput(E.INVALID_SEARCH_TERM, { ...details, key: "search_term" });
  }
  if (svc.template !== undefined && !isNonEmptyString(svc.template)) {
    return failInput(E.INVALID_SERVICE, { ...details, key: "template" });
  }
  return validateFields(svc.fields, details);
}

// Copia solo las claves del esquema a objetos nuevos (NFR3.5).
function copyService(svc) {
  const copy = { name: svc.name };
  if (svc.search_term !== undefined) copy.search_term = svc.search_term;
  if (svc.template !== undefined) copy.template = svc.template;
  if (svc.fields !== undefined) copy.fields = Object.fromEntries(Object.entries(svc.fields));
  return copy;
}

function copyRunInput(data) {
  const copy = { services: data.services.map(copyService) };
  if (data.project !== undefined) copy.project = data.project;
  if (data.region !== undefined) copy.region = data.region;
  return copy;
}

// Validador común (BR2.2-BR2.7): JSON pegado y runInput del cerebro (BR3.3).
export function parseRunInput(data) {
  if (!isPlainObject(data)) return failInput(E.NOT_OBJECT);
  const rootError = validateRoot(data);
  if (rootError) return rootError;
  for (let i = 0; i < data.services.length; i++) {
    const serviceError = validateService(data.services[i], i);
    if (serviceError) return serviceError;
  }
  return { ok: true, value: copyRunInput(data) };
}

// Camino JSON completo (BR2.1 + validador común). El tope de tamaño se evalúa
// antes de parsear para acotar el costo de JSON.parse (NFR3.4).
export function parseJsonText(text) {
  const source = typeof text === "string" ? text : "";
  if (source.length > MAX_JSON_CHARS) {
    return failInput(E.INPUT_TOO_LONG, { maxLength: MAX_JSON_CHARS });
  }
  let data;
  try {
    data = JSON.parse(source);
  } catch {
    return failInput(E.INVALID_JSON);
  }
  return parseRunInput(data);
}
