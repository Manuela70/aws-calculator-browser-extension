import { describe, it, expect } from "vitest";
import { normalize } from "../../aws-calculator-extension/lib/input/input-normalizer.js";
import { getRegionDisplayName } from "../../aws-calculator-extension/lib/mapping/region-map.js";
import { makeRunInput } from "./fixtures.js";

describe("normalize (BR1.3, BR1.4)", () => {
  it("normaliza el caso canónico EC2 a un ServiceRequest", () => {
    const result = normalize(makeRunInput());
    expect(result.ok).toBe(true);
    expect(result.value.project).toBe("Skeleton EC2");
    expect(result.value.services).toEqual([
      {
        requestId: "svc-1",
        serviceName: "Amazon EC2",
        searchTerm: "Amazon EC2",
        region: "us-east-1",
        fields: [
          { key: "Operating system", value: "Linux" },
          { key: "Number of instances", value: "1" },
          { key: "Instance type", value: "t3.micro" },
          { key: "Pricing strategy", value: "On-Demand" },
        ],
        toggles: [],
      },
    ]);
  });

  it("usa name como search_term por defecto", () => {
    const input = makeRunInput();
    delete input.services[0].search_term;
    expect(normalize(input).value.services[0].searchTerm).toBe("Amazon EC2");
  });

  it("usa us-east-1 si falta la región, y la hereda en cada servicio", () => {
    const input = makeRunInput();
    delete input.region;
    const result = normalize(input);
    expect(result.value.region).toBe("us-east-1");
    expect(result.value.services[0].region).toBe("us-east-1");
    expect(getRegionDisplayName("us-east-1")).toBe("US East (N. Virginia)");
  });

  it("rechaza una región desconocida nombrándola", () => {
    const result = normalize(makeRunInput({ region: "mars-north-1" }));
    expect(result.ok).toBe(false);
    expect(result.error.message).toContain("mars-north-1");
    expect(getRegionDisplayName("mars-north-1")).toBeNull();
  });

  it("convierte número y booleano a texto", () => {
    const input = makeRunInput();
    input.services[0].fields = { "Number of instances": 3, "Detailed monitoring": true };
    expect(normalize(input).value.services[0].fields).toEqual([
      { key: "Number of instances", value: "3" },
      { key: "Detailed monitoring", value: "true" },
    ]);
  });

  it("separa toggles __switch__: de los valores", () => {
    const input = makeRunInput();
    input.services[0].fields = { "__switch__:Model A": "on", "__switch__:Model B": false, X: "1" };
    const svc = normalize(input).value.services[0];
    expect(svc.toggles).toEqual([
      { label: "Model A", wantOn: true },
      { label: "Model B", wantOn: false },
    ]);
    expect(svc.fields).toEqual([{ key: "X", value: "1" }]);
  });

  it("rechaza un toggle con valor inválido, nombrándolo", () => {
    const input = makeRunInput();
    input.services[0].fields = { "__switch__:Model A": "quizás" };
    const result = normalize(input);
    expect(result.ok).toBe(false);
    expect(result.error.message).toContain("Model A");
  });
});
