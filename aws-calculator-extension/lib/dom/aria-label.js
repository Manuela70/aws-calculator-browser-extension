// lib/dom/aria-label.js — Limpieza y lectura puras de etiquetas accesibles (FIX-1, FIX-2).
// Módulo de Zona A: sin DOM, sin red y sin estado, y sin imports de Zona B
// (U3 lo importa desde la capa de mapeo). Lo usan el escáner de U5 (vía
// dom-utils.js, que reexporta cleanAriaLabel) y el mapeo de U3.

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

// Segmento que marca un botón de unidad en aria-labelledby (ELB, WAF).
export const UNIT_SEGMENT = "Unit";

function isUnitSegment(segment) {
  return segment.toLowerCase() === UNIT_SEGMENT.toLowerCase();
}

// FIX-2 (BR3.3): lectura semántica, no posicional, de los segmentos de
// aria-labelledby de un botón Unit de CloudScape. El orden varía por servicio
// (ELB: [sección, "Unit", valor]; WAF: ["Unit", sección, valor]); en ambos, el
// último segmento que no es "Unit" es el valor visible y los anteriores, la
// sección. Devuelve { label: "Unit", section, value }, o null si los segmentos
// no describen un botón de unidad con valor.
export function parseUnitButtonLabel(segments) {
  if (!Array.isArray(segments)) return null;
  const parts = segments.map((segment) => String(segment ?? "").trim()).filter(Boolean);
  if (!parts.some(isUnitSegment)) return null;
  const rest = parts.filter((part) => !isUnitSegment(part));
  if (rest.length === 0) return null;
  const value = rest[rest.length - 1];
  const section = cleanAriaLabel(rest.slice(0, -1).join(" ")) || null;
  return { label: UNIT_SEGMENT, section, value };
}
