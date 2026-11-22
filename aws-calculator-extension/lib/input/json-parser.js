// lib/input/json-parser.js — Parseo y validación mínima del JSON del Anexo A (BR1.1, BR1.2).
// PROVISIONAL (U1, walking skeleton). Dueño final: U2 (que añade la entrada en
// lenguaje natural sobre este mismo módulo).
// Devuelve { ok: true, value: RunInput } o { ok: false, error: { code, message } }
// con el mensaje en español para el panel; nunca lanza.

export const PROJECT_MAX_LENGTH = 200;
export const INVALID_JSON_MESSAGE = "❌ JSON inválido.";

function fail(code, message) {
  return { ok: false, error: { code, message } };
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function serviceRef(index, svc) {
  return isPlainObject(svc) && isNonEmptyString(svc.name) ? `"${svc.name}"` : `#${index + 1}`;
}

function validateProject(project) {
  if (project === undefined) return null;
  if (
    typeof project !== "string" ||
    project.trim().length < 1 ||
    project.length > PROJECT_MAX_LENGTH
  ) {
    return fail(
      "invalid_project",
      `❌ "project" debe ser un texto de 1 a ${PROJECT_MAX_LENGTH} caracteres.`,
    );
  }
  return null;
}

function validateFields(fields, ref) {
  if (fields === undefined) return null;
  if (!isPlainObject(fields)) {
    return fail(
      "invalid_fields",
      `❌ "fields" del servicio ${ref} debe ser un objeto etiqueta → valor.`,
    );
  }
  for (const [key, value] of Object.entries(fields)) {
    const type = typeof value;
    if (value === null || (type !== "string" && type !== "number" && type !== "boolean")) {
      return fail(
        "invalid_field_value",
        `❌ El campo "${key}" del servicio ${ref} debe ser texto, número o booleano.`,
      );
    }
  }
  return null;
}

function validateService(svc, index) {
  const ref = serviceRef(index, svc);
  if (!isPlainObject(svc))
    return fail("invalid_service", `❌ El servicio ${ref} debe ser un objeto.`);
  if (!isNonEmptyString(svc.name)) {
    return fail("missing_service_name", `❌ El servicio ${ref} no tiene "name".`);
  }
  if (svc.search_term !== undefined && !isNonEmptyString(svc.search_term)) {
    return fail(
      "invalid_search_term",
      `❌ "search_term" del servicio ${ref} debe ser un texto no vacío.`,
    );
  }
  return validateFields(svc.fields, ref);
}

export function parseRunInput(text) {
  let data;
  try {
    data = JSON.parse(String(text ?? ""));
  } catch {
    return fail("invalid_json", INVALID_JSON_MESSAGE);
  }
  if (!isPlainObject(data))
    return fail("not_object", '❌ El JSON debe ser un objeto con "services".');
  const projectError = validateProject(data.project);
  if (projectError) return projectError;
  if (data.region !== undefined && !isNonEmptyString(data.region)) {
    return fail("invalid_region", '❌ "region" debe ser un código de región (p. ej. us-east-1).');
  }
  if (!Array.isArray(data.services)) {
    return fail("missing_services", '❌ Falta la lista "services".');
  }
  if (data.services.length === 0) {
    return fail("empty_services", "❌ Sin servicios definidos.");
  }
  for (let i = 0; i < data.services.length; i++) {
    const serviceError = validateService(data.services[i], i);
    if (serviceError) return serviceError;
  }
  return { ok: true, value: data };
}
