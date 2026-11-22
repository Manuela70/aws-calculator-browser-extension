// lib/dom/dom-utils.js — Helpers de DOM portados del v6 (getText, cleanAriaLabel, clics, valores).
// PROVISIONAL (U1, walking skeleton). Dueño final: U5. Zona B: solo se ejecuta en
// la pestaña de calculator.aws y se verifica con el smoke manual (SMOKE.md).
// Ningún helper toca el DOM al importarse.

import { SELECTORS } from "./selectors.js";
import { DELAY, sleep } from "../rpa/wait.js";
import { normalizeText } from "../mapping/option-match.js";

export function queryAll(selectorName, root = document) {
  return [...root.querySelectorAll(SELECTORS[selectorName])];
}

export function isVisible(el) {
  return Boolean(el) && el.offsetParent !== null;
}

export function getText(el) {
  if (!el) return "";
  return (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
}

// FIX-1: cleanAriaLabel vive ahora en el módulo puro aria-label.js (U3); se
// reexporta aquí para no romper a sus llamadores (form-scanner.js).
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
  if (cancelled(signal)) return false;
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
      (b) => isVisible(b) && !b.disabled && normalizeText(getText(b)) === target,
    ) ?? null
  );
}

export function isToggleOn(el) {
  if (!el) return false;
  if (el.tagName === "INPUT") return el.checked;
  return el.getAttribute("aria-checked") === "true";
}
