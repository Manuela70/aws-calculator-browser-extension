// lib/rpa/orchestrator.js — Flujos R1 (corrida) y R2 (un servicio) sin tocar el DOM
// (BR1.1-BR1.3, BR2.1-BR2.7; NFR3.5, NFR8.4).
// Dueño: U5. Módulo de Zona A: recibe el resolvedor del DOM como dependencia
// (lib/dom/dom-resolver.js en la pestaña; un doble en los tests). Contrato del
// resolvedor: cada función es async, recibe { signal } y devuelve
// { ok: true, value? } o { ok: false, reason, detail?, selector? }; nunca
// debería lanzar, y si lanza el orquestador lo convierte en un resultado
// tipado (con la tabla DomError → reason si el error trae code).
//   openEstimate, listEstimateServices, startService(searchTerm) →
//   { value: { calculatorServiceName } }, setRegion(displayName),
//   selectTemplate(template), applyToggle(toggle), expandSections, scanForm,
//   applyAction(action), saveService(calculatorServiceName),
//   exitWithoutSave → { value: { listedNames } }, returnToEstimate,
//   renameEstimate(name), shareEstimate → { value: url }, cleanup()
// El puerto del cerebro (deps.mapResidue) es opcional: lo conecta U7; sin él,
// un residuo hace fallar el servicio (U3 BR3.4).
// La señal de la corrida (deps.signal o deps.context.signal) permite cancelar:
// aborta el servicio en curso, sale sin guardar y deja los restantes como
// not_attempted (decisión 7 del plan).

import {
  describeUnresolved,
  fieldNamePart,
  mapDeterministic,
  toLogEntry,
} from "../mapping/deterministic-mapper.js";
import { resolveResidue } from "../mapping/residue-resolver.js";
import { getRegionDisplayName } from "../mapping/region-map.js";
import { normalizeText } from "../mapping/option-match.js";
import { RETRY_LIMITS, retry } from "./retry.js";
import {
  createServiceTimer,
  EXIT_TIMEOUT_MS,
  EXIT_TIMEOUT_REASON,
  raceWithSignal,
  SERVICE_TIMEOUT_REASON,
} from "./service-timer.js";
import {
  aggregate,
  buildErrorRunResult,
  buildProgressEvent,
  buildServiceResult,
  estimateMatchesRequest,
  finalizeRunResult,
  RUN_FAILURE_DETAILS,
  translateDomError,
} from "./result-aggregator.js";

export const SAVE_MAX_ATTEMPTS = RETRY_LIMITS.save;
// Detalle de una región que no se pudo fijar (BR1.3).
export const REGION_DETAIL = "Region";

const fail = (reason, detail) => ({ status: "failed", reason, detail });

// Paso en curso → failureStep del RunResult ("service:svc-1" → services).
export function stepToFailure(step) {
  return String(step).startsWith("service:") ? "services" : step;
}

// --- Progreso (BR4.2) ---------------------------------------------------------

// ProgressEvent estructurado sin pct ni text (decisión 7 de U6): el panel
// arma el texto con messageFor("step:<paso>").
function emit(run, step, extra = {}) {
  run.progress(
    buildProgressEvent({
      runId: run.runRequest.runId,
      serviceCount: run.runRequest.services.length,
      step,
      ...extra,
    }),
  );
}

function emitService(run, state, step, extra) {
  state.step = step;
  emit(run, step, { serviceIndex: state.index, requestId: state.requestId, ...extra });
}

// Motivo de un fallo del resolvedor; fallback cuando la tabla no lo conoce.
function reasonOf(failure, step, fallback) {
  const { reason } = translateDomError(failure?.reason, { step });
  return reason === "unexpected_error" && fallback ? fallback : reason;
}

// --- R2: pasos de un servicio -------------------------------------------------

// Paso 1: Add service → buscar → tarjeta exacta → Configure. Hasta 2 intentos
// ante una espera agotada (search_service, BR4.1); "no encontrado" no se repite.
async function startService(run, svc, signal) {
  return retry(
    async () => {
      const started = await run.dom.startService(svc.searchTerm, { signal });
      if (started.ok) return { status: "success", value: started.value };
      const reason = reasonOf(started, "search_service", "page_timeout");
      const detail = started.detail || "buscar el servicio";
      return reason === "page_timeout"
        ? { status: "retry", reason, detail }
        : { status: "fail", reason, detail };
    },
    { operation: "search_service", signal },
  );
}

