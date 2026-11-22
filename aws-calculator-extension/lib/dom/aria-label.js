// lib/dom/aria-label.js — Limpieza pura de etiquetas accesibles (FIX-1).
// Módulo de Zona A: sin DOM, sin red y sin estado. Lo usan el escáner de U5
// (vía dom-utils.js, que lo reexporta) y el mapeo de U3 para normalizar
// etiquetas. U5 agregará aquí parseUnitButtonLabel (FIX-2).

// FIX-1 (portado del v6): limpia aria-labels contaminados con el placeholder
// (CloudWatch, KMS, SageMaker, ELB).
export function cleanAriaLabel(raw) {
  if (!raw) return "";
  return String(raw)
    .replace(/\s+Enter amount of [^$]{0,80}$/i, "")
    .replace(/\s+Enter amount$/i, "")
    .replace(/\s+Enter the amount$/i, "")
    .replace(/\s+Enter a number$/i, "")
    .replace(/\s+Enter\s+.{0,120}$/i, "")
    .trim();
}
