// brain/core/request-validators.js — Validación de los pedidos de C1, C2 y C3
// antes de invocar el modelo (BR1.1, BR1.2, NFR1.2). Devuelve
// { ok: true, value } con el pedido normalizado (solo los campos conocidos) o
// { ok: false, reason } con un motivo interno que nunca viaja al cliente ni al
// registro (el cliente recibe bad_request del catálogo fijo).

import {
  DOM_FIELD_TYPES,
  INTERPRET_SCHEMA_VERSIONS,
  INTERPRET_TEXT_MAX,
  RESIDUE_MAX_DOM_FIELDS,
  WAF_MAX_CONFIG_KEYS,
  WAF_MAX_KEY_OR_VALUE,
  WAF_MAX_SERVICES,
  WAF_PHASES,
} from "./limits.js";

// Contenido binario o de imagen embebido como data URL (BR1.2, ADR-005).
const DATA_URL = /^\s*data:[^,]*;base64,/i;

function invalid(reason) {
  return { ok: false, reason };
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

// Recorre el pedido buscando data URLs en cualquier texto.
export function containsBinary(value) {
  if (typeof value === "string") return DATA_URL.test(value);
  if (Array.isArray(value)) return value.some(containsBinary);
  if (isPlainObject(value)) return Object.values(value).some(containsBinary);
  return false;
}

export function validateInterpretRequest(body) {
  if (!isPlainObject(body)) return invalid("not_object");
  if (containsBinary(body)) return invalid("binary_content");
  if (!isNonEmptyString(body.text)) return invalid("text_missing");
  if (body.text.length > INTERPRET_TEXT_MAX) return invalid("text_too_long");
  const locale = body.locale === undefined ? "es" : body.locale;
  if (!isNonEmptyString(locale)) return invalid("locale_invalid");
  if (!INTERPRET_SCHEMA_VERSIONS.includes(body.schemaVersion)) {
    return invalid("schema_version_unsupported");
  }
  return { ok: true, value: { text: body.text, locale, schemaVersion: body.schemaVersion } };
}

function validateRequestedValues(list, name, { minItems = 0 } = {}) {
  if (!Array.isArray(list) || list.length < minItems) return { error: `${name}_invalid` };
  const values = [];
  for (const item of list) {
    if (!isPlainObject(item) || !isNonEmptyString(item.key) || typeof item.value !== "string") {
      return { error: `${name}_item_invalid` };
    }
    values.push({ key: item.key, value: item.value });
  }
  return { values };
}

function validateDomFields(list) {
  if (!Array.isArray(list)) return { error: "dom_fields_invalid" };
  if (list.length > RESIDUE_MAX_DOM_FIELDS) return { error: "dom_fields_too_many" };
  const fields = [];
  for (const item of list) {
    if (!isPlainObject(item) || !isNonEmptyString(item.label)) {
      return { error: "dom_field_invalid" };
    }
    if (!DOM_FIELD_TYPES.includes(item.type)) return { error: "dom_field_type_invalid" };
    const field = { label: item.label, type: item.type };
    if (item.section !== undefined) {
      if (typeof item.section !== "string") return { error: "dom_field_section_invalid" };
      field.section = item.section;
    }
    if (item.options !== undefined) {
      if (!Array.isArray(item.options) || !item.options.every((o) => typeof o === "string")) {
        return { error: "dom_field_options_invalid" };
      }
      field.options = item.options;
    }
    fields.push(field);
  }
  return { fields };
}

export function validateResidueRequest(body) {
  if (!isPlainObject(body)) return invalid("not_object");
  if (containsBinary(body)) return invalid("binary_content");
  if (!isNonEmptyString(body.service)) return invalid("service_missing");
  const dom = validateDomFields(body.domFields);
  if (dom.error) return invalid(dom.error);
  const requested = validateRequestedValues(body.requestedValues, "requested_values");
  if (requested.error) return invalid(requested.error);
  const unresolved = validateRequestedValues(body.unresolved, "unresolved", { minItems: 1 });
  if (unresolved.error) return invalid(unresolved.error);
  return {
    ok: true,
    value: {
      service: body.service,
      domFields: dom.fields,
      requestedValues: requested.values,
      unresolved: unresolved.values,
    },
  };
}

function validateWafConfig(config) {
  if (config === undefined) return { config: {} };
  if (!isPlainObject(config)) return { error: "config_invalid" };
  const entries = Object.entries(config);
  if (entries.length > WAF_MAX_CONFIG_KEYS) return { error: "config_too_many_keys" };
  for (const [key, value] of entries) {
    if (key.length > WAF_MAX_KEY_OR_VALUE) return { error: "config_key_too_long" };
    if (typeof value !== "string") return { error: "config_value_not_string" };
    if (value.length > WAF_MAX_KEY_OR_VALUE) return { error: "config_value_too_long" };
  }
  return { config: Object.fromEntries(entries) };
}

export function validateWafRequest(body) {
  if (!isPlainObject(body)) return invalid("not_object");
  if (containsBinary(body)) return invalid("binary_content");
  const phase = body.phase === undefined ? "post_fill" : body.phase;
  if (!WAF_PHASES.includes(phase)) return invalid("phase_invalid");
  if (!Array.isArray(body.services) || body.services.length === 0) {
    return invalid("services_missing");
  }
  if (body.services.length > WAF_MAX_SERVICES) return invalid("services_too_many");
  const services = [];
  for (const svc of body.services) {
    if (!isPlainObject(svc) || !isNonEmptyString(svc.name)) return invalid("service_invalid");
    if (svc.name.length > WAF_MAX_KEY_OR_VALUE) return invalid("service_name_too_long");
    const checked = validateWafConfig(svc.config);
    if (checked.error) return invalid(checked.error);
    services.push({ name: svc.name, config: checked.config });
  }
  return { ok: true, value: { phase, services } };
}
