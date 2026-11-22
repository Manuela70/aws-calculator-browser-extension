// lib/dom/cascade.js — Elección pura de un elemento por etiqueta en cascada (BR3.1; FR4.1, FR4.3).
// Módulo de Zona A: sin DOM, sin red y sin estado. La Zona B (dom-resolver.js)
// junta, para cada estrategia, los candidatos cuya etiqueta coincide exacta y
// normalizada, cada uno con su sección; aquí solo se decide cuál elegir.
// Nunca se elige "el primero" de varios: o queda exactamente uno o se pasa a la
// siguiente estrategia, y tras la última el resultado es field_not_resolved.

import { cleanAriaLabel } from "./aria-label.js";
import { normalizeText } from "../mapping/option-match.js";
import { LABEL_SEPARATOR } from "../mapping/deterministic-mapper.js";

// Orden fijo de la cascada (entities.md, ResolutionAttempt.strategy).
export const CASCADE_STRATEGIES = Object.freeze([
  "aria_label",
  "aria_labelledby",
  "label_for",
  "section_heading",
]);

// "Sección > Campo" → { section: "Sección", field: "Campo" }; sin separador, la
// clave no trae sección (section = null).
export function splitRequestedLabel(label) {
  const text = String(label ?? "");
  const index = text.lastIndexOf(LABEL_SEPARATOR);
  if (index < 0) return { section: null, field: text.trim() };
  return {
    section: text.slice(0, index).trim() || null,
    field: text.slice(index + LABEL_SEPARATOR.length).trim(),
  };
}

// FIX-8/FIX-9: etiqueta de aria-labelledby reconstruida con el texto de cada id
// referenciado, en orden, unido con un espacio y limpiado con cleanAriaLabel.
export function joinLabelledBy(texts) {
  if (!Array.isArray(texts)) return "";
  const parts = texts.map((text) => String(text ?? "").trim()).filter(Boolean);
  return cleanAriaLabel(parts.join(" "));
}

function sameSection(candidate, requestedSection) {
  return normalizeText(candidate?.section) === normalizeText(requestedSection);
}

// Una estrategia elige si tiene 1 candidato, o si al filtrar por sección queda
// exactamente uno (solo cuando la clave trae sección).
function pickFromStrategy(candidates, requestedSection) {
  if (candidates.length === 1) return candidates[0];
  if (candidates.length < 2 || !requestedSection) return null;
  const inSection = candidates.filter((candidate) => sameSection(candidate, requestedSection));
  return inSection.length === 1 ? inSection[0] : null;
}

// candidatesByStrategy: { aria_label: [...], aria_labelledby: [...], label_for:
// [...], section_heading: [...] }; cada candidato es opaco salvo su "section".
// Devuelve { ok: true, candidate, strategy, attempts } o
// { ok: false, reason: "field_not_resolved", attempts }, con un intento
// { strategy, matched } por cada estrategia recorrida (ResolvedElement).
export function selectByCascade(candidatesByStrategy, requestedSection) {
  const attempts = [];
  for (const strategy of CASCADE_STRATEGIES) {
    const raw = candidatesByStrategy?.[strategy];
    const candidates = Array.isArray(raw) ? raw : [];
    attempts.push({ strategy, matched: candidates.length });
    const candidate = pickFromStrategy(candidates, requestedSection);
    if (candidate) return { ok: true, candidate, strategy, attempts };
  }
  return { ok: false, reason: "field_not_resolved", attempts };
}

// Detalle legible del fallo para el registro técnico: "aria_label=0, ...".
export function describeAttempts(attempts) {
  return (attempts ?? []).map((a) => `${a.strategy}=${a.matched}`).join(", ");
}