// Pasos 2-4: región (una vez por corrida), plantilla y toggles (BR1.3, BR2.1, BR2.2).
async function prepareForm(run, svc, state, signal) {
  const opts = { signal };
  emitService(run, state, "applying_toggles", { label: svc.serviceName });
  if (!run.regionSet) {
    state.stoppedAtLabel = REGION_DETAIL;
    const display = getRegionDisplayName(svc.region);
    const region = display ? await run.dom.setRegion(display, opts) : { ok: false };
    if (signal.aborted) return null;
    if (!region.ok) return fail("field_not_applied", REGION_DETAIL);
    run.regionSet = true;
  }
  if (svc.template) {
    state.stoppedAtLabel = svc.template;
    const selected = await run.dom.selectTemplate(svc.template, opts);
    if (signal.aborted) return null;
    if (!selected.ok) {
      return fail(reasonOf(selected, "template", "template_not_found"), svc.template);
    }
  }
  for (const toggle of svc.toggles) {
    state.stoppedAtLabel = toggle.label;
    emitService(run, state, "applying_toggles", { label: toggle.label });
    const applied = await run.dom.applyToggle(toggle, opts);
    if (signal.aborted) return null;
    if (!applied.ok) {
      return fail(reasonOf(applied, "toggle", "toggle_not_applied"), toggle.label);
    }
  }
  const expanded = await run.dom.expandSections(opts);
  if (!expanded.ok) {
    run.log({
      level: "warn",
      step: `service:${svc.requestId}`,
      event: "expand_failed",
      message: "No pude expandir todas las secciones (mejor esfuerzo)",
      selector: expanded.selector,
    });
  }
  return null;
}

// Aplica acciones en orden; cada una se relee en la Zona B (BR2.4) y la
// opción de un selector se elige al abrirlo (BR2.8).
async function applyActions(run, state, actions, signal) {
  for (const action of actions) {
    if (signal.aborted) return null;
    const field = fieldNamePart(action.fieldLabel);
    state.stoppedAtLabel = action.fieldLabel;
    emitService(run, state, "applying_action", { label: action.fieldLabel });
    const applied = await run.dom.applyAction(action, { signal });
    if (signal.aborted) return null;
    if (!applied.ok) {
      return fail(
        reasonOf(applied, "apply_action", "field_not_applied"),
        applied.detail || `${field}: ${action.value}`,
      );
    }
    state.appliedActions.push(action);
  }
  return null;
}

// Paso 5 (BR2.3): hasta 3 pasadas de escaneo y mapeo; las acciones nuevas de
// cada pasada se aplican antes de volver a escanear. Al cerrar, el residuo va
// al cerebro (si hay puerto). Devuelve { failure } o { remaining } con las
// acciones aún sin aplicar (las de la última pasada y las del cerebro).
async function mapService(run, svc, state, signal) {
  const startedAt = run.now().getTime();
  let outcome = null;
  let domFields;
  let applied = 0;
  for (;;) {
    emitService(run, state, "mapping_pass", { label: svc.serviceName });
    const scanned = await run.dom.scanForm({ signal });
    if (signal.aborted) return { failure: null };
    if (!scanned.ok) return { failure: fail("page_timeout", "leer el formulario") };
    domFields = scanned.value;
    outcome = mapDeterministic(domFields, svc.fields, outcome);
    if (outcome.residueStatus !== "pending_passes") break;
    const failure = await applyActions(run, state, outcome.actions.slice(applied), signal);
    if (failure || signal.aborted) return { failure };
    applied = outcome.actions.length;
  }
  if ((outcome.unresolved?.length ?? 0) > 0 && run.mapResidue) {
    emitService(run, state, "asking_brain", { label: svc.serviceName });
  }
  const final = await resolveResidue(
    outcome,
    { serviceName: svc.serviceName, domFields, requestedValues: svc.fields },
    { mapResidue: run.mapResidue, signal },
  );
  const durationMs = run.now().getTime() - startedAt;
  run.log({ step: `service:${svc.requestId}`, ...toLogEntry(final, { durationMs }) });
  if (final.residueStatus !== "none" && final.residueStatus !== "resolved_by_brain") {
    state.brainErrorCode = final.brainErrorCode;
    return { failure: fail("field_not_recognized", describeUnresolved(final)) };
  }
  return { remaining: final.actions.slice(applied) };
}

