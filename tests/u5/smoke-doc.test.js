// SMOKE.md cubre los nueve casos del RPA de U5 (NFR6.2; decisión 13 del plan).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SMOKE = fileURLToPath(new URL("../../aws-calculator-extension/SMOKE.md", import.meta.url));

// Encabezado exacto de cada caso y una palabra clave de su contenido.
const CASES = [
  ["R1", "Servicio simple canónico (EC2)"],
  ["R2", "Multi-servicio con toggle condicional"],
  ["R3", "Servicio inexistente"],
  ["R4", "Campo obligatorio vacío"],
  ["R5", "Fallo a mitad de corrida con salida sin guardar"],
  ["R6", "Cancelación"],
  ["R7", "Sustitución del cerebro"],
  ["R8", "Servicios homónimos"],
  ["R9", "Overlay ausente tras cancelar"],
];

function sections(text) {
  const parts = text.split(/^### /m).slice(1);
  return new Map(parts.map((part) => [part.split("\n")[0].trim(), part]));
}

describe("SMOKE.md (U5)", () => {
  const text = readFileSync(SMOKE, "utf8").replace(/\r\n/g, "\n");
  const byHeading = sections(text);

  it.each(CASES)("contiene el caso %s — %s", (id, title) => {
    expect(byHeading.has(`${id} — ${title}`)).toBe(true);
  });

  it("cada caso dice el resultado esperado en el panel", () => {
    for (const [id, title] of CASES) {
      expect(byHeading.get(`${id} — ${title}`)).toMatch(/Esperado/);
    }
  });

  it("los casos de fallo exigen que no haya URL y el registro tiene una fila por caso", () => {
    for (const id of ["R3", "R4", "R5", "R6"]) {
      const [, body] = [...byHeading.entries()].find(([heading]) => heading.startsWith(id));
      expect(body).toMatch(/sin URL/);
    }
    for (const [id] of CASES) expect(text).toContain(`| | | ${id} |`);
  });
});
