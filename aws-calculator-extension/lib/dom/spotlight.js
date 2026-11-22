// lib/dom/spotlight.js — Resalte del campo que se va a llenar (BR5.1, BR5.2; NFR5.2, NFR5.3).
// Zona B: solo se ejecuta en la pestaña de calculator.aws y se verifica con el
// smoke manual (SMOKE.md). No toca el DOM al importarse.
// - El overlay vive en un shadow root CERRADO propio: la página no lo lee y sus
//   estilos no se mezclan con los de CloudScape.
// - Solo createElement y textContent: nunca HTML con datos de la página, del
//   cerebro o del usuario.
// - pointer-events: none y z-index máximo: no intercepta los clics del RPA.
// - Sin transición si el usuario pidió movimiento reducido.
// - El host lleva data-aidlc-overlay, que form-scanner.js excluye del escaneo.

import { OVERLAY_ATTRIBUTE, SELECTORS } from "./selectors.js";

const MAX_TOOLTIP_CHARS = 200;
const Z_INDEX_MAX = "2147483647";

function prefersReducedMotion() {
  try {
    return Boolean(globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  } catch {
    // Sin matchMedia (entorno raro): se asume movimiento reducido, que es lo seguro.
    return true;
  }
}

function overlayStyles(reducedMotion) {
  const transition = reducedMotion ? "none" : "all 150ms ease-out";
  return [
    ":host { all: initial; }",
    ".dim { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.25); pointer-events: none; }",
    `.box { position: fixed; border: 3px solid #ff9900; border-radius: 6px; pointer-events: none; transition: ${transition}; }`,
    ".tip { position: fixed; max-width: 320px; padding: 4px 8px; border-radius: 4px; background: #232f3e; color: #fff; font: 12px/1.4 sans-serif; pointer-events: none; }",
  ].join("\n");
}

function place(el, { top, left, width, height }) {
  el.style.top = `${top}px`;
  el.style.left = `${left}px`;
  if (width !== undefined) el.style.width = `${width}px`;
  if (height !== undefined) el.style.height = `${height}px`;
}

// Muestra el resalte sobre target con la etiqueta como texto plano. Devuelve
// { remove() } para quitarlo en un finally; remove() es idempotente.
export function showSpotlight(target, label) {
  const reducedMotion = prefersReducedMotion();
  // Desplazamiento instantáneo: el contorno se dibuja con la posición final.
  target.scrollIntoView({ block: "center", behavior: "auto" });
  const host = document.createElement("div");
  host.setAttribute(OVERLAY_ATTRIBUTE, "");
  host.style.position = "fixed";
  host.style.inset = "0";
  host.style.pointerEvents = "none";
  host.style.zIndex = Z_INDEX_MAX;
  const root = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = overlayStyles(reducedMotion);
  const dim = document.createElement("div");
  dim.className = "dim";
  const box = document.createElement("div");
  box.className = "box";
  const rect = target.getBoundingClientRect();
  place(box, {
    top: rect.top - 4,
    left: rect.left - 4,
    width: rect.width + 8,
    height: rect.height + 8,
  });
  root.append(style, dim, box);
  const text = String(label ?? "").slice(0, MAX_TOOLTIP_CHARS);
  if (text) {
    const tip = document.createElement("div");
    tip.className = "tip";
    tip.textContent = text;
    place(tip, { top: Math.max(0, rect.top - 32), left: Math.max(0, rect.left) });
    root.append(tip);
  }
  document.documentElement.append(host);
  return {
    state: { targetLabel: text, visible: true, reducedMotion },
    remove() {
      host.remove();
      this.state = { ...this.state, visible: false };
    },
  };
}

// Quita cualquier overlay que haya quedado (cancelación, error o corte).
export function clearSpotlights() {
  for (const host of document.querySelectorAll(SELECTORS["overlay.root"])) host.remove();
}
