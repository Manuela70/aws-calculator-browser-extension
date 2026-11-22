// lib/messages-es.js — Traducción de reason/failureStep a texto en español (BR6.4, NFR3.3).
// PROVISIONAL (U1, walking skeleton). Dueño final: U6.
// Los mensajes nombran servicio, campo o región; nunca códigos de reason,
// selectores, clases awsui_* ni trazas técnicas.

const SERVICE_REASON_TEXT = Object.freeze({
  service_not_found: (svc) => `No encontré el servicio ${svc} en la calculadora.`,
  page_timeout: (svc, detail) =>
    `calculator.aws tardó demasiado en ${detail || "cargar la página"} (${svc}).`,
  toggle_not_applied: (svc, detail) => `No pude activar la opción ${detail} en ${svc}.`,
  field_not_recognized: (svc, detail) => `No reconocí el campo ${detail} en ${svc}.`,
  field_not_applied: (svc, detail) => `No pude aplicar ${detail} en ${svc}.`,
  validation_required: (svc, detail) => `Falta un dato obligatorio en ${svc}: ${detail}.`,
  save_not_confirmed: (svc) => `No pude confirmar que ${svc} se guardó.`,
  service_timeout: (svc) =>
    `Configurar ${svc} tardó más de 3 minutos; lo detuve. Revisa el estimado en calculator.aws antes de volver a intentar.`,
  unexpected_error: (svc) => `Algo falló al configurar ${svc}.`,
  // Motivos de U5 (BR4.3; decisión 8 del plan). U6 es dueño final del copy.
  template_not_found: (svc, detail) =>
    `La calculadora no ofrece la plantilla ${detail || "pedida"} para ${svc}.`,
  field_not_resolved: (svc, detail) =>
    `No pude ubicar de forma única el campo ${detail} en ${svc}.`,
  option_no_match: (svc, detail) => `Ninguna opción coincide con ${detail} en ${svc}.`,
  option_ambiguous: (svc, detail) => `Hay más de una opción posible para ${detail} en ${svc}.`,
  not_attempted: (svc) => `${svc} no se procesó porque la corrida se detuvo.`,
});

// Aviso de cada sustitución del cerebro (BR4.3).
function describeSubstitution({ requestedValue, appliedValue }) {
  return `Pediste ${requestedValue}; se usó ${appliedValue}.`;
}

// Detalles de corrida propios de U5 (decisiones 3 y 7 del plan).
const RUN_DETAIL_TEXT = Object.freeze({
  share_invalid: "El enlace que devolvió la calculadora no es válido; no lo comparto.",
  cancelled: "Cancelaste la corrida; los servicios pendientes no se procesaron.",
  exit_not_confirmed:
    "No pude salir del formulario sin guardar; detuve la corrida. Revisa el estimado en calculator.aws.",
});

const CONNECTION_DETAIL_TEXT = Object.freeze({
  busy: "Ya hay una corrida en curso en calculator.aws.",
  not_ready: "calculator.aws aún no está listo; vuelve a intentar.",
  module_load_failed:
    "No pude cargar la extensión en calculator.aws. Recarga la pestaña de calculator.aws y vuelve a intentar.",
});

const FAILURE_STEP_TEXT = Object.freeze({
  connection: "No pude conectar con calculator.aws.",
  preconditions:
    "El estimado abierto ya tiene servicios. Vacíalo o abre uno nuevo en calculator.aws y vuelve a intentar.",
  services: "No todos los servicios quedaron guardados; no comparto un enlace incompleto.",
  estimate_check: "El estimado no coincide con lo pedido; no comparto un enlace incorrecto.",
  rename:
    "Los servicios se guardaron, pero no pude renombrar el estimado; no comparto un enlace incompleto.",
  share: "No pude obtener el enlace público del estimado.",
  lost: "La corrida dejó de responder (se cerró o recargó la pestaña). Puedes volver a intentar.",
});

// failureDetail "timeout:<paso>" → espera agotada fuera de un servicio (BR4.10).
const TIMEOUT_PREFIX = "timeout:";

function substitutionNotes(serviceResult) {
  return (serviceResult.brainSubstitutions ?? []).map(describeSubstitution);
}

export function describeServiceResult(serviceResult) {
  const name = serviceResult.serviceName;
  const notes = substitutionNotes(serviceResult);
  if (serviceResult.status === "confirmed") {
    return [`${name}: guardado y confirmado.`, ...notes].join(" ");
  }
  const translate =
    SERVICE_REASON_TEXT[serviceResult.reason] ?? SERVICE_REASON_TEXT.unexpected_error;
  const parts = [translate(name, serviceResult.detail ?? "")];
  if (serviceResult.stoppedAtLabel) parts.push(`Me detuve en ${serviceResult.stoppedAtLabel}.`);
  if (serviceResult.listedInEstimate) parts.push(`${name} aparece igual en My Estimate.`);
  return [...parts, ...notes].join(" ");
}

export function describeFailure(runResult) {
  const detail = runResult.failureDetail ?? "";
  if (runResult.failureStep === "connection" && CONNECTION_DETAIL_TEXT[detail]) {
    return CONNECTION_DETAIL_TEXT[detail];
  }
  if (RUN_DETAIL_TEXT[detail]) return RUN_DETAIL_TEXT[detail];
  if (detail.startsWith(TIMEOUT_PREFIX)) {
    return `calculator.aws tardó demasiado en ${detail.slice(TIMEOUT_PREFIX.length)}.`;
  }
  return FAILURE_STEP_TEXT[runResult.failureStep] ?? FAILURE_STEP_TEXT.connection;
}

// Resumen para el panel: título, líneas por servicio y si se puede mostrar la
// URL (solo DONE, BR5.4).
export function describeRunResult(runResult) {
  const isDone = runResult.status === "DONE";
  return {
    title: isDone ? "✅ Estimado listo." : `❌ ${describeFailure(runResult)}`,
    lines: (runResult.perServiceResults ?? []).map(describeServiceResult),
    showUrl: isDone,
  };
}
