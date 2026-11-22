// lib/mapping/residue-resolver.js — Resolución del residuo con el cerebro (BR3.2-BR3.4;
// NFR3.2, NFR3.3, NFR5.2, NFR5.3, NFR8.5). Dueño: U3.
// Única función asíncrona del mapeo: envuelve el puerto inyectado mapResidue
// (C1 2.0.0 /map-residue, conectado por U7 con BRAIN_CALL) con tope de 30 s,
// cancelación con la señal de la corrida y validación de la respuesta, que es
// no confiable. U3 NUNCA reintenta: el puerto se llama una sola vez. Sin DOM,
// sin red propia y sin estado entre llamadas.

import {
  OPTION_FIELD_TYPES,
  isUnitFieldType,
  isUnitKey,
  matchOption,
  normalizeText,
  validateFieldValue,
} from "./option-match.js";
import {
  RESIDUE_STATUS,
  actionTypeFor,
  closeOutcome,
  normalizeLabel,
  renumberActions,
} from "./deterministic-mapper.js";

export const RESIDUE_TIMEOUT_MS = 30000;
export const MAX_DOM_FIELDS = 500;

// Códigos del canal de error de los puertos del cerebro (contract-summary:
// BrainCallError y BrainError de C1). Uno desconocido se guarda como internal_error.
export const BRAIN_ERROR_CODES = Object.freeze([
  "unauthorized",
  "login_cancelled",
  "rate_limited",
  "daily_quota_exceeded",
  "inventory_unavailable",
  "timeout",
  "brain_unavailable",
  "bad_request",
  "empty_result",
  "model_unavailable",
  "internal_error",
]);

// Selectores cuyo valor del cerebro debe anclarse en las opciones escaneadas.
const ANCHORED_TYPES = Object.freeze([...OPTION_FIELD_TYPES, "instance_radio"]);

function copyDomField(field) {
  const copy = { label: String(field.label), type: String(field.type) };
  if (typeof field.section === "string") copy.section = field.section;
  if (Array.isArray(field.options)) copy.options = field.options.map(String);
  return copy;
}

const copyValue = (value) => ({ key: String(value.key), value: String(value.value) });

// Arma el pedido de /map-residue (NFR5.2): solo el nombre del servicio, los
// DomField del último escaneo, los valores pedidos del servicio y el residuo
// enviable. Más de 500 campos → no arma pedido (NFR5.3).
export function buildResidueRequest(outcome, domFields, ctx = {}) {
  const fields = Array.isArray(domFields) ? domFields : [];
  if (fields.length > MAX_DOM_FIELDS) return { ok: false, reason: "form_too_large" };
  const unresolved = (outcome?.unresolved ?? []).filter((value) => value.sendable);
  if (unresolved.length === 0) return { ok: false, reason: "nothing_to_send" };
  return {
    ok: true,
    request: {
      service: String(ctx.serviceName ?? ""),
      domFields: fields.map(copyDomField),
      requestedValues: (ctx.requestedValues ?? []).map(copyValue),
      unresolved: unresolved.map(copyValue),
    },
  };
}

// Fallo tipado (BR3.4): el servicio no se guarda, sin acciones.
function failOutcome(outcome, residueStatus, extra = {}) {
  return { ...outcome, ...extra, actions: [], residueStatus };
}

function brainUnavailable(outcome, extra) {
  return failOutcome(outcome, RESIDUE_STATUS.BRAIN_UNAVAILABLE, extra);
}

function errorCodeOf(error) {
  const code = error?.code;
  return BRAIN_ERROR_CODES.includes(code) ? code : "internal_error";
}

