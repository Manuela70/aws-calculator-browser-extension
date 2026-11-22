// lib/mapping/option-match.js — Normalización, coincidencia de opciones y validación
// de valores por tipo de campo (BR1.1, BR2.2-BR2.5). Dueño: U3; también lo usa U5
// al ejecutar. Función pura de Zona A: sin DOM, sin red y sin estado.
// Nunca elige por aproximación: ni "contiene" ni "primer resultado".

// Decimal simple: signo opcional, dígitos y, opcionalmente, punto y dígitos
// (BR2.2). Sin unidades, separadores de miles, comas decimales ni exponentes.
const PLAIN_NUMBER = /^[+-]?\d+(?:\.\d+)?$/;

// Sufijo de la clave de unidad o periodo: "<Campo> unit" (BR2.3).
export const UNIT_KEY_SUFFIX = " unit";

// Tipos de campo cuyo valor debe ser una de sus opciones (BR2.4).
export const OPTION_FIELD_TYPES = Object.freeze(["select", "dropdown", "radio", "radiogroup"]);

// Tipos que pueden recibir la clave de unidad (selector propio, Q1).
const UNIT_FIELD_TYPES = Object.freeze(["select", "dropdown"]);

const BOOLEAN_VALUES = Object.freeze(["true", "false"]);
const TOGGLE_VALUES = Object.freeze({ on: true, true: true, off: false, false: false });

export function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

// Devuelve { ok: true, index, option } si el valor coincide exactamente con UNA
// opción; { ok: false, reason: "no_match" | "ambiguous" } en otro caso.
export function matchOption(value, options) {
  const target = normalizeText(value);
  if (!target || !Array.isArray(options)) return { ok: false, reason: "no_match" };
  const hits = [];
  options.forEach((option, index) => {
    if (normalizeText(option) === target) hits.push(index);
  });
  if (hits.length === 0) return { ok: false, reason: "no_match" };
  if (hits.length > 1) return { ok: false, reason: "ambiguous" };
  return { ok: true, index: hits[0], option: options[hits[0]] };
}

// Para instance_radio: la comparación es contra el tipo de instancia de cada fila.
export function matchInstanceRow(instanceType, rowTypes) {
  return matchOption(instanceType, rowTypes);
}

// true si el valor es un decimal simple sin unidad (BR2.2).
export function isPlainNumber(value) {
  return typeof value === "string" && PLAIN_NUMBER.test(value.trim());
}

// true si la clave pedida es la de una unidad o periodo ("<Campo> unit").
export function isUnitKey(key) {
  const normalized = normalizeText(key);
  return normalized.length > UNIT_KEY_SUFFIX.length && normalized.endsWith(UNIT_KEY_SUFFIX);
}

// Una clave de unidad solo puede ir a un selector (dropdown o select).
export function isUnitFieldType(fieldType) {
  return UNIT_FIELD_TYPES.includes(fieldType);
}

// Estado de un toggle pedido: true (on), false (off) o null si el valor no vale.
export function toggleState(value) {
  const state = TOGGLE_VALUES[normalizeText(value)];
  return state === undefined ? null : state;
}

function validateOption(value, options) {
  if (!Array.isArray(options) || options.length === 0) {
    // Sin opciones al escanear: se emite el valor pedido y U5 compara al ejecutar.
    return { ok: true, value };
  }
  const match = matchOption(value, options);
  if (match.ok) return { ok: true, value: match.option };
  return {
    ok: false,
    reason: match.reason === "ambiguous" ? "option_ambiguous" : "option_no_match",
  };
}

// Valida un valor pedido según el tipo del campo objetivo (BR2.2, BR2.4, BR2.5).
// Devuelve { ok: true, value } con el valor a aplicar (la opción tal como aparece
// en el formulario, o el booleano en minúsculas), o { ok: false, reason } con
// el motivo de UnresolvedValue.
export function validateFieldValue(fieldType, value, options) {
  const text = String(value ?? "");
  if (fieldType === "number") {
    return isPlainNumber(text)
      ? { ok: true, value: text.trim() }
      : { ok: false, reason: "invalid_number" };
  }
  if (OPTION_FIELD_TYPES.includes(fieldType)) return validateOption(text, options);
  if (fieldType === "checkbox") {
    const normalized = normalizeText(text);
    return BOOLEAN_VALUES.includes(normalized)
      ? { ok: true, value: normalized }
      : { ok: false, reason: "invalid_value" };
  }
  if (fieldType === "toggle") {
    return toggleState(text) === null
      ? { ok: false, reason: "invalid_value" }
      : { ok: true, value: normalizeText(text) };
  }
  if (normalizeText(text) === "") return { ok: false, reason: "invalid_value" };
  return { ok: true, value: text };
}
