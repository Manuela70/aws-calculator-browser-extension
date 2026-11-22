// lib/input/input-errors.js — Códigos de InputError y sus mensajes en español
// (entities.md InputError; BR1.2-BR5.4; NFR3.1, NFR5.2).
// Dueño: U2. Los mensajes son texto plano: U6 los pinta con textContent
// (NFR3.6). Ninguna función de este módulo produce marcado.

import { MAX_FIELD_CHARS, MAX_FIELDS, MAX_PROJECT_CHARS, MAX_SERVICES } from "./input-schema.js";

export const INPUT_ERROR_CODES = Object.freeze({
  EMPTY_INPUT: "empty_input",
  INPUT_TOO_LONG: "input_too_long",
  INVALID_JSON: "invalid_json",
  NOT_OBJECT: "not_object",
  UNKNOWN_KEY: "unknown_key",
  MISSING_SERVICES: "missing_services",
  EMPTY_SERVICES: "empty_services",
  INVALID_SERVICE: "invalid_service",
  MISSING_SERVICE_NAME: "missing_service_name",
  INVALID_SEARCH_TERM: "invalid_search_term",
  INVALID_FIELDS: "invalid_fields",
  INVALID_FIELD_VALUE: "invalid_field_value",
  INVALID_TOGGLE: "invalid_toggle",
  INVALID_PROJECT: "invalid_project",
  INVALID_REGION: "invalid_region",
  UNKNOWN_REGION: "unknown_region",
  INPUT_LIMIT_EXCEEDED: "input_limit_exceeded",
  NL_UNRESOLVED: "nl_unresolved",
  NL_INVALID_RESPONSE: "nl_invalid_response",
  BRAIN_UNAVAILABLE: "brain_unavailable",
  CANCELLED: "cancelled",
  UNAUTHORIZED: "unauthorized",
  LOGIN_CANCELLED: "login_cancelled",
  RATE_LIMITED: "rate_limited",
  DAILY_QUOTA_EXCEEDED: "daily_quota_exceeded",
  INVENTORY_UNAVAILABLE: "inventory_unavailable",
  TIMEOUT: "timeout",
  UNEXPECTED_ERROR: "unexpected_error",
});

// Aviso de privacidad de la pestaña de lenguaje natural (NFR5.2); lo pinta U6.
export const NL_PRIVACY_NOTICE =
  "No incluyas nombres de clientes ni datos personales; describe solo la arquitectura.";

export const INVALID_JSON_MESSAGE = "❌ JSON inválido.";

const LIMIT_TEXT = Object.freeze({
  services: `${MAX_SERVICES} servicios`,
  fields: `${MAX_FIELDS} claves en "fields" por servicio`,
  field_chars: `${MAX_FIELD_CHARS} caracteres por clave o valor`,
});

// Referencia legible al servicio: por name si se conoce, si no por posición.
function serviceRef({ service, serviceIndex }) {
  if (typeof service === "string" && service.length > 0) return `"${service}"`;
  return Number.isInteger(serviceIndex) ? `#${serviceIndex + 1}` : "sin nombre";
}

function limitMessage(details) {
  const limitText = LIMIT_TEXT[details.limit] ?? "tamaño permitido";
  const where = [];
  if (Number.isInteger(details.serviceIndex)) where.push(`servicio ${details.serviceIndex + 1}`);
  if (typeof details.key === "string") where.push(`clave "${details.key}"`);
  const suffix = where.length > 0 ? ` (${where.join(", ")})` : "";
  return `❌ La configuración supera el límite de ${limitText}${suffix}.`;
}

function unknownKeyMessage(details) {
  if (details.service === undefined && details.serviceIndex === undefined) {
    return `❌ La configuración tiene una clave desconocida: "${details.key}".`;
  }
  return `❌ El servicio ${serviceRef(details)} tiene una clave desconocida: "${details.key}".`;
}

function invalidServiceMessage(details) {
  const ref = serviceRef(details);
  if (details.key === "template") {
    return `❌ "template" del servicio ${ref} debe ser un texto no vacío.`;
  }
  return `❌ El servicio ${ref} debe ser un objeto.`;
}

// Describe un fragmento no interpretado en lenguaje de dominio (BR3.4).
export function describeFragment({ fragment, service, reason }) {
  const of = typeof service === "string" && service.length > 0 ? ` de ${service}` : "";
  switch (reason) {
    case "unknown_service":
      return `no reconocí el servicio "${fragment}"`;
    case "ambiguous_service":
      return `"${fragment}" puede referirse a más de un servicio`;
    case "unknown_field":
      return `no reconocí el campo "${fragment}"${of}`;
    case "ambiguous_field":
      return `no sé a qué campo${of || " del servicio"} corresponden "${fragment}"`;
    case "missing_value":
      return `falta el valor de "${fragment}"${of}`;
    case "unsupported_component":
      return `"${fragment}"${of} no se puede configurar en la calculadora`;
    case "region_unavailable":
      return `la región pedida en "${fragment}" no está disponible${of && ` para ${service}`}`;
    default:
      return `no pude interpretar "${fragment}"`;
  }
}

