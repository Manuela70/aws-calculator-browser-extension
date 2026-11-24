// parseUnitButtonLabel (FIX-2, BR3.3) y cleanAriaLabel sin regresión (FIX-1, BR3.2).
import { describe, it, expect } from "vitest";
import {
  cleanAriaLabel,
  humanizeName,
  parseUnitButtonLabel,
} from "../../aws-calculator-extension/lib/dom/aria-label.js";

describe("humanizeName (grupos de radios sin título, p. ej. EC2 pricingStrategy)", () => {
  it("convierte camelCase, snake_case y kebab-case en una etiqueta legible", () => {
    expect(humanizeName("pricingStrategy")).toBe("Pricing strategy");
    expect(humanizeName("payment_option")).toBe("Payment option");
    expect(humanizeName("reserved-term")).toBe("Reserved term");
  });

  it("respeta siglas y nombres ya legibles; vacío o nulo da cadena vacía", () => {
    expect(humanizeName("EBS Volume Type")).toBe("EBS volume type");
    expect(humanizeName("Workloads")).toBe("Workloads");
    expect(humanizeName("")).toBe("");
    expect(humanizeName(null)).toBe("");
  });
});

describe("parseUnitButtonLabel", () => {
  const table = [
    // ELB: [sección, "Unit", valor]
    [
      ["Processed bytes (Lambda functions as targets)", "Unit", "GB per hour"],
      {
        label: "Unit",
        section: "Processed bytes (Lambda functions as targets)",
        value: "GB per hour",
      },
    ],
    // WAF: ["Unit", sección, valor]
    [
      ["Unit", "Number of requests received", "per month"],
      { label: "Unit", section: "Number of requests received", value: "per month" },
    ],
    // Mayúsculas y espacios distintos en el segmento Unit
    [
      ["  UNIT ", "Data processed", "TB per month"],
      { label: "Unit", section: "Data processed", value: "TB per month" },
    ],
    // Sección contaminada con el placeholder (FIX-1 aplicado a la sección)
    [
      ["New connections Enter amount", "Unit", "per second"],
      { label: "Unit", section: "New connections", value: "per second" },
    ],
    // Solo unidad y valor, sin sección
    [["Unit", "millions"], { label: "Unit", section: null, value: "millions" }],
  ];

  it.each(table)("lee %j por significado y no por posición", (segments, expected) => {
    expect(parseUnitButtonLabel(segments)).toEqual(expected);
  });

  it("sin segmento Unit, sin valor o con entrada inválida devuelve null", () => {
    expect(parseUnitButtonLabel(["Number of requests", "per month"])).toBeNull();
    expect(parseUnitButtonLabel(["Unit"])).toBeNull();
    expect(parseUnitButtonLabel(["Unit", "", "  "])).toBeNull();
    expect(parseUnitButtonLabel([])).toBeNull();
    expect(parseUnitButtonLabel(undefined)).toBeNull();
    expect(parseUnitButtonLabel("Unit per month")).toBeNull();
  });

  it("cleanAriaLabel sigue limpiando los placeholders del v6", () => {
    expect(cleanAriaLabel("Number of instances Enter amount")).toBe("Number of instances");
    expect(cleanAriaLabel("Storage Enter the amount")).toBe("Storage");
    expect(cleanAriaLabel(undefined)).toBe("");
  });
});
