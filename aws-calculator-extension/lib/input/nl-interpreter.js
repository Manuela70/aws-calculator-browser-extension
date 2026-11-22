// lib/input/nl-interpreter.js — Grupo 3: lenguaje natural vía el puerto del
// cerebro (BR3.2-BR3.6; NFR1.1, NFR3.2, NFR8.4, NFR8.5).
// Dueño: U2. No contiene gramática: arma la petición, llama al puerto
// inyectado interpretNaturalLanguage(request, { signal }) y traduce su
// respuesta o su BrainCallError a RunInput o InputError. U2 no sabe dónde vive
// el cerebro; U7 conecta la implementación real (service worker, BRAIN_CALL).

import { INPUT_ERROR_CODES as E, failInput } from "./input-errors.js";
import {
  MAX_FRAGMENT_CHARS,
  MAX_FRAGMENTS,
  NL_LOCALE,
  NL_SCHEMA_VERSION,
  NL_TIMEOUT_MS,
  UNRESOLVED_REASONS,
} from "./input-schema.js";
import { parseRunInput } from "./json-parser.js";

// Códigos del canal de error que el SE debe ver con su propio texto (NFR3.2).
const PASS_THROUGH_CODES = Object.freeze([
  E.UNAUTHORIZED,
  E.LOGIN_CANCELLED,
  E.RATE_LIMITED,
  E.DAILY_QUOTA_EXCEEDED,
  E.INVENTORY_UNAVAILABLE,
  E.TIMEOUT,
]);

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isBoundedText(value, { optional }) {
  if (value === undefined) return optional;
  return typeof value === "string" && value.trim().length > 0 && value.length <= MAX_FRAGMENT_CHARS;
}

// NlInterpretationRequest: solo texto y parámetros, nunca credenciales (BR3.2).
export function buildInterpretationRequest(text) {
  return { text, locale: NL_LOCALE, schemaVersion: NL_SCHEMA_VERSION };
}

// BrainCallError.code → InputError (NFR3.2). empty_result significa que el
// cerebro respondió sin una configuración usable; el resto de los códigos
// (bad_request, internal_error, brain_unavailable, desconocidos, errores de
// red sin código) se informan como brain_unavailable.
export function classifyPortError(error) {
  const code = isPlainObject(error) || error instanceof Error ? error.code : undefined;
  if (PASS_THROUGH_CODES.includes(code)) {
    const retryAfterSeconds = error.retryAfterSeconds;
    const hasRetry =
      code === E.RATE_LIMITED && Number.isInteger(retryAfterSeconds) && retryAfterSeconds >= 0;
    return failInput(code, hasRetry ? { retryAfterSeconds } : {});
  }
  if (code === "empty_result") return failInput(E.NL_INVALID_RESPONSE);
  return failInput(E.BRAIN_UNAVAILABLE);
}

// Copia un fragmento validado (BR3.6) o devuelve null si la forma no cumple.
function copyFragment(item) {
  if (!isPlainObject(item)) return null;
  if (!isBoundedText(item.fragment, { optional: false })) return null;
  if (!isBoundedText(item.service, { optional: true })) return null;
  if (!UNRESOLVED_REASONS.includes(item.reason)) return null;
  const copy = { fragment: item.fragment, reason: item.reason };
  if (item.service !== undefined) copy.service = item.service;
  return copy;
}

function classifyUnresolved(response) {
  const list = response.unresolved;
  const isValidList =
    response.runInput === undefined &&
    Array.isArray(list) &&
    list.length > 0 &&
    list.length <= MAX_FRAGMENTS;
  if (!isValidList) return failInput(E.NL_INVALID_RESPONSE);
  const fragments = list.map(copyFragment);
  if (fragments.includes(null)) return failInput(E.NL_INVALID_RESPONSE);
  return failInput(E.NL_UNRESOLVED, { fragments });
}

function classifyInterpreted(response) {
  if (response.unresolved !== undefined || response.runInput === undefined) {
    return failInput(E.NL_INVALID_RESPONSE);
  }
  // Misma validación que un JSON pegado (BR3.3); cualquier fallo se informa
  // como respuesta inválida del cerebro, no como error del SE (BR3.6).
  const parsed = parseRunInput(response.runInput);
  return parsed.ok ? parsed : failInput(E.NL_INVALID_RESPONSE);
}

// Valida la forma completa de la respuesta antes de usarla (paso 2b, BR3.6).
export function classifyPortResponse(response) {
  if (!isPlainObject(response)) return failInput(E.NL_INVALID_RESPONSE);
  if (response.status === "interpreted") return classifyInterpreted(response);
  if (response.status === "unresolved") return classifyUnresolved(response);
  return failInput(E.NL_INVALID_RESPONSE);
}

// Carrera entre la respuesta del puerto, la señal de la corrida y el tope de
// 30 s; gana el primer evento y lo que llega después se descarta (NFR8.4,
// NFR8.5). El vencimiento del tope propio se informa como timeout, igual que
// el timeout del puerto, para que el SE vea un solo texto de "tardó demasiado".
export async function interpretText(text, deps = {}) {
  const { interpretNaturalLanguage, signal, timeoutMs = NL_TIMEOUT_MS } = deps;
  if (typeof interpretNaturalLanguage !== "function") return failInput(E.BRAIN_UNAVAILABLE);
  if (signal?.aborted) return failInput(E.CANCELLED);

  const controller = new AbortController();
  let timer;
  let onExternalAbort;
  const stopped = new Promise((resolve) => {
    onExternalAbort = () => {
      controller.abort("external");
      resolve(failInput(E.CANCELLED));
    };
    signal?.addEventListener("abort", onExternalAbort, { once: true });
    timer = setTimeout(() => {
      controller.abort("timeout");
      resolve(failInput(E.TIMEOUT));
    }, timeoutMs);
  });
  const answered = Promise.resolve()
    .then(() =>
      interpretNaturalLanguage(buildInterpretationRequest(text), { signal: controller.signal }),
    )
    .then(classifyPortResponse, classifyPortError);

  try {
    return await Promise.race([answered, stopped]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onExternalAbort);
  }
}