// Paso 6 (BR2.6): guarda con hasta 3 intentos; solo el banner verde nuevo con
// el nombre exacto de la tarjeta confirma; "is required" corta sin reintento.
async function saveWithRetries(run, svc, state, signal) {
  state.phase = "saving";
  const outcome = await retry(
    async (attempt) => {
      emitService(run, state, "saving", { label: state.calculatorServiceName });
      const saved = await run.dom.saveService(state.calculatorServiceName, { signal });
      if (saved.ok) return { status: "success" };
      run.log({
        level: "warn",
        step: `service:${svc.requestId}`,
        event: "save_attempt_failed",
        message: `Intento ${attempt} sin banner de éxito`,
        selector: saved.selector,
        detail: saved.reason,
      });
      if (saved.reason === "validation_required") {
        return { status: "fail", reason: "validation_required", detail: saved.detail };
      }
      return { status: "retry", reason: saved.reason };
    },
    { operation: "save", signal },
  );
  if (signal.aborted) return null;
  if (outcome.ok) {
    state.formOpen = false;
    return { status: "confirmed" };
  }
  if (outcome.reason === "validation_required") {
    if (outcome.detail) state.stoppedAtLabel = outcome.detail;
    return fail("validation_required", outcome.detail || "un campo obligatorio");
  }
  return fail("save_not_confirmed");
}

// R2 completo. Devuelve { status, reason?, detail? }, o null si la señal se
// abortó (el corte o la cancelación lo resuelve raceWithSignal).
async function serviceSteps(run, svc, state, signal) {
  const started = await startService(run, svc, signal);
  if (signal.aborted) return null;
  if (!started.ok) {
    const reason = started.reason === "exhausted" ? "page_timeout" : started.reason;
    return fail(reason, started.detail || "buscar el servicio");
  }
  state.formOpen = true;
  state.calculatorServiceName = started.value?.calculatorServiceName || svc.serviceName;
  const prepared = await prepareForm(run, svc, state, signal);
  if (prepared || signal.aborted) return prepared;
  const mapped = await mapService(run, svc, state, signal);
  if (mapped.failure || signal.aborted) return mapped.failure ?? null;
  const applyFailure = await applyActions(run, state, mapped.remaining, signal);
  if (applyFailure || signal.aborted) return applyFailure;
  return saveWithRetries(run, svc, state, signal);
}

// --- Cierre de un servicio ----------------------------------------------------

// Convierte la carrera con la señal en { status, reason?, detail? }.
function settle(run, svc, outcome) {
  const step = `service:${svc.requestId}`;
  if (outcome.timedOut) {
    if (outcome.reason === SERVICE_TIMEOUT_REASON) {
      // Corte duro: ninguna acción más sobre el DOM salvo la salida (NFR8.4).
      run.log({ level: "error", step, event: "service_timeout", message: "Corte de 180 s" });
      return fail("service_timeout");
    }
    return fail("not_attempted", "cancelled");
  }
  if (outcome.error) {
    run.log({
      level: "error",
      step,
      event: "unexpected_error",
      message: String(outcome.error?.message ?? outcome.error),
    });
    const code = outcome.error?.code;
    return fail(
      code ? translateDomError(code, { step: outcome.error.step }).reason : "unexpected_error",
    );
  }
  return outcome.value ?? fail("unexpected_error");
}

// BR2.5 / NFR3.5: salir sin guardar con su propia señal de 20 s. Devuelve
// { ok, listedNames }; ok = false detiene la corrida (RunStopped).
async function exitForm(run, svc, state) {
  emitService(run, state, "cancelling", { label: state.stoppedAtLabel });
  const exitTimer = run.createExitTimer();
  try {
    const raced = await raceWithSignal(
      run.dom.exitWithoutSave({ signal: exitTimer.signal }),
      exitTimer.signal,
    );
    if (!raced.timedOut && !raced.error && raced.value?.ok) {
      return { ok: true, listedNames: raced.value.value?.listedNames ?? [] };
    }
    run.log({
      level: "error",
      step: `service:${svc.requestId}`,
      event: "exit_not_confirmed",
      message: "No pude confirmar la salida sin guardar en 20 s",
      selector: raced.value?.selector,
    });
    return { ok: false, listedNames: [] };
  } finally {
    exitTimer.clear();
  }
}

