// lib/dom/dom-utils.js — Helpers de DOM: esperas tipadas, clics, valores, relectura,
// confirmación del guardado, salida sin guardar y lectura de My Estimate
// (NFR2.2, NFR3.1, NFR3.3, NFR3.5; BR2.4-BR2.6).
// Dueño: U5. Zona B: solo se ejecuta en la pestaña de calculator.aws y se
// verifica con el smoke manual (SMOKE.md). Ningún helper toca el DOM al importarse.

import { ESTIMATE_HASH, SELECTORS, SUCCESS_BANNER_PATTERN, UI_TEXT } from "./selectors.js";
import { DEFAULT_WAIT_TIMEOUT_MS, DELAY, sleep, waitFor as waitForResult } from "../rpa/wait.js";
import { normalizeText } from "../mapping/option-match.js";

// Banner de guardado: 10 s por intento (NFR3.1).
export const BANNER_TIMEOUT_MS = 10000;

// Fallo tipado de la Zona B (security-design §2): code se traduce a los enums
// de entities.md con translateDomError (result-aggregator.js).
export class DomError extends Error {
  constructor(code, { step, label } = {}) {
    super(label ? `${code}: ${label}` : code);
    this.name = "DomError";
    this.code = code;
    this.step = step;
    this.label = label;
  }
}

const WAIT_FAILURE_CODES = Object.freeze({
  timeout: "not_found",
  cancelled: "aborted",
  error: "unexpected_error",
});

// Decisión 4 del plan: envuelve la primitiva pura de lib/rpa/wait.js (que
// nunca rechaza) y convierte su fallo en DomError { code, step, label }.
// Toda espera tiene tope (20 s por defecto) y señal.
export async function waitFor(
  predicate,
  { signal, timeoutMs = DEFAULT_WAIT_TIMEOUT_MS, step, label } = {},
) {
  const result = await waitForResult(predicate, { signal, timeoutMs, label });
  if (result.ok) return result.value;
  throw new DomError(WAIT_FAILURE_CODES[result.reason] ?? "unexpected_error", { step, label });
}

export function queryAll(selectorName, root = document) {
  return [...root.querySelectorAll(SELECTORS[selectorName])];
}

export function isVisible(el) {
  return Boolean(el) && el.offsetParent !== null;
}

// Nodos del Spotlight (BR5.2): nunca entran en el escaneo ni en la búsqueda.
export function isOverlay(el) {
  return Boolean(el?.closest?.(SELECTORS["overlay.root"]));
}

