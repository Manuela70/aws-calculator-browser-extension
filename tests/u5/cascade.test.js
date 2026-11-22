// Resolución en cascada (BR3.1; FR4.1, FR4.3; FIX-8, FIX-9).
import { describe, it, expect } from "vitest";
import {
  CASCADE_STRATEGIES,
  describeAttempts,
  joinLabelledBy,
  selectByCascade,
  splitRequestedLabel,
} from "../../aws-calculator-extension/lib/dom/cascade.js";
import { candidate, makeCandidates } from "./fixtures.js";

describe("selectByCascade", () => {
  it("cada estrategia con exactamente 1 candidato elige, en el orden fijo", () => {
    for (const [position, strategy] of CASCADE_STRATEGIES.entries()) {
      const target = candidate(`el-${strategy}`);
      const result = selectByCascade(makeCandidates({ [strategy]: [target] }), null);
      expect(result).toMatchObject({ ok: true, candidate: target, strategy });
      expect(result.attempts).toHaveLength(position + 1);
    }
    const first = selectByCascade(
      makeCandidates({ aria_label: [candidate("a")], label_for: [candidate("b")] }),
      null,
    );
    expect(first.candidate.id).toBe("a");
  });

  it("0 candidatos en una estrategia pasa a la siguiente; sin elección tras la última, field_not_resolved", () => {
    const result = selectByCascade(makeCandidates(), null);
    expect(result).toEqual({
      ok: false,
      reason: "field_not_resolved",
      attempts: [
        { strategy: "aria_label", matched: 0 },
        { strategy: "aria_labelledby", matched: 0 },
        { strategy: "label_for", matched: 0 },
        { strategy: "section_heading", matched: 0 },
      ],
    });
    expect(describeAttempts(result.attempts)).toBe(
      "aria_label=0, aria_labelledby=0, label_for=0, section_heading=0",
    );
    expect(selectByCascade(undefined, null).ok).toBe(false);
  });

  it("varios candidatos sin sección pedida: la estrategia no elige y nunca toma el primero", () => {
    const result = selectByCascade(
      makeCandidates({ aria_label: [candidate("a", "S1"), candidate("b", "S2")] }),
      null,
    );
    expect(result.ok).toBe(false);
    expect(result.attempts[0]).toEqual({ strategy: "aria_label", matched: 2 });
  });

  it("varios candidatos con sección pedida: filtra por sección normalizada", () => {
    const result = selectByCascade(
      makeCandidates({
        aria_labelledby: [candidate("a", "Data Transfer"), candidate("b", "  data   transfer ")],
        label_for: [candidate("c", "EC2 specifications"), candidate("d", "Storage")],
      }),
      "EC2 Specifications",
    );
    expect(result).toMatchObject({ ok: true, strategy: "label_for" });
    expect(result.candidate.id).toBe("c");
  });

  it("si el filtro por sección deja 0, pasa a la siguiente estrategia", () => {
    const result = selectByCascade(
      makeCandidates({
        aria_label: [candidate("a", "S1"), candidate("b", "S2")],
        section_heading: [candidate("e", "S9")],
      }),
      "S3",
    );
    expect(result).toMatchObject({ ok: true, strategy: "section_heading" });
  });
});

describe("joinLabelledBy y splitRequestedLabel", () => {
  it("reconstruye aria-labelledby en orden, con un espacio, y limpia el placeholder", () => {
    expect(joinLabelledBy(["Data processed", " Unit ", "GB per month"])).toBe(
      "Data processed Unit GB per month",
    );
    expect(joinLabelledBy(["Number of requests", "", null, "Enter amount"])).toBe(
      "Number of requests",
    );
    expect(joinLabelledBy("no es lista")).toBe("");
  });

  it("separa la sección de la clave 'Sección > Campo'", () => {
    expect(splitRequestedLabel("EC2 specifications > Number of instances")).toEqual({
      section: "EC2 specifications",
      field: "Number of instances",
    });
    expect(splitRequestedLabel("A > B > Unit")).toEqual({ section: "A > B", field: "Unit" });
    expect(splitRequestedLabel("Operating system")).toEqual({
      section: null,
      field: "Operating system",
    });
    expect(splitRequestedLabel(undefined)).toEqual({ section: null, field: "" });
  });
});
