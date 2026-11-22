import { describe, it, expect } from "vitest";
import { cleanAriaLabel } from "../../aws-calculator-extension/lib/dom/aria-label.js";
import { cleanAriaLabel as fromDomUtils } from "../../aws-calculator-extension/lib/dom/dom-utils.js";

describe("cleanAriaLabel (FIX-1)", () => {
  it("quita el placeholder pegado a la etiqueta", () => {
    expect(cleanAriaLabel("Number of requests Enter amount")).toBe("Number of requests");
    expect(cleanAriaLabel("Storage Enter amount of storage in GB")).toBe("Storage");
    expect(cleanAriaLabel("Metrics Enter a number")).toBe("Metrics");
  });

  it("vacío o ausente → cadena vacía; sin placeholder queda igual", () => {
    expect(cleanAriaLabel("")).toBe("");
    expect(cleanAriaLabel(undefined)).toBe("");
    expect(cleanAriaLabel("  Operating system ")).toBe("Operating system");
  });

  it("dom-utils.js la reexporta sin cambios para sus llamadores", () => {
    expect(fromDomUtils).toBe(cleanAriaLabel);
  });
});
