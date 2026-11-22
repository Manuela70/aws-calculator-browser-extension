// lib/messages-es.js — Textos en español del panel lateral (functional-spec §6; BR3.2, BR3.4;
// NFR3.1, NFR5.3).
// Dueño: U6 (completa el provisional de U1). Módulo de Zona A: sin DOM ni chrome.
// El panel siempre pinta messageFor(código, parámetros), nunca error.message de
// U2 ni de U7. Todo texto es plano (la vista lo inserta con textContent) y no
// lleva emojis: el estado se marca con clases y aria en la vista.
//
// Los códigos llevan un espacio de nombres: "input:<código de InputError>",
// "brain:<código del cerebro o de la sesión>", "reason:<ServiceResult.reason>",
// "failure:<RunResult.failureStep>", "detail:<RunResult.failureDetail>",
// "step:<ProgressEvent.step>", "pillar:<pilar>", "severity:<severidad>",
// "verdict:<veredicto>" y "panel:<texto propio del panel>".

import { NL_PRIVACY_NOTICE as INPUT_NL_PRIVACY_NOTICE } from "./input/input-errors.js";
import {
  MAX_FIELD_CHARS,
  MAX_FIELDS,
  MAX_PROJECT_CHARS,
  MAX_SERVICES,
} from "./input/input-schema.js";

export { describeFragment } from "./input/input-errors.js";

// Aviso de privacidad de la pestaña de lenguaje natural (copy fijo de U2, NFR5.3).
export const NL_PRIVACY_NOTICE = INPUT_NL_PRIVACY_NOTICE;

export const MAX_PARAM_CHARS = 200;
export const FALLBACK_STEP_TEXT = "Trabajando…";
const TIMEOUT_PREFIX = "timeout:";

// Parámetros como texto plano recortado a 200 caracteres (NFR3.1). Los números
// finitos se conservan para las plantillas que los necesitan.
export function clipParam(value, max = MAX_PARAM_CHARS) {
  if (value === undefined || value === null) return "";
  const text = String(value);
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function sanitizeParams(params) {
  const safe = {};
  if (params === null || typeof params !== "object") return safe;
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "number") safe[key] = Number.isFinite(value) ? value : "";
    else if (typeof value === "string") safe[key] = clipParam(value);
  }
  return safe;
}

function fallbackText(code) {
  return `Ocurrió un problema (${clipParam(code || "desconocido")}).`;
}

// Referencia legible al servicio de un InputError: por nombre o por posición.
function serviceRef(p) {
  if (p.service) return `"${p.service}"`;
  return Number.isInteger(p.serviceIndex) ? `#${p.serviceIndex + 1}` : "sin nombre";
}

const LIMIT_TEXT = Object.freeze({
  services: `${MAX_SERVICES} servicios`,
  fields: `${MAX_FIELDS} claves en "fields" por servicio`,
  field_chars: `${MAX_FIELD_CHARS} caracteres por clave o valor`,
});

function limitText(p) {
  const base = LIMIT_TEXT[p.limit] ?? (p.limit || "tamaño permitido");
  const where = [];
  if (Number.isInteger(p.serviceIndex)) where.push(`servicio ${p.serviceIndex + 1}`);
  if (p.key) where.push(`clave "${p.key}"`);
  return where.length > 0 ? `${base} (${where.join(", ")})` : base;
}