function unresolvedMessage(details) {
  const parts = (details.fragments ?? []).map(describeFragment);
  return `❌ No pude interpretar toda la descripción: ${parts.join("; ")}. No se llenó nada.`;
}

function rateLimitedMessage(details) {
  const wait = Number.isInteger(details.retryAfterSeconds)
    ? ` en ${details.retryAfterSeconds} s`
    : " en unos momentos";
  return `❌ Hay demasiadas solicitudes al servicio que interpreta la descripción. Intenta de nuevo${wait}.`;
}

const MESSAGES = Object.freeze({
  empty_input: () => "❌ Escribe la configuración antes de generar el estimado.",
  input_too_long: (d) =>
    `❌ El texto supera el máximo de ${d.maxLength} caracteres. Acórtalo e intenta de nuevo.`,
  invalid_json: () => INVALID_JSON_MESSAGE,
  not_object: () => '❌ El JSON debe ser un objeto con "services".',
  unknown_key: unknownKeyMessage,
  missing_services: () => '❌ Falta la lista "services".',
  empty_services: () => "❌ Sin servicios definidos.",
  invalid_service: invalidServiceMessage,
  missing_service_name: (d) => `❌ El servicio ${serviceRef(d)} no tiene "name".`,
  invalid_search_term: (d) =>
    `❌ "search_term" del servicio ${serviceRef(d)} debe ser un texto no vacío.`,
  invalid_fields: (d) =>
    `❌ "fields" del servicio ${serviceRef(d)} debe ser un objeto etiqueta → valor.`,
  invalid_field_value: (d) =>
    `❌ El campo "${d.key}" del servicio ${serviceRef(d)} debe ser texto, número o booleano.`,
  invalid_toggle: (d) =>
    d.key
      ? `❌ El toggle "${d.key}" del servicio ${serviceRef(d)} debe ser on, off, true o false.`
      : `❌ Hay un toggle sin nombre en el servicio ${serviceRef(d)}.`,
  invalid_project: () => `❌ "project" debe ser un texto de 1 a ${MAX_PROJECT_CHARS} caracteres.`,
  invalid_region: () => '❌ "region" debe ser un código de región (p. ej. us-east-1).',
  unknown_region: (d) => `❌ No reconozco la región ${d.region}.`,
  input_limit_exceeded: limitMessage,
  nl_unresolved: unresolvedMessage,
  nl_invalid_response: () =>
    "❌ No pude interpretar la descripción de forma confiable. Intenta de nuevo o usa la pestaña JSON.",
  brain_unavailable: () =>
    "❌ No pude conectar con el servicio que interpreta la descripción. Usa la pestaña JSON o intenta más tarde.",
  cancelled: () => "Interpretación cancelada.",
  unauthorized: () =>
    "❌ Tu sesión con el servicio que interpreta la descripción no es válida o venció. Inicia sesión e intenta de nuevo.",
  login_cancelled: () =>
    "❌ Se canceló el inicio de sesión. Inicia sesión para usar la descripción en lenguaje natural.",
  rate_limited: rateLimitedMessage,
  daily_quota_exceeded: () =>
    "❌ Alcanzaste el tope diario del servicio que interpreta la descripción. Usa la pestaña JSON o intenta mañana.",
  inventory_unavailable: () =>
    "❌ El inventario de servicios de la calculadora no está disponible ahora. Usa la pestaña JSON o intenta más tarde.",
  timeout: () =>
    "❌ El servicio que interpreta la descripción tardó demasiado en responder. Intenta de nuevo o usa la pestaña JSON.",
  unexpected_error: () =>
    "❌ Ocurrió un error inesperado al procesar la entrada. Intenta de nuevo; tu texto no se perdió.",
});

const DETAIL_KEYS = Object.freeze([
  "service",
  "serviceIndex",
  "key",
  "limit",
  "maxLength",
  "region",
  "fragments",
  "retryAfterSeconds",
]);

export function isInputErrorCode(code) {
  return Object.hasOwn(MESSAGES, code);
}

// Construye un InputError { code, message, ...detalles }. Solo copia los
// detalles conocidos y definidos; un código desconocido es un error de
// programación y se reporta como unexpected_error.
export function makeInputError(code, details = {}) {
  const safeCode = isInputErrorCode(code) ? code : INPUT_ERROR_CODES.UNEXPECTED_ERROR;
  const error = { code: safeCode, message: MESSAGES[safeCode](details) };
  for (const key of DETAIL_KEYS) {
    if (details[key] !== undefined) error[key] = details[key];
  }
  return error;
}

// Resultado tipado de fallo (NFR3.1): nunca va acompañado de servicios.
export function failInput(code, details) {
  return { ok: false, error: makeInputError(code, details) };
}