export function getText(el) {
  if (!el) return "";
  return (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
}

// FIX-1: cleanAriaLabel vive en el módulo puro aria-label.js; se reexporta aquí
// para no romper a sus llamadores (form-scanner.js).
export { cleanAriaLabel } from "./aria-label.js";

// Texto de los elementos referenciados por aria-labelledby (ids separados por espacio).
export function labelledByParts(el) {
  return (el.getAttribute("aria-labelledby") || "")
    .split(" ")
    .filter(Boolean)
    .map((id) => getText(document.getElementById(id)))
    .filter(Boolean);
}

export function isUiChrome(el) {
  return Boolean(el.closest(SELECTORS["page.uiChrome"]));
}

export function cancelled(signal) {
  return Boolean(signal?.aborted);
}

function mouseClick(el) {
  const rect = el.getBoundingClientRect();
  const opts = {
    bubbles: true,
    cancelable: true,
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height / 2,
  };
  el.dispatchEvent(new MouseEvent("mouseover", opts));
  el.dispatchEvent(new MouseEvent("mousedown", opts));
  el.dispatchEvent(new MouseEvent("mouseup", opts));
  el.click();
}

// Clic con desplazamiento previo; comprueba la cancelación antes de tocar el DOM.
export async function clickElement(el, signal) {
  if (cancelled(signal) || !el) return false;
  el.scrollIntoView({ block: "center" });
  if (!(await sleep(DELAY.SHORT, signal))) return false;
  mouseClick(el);
  return sleep(DELAY.SHORT, signal);
}

// Fija el valor de un input con el setter nativo para que React lo detecte.
export async function setNativeValue(el, value, signal) {
  if (cancelled(signal)) return false;
  el.scrollIntoView({ block: "center" });
  el.focus();
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(el, String(value));
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return sleep(DELAY.SHORT, signal);
}

// Botón visible y habilitado cuyo texto coincide exactamente (normalizado).
export function findButton(text, root = document) {
  const target = normalizeText(text);
  return (
    queryAll("page.buttons", root).find(
      (b) => isVisible(b) && !b.disabled && !isOverlay(b) && normalizeText(getText(b)) === target,
    ) ?? null
  );
}

export function isToggleOn(el) {
  if (!el) return false;
  if (el.tagName === "INPUT") return el.checked;
  return el.getAttribute("aria-checked") === "true";
}

export function formRoot() {
  return document.querySelector(SELECTORS["form.root"]) ?? document.body;
}

// --- Relectura (NFR3.3, BR2.4) -------------------------------------------------

// Normaliza para comparar: espacios, mayúsculas y separadores de miles
// ("1,000" y "1 000" valen como "1000").
export function normalizeValue(value) {
  return normalizeText(value).replace(/(\d)[,\s](?=\d{3}(?:\D|$))/g, "$1");
}

// Valor visible de un control tras aplicar la acción.
export function readBack(el) {
  if (!el) return "";
  if (el.tagName === "SELECT") return el.options[el.selectedIndex]?.text ?? "";
  if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") return el.value;
  return getText(el);
}

export function valuesMatch(expected, actual) {
  return normalizeValue(expected) === normalizeValue(actual);
}

// --- Guardado (NFR3.1, BR2.6) ---------------------------------------------------

function bannerNames(el) {
  return [el, ...el.querySelectorAll("*")]
    .map((node) => SUCCESS_BANNER_PATTERN.exec(getText(node)))
    .filter(Boolean)
    .map((match) => normalizeText(match[1]));
}

function wasAdded(el, addedNodes) {
  for (const node of addedNodes) {
    if (node === el || node.contains(el)) return true;
  }
  return false;
}

function requiredFieldLabel(message) {
  const field = message.closest(SELECTORS["form.field"]);
  const label = field ? getText(field.querySelector("label")) : "";
  return label || getText(message);
}

// "is required" SOLO dentro del formulario abierto (decisión 9 del plan).
function findRequiredMessage() {
  const marker = normalizeText(UI_TEXT.REQUIRED_MARKER);
  return (
    queryAll("form.requiredMessages", formRoot()).find(
      (m) => isVisible(m) && !isOverlay(m) && normalizeText(getText(m)).includes(marker),
    ) ?? null
  );
}

// Un intento de guardado. Solo confirma un banner que APARECE después del clic
// (MutationObserver + lista previa) con texto "Successfully added <X> estimate."
// y X igual, normalizado, al título de la tarjeta (calculatorServiceName).
// Así el banner de un homónimo anterior nunca confirma el siguiente. La URL y
// el botón "Add service" no participan.
// Devuelve { ok: true } | { ok: false, reason: "validation_required", detail }
// | { ok: false, reason: "not_confirmed" }; la cancelación lanza DomError aborted.
export async function confirmSave(calculatorServiceName, saveButton, { signal } = {}) {
  const wanted = normalizeText(calculatorServiceName);
  const before = new Set(queryAll("save.messages"));
  const added = new Set();
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) if (node.nodeType === 1) added.add(node);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  try {
    if (!(await clickElement(saveButton, signal))) throw new DomError("aborted", { step: "save" });
    const outcome = await waitFor(
      () => {
        const required = findRequiredMessage();
        if (required) return { required };
        const banner = queryAll("save.messages").find(
          (m) =>
            !before.has(m) && isVisible(m) && wasAdded(m, added) && bannerNames(m).includes(wanted),
        );
        return banner ? { confirmed: true } : null;
      },
      { signal, timeoutMs: BANNER_TIMEOUT_MS, step: "save", label: "banner" },
    );
    if (outcome.required) {
      return {
        ok: false,
        reason: "validation_required",
        detail: requiredFieldLabel(outcome.required),
        selector: "form.requiredMessages",
      };
    }
    return { ok: true };
  } catch (error) {
    if (error instanceof DomError && error.code === "not_found") {
      return { ok: false, reason: "not_confirmed", selector: "save.messages" };
    }
    throw error;
  } finally {
    observer.disconnect();
  }
}

// --- My Estimate -----------------------------------------------------------------

export function isEstimatePage() {
  return window.location.hash.includes(ESTIMATE_HASH) && Boolean(findButton(UI_TEXT.ADD_SERVICE));
}

// Nombres de los servicios de My Estimate, leídos de la columna "Service Name"
// (o de la primera celda con texto si la tabla no tiene encabezado).
export function readEstimateServiceNames() {
  const headers = queryAll("estimate.headerCells").map(getText);
  const wanted = normalizeText(UI_TEXT.ESTIMATE_SERVICE_COLUMN);
  const column = headers.findIndex((header) => normalizeText(header) === wanted);
  return queryAll("estimate.serviceRows")
    .filter(isVisible)
    .map((row) => {
      const cells = queryAll("instances.cells", row);
      if (cells.length < 2) return "";
      const cell = column >= 0 ? cells[column] : cells.find((c) => getText(c));
      return getText(cell);
    })
    .filter(Boolean);
}

// Parte DOM de la verificación final (NFR3.2): la comparación de multiconjunto
// exacta es estimateMatchesRequest (Zona A).
export function verifyEstimate() {
  return { names: readEstimateServiceNames() };
}

// BR2.5 / NFR3.5: salir del formulario sin guardar y confirmar que se ve My
// Estimate, esté o no el servicio en la lista. La señal es la propia de la
// salida (20 s), no la del servicio. Si Cancel no lleva a My Estimate, se
// navega por hash. Devuelve { ok: true, value: { listedNames } }.
export async function exitWithoutSave({ signal } = {}) {
  const cancel = findButton(UI_TEXT.CANCEL, formRoot());
  if (cancel && !(await clickElement(cancel, signal))) {
    throw new DomError("aborted", { step: "exit" });
  }
  try {
    await waitFor(isEstimatePage, { signal, timeoutMs: DELAY.LONG * 4, step: "exit" });
  } catch (error) {
    if (!(error instanceof DomError) || error.code !== "not_found") throw error;
    window.location.hash = ESTIMATE_HASH;
    await waitFor(isEstimatePage, { signal, step: "exit", label: "estimate" });
  }
  return { ok: true, value: { listedNames: readEstimateServiceNames() } };
}