// Errores del cerebro y de la sesión (functional-spec §6).
const BRAIN_TEXT = Object.freeze({
  unauthorized: "Tu sesión venció. Inicia sesión para continuar.",
  login_cancelled: "No se completó el inicio de sesión.",
  rate_limited: (p) =>
    Number.isInteger(p.retryAfterSeconds)
      ? `Hay muchas solicitudes en curso. Espera ${p.retryAfterSeconds} s y vuelve a intentar.`
      : "Hay muchas solicitudes en curso. Espera unos segundos y vuelve a intentar.",
  daily_quota_exceeded:
    "Alcanzaste el límite diario de uso del asistente. Podrás volver a usarlo mañana.",
  inventory_unavailable: "El catálogo de la calculadora no está disponible en este momento.",
  model_unavailable: "No pude conectar con el servicio de interpretación. Intenta más tarde.",
  brain_unavailable: "No pude conectar con el servicio de interpretación. Intenta más tarde.",
  timeout: "El servicio de interpretación tardó demasiado en responder.",
  bad_request: "El servicio de interpretación no pudo procesar la solicitud.",
  empty_result: "El servicio de interpretación no pudo procesar la solicitud.",
  internal_error: "El servicio de interpretación no pudo procesar la solicitud.",
  input_limit_exceeded: (p) => `La configuración supera el límite de ${limitText(p)}.`,
});

// Los 28 códigos de InputError de U2 (lib/input/input-errors.js).
const INPUT_TEXT = Object.freeze({
  empty_input: "Escribe la configuración antes de generar el estimado.",
  input_too_long: (p) =>
    `El texto supera el máximo de ${p.maxLength || "caracteres permitidos"} caracteres. Acórtalo e intenta de nuevo.`,
  invalid_json: "El JSON no es válido. Revisa comas, comillas y llaves.",
  not_object: 'El JSON debe ser un objeto con "services".',
  unknown_key: (p) =>
    p.service === undefined && p.serviceIndex === undefined
      ? `La configuración tiene una clave desconocida: "${p.key}".`
      : `El servicio ${serviceRef(p)} tiene una clave desconocida: "${p.key}".`,
  missing_services: 'Falta la lista "services".',
  empty_services: "La lista de servicios está vacía.",
  invalid_service: (p) =>
    p.key === "template"
      ? `"template" del servicio ${serviceRef(p)} debe ser un texto no vacío.`
      : `El servicio ${serviceRef(p)} debe ser un objeto.`,
  missing_service_name: (p) => `El servicio ${serviceRef(p)} no tiene "name".`,
  invalid_search_term: (p) =>
    `"search_term" del servicio ${serviceRef(p)} debe ser un texto no vacío.`,
  invalid_fields: (p) =>
    `"fields" del servicio ${serviceRef(p)} debe ser un objeto etiqueta → valor.`,
  invalid_field_value: (p) =>
    `El campo "${p.key}" del servicio ${serviceRef(p)} debe ser texto, número o booleano.`,
  invalid_toggle: (p) =>
    p.key
      ? `El toggle "${p.key}" del servicio ${serviceRef(p)} debe ser on, off, true o false.`
      : `Hay un toggle sin nombre en el servicio ${serviceRef(p)}.`,
  invalid_project: `"project" debe ser un texto de 1 a ${MAX_PROJECT_CHARS} caracteres.`,
  invalid_region: '"region" debe ser un código de región (por ejemplo, us-east-1).',
  unknown_region: (p) => `No reconozco la región ${p.region || "pedida"}.`,
  input_limit_exceeded: BRAIN_TEXT.input_limit_exceeded,
  nl_unresolved:
    "No pude interpretar toda la descripción y no se llenó nada. Revisa estos fragmentos:",
  nl_invalid_response:
    "No pude interpretar la descripción de forma confiable. Intenta de nuevo o usa la pestaña JSON.",
  brain_unavailable: BRAIN_TEXT.brain_unavailable,
  cancelled: "Interpretación cancelada.",
  unauthorized: BRAIN_TEXT.unauthorized,
  login_cancelled: BRAIN_TEXT.login_cancelled,
  rate_limited: BRAIN_TEXT.rate_limited,
  daily_quota_exceeded: BRAIN_TEXT.daily_quota_exceeded,
  inventory_unavailable: BRAIN_TEXT.inventory_unavailable,
  timeout: BRAIN_TEXT.timeout,
  unexpected_error:
    "Ocurrió un error inesperado al procesar la entrada. Intenta de nuevo; tu texto no se perdió.",
});

