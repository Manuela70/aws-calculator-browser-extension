// lib/panel/waf-model.js — Pedido y validación de la evaluación Well-Architected (C2 1.1.0;
// BR2.2, BR4.1, NFR5.1).
// Dueño: U6. Zona A. La respuesta del cerebro es dato no confiable: se valida
// completa antes de pintarla y una respuesta que no valida es WafError, nunca
// una lista vacía.

export const WAF_PHASES = Object.freeze({ PRE_FILL: "pre_fill", POST_FILL: "post_fill" });

export const WAF_PILLARS = Object.freeze([
  "OperationalExcellence",
  "Security",
  "Reliability",
  "PerformanceEfficiency",
  "CostOptimization",
  "Sustainability",
]);

export const WAF_SEVERITIES = Object.freeze(["high", "medium", "low"]);

// Topes de C2 (iguales a brain/core/limits.js).
export const WAF_LIMITS = Object.freeze({
  services: 20,
  configKeys: 30,
  keyOrValueChars: 100,
  recommendations: 5,
  textChars: 300,
});

const INVALID = Object.freeze({ ok: false, code: "empty_result" });

function clipTo(text, max) {
  const value = String(text ?? "");
  return value.length <= max ? value : value.slice(0, max);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

// Configuración del servicio como pares campo → valor de texto, dentro de los topes.
function buildConfig(svc) {
  const max = WAF_LIMITS.keyOrValueChars;
  const config = {};
  const put = (key, value) => {
    if (Object.keys(config).length >= WAF_LIMITS.configKeys) return;
    if (!isNonEmptyString(key) || typeof value !== "string") return;
    config[clipTo(key, max)] = clipTo(value, max);
  };
  if (svc.template) put("Template", svc.template);
  if (svc.region) put("Region", svc.region);
  for (const field of svc.fields ?? []) put(field?.key, field?.value);
  for (const toggle of svc.toggles ?? []) put(toggle?.label, toggle?.wantOn ? "on" : "off");
  return config;
}

// WafRequest { phase, services: [{ name, config }] }. Usa la configuración
// normalizada si está en memoria; al reanudar una corrida solo se conocen los
// nombres del RunResult.
export function buildWafRequest(normalizedRun, runResult, phase = WAF_PHASES.POST_FILL) {
  const fromRun = Array.isArray(normalizedRun?.services) ? normalizedRun.services : [];
  const services =
    fromRun.length > 0
      ? fromRun.map((svc) => ({
          name: clipTo(svc.serviceName, WAF_LIMITS.keyOrValueChars),
          config: buildConfig(svc),
        }))
      : (runResult?.perServiceResults ?? []).map((result) => ({
          name: clipTo(result.serviceName, WAF_LIMITS.keyOrValueChars),
          config: {},
        }));
  return {
    phase: phase === WAF_PHASES.PRE_FILL ? WAF_PHASES.PRE_FILL : WAF_PHASES.POST_FILL,
    services: services.filter((svc) => svc.name.trim().length > 0).slice(0, WAF_LIMITS.services),
  };
}

function checkRecommendation(rec) {
  if (!isPlainObject(rec)) return null;
  if (!WAF_PILLARS.includes(rec.pillar) || !WAF_SEVERITIES.includes(rec.severity)) return null;
  if (!isNonEmptyString(rec.text) || rec.text.length > WAF_LIMITS.textChars) return null;
  return { pillar: rec.pillar, severity: rec.severity, text: rec.text };
}

function checkServiceResult(item, serviceCount) {
  if (!isPlainObject(item) || typeof item.noFindings !== "boolean") return null;
  if (!Number.isInteger(item.serviceIndex) || item.serviceIndex < 0) return null;
  if (item.serviceIndex >= serviceCount) return null;
  if (!isNonEmptyString(item.service) || item.service.length > WAF_LIMITS.keyOrValueChars) {
    return null;
  }
  const recs = item.recommendations;
  const base = { serviceIndex: item.serviceIndex, service: item.service };
  if (item.noFindings) {
    const isEmpty = recs === undefined || (Array.isArray(recs) && recs.length === 0);
    return isEmpty ? { ...base, noFindings: true, recommendations: [] } : null;
  }
  if (!Array.isArray(recs) || recs.length === 0 || recs.length > WAF_LIMITS.recommendations) {
    return null;
  }
  const recommendations = recs.map(checkRecommendation);
  if (recommendations.includes(null)) return null;
  return { ...base, noFindings: false, recommendations };
}

// Valida { perService: [...] } contra el pedido de serviceCount servicios.
// Devuelve { ok: true, value: { perService, hasFindings } } o { ok: false, code }.
export function validateWafResponse(value, { serviceCount } = {}) {
  const count = Number.isInteger(serviceCount) ? serviceCount : WAF_LIMITS.services;
  if (!isPlainObject(value) || !Array.isArray(value.perService)) return INVALID;
  const list = value.perService;
  if (list.length === 0 || list.length > Math.min(count, WAF_LIMITS.services)) return INVALID;
  const perService = list.map((item) => checkServiceResult(item, count));
  if (perService.includes(null)) return INVALID;
  const indexes = new Set(perService.map((item) => item.serviceIndex));
  if (indexes.size !== perService.length) return INVALID;
  perService.sort((a, b) => a.serviceIndex - b.serviceIndex);
  return {
    ok: true,
    value: { perService, hasFindings: perService.some((item) => !item.noFindings) },
  };
}
