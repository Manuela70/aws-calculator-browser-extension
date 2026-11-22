// lib/mapping/option-match.js — Elección de opción por coincidencia exacta normalizada (BR3.4).
// PROVISIONAL (U1, walking skeleton). Dueño final: U3.
// Nunca elige por aproximación: ni "contiene" ni "primer resultado".

export function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

// Devuelve { ok: true, index, option } si el valor coincide exactamente con UNA
// opción; { ok: false, reason: "no_match" | "ambiguous" } en otro caso.
export function matchOption(value, options) {
  const target = normalizeText(value);
  if (!target || !Array.isArray(options)) return { ok: false, reason: "no_match" };
  const hits = [];
  options.forEach((option, index) => {
    if (normalizeText(option) === target) hits.push(index);
  });
  if (hits.length === 0) return { ok: false, reason: "no_match" };
  if (hits.length > 1) return { ok: false, reason: "ambiguous" };
  return { ok: true, index: hits[0], option: options[hits[0]] };
}

// Para instance_radio: la comparación es contra el tipo de instancia de cada fila.
export function matchInstanceRow(instanceType, rowTypes) {
  return matchOption(instanceType, rowTypes);
}