// ServiceResult.reason (functional-spec §6 y los motivos de U5).
const REASON_TEXT = Object.freeze({
  service_not_found: "No encontré el servicio en el catálogo de la calculadora.",
  template_not_found: "La calculadora no ofrece la plantilla pedida para este servicio.",
  field_not_recognized: (p) => `Hay campos que no pude reconocer: ${p.detail || "sin detalle"}.`,
  field_not_resolved: (p) => `No pude ubicar el campo ${p.field || "pedido"} en la página.`,
  field_not_applied: (p) => `El campo ${p.field || "pedido"} no quedó con el valor pedido.`,
  option_no_match: (p) =>
    `"${p.value || "el valor pedido"}" no es una opción del campo ${p.field || "pedido"}.`,
  option_ambiguous: (p) =>
    `"${p.value || "el valor pedido"}" coincide con más de una opción del campo ${p.field || "pedido"}.`,
  toggle_not_applied: (p) => `No pude activar la opción ${p.field || "pedida"}.`,
  validation_required: (p) =>
    `La calculadora pide completar un campo obligatorio: ${p.field || "sin nombre"}.`,
  save_not_confirmed: "No pude confirmar que el servicio se guardó.",
  page_timeout: "La página tardó demasiado en responder.",
  service_timeout: "El servicio superó los 3 minutos y se detuvo.",
  not_attempted: "No se procesó porque la corrida se detuvo antes.",
  unexpected_error: "Ocurrió un error inesperado en este servicio.",
});

// RunResult.failureStep (ERROR sin resultados por servicio).
const FAILURE_TEXT = Object.freeze({
  preconditions:
    "El estimado de calculator.aws no está vacío. Ábrelo en una pestaña nueva y vuelve a intentar.",
  connection: "No pude conectar con calculator.aws. Recarga la pestaña y vuelve a intentar.",
  lost: "La corrida dejó de responder. Revisa la pestaña de calculator.aws.",
  estimate_check: "El estimado final no coincide con lo pedido.",
  rename: "No pude renombrar el estimado.",
  share: "No pude obtener el enlace público del estimado.",
  services: "Algunos servicios no se completaron.",
});

// RunResult.failureDetail de U5 y fallos del handshake de U1.
const DETAIL_TEXT = Object.freeze({
  share_invalid: "El enlace que devolvió la calculadora no es válido; no lo comparto.",
  cancelled: "Cancelaste la corrida; los servicios pendientes no se procesaron.",
  exit_not_confirmed:
    "No pude salir del formulario sin guardar y detuve la corrida. Revisa el estimado en calculator.aws.",
  estimate_not_empty: FAILURE_TEXT.preconditions,
  busy: "Ya hay una corrida en curso en calculator.aws.",
  not_ready: "calculator.aws aún no está listo. Espera unos segundos y vuelve a intentar.",
  module_load_failed:
    "No pude cargar la extensión en calculator.aws. Recarga la pestaña de calculator.aws y vuelve a intentar.",
  open_failed: "No pude abrir una pestaña de calculator.aws.",
  tab_load_timeout: "La pestaña de calculator.aws tardó demasiado en cargar.",
  inject_failed: "No pude preparar la pestaña de calculator.aws. Recárgala y vuelve a intentar.",
  no_response: FAILURE_TEXT.connection,
});

// ProgressEvent.step.
const STEP_TEXT = Object.freeze({
  adding_service: (p) => `Agregando ${p.service || "el servicio"}`,
  applying_toggles: (p) => `Ajustando opciones de ${p.service || "el servicio"}`,
  mapping_pass: (p) => `Llenando campos de ${p.service || "el servicio"}`,
  asking_brain: (p) =>
    `Consultando el mapeo de ${p.service || "el servicio"} (${Number.isFinite(p.seconds) ? p.seconds : 0} s)`,
  applying_action: (p) => `Llenando ${p.field || "un campo"}`,
  saving: (p) => `Guardando ${p.service || "el servicio"}`,
  cancelling: (p) => `Saliendo sin guardar de ${p.service || "el servicio"}`,
  checking_estimate: "Revisando el estimado",
  renaming: "Renombrando el estimado",
  sharing: "Obteniendo el enlace público",
});

