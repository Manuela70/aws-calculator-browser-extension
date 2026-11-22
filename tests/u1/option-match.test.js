import { describe, it, expect } from "vitest";
import {
  matchInstanceRow,
  matchOption,
  normalizeText,
} from "../../aws-calculator-extension/lib/mapping/option-match.js";

describe("matchOption (BR3.4)", () => {
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
  });

  it("instance_radio compara contra el tipo de cada fila", () => {
    expect(matchInstanceRow("t3.micro", ["t3.micro", "t3.micro.large"]).index).toBe(0);
    expect(matchInstanceRow("t3.mic", ["t3.micro"]).ok).toBe(false);
  });
});
