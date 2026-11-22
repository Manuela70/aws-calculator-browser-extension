// lib/mapping/deterministic-mapper.js — mapDeterministic(domFields, requestedValues) (BR3.1-BR3.3).
// PROVISIONAL (U1, walking skeleton). Dueño final: U3 (DeterministicMapper),
// que lo completa en sitio. Es la capa de mapeo extraíble a su propio módulo
// ES (regla afirmada): acoplada solo por import, sin DOM ni red.

import { normalizeText } from "./option-match.js";

export const LABEL_SEPARATOR = " > ";

// Tipo de campo → tipo de acción (BR3.2). slider no se mapea en el skeleton.
const ACTION_BY_FIELD_TYPE = Object.freeze({
  text: "fill",
  number: "fill",
  search: "fill",
  select: "select",
  dropdown: "dropdown",
  radio: "radio",
  radiogroup: "radio",
  checkbox: "checkbox",
  instance_radio: "instance_radio",
});

const TOGGLE_ON_VALUES = ["on", "true"];

export function fieldNamePart(label) {
  const parts = String(label ?? "").split(LABEL_SEPARATOR);
  return parts[parts.length - 1];
}

export function actionTypeFor(fieldType, value) {
  if (fieldType === "toggle") {
    return TOGGLE_ON_VALUES.includes(normalizeText(value)) ? "toggle_on" : "toggle_off";
  }
  return ACTION_BY_FIELD_TYPE[fieldType] ?? null;
}

// Un DomField coincide si la etiqueta pedida es igual (normalizada) a su label
// completo "Sección > Campo" o a la parte "Campo".
function labelMatches(requestedKey, domField) {
  const key = normalizeText(requestedKey);
  return (
    key === normalizeText(domField.label) || key === normalizeText(fieldNamePart(domField.label))
  );
}

// Devuelve MappingOutcome { actions, unresolved }. Un RequestedValue produce
// exactamente una MappingAction solo con coincidencia única; con cero o más de
// una coincidencia, o con un tipo sin acción (slider), va a unresolved.
export function mapDeterministic(domFields, requestedValues) {
  const fields = Array.isArray(domFields) ? domFields : [];
  const actions = [];
  const unresolved = [];
  for (const requested of requestedValues ?? []) {
    const matches = fields.filter((field) => labelMatches(requested.key, field));
    const actionType =
      matches.length === 1 ? actionTypeFor(matches[0].type, requested.value) : null;
    if (!actionType) {
      unresolved.push({ key: requested.key, value: requested.value });
      continue;
    }
    actions.push({
      actionId: `act-${actions.length + 1}`,
      fieldLabel: matches[0].label,
      actionType,
      value: requested.value,
      source: "deterministic",
    });
  }
  return { actions, unresolved };
}
