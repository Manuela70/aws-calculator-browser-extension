// brain/core/candidate-selector.js — Selección por código de los servicios
// candidatos para /interpret (BR7.1, NFR8.5). El modelo solo ve los campos de
// estos candidatos, nunca el inventario completo.

import { MAX_CANDIDATES } from "./limits.js";

// Palabras de los nombres que no distinguen servicios.
const GENERIC_NAME_WORDS = new Set(["amazon", "aws", "service", "services", "the", "for", "and"]);

// Minúsculas, sin tildes, solo letras y dígitos separados por un espacio.
export function normalizeText(text) {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function containsPhrase(haystack, phrase) {
  return phrase.length > 0 && ` ${haystack} `.includes(` ${phrase} `);
}

// Puntaje de un servicio contra la expresión normalizada:
// nombre completo +5, cada palabra distintiva del nombre +1, cada sinónimo en
// español +3, cada palabra clave +2.
export function scoreService(service, normalizedExpression) {
  let score = 0;
  const name = normalizeText(service.name);
  if (containsPhrase(normalizedExpression, name)) score += 5;
  for (const word of name.split(" ")) {
    if (word.length > 1 && !GENERIC_NAME_WORDS.has(word)) {
      if (containsPhrase(normalizedExpression, word)) score += 1;
    }
  }
  for (const synonym of service.synonymsEs ?? []) {
    if (containsPhrase(normalizedExpression, normalizeText(synonym))) score += 3;
  }
  for (const keyword of new Set((service.searchKeywords ?? []).map(normalizeText))) {
    if (containsPhrase(normalizedExpression, keyword)) score += 2;
  }
  return score;
}

// Devuelve hasta `limit` servicios canónicos con puntaje > 0, de mayor a menor
// puntaje y, a igual puntaje, por nombre.
export function selectCandidates(inventoryIndex, expression, limit = MAX_CANDIDATES) {
  const normalized = normalizeText(expression);
  if (normalized.length === 0) return [];
  const scored = [];
  for (const service of inventoryIndex.byName.values()) {
    const score = scoreService(service, normalized);
    if (score > 0) scored.push({ service, score });
  }
  scored.sort((a, b) => b.score - a.score || a.service.name.localeCompare(b.service.name));
  return scored.slice(0, limit).map((s) => s.service);
}
