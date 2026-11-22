// lib/rpa/orchestrator.js — Flujos W3 (corrida) y W4 (un servicio) sin tocar el DOM.
// PROVISIONAL (U1, walking skeleton). Dueño final: U5.
// Recibe el resolvedor del DOM como dependencia (lib/dom/dom-resolver.js en la
// pestaña; un doble en los tests). Contrato del resolvedor: cada función es
// async, recibe { signal } y devuelve { ok: true, value? } o
// { ok: false, reason, detail?, selector? }; nunca debe lanzar, y si lanza el
// orquestador lo convierte en un resultado tipado (BR4.8).
//   openEstimate, listEstimateServices, startService(searchTerm),
//   setRegion(displayName), applyToggle(toggle), expandSections, scanForm,
//   applyAction(action), saveService(serviceName), returnToEstimate,
//   renameEstimate(name), shareEstimate → { value: url }
// El puerto del cerebro (deps.mapResidue) es opcional: null hasta que U7 lo
// conecte con BRAIN_CALL; sin él, un residuo hace fallar el servicio (BR3.4).

import {
  describeUnresolved,
  fieldNamePart,
  mapDeterministic,
  toLogEntry,
} from "../mapping/deterministic-mapper.js";
import { resolveResidue } from "../mapping/residue-resolver.js";
import { getRegionDisplayName } from "../mapping/region-map.js";
import { retry } from "./retry.js";
import { createServiceTimer, raceWithSignal } from "./service-timer.js";
import {
  aggregate,
  buildErrorRunResult,
  estimateMatchesRequest,
  finalizeRunResult,
} from "./result-aggregator.js";

export const SAVE_MAX_ATTEMPTS = 3;

function failedService(svc, reason, detail) {
  const result = {
    requestId: svc.requestId,
    serviceName: svc.serviceName,
    status: "failed",
    reason,
  };
  if (detail) result.detail = detail;
  return result;
}

// Paso en curso → failureStep del RunResult ("service:svc-1" → services).
export function stepToFailure(step) {
  return String(step).startsWith("service:") ? "services" : step;
}

