// sw/brain-client.js — Único fetch al cerebro (NFR3.1, NFR5.3, NFR5.4, NFR8.1).
// - Authorization: Bearer y Content-Type: application/json. No envía X-Request-Id:
//   el CORS de u4 solo admite authorization y content-type; la correlación usa la
//   cabecera x-request-id de la respuesta o body.requestId (decisión 3 del plan).
// - Plazo total de 30 s por llamada, con reloj inyectable; al vencer aborta el
//   fetch y responde timeout.
// - Un solo reintento por rate_limited si retryAfterSeconds + 12 s caben en lo que
//   queda; la espera es cancelable por BRAIN_CANCEL y por el plazo.
// - 401 borra el token y responde unauthorized sin reintentar.
// - Sin token vigente → unauthorized sin abrir el login; sin configuración →
//   brain_unavailable sin fetch.
// - Un 200 que no valida la forma de su operación es internal_error, nunca ok: true.
// Nunca registra el token ni los cuerpos: solo operation, code y requestId.

import { OPERATION_PATHS } from "./config.js";
import { isServerErrorCode, makeEdgeError } from "./messages.js";

export const CALL_DEADLINE_MS = 30000;
export const RETRY_MARGIN_MS = 12000;
export const MAX_ATTEMPTS = 2;

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

// Validador mínimo de forma por operación (la validación semántica completa
// queda en las unidades consumidoras).
export const RESPONSE_VALIDATORS = Object.freeze({
  "map-residue": (body) => isObject(body) && Array.isArray(body.actions),
  interpret: (body) =>
    isObject(body) &&
    ((body.status === "interpreted" && isObject(body.runInput)) ||
      (body.status === "unresolved" && Array.isArray(body.unresolved))),
  "waf-evaluate": (body) => isObject(body) && Array.isArray(body.perService),
});

function failure(code, extra) {
  return { ok: false, error: makeEdgeError(code, extra) };
}

// Traduce una respuesta HTTP ya parseada a { ok, value } o { ok: false, error }.
// Lee body.code (cuerpo plano de u4) y acepta body.error.code por compatibilidad
// (decisión 1 del plan); un código fuera del conjunto es internal_error.
export function translateResponse(status, body, { operation, requestId = null } = {}) {
  const bodyRequestId =
    isObject(body) && typeof body.requestId === "string" ? body.requestId : null;
  const correlation = bodyRequestId ?? requestId ?? undefined;
  if (status >= 200 && status < 300) {
    const validate = RESPONSE_VALIDATORS[operation];
    if (validate && validate(body)) return { ok: true, value: body };
    return failure("internal_error", { requestId: correlation });
  }
  const rawCode = isObject(body) ? (body.code ?? body.error?.code) : undefined;
  const code = isServerErrorCode(rawCode) ? rawCode : "internal_error";
  const retryAfterSeconds = code === "rate_limited" ? body.retryAfterSeconds : undefined;
  return failure(code, { requestId: correlation, retryAfterSeconds });
}

function parseJson(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

async function attemptOnce({ url, token, body, signal, fetchFn, session, operation }) {
  let response;
  let text;
  try {
    response = await fetchFn(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    text = await response.text();
  } catch {
    if (signal.aborted) return { aborted: true };
    return failure("brain_unavailable");
  }
  const requestId = response.headers?.get?.("x-request-id") ?? null;
  if (response.status === 401) {
    await session.clear();
    return failure("unauthorized", { requestId: requestId ?? undefined });
  }
  const parsed = parseJson(text);
  if (!parsed.ok) {
    return failure(response.status >= 500 ? "brain_unavailable" : "internal_error", {
      requestId: requestId ?? undefined,
    });
  }
  return translateResponse(response.status, parsed.value, { operation, requestId });
}

// Espera ms con el reloj inyectado; resuelve false si la señal aborta antes.
function waitCancellable(ms, signal, clock) {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve(false);
      return;
    }
    const onAbort = () => {
      clock.clearTimeout(timer);
      resolve(false);
    };
    const timer = clock.setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve(true);
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function shouldRetry(result, attempts, deadline, clock) {
  if (result.ok || result.aborted || attempts >= MAX_ATTEMPTS) return false;
  if (result.error.code !== "rate_limited" || !result.error.retryAfterSeconds) return false;
  const waitMs = result.error.retryAfterSeconds * 1000;
  return waitMs + RETRY_MARGIN_MS <= deadline - clock.now();
}

async function runWithDeadline({ operation, body, signal, token }, deps) {
  const { config, clock, fetchFn, session } = deps;
  const url = new URL(OPERATION_PATHS[operation], config.BRAIN_BASE_URL).toString();
  const controller = new AbortController();
  let timedOut = false;
  const deadline = clock.now() + CALL_DEADLINE_MS;
  const timer = clock.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, CALL_DEADLINE_MS);
  const onCancel = () => controller.abort();
  signal?.addEventListener("abort", onCancel, { once: true });
  if (signal?.aborted) controller.abort();
  const requestIds = [];
  let attempts = 0;
  let result = { aborted: true };
  try {
    while (!controller.signal.aborted) {
      attempts += 1;
      result = await attemptOnce({
        url,
        token,
        body,
        signal: controller.signal,
        fetchFn,
        session,
        operation,
      });
      if (result.error?.requestId) requestIds.push(result.error.requestId);
      if (!shouldRetry(result, attempts, deadline, clock)) break;
      const waited = await waitCancellable(
        result.error.retryAfterSeconds * 1000,
        controller.signal,
        clock,
      );
      if (!waited) result = { aborted: true };
    }
  } finally {
    clock.clearTimeout(timer);
    signal?.removeEventListener("abort", onCancel);
  }
  if (timedOut) return { ...failure("timeout"), attempts, requestIds };
  if (result.aborted || signal?.aborted) return { cancelled: true, attempts, requestIds };
  return { ...result, attempts, requestIds };
}

function logOutcome(logger, operation, result) {
  if (result.ok || result.cancelled) return;
  logger.warn("[aws-calc] brain", {
    operation,
    code: result.error.code,
    requestIds: result.requestIds ?? [],
    attempts: result.attempts,
  });
}

// Respuesta: { ok: true, value, attempts, requestIds } | { ok: false, error, attempts,
// requestIds } | { cancelled: true, attempts, requestIds }.
export async function callBrain({ operation, body, signal }, deps) {
  const {
    config,
    session,
    keepalive,
    fetchFn = (...args) => fetch(...args),
    clock = { now: () => Date.now(), setTimeout, clearTimeout },
    logger = console,
  } = deps;
  if (!Object.hasOwn(OPERATION_PATHS, operation)) {
    return { ...failure("bad_request"), attempts: 0, requestIds: [] };
  }
  if (!config.BRAIN_BASE_URL) {
    const result = { ...failure("brain_unavailable"), attempts: 0, requestIds: [] };
    logOutcome(logger, operation, result);
    return result;
  }
  const token = await session.getValidToken();
  if (!token) return { ...failure("unauthorized"), attempts: 0, requestIds: [] };
  const result = await keepalive.run(() =>
    runWithDeadline({ operation, body, signal, token }, { config, clock, fetchFn, session }),
  );
  logOutcome(logger, operation, result);
  return result;
}
