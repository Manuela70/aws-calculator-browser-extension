// lib/mapping/deterministic-mapper.js — Mapeo determinístico campo ↔ valor por pasadas
// (BR1.1-BR1.4, BR2.1-BR2.6, BR3.1, BR4.1). Dueño: U3 (completa en sitio el
// provisional de U1). Capa de mapeo extraíble a su propio módulo ES: función
// pura, sin DOM, sin red y sin estado; acoplada solo por import.

import {
  isUnitFieldType,
  isUnitKey,
  normalizeText,
  toggleState,
  validateFieldValue,
} from "./option-match.js";
import { cleanAriaLabel } from "../dom/aria-label.js";

export const LABEL_SEPARATOR = " > ";
export const MAX_PASSES = 3;

// Tipo de campo → tipo de acción (BR2.1), tabla cerrada en paridad con C1. Un
// tipo ausente (slider o desconocido) produce unsupported_type. toggle se
// resuelve aparte según el valor (toggle_on / toggle_off).
export const FIELD_TYPE_TO_ACTION = Object.freeze({
  text: "fill",
  number: "fill",
  search: "fill",
  select: "select",
  dropdown: "dropdown",
  radio: "radio",
  radiogroup: "radio",
  checkbox: "checkbox",
  instance_radio: "instance_radio",
  toggle: "toggle",
});

// Motivos que pueden ir al cerebro (BR3.2); el resto son errores de la configuración.
export const SENDABLE_REASONS = Object.freeze(["no_match", "option_no_match"]);

export const RESIDUE_STATUS = Object.freeze({
  PENDING_PASSES: "pending_passes",
  NONE: "none",
  RESOLVED_BY_BRAIN: "resolved_by_brain",
  BRAIN_UNAVAILABLE: "brain_unavailable",
  STILL_UNRESOLVED: "still_unresolved",
});

export function fieldNamePart(label) {
  const parts = String(label ?? "").split(LABEL_SEPARATOR);
  return parts[parts.length - 1];
}

// Tipo de acción para un campo; null si el tipo no tiene acción o el toggle
// trae un valor que no es on/off/true/false.
export function actionTypeFor(fieldType, value) {
  const action = Object.hasOwn(FIELD_TYPE_TO_ACTION, fieldType)
    ? FIELD_TYPE_TO_ACTION[fieldType]
    : null;
  if (action !== "toggle") return action;
  const state = toggleState(value);
  if (state === null) return null;
  return state ? "toggle_on" : "toggle_off";
}

// Normalización de etiquetas (BR1.1): limpieza FIX-1, espacios y minúsculas.
export function normalizeLabel(label) {
  return normalizeText(cleanAriaLabel(String(label ?? "")));
}

// Claves por las que se puede pedir un campo: "Sección > Campo" y "Campo" (BR1.2).
function labelKeysFor(field) {
  const keys = new Set([normalizeLabel(field.label), normalizeLabel(fieldNamePart(field.label))]);
  if (field.section && !String(field.label).includes(LABEL_SEPARATOR)) {
    keys.add(normalizeLabel(`${field.section}${LABEL_SEPARATOR}${field.label}`));
  }
  keys.delete("");
  return keys;
}

// Índice etiqueta normalizada → DomField[]; una búsqueda exacta, nunca difusa.
export function buildLabelIndex(domFields) {
  const index = new Map();
  for (const field of Array.isArray(domFields) ? domFields : []) {
    if (!field || typeof field.label !== "string") continue;
    for (const key of labelKeysFor(field)) {
      const list = index.get(key) ?? [];
      if (!list.includes(field)) list.push(field);
      index.set(key, list);
    }
  }
  return index;
}

function unresolvedValue(requested, reason) {
  return {
    key: requested.key,
    value: requested.value,
    reason,
    sendable: SENDABLE_REASONS.includes(reason),
  };
}

// Resuelve un valor pedido contra el escaneo actual: { field, actionType, value }
// o { reason } con el motivo de UnresolvedValue (BR1.2-BR1.4, BR2.1-BR2.5).
function resolveRequested(requested, index, usedLabels) {
  const matches = index.get(normalizeLabel(requested.key)) ?? [];
  if (matches.length === 0) return { reason: "no_match" };
  if (matches.length > 1) return { reason: "ambiguous_label" };
  const field = matches[0];
  if (usedLabels.has(normalizeLabel(field.label))) return { reason: "duplicate_target" };
  if (!Object.hasOwn(FIELD_TYPE_TO_ACTION, field.type)) return { reason: "unsupported_type" };
  if (isUnitKey(requested.key) && !isUnitFieldType(field.type)) return { reason: "invalid_value" };
  const checked = validateFieldValue(field.type, requested.value, field.options);
  if (!checked.ok) return { reason: checked.reason };
  return { field, actionType: actionTypeFor(field.type, checked.value), value: checked.value };
}

// Renumera act-1, act-2, … en orden de ejecución.
export function renumberActions(actions) {
  return actions.map((action, i) => ({ ...action, actionId: `act-${i + 1}` }));
}

