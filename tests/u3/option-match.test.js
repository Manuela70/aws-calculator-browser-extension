import { describe, it, expect } from "vitest";
import {
  isPlainNumber,
  isUnitFieldType,
  isUnitKey,
  matchInstanceRow,
  matchOption,
  normalizeText,
  toggleState,
  validateFieldValue,
} from "../../aws-calculator-extension/lib/mapping/option-match.js";

describe("matchOption (BR1.1, BR2.4)", () => {
  it("elige la opción con coincidencia exacta normalizada", () => {
    expect(matchOption(" linux ", ["Windows Server", "Linux"])).toEqual({
      ok: true,
      index: 1,
      option: "Linux",
    });
  });

  it("no elige por aproximación (prefijo o contiene)", () => {
    expect(matchOption("Linux", ["Linux Pro", "Red Hat Linux"])).toEqual({
      ok: false,
      reason: "no_match",
    });
  });

  it("opciones duplicadas tras normalizar → ambigua", () => {
    expect(matchOption("On-Demand", ["On-Demand", "on-demand "]).reason).toBe("ambiguous");
  });

  it("valor vacío u opciones ausentes → sin coincidencia", () => {
    expect(matchOption("", ["a"]).ok).toBe(false);
    expect(matchOption("a", undefined).ok).toBe(false);
    expect(normalizeText("  A   b ")).toBe("a b");
    expect(normalizeText(undefined)).toBe("");
  });

  it("instance_radio compara contra el tipo de cada fila", () => {
    expect(matchInstanceRow("t3.micro", ["t3.micro", "t3.micro.large"]).index).toBe(0);
    expect(matchInstanceRow("t3.mic", ["t3.micro"]).ok).toBe(false);
  });
});

describe("patrón numérico (BR2.2)", () => {
  it("acepta decimales simples con signo opcional", () => {
    for (const value of ["100", "0.5", "-3", "+7", " 42 "]) {
      expect(isPlainNumber(value)).toBe(true);
    }
  });

  it("rechaza unidades, separadores, comas decimales, exponentes y espacios internos", () => {
    for (const value of ["100 GB", "1,000", "0,5", "1e3", "1 000", "", ".5", "5.", "abc"]) {
      expect(isPlainNumber(value)).toBe(false);
    }
    expect(isPlainNumber(100)).toBe(false);
  });

  it("validateFieldValue de un number devuelve el valor recortado o invalid_number", () => {
    expect(validateFieldValue("number", " 30 ")).toEqual({ ok: true, value: "30" });
    expect(validateFieldValue("number", "30 GB")).toEqual({ ok: false, reason: "invalid_number" });
  });
});

describe("unidades (BR2.3)", () => {
  it('reconoce la clave "<Campo> unit" y exige un selector como destino', () => {
    expect(isUnitKey("Storage amount unit")).toBe(true);
    expect(isUnitKey(" storage amount  UNIT ")).toBe(true);
    expect(isUnitKey("unit")).toBe(false);
    expect(isUnitKey("Storage amount")).toBe(false);
    expect(isUnitFieldType("dropdown")).toBe(true);
    expect(isUnitFieldType("select")).toBe(true);
    expect(isUnitFieldType("number")).toBe(false);
  });

  it("unidad válida devuelve la opción tal como aparece; inválida → option_no_match", () => {
    expect(validateFieldValue("dropdown", "gb", ["GB", "TB"])).toEqual({ ok: true, value: "GB" });
    expect(validateFieldValue("dropdown", "GiB", ["GB", "TB"])).toEqual({
      ok: false,
      reason: "option_no_match",
    });
  });
});

describe("validateFieldValue por tipo (BR2.4, BR2.5)", () => {
  it("opción ambigua → option_ambiguous; selector sin options → valor pedido", () => {
    expect(validateFieldValue("radiogroup", "x", ["X", "x "])).toEqual({
      ok: false,
      reason: "option_ambiguous",
    });
    expect(validateFieldValue("select", "Standard", undefined)).toEqual({
      ok: true,
      value: "Standard",
    });
    expect(validateFieldValue("radio", "Standard", [])).toEqual({ ok: true, value: "Standard" });
  });

  it("checkbox acepta solo true/false y normaliza a minúsculas", () => {
    expect(validateFieldValue("checkbox", " TRUE ")).toEqual({ ok: true, value: "true" });
    expect(validateFieldValue("checkbox", "sí")).toEqual({ ok: false, reason: "invalid_value" });
  });

  it("toggle acepta on/off/true/false; texto vacío es inválido", () => {
    expect(validateFieldValue("toggle", "ON")).toEqual({ ok: true, value: "on" });
    expect(validateFieldValue("toggle", "maybe")).toEqual({ ok: false, reason: "invalid_value" });
    expect(toggleState("false")).toBe(false);
    expect(toggleState("x")).toBeNull();
    expect(validateFieldValue("text", "  ")).toEqual({ ok: false, reason: "invalid_value" });
    expect(validateFieldValue("text", "abc")).toEqual({ ok: true, value: "abc" });
  });
});