async function returnToEstimate(run, svc) {
  const back = await run.dom.returnToEstimate({ signal: run.signal });
  if (!back.ok) {
    run.log({
      level: "warn",
      step: `service:${svc.requestId}`,
      event: "return_failed",
      message: "No pude volver a My Estimate",
      selector: back.selector,
    });
  }
}

// Un servicio dentro de su corte de 3 minutos (BR2.7), y después su salida.
async function runService(run, svc, index) {
  const state = {
    index,
    requestId: svc.requestId,
    formOpen: false,
    phase: "adding",
    appliedActions: [],
    calculatorServiceName: svc.serviceName,
  };
  emitService(run, state, "adding_service", {
    label: svc.serviceName,
    serviceStatus: "in_progress",
  });
  const startedAt = run.now().getTime();
  const timer = run.createTimer({ runSignal: run.signal });
  let outcome;
  try {
    outcome = await raceWithSignal(serviceSteps(run, svc, state, timer.signal), timer.signal);
  } finally {
    timer.clear();
  }
  const settled = settle(run, svc, outcome);
  let runStopped = false;
  if (settled.status === "failed" && state.formOpen) {
    const exit = await exitForm(run, svc, state);
    runStopped = !exit.ok;
    if (exit.ok && state.phase === "saving") {
      const wanted = normalizeText(state.calculatorServiceName);
      settled.listedInEstimate = exit.listedNames.some((name) => normalizeText(name) === wanted);
    }
  } else {
    await returnToEstimate(run, svc);
  }
  const result = buildServiceResult(svc, {
    ...settled,
    stoppedAtLabel: state.stoppedAtLabel,
    appliedActions: state.appliedActions,
    brainErrorCode: state.brainErrorCode,
    durationMs: run.now().getTime() - startedAt,
  });
  run.log({
    level: result.status === "confirmed" ? "info" : "warn",
    step: `service:${svc.requestId}`,
    event: result.status === "confirmed" ? "service_confirmed" : result.reason,
    label: svc.serviceName,
    detail: result.detail,
  });
  // Fin del servicio: mismo paso en que terminó, con su estado (BR4.2).
  emitService(run, state, state.step, { label: svc.serviceName, serviceStatus: result.status });
  return { result, runStopped, calculatorServiceName: state.calculatorServiceName };
}

// --- R1: corrida --------------------------------------------------------------

async function checkPreconditions(run) {
  emit(run, "checking_estimate");
  const opts = { signal: run.signal };
  const opened = await run.dom.openEstimate(opts);
  if (!opened.ok) return { failureDetail: "timeout:abrir My Estimate", selector: opened.selector };
  const listed = await run.dom.listEstimateServices(opts);
  if (!listed.ok) return { failureDetail: "timeout:leer My Estimate", selector: listed.selector };
  if (listed.value.length > 0) return { failureDetail: "estimate_not_empty" };
  return null;
}

function cancelledResult(run, perServiceResults, failureStep = "services") {
  run.log({
    level: "warn",
    step: run.ctx.step,
    event: "run_cancelled",
    message: "Corrida cancelada",
  });
  return buildErrorRunResult({
    runId: run.runRequest.runId,
    failureStep,
    failureDetail: RUN_FAILURE_DETAILS.CANCELLED,
    perServiceResults,
    now: run.now,
  });
}