// Llama al puerto una sola vez con tope propio y cancelación externa
// (Promise.race): no depende de que el puerto respete la señal, y una
// respuesta tardía se ignora.
async function callPortOnce(mapResidue, request, signal) {
  const controller = new AbortController();
  let timer;
  let onAbort;
  const stop = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ kind: "timeout" }), RESIDUE_TIMEOUT_MS);
    onAbort = () => resolve({ kind: "cancelled" });
    signal?.addEventListener("abort", onAbort, { once: true });
  });
  const call = Promise.resolve()
    .then(() => mapResidue(request, { signal: controller.signal }))
    .then(
      (value) => ({ kind: "ok", value }),
      (error) => ({ kind: "error", error }),
    );
  try {
    const result = await Promise.race([call, stop]);
    if (result.kind !== "ok") controller.abort();
    return result;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

function isValidShape(raw) {
  return (
    raw !== null &&
    typeof raw === "object" &&
    ["requestKey", "fieldLabel", "actionType", "value"].every((k) => typeof raw[k] === "string")
  );
}

// Valor de un selector: debe ser una de las opciones escaneadas; sin opciones
// no hay ancla y la clave queda como option_no_match (BR3.3, NFR3.3).
function anchoredValue(field, raw, requestedValue) {
  if (!Array.isArray(field.options) || field.options.length === 0) {
    return { ok: false, reason: "option_no_match" };
  }
  const match = matchOption(raw.value, field.options);
  if (!match.ok) return { ok: false };
  const substituted = normalizeText(match.option) !== normalizeText(requestedValue);
  return { ok: true, value: match.option, substituted };
}

// fill, checkbox y toggle: el valor debe ser válido y igual al pedido.
function exactValue(field, raw, requestedValue) {
  const checked = validateFieldValue(field.type, raw.value, field.options);
  if (!checked.ok) return { ok: false };
  if (normalizeText(checked.value) !== normalizeText(requestedValue)) return { ok: false };
  return { ok: true, value: checked.value, substituted: false };
}

// Valida una acción del cerebro como si fuera determinística (BR3.3, NFR3.2).
function validateBrainAction(raw, ctx) {
  const requestedValue = ctx.sentByKey.get(raw.requestKey);
  const matches = ctx.fieldsByLabel.get(raw.fieldLabel) ?? [];
  if (matches.length !== 1) return { ok: false };
  const field = matches[0];
  const expected = actionTypeFor(field.type, raw.value);
  if (!expected || raw.actionType !== expected) return { ok: false };
  if (ctx.usedLabels.has(normalizeLabel(field.label))) return { ok: false };
  if (isUnitKey(raw.requestKey) && !isUnitFieldType(field.type)) return { ok: false };
  const checked = ANCHORED_TYPES.includes(field.type)
    ? anchoredValue(field, raw, requestedValue)
    : exactValue(field, raw, requestedValue);
  if (!checked.ok) return checked;
  const action = {
    fieldLabel: field.label,
    actionType: expected,
    value: checked.value,
    source: "brain",
    requestKey: raw.requestKey,
    substituted: checked.substituted,
  };
  if (checked.substituted) action.requestedValue = requestedValue;
  return { ok: true, action };
}

function indexFieldsByLabel(domFields) {
  const index = new Map();
  for (const field of domFields) {
    index.set(field.label, [...(index.get(field.label) ?? []), field]);
  }
  return index;
}

// Acciones aceptadas y motivos actualizados por clave. Una clave con más de una
// acción, o una acción con requestKey no enviada, se descarta.
function validateResponse(response, sent, outcome, domFields) {
  const sentByKey = new Map(sent.map((value) => [value.key, value.value]));
  const raws = response.actions.filter((raw) => isValidShape(raw) && sentByKey.has(raw.requestKey));
  const perKey = new Map();
  for (const raw of raws) perKey.set(raw.requestKey, (perKey.get(raw.requestKey) ?? 0) + 1);
  const ctx = {
    sentByKey,
    fieldsByLabel: indexFieldsByLabel(domFields),
    usedLabels: new Set(outcome.actions.map((a) => normalizeLabel(a.fieldLabel))),
  };
  const accepted = [];
  const reasonByKey = new Map();
  for (const raw of raws) {
    if (perKey.get(raw.requestKey) !== 1) continue;
    const checked = validateBrainAction(raw, ctx);
    if (checked.ok) {
      accepted.push(checked.action);
      ctx.usedLabels.add(normalizeLabel(checked.action.fieldLabel));
    } else if (checked.reason) {
      reasonByKey.set(raw.requestKey, checked.reason);
    }
  }
  return { accepted, reasonByKey };
}

function applyBrainResponse(outcome, response, sent, domFields) {
  const isWellFormed =
    response !== null &&
    typeof response === "object" &&
    Array.isArray(response.actions) &&
    response.actions.length <= sent.length;
  if (!isWellFormed) {
    return failOutcome(outcome, RESIDUE_STATUS.STILL_UNRESOLVED, {
      residueDetail: "invalid_response",
    });
  }
  const { accepted, reasonByKey } = validateResponse(response, sent, outcome, domFields);
  const resolvedKeys = new Set(accepted.map((action) => action.requestKey));
  const unresolved = outcome.unresolved
    .filter((value) => !resolvedKeys.has(value.key))
    .map((value) =>
      reasonByKey.has(value.key) ? { ...value, reason: reasonByKey.get(value.key) } : value,
    );
  if (unresolved.length > 0) {
    return failOutcome(outcome, RESIDUE_STATUS.STILL_UNRESOLVED, { unresolved });
  }
  return {
    ...outcome,
    actions: renumberActions([...outcome.actions, ...accepted]),
    unresolved: [],
    residueStatus: RESIDUE_STATUS.RESOLVED_BY_BRAIN,
  };
}

async function resolveClosed(outcome, context, { mapResidue, signal }) {
  if (outcome.unresolved.length === 0) return { ...outcome, residueStatus: RESIDUE_STATUS.NONE };
  if (outcome.unresolved.some((value) => !value.sendable)) {
    return failOutcome(outcome, RESIDUE_STATUS.STILL_UNRESOLVED);
  }
  if (typeof mapResidue !== "function")
    return brainUnavailable(outcome, { residueDetail: "no_port" });
  const domFields = Array.isArray(context.domFields) ? context.domFields : [];
  const built = buildResidueRequest(outcome, domFields, context);
  if (!built.ok) return brainUnavailable(outcome, { residueDetail: built.reason });
  if (signal?.aborted) return brainUnavailable(outcome, { residueDetail: "cancelled" });
  const result = await callPortOnce(mapResidue, built.request, signal);
  if (result.kind === "timeout" || result.kind === "cancelled") {
    return brainUnavailable(outcome, { residueDetail: result.kind });
  }
  if (result.kind === "error") {
    return brainUnavailable(outcome, { brainErrorCode: errorCodeOf(result.error) });
  }
  return applyBrainResponse(outcome, result.value, built.request.unresolved, domFields);
}

// M3 — Residuo. Recibe el MappingOutcome de la última pasada y devuelve el
// resultado final: none, resolved_by_brain (acciones del cerebro validadas al
// final), brain_unavailable (sin puerto, error tipado, tope, cancelación o
// formulario demasiado grande) o still_unresolved. Con residuo, actions = []
// (BR3.4). Nunca lanza: una excepción inesperada es brain_unavailable.
export async function resolveResidue(outcome, context = {}, deps = {}) {
  try {
    const closed =
      outcome.residueStatus === RESIDUE_STATUS.PENDING_PASSES ? closeOutcome(outcome) : outcome;
    if (closed.residueStatus !== RESIDUE_STATUS.STILL_UNRESOLVED) return closed;
    return await resolveClosed(closed, context, deps);
  } catch {
    return brainUnavailable(outcome ?? { unresolved: [] }, { residueDetail: "unexpected_error" });
  }
}
