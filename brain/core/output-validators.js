// brain/core/output-validators.js — Validación de la salida del modelo antes de
// responder (BR1.4, BR2.1-BR2.3, BR3.1, BR3.2, BR4.2, NFR1.3). La salida nunca se
// reenvía sin pasar por aquí y nunca se sanea: si no cumple, es inválida y el
// orquestador decide el segundo intento o empty_result.
// Cada función devuelve { ok: true, value } o { ok: false, error } donde error es
// un motivo corto que se usa como pista para el segundo intento (nunca viaja al
// cliente ni al registro).

import { fieldKeysByTemplate } from "./inventory-model.js";
import {
  INTERPRET_MAX_SERVICES,
  INTERPRET_TEXT_MAX,
  PROJECT_MAX_LENGTH,
  UNRESOLVED_REASONS,
  WAF_MAX_RECOMMENDATIONS,
  WAF_MAX_TEXT,
  WAF_PILLARS,
  WAF_SEVERITIES,
} from "./limits.js";

const REGION_PATTERN = /^[a-z]{2}(-[a-z]+)+-\d$/;
const DECIMAL_PATTERN = /^\d+(\.\d+)?$/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const URL_PATTERN = /https?:\/\//i;

function invalid(error) {
  return { ok: false, error };
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

// Texto plano verificable (BR4.2): sin marcado, sin secuencias de control, sin URL.
export function isPlainText(text) {
  return (
    typeof text === "string" &&
    !text.includes("<") &&
    !text.includes(">") &&
    !CONTROL_CHARS.test(text) &&
    !URL_PATTERN.test(text)
  );
}

// Extrae el objeto JSON de la respuesta del modelo (tolera un bloque de código).
export function parseModelJson(text) {
  if (typeof text !== "string") return invalid("salida vacía");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return invalid("la salida no contiene un objeto JSON");
  try {
    return { ok: true, value: JSON.parse(text.slice(start, end + 1)) };
  } catch {
    return invalid("la salida no es JSON válido");
  }
}

// ---------------------------------------------------------------- /interpret

function checkFieldValue(field, value) {
  switch (field.kind) {
    case "quantity": {
      const text = typeof value === "number" ? String(value) : value;
      return typeof text === "string" && DECIMAL_PATTERN.test(text) ? { value: text } : null;
    }
    case "choice":
    case "unit":
      return typeof value === "string" && field.options.includes(value) ? { value } : null;
    case "checkbox":
      return typeof value === "boolean" ? { value } : null;
    case "toggle":
      return value === "on" || value === "off" ? { value } : null;
    default:
      return null; // complex: debió reportarse como unsupported_component
  }
}

function checkTemplate(service, svc) {
  if (service.templates.length >= 2) {
    if (!service.templates.includes(svc.template)) {
      return { error: `"${service.name}" requiere template válido` };
    }
    return { template: svc.template };
  }
  if (svc.template !== undefined) return { error: `"${service.name}" no lleva template` };
  return { template: undefined };
}

function checkFields(service, template, fields) {
  if (fields === undefined) return { fields: {} };
  if (!isPlainObject(fields)) return { error: "fields debe ser un objeto" };
  const keys = fieldKeysByTemplate(service).get(template ?? "") ?? new Map();
  const out = {};
  for (const [key, value] of Object.entries(fields)) {
    const field = keys.get(key);
    if (!field) return { error: `clave "${key}" no existe en "${service.name}"` };
    const checked = checkFieldValue(field, value);
    if (!checked) return { error: `valor inválido para "${key}"` };
    out[key] = checked.value;
  }
  return { fields: out };
}

function validateInterpreted(output, { candidates }) {
  if (
    output.unresolved !== undefined &&
    !(Array.isArray(output.unresolved) && output.unresolved.length === 0)
  ) {
    return invalid("interpreted no lleva unresolved");
  }
  const runInput = output.runInput;
  if (!isPlainObject(runInput)) return invalid("falta runInput");
  if (!Array.isArray(runInput.services) || runInput.services.length === 0) {
    return invalid("runInput sin servicios");
  }
  if (runInput.services.length > INTERPRET_MAX_SERVICES) return invalid("demasiados servicios");
  if (runInput.region !== undefined && !REGION_PATTERN.test(runInput.region)) {
    return invalid("region inválida");
  }
  if (
    runInput.project !== undefined &&
    !(
      isNonEmptyString(runInput.project) &&
      runInput.project.length <= PROJECT_MAX_LENGTH &&
      isPlainText(runInput.project)
    )
  ) {
    return invalid("project inválido");
  }
  const byName = new Map(candidates.map((c) => [c.name, c]));
  const services = [];
  const fragments = [];
  for (const svc of runInput.services) {
    if (!isPlainObject(svc) || !isNonEmptyString(svc.name)) return invalid("servicio sin name");
    const service = byName.get(svc.name);
    if (!service) {
      // Fuera de los candidatos: no se puede validar; se informa, no es salida inválida (BR7.1).
      fragments.push({ fragment: svc.name, reason: "unknown_service" });
      continue;
    }
    if (svc.search_term !== undefined && svc.search_term !== service.name) {
      return invalid(`search_term debe ser "${service.name}"`);
    }
    const template = checkTemplate(service, svc);
    if (template.error) return invalid(template.error);
    const fields = checkFields(service, template.template, svc.fields);
    if (fields.error) return invalid(fields.error);
    if (
      runInput.region !== undefined &&
      service.regions.length > 0 &&
      !service.regions.includes(runInput.region)
    ) {
      fragments.push({
        fragment: service.name,
        service: service.name,
        reason: "region_unavailable",
      });
      continue;
    }
    const normalized = { name: service.name, search_term: service.name };
    if (template.template) normalized.template = template.template;
    normalized.fields = fields.fields;
    services.push(normalized);
  }
  if (fragments.length > 0) {
    return { ok: true, value: { status: "unresolved", unresolved: fragments } };
  }
  const normalizedRun = { services };
  if (runInput.region !== undefined) normalizedRun.region = runInput.region;
  if (runInput.project !== undefined) normalizedRun.project = runInput.project;
  return { ok: true, value: { status: "interpreted", runInput: normalizedRun } };
}

function validateUnresolved(output) {
  if (output.runInput !== undefined) return invalid("unresolved no lleva runInput");
  if (!Array.isArray(output.unresolved) || output.unresolved.length === 0) {
    return invalid("unresolved sin fragmentos");
  }
  const fragments = [];
  for (const item of output.unresolved) {
    if (!isPlainObject(item) || !isNonEmptyString(item.fragment))
      return invalid("fragmento inválido");
    if (item.fragment.length > INTERPRET_TEXT_MAX) return invalid("fragmento demasiado largo");
    if (!UNRESOLVED_REASONS.includes(item.reason)) return invalid("motivo desconocido");
    const fragment = { fragment: item.fragment, reason: item.reason };
    if (item.service !== undefined) {
      if (!isNonEmptyString(item.service)) return invalid("service del fragmento inválido");
      fragment.service = item.service;
    }
    fragments.push(fragment);
  }
  return { ok: true, value: { status: "unresolved", unresolved: fragments } };
}

export function validateInterpretOutput(output, context) {
  if (!isPlainObject(output)) return invalid("la salida no es un objeto");
  if (output.status === "interpreted") return validateInterpreted(output, context);
  if (output.status === "unresolved") return validateUnresolved(output);
  return invalid("status desconocido");
}

// -------------------------------------------------------------- /map-residue

const ACTIONS_BY_FIELD_TYPE = {
  text: ["fill"],
  number: ["fill"],
  slider: ["fill"],
  search: ["fill", "instance_search"],
  select: ["select"],
  dropdown: ["dropdown"],
  radio: ["radio"],
  radiogroup: ["radio"],
  checkbox: ["checkbox"],
  toggle: ["toggle_on", "toggle_off"],
  instance_radio: ["instance_radio"],
};

const SELECTOR_ACTIONS = new Set(["select", "dropdown", "radio", "instance_radio"]);

function checkActionValue(action, field, requestedValue) {
  if (SELECTOR_ACTIONS.has(action.actionType)) {
    return Array.isArray(field.options) && field.options.includes(action.value);
  }
  if (action.actionType === "toggle_on" || action.actionType === "toggle_off") {
    const expected = action.actionType === "toggle_on" ? "on" : "off";
    return action.value === requestedValue && requestedValue === expected;
  }
  return action.value === requestedValue; // fill, instance_search, checkbox
}

export function validateResidueOutput(output, request) {
  if (!isPlainObject(output) || !Array.isArray(output.actions)) {
    return invalid("la salida debe tener actions");
  }
  const requested = new Map();
  for (const item of request.unresolved) {
    if (!requested.has(item.key)) requested.set(item.key, item.value); // clave repetida: la primera
  }
  const fieldsByLabel = new Map(request.domFields.map((f) => [f.label, f]));
  const used = new Set();
  const actions = [];
  for (const action of output.actions) {
    if (!isPlainObject(action)) return invalid("acción inválida");
    if (!isNonEmptyString(action.requestKey) || !requested.has(action.requestKey)) {
      return invalid("acción sin requestKey del residuo");
    }
    if (used.has(action.requestKey))
      return invalid(`más de una acción para "${action.requestKey}"`);
    const field = fieldsByLabel.get(action.fieldLabel);
    if (!field) return invalid(`fieldLabel "${action.fieldLabel}" no es un campo recibido`);
    if (!ACTIONS_BY_FIELD_TYPE[field.type].includes(action.actionType)) {
      return invalid(`actionType "${action.actionType}" no corresponde al campo`);
    }
    if (typeof action.value !== "string") return invalid("value debe ser texto");
    if (!checkActionValue(action, field, requested.get(action.requestKey))) {
      return invalid(`valor no permitido para "${action.fieldLabel}"`);
    }
    used.add(action.requestKey);
    actions.push({
      requestKey: action.requestKey,
      fieldLabel: action.fieldLabel,
      actionType: action.actionType,
      value: action.value,
    });
  }
  return { ok: true, value: { actions } };
}

// ------------------------------------------------------------- /waf-evaluate

function checkRecommendation(rec) {
  if (!isPlainObject(rec)) return "recomendación inválida";
  if (!WAF_PILLARS.includes(rec.pillar)) return "pilar desconocido";
  if (!WAF_SEVERITIES.includes(rec.severity)) return "severidad desconocida";
  if (!isNonEmptyString(rec.text) || rec.text.length > WAF_MAX_TEXT) {
    return "texto vacío o de más de 300 caracteres";
  }
  if (!isPlainText(rec.text)) return "texto con marcado, control o URL";
  return null;
}

function checkServiceResult(result, expected) {
  if (result.service !== expected.service.name)
    return { error: "service no coincide con el pedido" };
  if (typeof result.noFindings !== "boolean") return { error: "noFindings no booleano" };
  const recs = result.recommendations;
  if (result.noFindings) {
    if (recs !== undefined && !(Array.isArray(recs) && recs.length === 0)) {
      return { error: "noFindings true con recomendaciones" };
    }
    return {
      value: { serviceIndex: expected.serviceIndex, service: result.service, noFindings: true },
    };
  }
  if (!Array.isArray(recs) || recs.length === 0 || recs.length > WAF_MAX_RECOMMENDATIONS) {
    return { error: "se esperan de 1 a 5 recomendaciones" };
  }
  const recommendations = [];
  for (const rec of recs) {
    const problem = checkRecommendation(rec);
    if (problem) return { error: problem };
    recommendations.push({ pillar: rec.pillar, severity: rec.severity, text: rec.text });
  }
  return {
    value: {
      serviceIndex: expected.serviceIndex,
      service: result.service,
      noFindings: false,
      recommendations,
    },
  };
}

// batch: [{ serviceIndex, service: { name, config } }] en el orden del pedido.
export function validateWafOutput(output, batch) {
  if (!isPlainObject(output) || !Array.isArray(output.perService)) {
    return invalid("la salida debe tener perService");
  }
  if (output.perService.length !== batch.length) return invalid("cantidad de servicios distinta");
  const byIndex = new Map();
  for (const result of output.perService) {
    if (!isPlainObject(result) || !Number.isInteger(result.serviceIndex)) {
      return invalid("serviceIndex inválido");
    }
    if (byIndex.has(result.serviceIndex)) return invalid("serviceIndex repetido");
    byIndex.set(result.serviceIndex, result);
  }
  const perService = [];
  for (const expected of batch) {
    const result = byIndex.get(expected.serviceIndex);
    if (!result) return invalid(`falta serviceIndex ${expected.serviceIndex}`);
    const checked = checkServiceResult(result, expected);
    if (checked.error) return invalid(checked.error);
    perService.push(checked.value);
  }
  return { ok: true, value: { perService } };
}