const PILLAR_TEXT = Object.freeze({
  OperationalExcellence: "Excelencia operativa",
  Security: "Seguridad",
  Reliability: "Fiabilidad",
  PerformanceEfficiency: "Eficiencia de rendimiento",
  CostOptimization: "Optimización de costos",
  Sustainability: "Sostenibilidad",
});

const SEVERITY_TEXT = Object.freeze({ high: "Alta", medium: "Media", low: "Baja" });

const VERDICT_TEXT = Object.freeze({
  DONE: "Estimado listo",
  ERROR: "Con error",
  interrupted: "Interrumpida",
});

// Textos propios del panel (estados, botones con texto variable y avisos).
const PANEL_TEXT = Object.freeze({
  validating: "Validando…",
  interpreting: "Interpretando…",
  checking_session: "Revisando la sesión…",
  reviewing: "Revisando la configuración con Well-Architected…",
  connecting: "Conectando con calculator.aws…",
  running: (p) =>
    Number.isInteger(p.total) && p.total > 0
      ? `Servicio ${p.current} de ${p.total}`
      : "Corrida en curso en calculator.aws.",
  done: "Estimado listo.",
  failed: "No se generó el estimado.",
  waf_loading: "Evaluando el estimado con Well-Architected…",
  waf_no_findings: "Sin hallazgos",
  review_no_findings: "Revisión Well-Architected sin hallazgos.",
  no_review: "Esta corrida no tiene revisión Well-Architected.",
  login_required: "Inicia sesión para revisar la configuración con Well-Architected.",
  login_ok: "Sesión iniciada. Abre un estimado nuevo en calculator.aws y vuelve a generar.",
  new_estimate_needed: "Abre un estimado nuevo antes de volver a generar.",
  lost_reopen: "Abre un estimado nuevo en calculator.aws y vuelve a generar.",
  cancel_confirm: "¿Cancelar la corrida? Los servicios pendientes no se procesarán.",
  cancelling_run: "Cancelando la corrida…",
  cancelled: "Cancelaste la corrida.",
  cancel_unconfirmed:
    "No llegó la confirmación de la cancelación. Revisa la pestaña de calculator.aws.",
  service_queued: "En cola",
  service_in_progress: "En curso",
  service_confirmed: "Guardado y confirmado",
  service_failed: "No se guardó",
  substitution: (p) => `Pediste ${p.requested}; se usó ${p.applied}.`,
  stopped_at: (p) => `Me detuve en ${p.field}.`,
  listed_in_estimate: "El servicio aparece igual en My Estimate.",
  region: (p) => `Región: ${p.region}`,
  region_default: (p) => `Región: ${p.region} (por defecto)`,
  template: (p) => `Plantilla: ${p.template}`,
  project: (p) => `Proyecto: ${p.project}`,
  missing: (p) => `Faltan: ${p.names}`,
  copied: "URL copiada.",
  copy_failed: "No pude copiar la URL; cópiala desde el enlace.",
  log_degraded: "No pude guardar parte del registro técnico.",
  history_truncated: (p) => `Mostrando las ${p.limit} más recientes de ${p.total}.`,
  history_empty: "Todavía no hay corridas registradas.",
  history_error: "No pude leer el historial.",
  history_action_failed: "No pude completar la operación sobre el historial.",
  storage_error: "No pude leer el estado guardado de la extensión.",
  last_run_none: "Sin corridas anteriores.",
});

const TABLES = Object.freeze({
  input: INPUT_TEXT,
  brain: BRAIN_TEXT,
  reason: REASON_TEXT,
  failure: FAILURE_TEXT,
  detail: DETAIL_TEXT,
  step: STEP_TEXT,
  pillar: PILLAR_TEXT,
  severity: SEVERITY_TEXT,
  verdict: VERDICT_TEXT,
  panel: PANEL_TEXT,
});

export const MESSAGE_KINDS = Object.freeze(Object.keys(TABLES));