// Guarda con hasta 3 intentos; solo el banner verde confirma (BR4.4-BR4.6).
async function saveWithRetries(run, svc, signal) {
  const outcome = await retry(
    async (attempt) => {
      run.progress(
        run.pct,
        `Guardando ${svc.serviceName} (intento ${attempt}/${SAVE_MAX_ATTEMPTS})…`,
      );
      const saved = await run.dom.saveService(svc.serviceName, { signal });
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
    { maxAttempts: SAVE_MAX_ATTEMPTS, signal },
  );
  if (outcome.ok) return null;
  if (outcome.reason === "validation_required") {
    return failedService(svc, "validation_required", outcome.detail || "un campo obligatorio");
  }
  return failedService(svc, "save_not_confirmed");
}

async function prepareForm(run, svc, { isFirst, signal }) {
  const opts = { signal };
  if (isFirst) {
    const display = getRegionDisplayName(svc.region);
    run.progress(run.pct, `Fijando la región ${display ?? svc.region}…`);
    const region = display ? await run.dom.setRegion(display, opts) : { ok: false };
    if (!region.ok) return failedService(svc, "field_not_applied", "región");
  }
  for (const toggle of svc.toggles) {
    run.progress(run.pct, `Ajustando la opción ${toggle.label} en ${svc.serviceName}…`);
    const applied = await run.dom.applyToggle(toggle, opts);
    if (!applied.ok) return failedService(svc, "toggle_not_applied", toggle.label);
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

async function applyActions(run, svc, actions, signal) {
  for (const action of actions) {
    if (signal.aborted) return null;
    run.progress(run.pct, `Aplicando ${fieldNamePart(action.fieldLabel)} = ${action.value}…`);
    const applied = await run.dom.applyAction(action, { signal });
    if (!applied.ok) {
      const reason = applied.reason === "page_timeout" ? "page_timeout" : "field_not_applied";
      return failedService(
        svc,
        reason,
        applied.detail || `${fieldNamePart(action.fieldLabel)}: ${action.value}`,
      );
    }
  }
  return null;
}

// M2 (reglas de U3): hasta 3 pasadas de escaneo y mapeo; las acciones nuevas de
// cada pasada se aplican antes de volver a escanear, para que aparezcan los
// campos condicionales. Al cerrar, M3 consulta el residuo con el puerto (si
// hay). Devuelve { failure } o { remaining } con las acciones aún sin aplicar
// (las de la última pasada y las del cerebro). Un residuo sin resolver es
// field_not_recognized con el detalle "clave: motivo" (BR3.4).
async function mapService(run, svc, signal) {
  const startedAt = run.now().getTime();
  let outcome = null;
  let domFields;
  let applied = 0;
  for (;;) {
    const scanned = await run.dom.scanForm({ signal });
    if (!scanned.ok) return { failure: failedService(svc, "page_timeout", "leer el formulario") };
    domFields = scanned.value;
    outcome = mapDeterministic(domFields, svc.fields, outcome);
    if (outcome.residueStatus !== "pending_passes") break;
    const failure = await applyActions(run, svc, outcome.actions.slice(applied), signal);
    if (failure || signal.aborted) return { failure };
    applied = outcome.actions.length;
  }
  const final = await resolveResidue(
    outcome,
    { serviceName: svc.serviceName, domFields, requestedValues: svc.fields },
    { mapResidue: run.mapResidue, signal },
  );
  const durationMs = run.now().getTime() - startedAt;
  run.log({ step: `service:${svc.requestId}`, ...toLogEntry(final, { durationMs }) });
  if (final.residueStatus !== "none" && final.residueStatus !== "resolved_by_brain") {
    return { failure: failedService(svc, "field_not_recognized", describeUnresolved(final)) };
  }
  return { remaining: final.actions.slice(applied) };
}

// W4: un servicio. Devuelve un ServiceResult, o null si se canceló (el corte
// lo resuelve raceWithSignal).
async function serviceSteps(run, svc, { isFirst, signal }) {
  const started = await run.dom.startService(svc.searchTerm, { signal });
  if (signal.aborted) return null;
  if (!started.ok) {
    const reason = started.reason === "service_not_found" ? "service_not_found" : "page_timeout";
    return failedService(svc, reason, started.detail || "buscar el servicio");
  }
  const prepared = await prepareForm(run, svc, { isFirst, signal });
  if (prepared || signal.aborted) return prepared;
  const mapped = await mapService(run, svc, signal);
  if (mapped.failure || signal.aborted) return mapped.failure ?? null;
  const applyFailure = await applyActions(run, svc, mapped.remaining, signal);
  if (applyFailure || signal.aborted) return applyFailure;
  const saveFailure = await saveWithRetries(run, svc, signal);
  if (saveFailure) return saveFailure;
  return { requestId: svc.requestId, serviceName: svc.serviceName, status: "confirmed" };
}

async function runService(run, svc, index) {
  const total = run.runRequest.services.length;
  run.pct = 10 + Math.round((index / total) * 75);
  run.progress(run.pct, `Configurando ${svc.serviceName} (${index + 1}/${total})…`);
  const step = `service:${svc.requestId}`;
  const timer = run.createTimer();
  let result;
  try {
    const outcome = await raceWithSignal(
      serviceSteps(run, svc, { isFirst: index === 0, signal: timer.signal }),
      timer.signal,
    );
    if (outcome.timedOut) {
      // Corte duro: ninguna acción más sobre el DOM para este servicio (NFR8.6).
      run.log({ level: "error", step, event: "service_timeout", message: "Corte de 180 s" });
      return failedService(svc, "service_timeout");
    }
    if (outcome.error) {
      run.log({
        level: "error",
        step,
        event: "unexpected_error",
        message: String(outcome.error?.message ?? outcome.error),
      });
      result = failedService(svc, "unexpected_error");
    } else {
      result = outcome.value ?? failedService(svc, "unexpected_error");
    }
  } finally {
    timer.clear();
  }
  run.log({
    level: result.status === "confirmed" ? "info" : "warn",
    step,
    event: result.status === "confirmed" ? "service_confirmed" : result.reason,
    label: svc.serviceName,
    detail: result.detail,
  });
  const back = await run.dom.returnToEstimate({});
  if (!back.ok) {
    run.log({
      level: "warn",
      step,
      event: "return_failed",
      message: "No pude volver a My Estimate",
      selector: back.selector,
    });
  }
  return result;
}

async function checkPreconditions(run) {
  run.progress(5, "Abriendo My Estimate…");
  const opened = await run.dom.openEstimate({});
  if (!opened.ok) return { failureDetail: "timeout:abrir My Estimate", selector: opened.selector };
  const listed = await run.dom.listEstimateServices({});
  if (!listed.ok) return { failureDetail: "timeout:leer My Estimate", selector: listed.selector };
  if (listed.value.length > 0) return { failureDetail: "estimate_not_empty" };
  return null;
}

async function finishRun(run, aggregation) {
  const { runId, project, services } = run.runRequest;
  const finalize = (checks) => finalizeRunResult({ runId, aggregation, now: run.now, ...checks });
  run.ctx.step = "estimate_check";
  run.progress(88, "Verificando el contenido del estimado…");
  const listed = await run.dom.listEstimateServices({});
  const estimateMatches = listed.ok && estimateMatchesRequest(services, listed.value);
  if (!estimateMatches) return finalize({ estimateMatches });
  let renameOk;
  if (project) {
    run.ctx.step = "rename";
    run.progress(92, `Renombrando el estimado a "${project}"…`);
    renameOk = (await run.dom.renameEstimate(project, {})).ok;
    if (!renameOk) return finalize({ estimateMatches, renameOk });
  }
  run.ctx.step = "share";
  run.progress(95, "Obteniendo el enlace público…");
  const shared = await run.dom.shareEstimate({});
  return finalize({ estimateMatches, renameOk, shareUrl: shared.ok ? shared.value : undefined });
}

async function runSteps(run) {
  const { runId, services } = run.runRequest;
  run.ctx.step = "preconditions";
  const precondition = await checkPreconditions(run);
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
  for (let i = 0; i < services.length; i++) {
    run.ctx.step = `service:${services[i].requestId}`;
    serviceResults.push(await runService(run, services[i], i));
  }
  const aggregation = aggregate(services, serviceResults);
  if (!aggregation.allConfirmed) {
    return finalizeRunResult({ runId, aggregation, now: run.now });
  }
  return finishRun(run, aggregation);
}

// W3: corrida completa. Siempre devuelve un RunResult (DONE solo vía
// finalizeRunResult); una excepción fuera de un servicio es ERROR con el paso
// en curso.
export async function runEstimate(runRequest, deps) {
  const run = {
    runRequest,
    dom: deps.dom,
    log: deps.log ?? (() => null),
    progress: deps.progress ?? (() => {}),
    now: deps.now ?? (() => new Date()),
    createTimer: deps.createTimer ?? (() => createServiceTimer()),
    mapResidue: deps.mapResidue ?? null,
    ctx: deps.context ?? { step: "preconditions" },
    pct: 5,
  };
  try {
    const result = await runSteps(run);
    if (result.status === "DONE") run.progress(100, "Estimado listo.");
    return result;
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
  }
}