function emptyOutcome() {
  return {
    actions: [],
    pending: [],
    newActionsInLastPass: 0,
    pass: 0,
    unresolved: [],
    residueStatus: RESIDUE_STATUS.PENDING_PASSES,
  };
}

// Cierra las pasadas (BR3.1): los pendientes pasan al residuo como no_match.
// Con residuo no enviable el servicio ya falló (BR3.4): actions = [].
export function closeOutcome(outcome) {
  const unresolved = [
    ...outcome.unresolved,
    ...outcome.pending.map((requested) => unresolvedValue(requested, "no_match")),
  ];
  if (unresolved.length === 0) {
    return { ...outcome, pending: [], unresolved, residueStatus: RESIDUE_STATUS.NONE };
  }
  const definitive = unresolved.some((value) => !value.sendable);
  return {
    ...outcome,
    actions: definitive ? [] : outcome.actions,
    pending: [],
    unresolved,
    residueStatus: RESIDUE_STATUS.STILL_UNRESOLVED,
  };
}

// Una pasada de mapeo (M1). Sin previousOutcome mapea todos los valores pedidos;
// con él, solo los pendientes de la pasada anterior. Devuelve MappingOutcome con
// residueStatus = pending_passes mientras haga falta otra pasada (U5 aplica las
// acciones nuevas y vuelve a escanear), o cerrado tras la pasada 3, una pasada
// sin acciones nuevas o sin pendientes.
export function mapDeterministic(domFields, requestedValues, previousOutcome) {
  const previous = previousOutcome ?? emptyOutcome();
  if (previous.residueStatus !== RESIDUE_STATUS.PENDING_PASSES) return previous;
  const toMap = previousOutcome ? previous.pending : (requestedValues ?? []);
  const index = buildLabelIndex(domFields);
  const usedLabels = new Set(previous.actions.map((a) => normalizeLabel(a.fieldLabel)));
  const actions = [...previous.actions];
  const unresolved = [...previous.unresolved];
  const pending = [];
  for (const requested of toMap) {
    const resolved = resolveRequested(requested, index, usedLabels);
    if (resolved.reason === "no_match") pending.push(requested);
    else if (resolved.reason) unresolved.push(unresolvedValue(requested, resolved.reason));
    else {
      usedLabels.add(normalizeLabel(resolved.field.label));
      actions.push({
        actionId: `act-${actions.length + 1}`,
        fieldLabel: resolved.field.label,
        actionType: resolved.actionType,
        value: resolved.value,
        source: "deterministic",
        requestKey: requested.key,
        substituted: false,
      });
    }
  }
  const pass = previous.pass + 1;
  const newActionsInLastPass = actions.length - previous.actions.length;
  const outcome = { ...previous, actions, pending, newActionsInLastPass, pass, unresolved };
  const isDone = pending.length === 0 || newActionsInLastPass === 0 || pass >= MAX_PASSES;
  return isDone ? closeOutcome(outcome) : outcome;
}

// Detalle "clave: motivo" de cada valor sin resolver (functional-spec §4, BR3.4);
// con el cerebro no disponible agrega el motivo y el código (U5 lo copia a
// ServiceResult.detail; U6 lo traduce).
export function describeUnresolved(outcome) {
  const parts = (outcome?.unresolved ?? []).map((value) => `${value.key}: ${value.reason}`);
  if (outcome?.residueStatus === RESIDUE_STATUS.BRAIN_UNAVAILABLE) {
    const cause = outcome.brainErrorCode ?? outcome.residueDetail;
    parts.push(cause ? `brain_unavailable (${cause})` : "brain_unavailable");
  }
  return parts.join("; ");
}

// Entrada del registro técnico (NFR5.4): conteos, claves pendientes con su
// motivo, estado del residuo y duración. Nunca los valores pedidos, las
// opciones del formulario ni la respuesta del cerebro.
export function toLogEntry(outcome, { durationMs } = {}) {
  const status = outcome?.residueStatus;
  const ok = status === RESIDUE_STATUS.NONE || status === RESIDUE_STATUS.RESOLVED_BY_BRAIN;
  const keys = (outcome?.unresolved ?? []).map((value) => `${value.key}: ${value.reason}`);
  const cause = outcome?.brainErrorCode ?? outcome?.residueDetail;
  if (cause) keys.push(`brain: ${cause}`);
  const counts = [
    `pasadas=${outcome?.pass ?? 0}`,
    `acciones=${outcome?.actions?.length ?? 0}`,
    `residuo=${outcome?.unresolved?.length ?? 0}`,
    `duración=${Number.isFinite(durationMs) ? Math.round(durationMs) : 0} ms`,
  ];
  const entry = {
    level: ok ? "info" : "warn",
    event: "mapping_outcome",
    message: `Mapeo: ${counts.join(", ")}`,
    value: status,
  };
  if (keys.length > 0) entry.detail = keys.join("; ");
  return entry;
}