// Claves conocidas de un espacio de nombres (para las pruebas de cobertura).
export function knownCodes(kind) {
  return Object.hasOwn(TABLES, kind) ? Object.keys(TABLES[kind]) : [];
}

function splitCode(code) {
  const raw = String(code ?? "");
  const sep = raw.indexOf(":");
  if (sep <= 0) return { kind: "", key: raw };
  return { kind: raw.slice(0, sep), key: raw.slice(sep + 1) };
}

// Texto en español de un código. Un código desconocido usa el respaldo
// "Ocurrió un problema ({código})." (o "Trabajando…" para un paso).
export function messageFor(code, params = {}) {
  const { kind, key } = splitCode(code);
  const safe = sanitizeParams(params);
  if (kind === "detail" && key.startsWith(TIMEOUT_PREFIX)) {
    const step = clipParam(key.slice(TIMEOUT_PREFIX.length)) || "responder";
    return `calculator.aws tardó demasiado en ${step}.`;
  }
  const table = Object.hasOwn(TABLES, kind) ? TABLES[kind] : null;
  if (!table || !Object.hasOwn(table, key)) {
    return kind === "step" ? FALLBACK_STEP_TEXT : fallbackText(key);
  }
  const entry = table[key];
  return typeof entry === "function" ? entry(safe) : entry;
}

// ─── Textos compuestos del resultado (BR3.2) ──────────────────────────────────

export function substitutionText({ requestedValue, appliedValue } = {}) {
  return messageFor("panel:substitution", { requested: requestedValue, applied: appliedValue });
}

// Partes de un ServiceResult para la vista: estado, motivo y notas en texto plano.
export function describeServiceResultParts(serviceResult) {
  const result = serviceResult ?? {};
  const isConfirmed = result.status === "confirmed";
  const notes = [];
  if (!isConfirmed && result.stoppedAtLabel) {
    notes.push(messageFor("panel:stopped_at", { field: result.stoppedAtLabel }));
  }
  if (result.listedInEstimate === true) notes.push(messageFor("panel:listed_in_estimate"));
  for (const sub of result.brainSubstitutions ?? []) notes.push(substitutionText(sub));
  const reasonText = isConfirmed
    ? null
    : messageFor(`reason:${result.reason ?? "unexpected_error"}`, {
        field: result.stoppedAtLabel || result.detail,
        value: result.detail,
        detail: result.detail,
      });
  return {
    name: clipParam(result.serviceName || "Servicio"),
    isConfirmed,
    statusText: messageFor(isConfirmed ? "panel:service_confirmed" : "panel:service_failed"),
    reasonText,
    notes,
  };
}

// Una línea por servicio: "<servicio>: <estado o motivo> <notas>".
export function describeServiceResult(serviceResult) {
  const parts = describeServiceResultParts(serviceResult);
  const head = parts.isConfirmed ? "guardado y confirmado." : parts.reasonText;
  return [`${parts.name}: ${head}`, ...parts.notes].join(" ");
}

function hasSavedServices(runResult) {
  return (runResult?.perServiceResults ?? []).some(
    (result) => result?.status === "confirmed" || result?.listedInEstimate === true,
  );
}

// Motivo global de un RunResult que no es éxito. Con servicios guardados en el
// estimado suma el aviso de abrir un estimado nuevo (R-13).
export function describeFailure(runResult) {
  const result = runResult ?? {};
  const detail = typeof result.failureDetail === "string" ? result.failureDetail : "";
  const step = typeof result.failureStep === "string" ? result.failureStep : "services";
  const useDetail =
    detail && (detail.startsWith(TIMEOUT_PREFIX) || knownCodes("detail").includes(detail));
  const text = useDetail ? messageFor(`detail:${detail}`) : messageFor(`failure:${step}`);
  if (step === "lost") return `${text} ${messageFor("panel:lost_reopen")}`;
  return hasSavedServices(result) ? `${text} ${messageFor("panel:new_estimate_needed")}` : text;
}