// BR1.2: estimado exacto → renombrar (si hay project) → Share validado.
async function finishRun(run, aggregation, calculatorNames) {
  const { runId, project, services } = run.runRequest;
  const finalize = (checks) => finalizeRunResult({ runId, aggregation, now: run.now, ...checks });
  const opts = { signal: run.signal };
  run.ctx.step = "estimate_check";
  emit(run, "checking_estimate");
  const listed = await run.dom.listEstimateServices(opts);
  if (run.signal.aborted)
    return cancelledResult(run, aggregation.perServiceResults, "estimate_check");
  const requested = services.map((svc) => ({
    ...svc,
    calculatorServiceName: calculatorNames.get(svc.requestId),
  }));
  const estimateMatches = listed.ok && estimateMatchesRequest(requested, listed.value);
  if (!estimateMatches) return finalize({ estimateMatches });
  let renameOk;
  if (project) {
    run.ctx.step = "rename";
    emit(run, "renaming", { label: project });
    renameOk = (await run.dom.renameEstimate(project, opts)).ok;
    if (run.signal.aborted) return cancelledResult(run, aggregation.perServiceResults, "rename");
    if (!renameOk) return finalize({ estimateMatches, renameOk });
  }
  run.ctx.step = "share";
  emit(run, "sharing");
  const shared = await run.dom.shareEstimate(opts);
  if (run.signal.aborted) return cancelledResult(run, aggregation.perServiceResults, "share");
  return finalize({ estimateMatches, renameOk, shareUrl: shared.ok ? shared.value : undefined });
}

function notAttempted(svc) {
  return buildServiceResult(svc, { status: "failed", reason: "not_attempted" });
}

async function runSteps(run) {
  const { runId, services } = run.runRequest;
  run.ctx.step = "preconditions";
  const precondition = await checkPreconditions(run);
  if (run.signal.aborted) return cancelledResult(run, services.map(notAttempted), "preconditions");
  if (precondition) {
    run.log({
      level: "warn",
      step: "preconditions",
      event: "preconditions_failed",
      ...precondition,
    });
    return buildErrorRunResult({
      runId,
      failureStep: "preconditions",
      now: run.now,
      ...precondition,
    });
  }
  const serviceResults = [];
  const calculatorNames = new Map();
  let stopped = false;
  for (let i = 0; i < services.length; i++) {
    // BR1.1: se sigue con el siguiente salvo corrida detenida o cancelada.
    if (stopped || run.signal.aborted) {
      serviceResults.push(notAttempted(services[i]));
      continue;
    }
    run.ctx.step = `service:${services[i].requestId}`;
    const { result, runStopped, calculatorServiceName } = await runService(run, services[i], i);
    serviceResults.push(result);
    calculatorNames.set(services[i].requestId, calculatorServiceName);
    stopped = runStopped;
  }
  const aggregation = aggregate(services, serviceResults);
  if (run.signal.aborted) return cancelledResult(run, aggregation.perServiceResults);
  if (!aggregation.allConfirmed) {
    const failureDetail = stopped ? RUN_FAILURE_DETAILS.EXIT_NOT_CONFIRMED : undefined;
    return finalizeRunResult({ runId, aggregation, failureDetail, now: run.now });
  }
  return finishRun(run, aggregation, calculatorNames);
}

function createRun(runRequest, deps) {
  return {
    runRequest,
    dom: deps.dom,
    log: deps.log ?? (() => null),
    progress: deps.progress ?? (() => {}),
    now: deps.now ?? (() => new Date()),
    createTimer: deps.createTimer ?? ((options) => createServiceTimer(options)),
    createExitTimer:
      deps.createExitTimer ??
      (() => createServiceTimer({ timeoutMs: EXIT_TIMEOUT_MS, reason: EXIT_TIMEOUT_REASON })),
    mapResidue: deps.mapResidue ?? null,
    signal: deps.signal ?? deps.context?.signal ?? new AbortController().signal,
    ctx: deps.context ?? { step: "preconditions" },
    regionSet: false,
  };
}

// R1: corrida completa. Siempre devuelve un RunResult (DONE solo vía
// finalizeRunResult); una excepción fuera de un servicio es ERROR con el paso
// en curso. El overlay se limpia siempre al terminar (BR5.2).
export async function runEstimate(runRequest, deps) {
  const run = createRun(runRequest, deps);
  try {
    return await runSteps(run);
  } catch (error) {
    run.log({
      level: "error",
      step: run.ctx.step,
      event: "unexpected_error",
      message: String(error?.message ?? error),
    });
    return buildErrorRunResult({
      runId: runRequest.runId,
      failureStep: stepToFailure(run.ctx.step),
      now: run.now,
    });
  } finally {
    try {
      run.dom.cleanup?.();
    } catch (error) {
      run.log({
        level: "warn",
        step: run.ctx.step,
        event: "cleanup_failed",
        message: String(error),
      });
    }
  }
}
