import { describe, expect, it } from "vitest";
import {
  normalizeText,
  scoreService,
  selectCandidates,
} from "../../brain/core/candidate-selector.js";
import { indexInventory } from "../../brain/core/inventory-model.js";
import {
  buildInterpretPrompt,
  buildResiduePrompt,
  buildWafPrompt,
} from "../../brain/core/prompt-builder.js";
import { loadFixture, smallInventory } from "./helpers.js";

function syntheticIndex(count) {
  const byName = new Map();
  for (let i = 0; i < count; i++) {
    const name = `Storage Service ${String.fromCharCode(65 + i)}`;
    byName.set(name, {
      name,
      canonical: true,
      searchKeywords: ["bucket"],
      synonymsEs: [],
      regions: [],
      templates: [],
      fields: [],
    });
  }
  return { version: "2026-11-21", byName, canonicalNames: [...byName.keys()] };
}

describe("candidate-selector (BR7.1)", () => {
  it("normaliza minúsculas, tildes y signos", () => {
    expect(normalizeText("  Máquina-Virtual, ÚNICA! ")).toBe("maquina virtual unica");
  });

  it("devuelve 0 candidatos cuando nada coincide", () => {
    const index = indexInventory(smallInventory());
    expect(selectCandidates(index, "un servidor de correo")).toEqual([]);
    expect(selectCandidates(index, "   ")).toEqual([]);
  });

  it("devuelve 1 candidato para el caso canónico de S3", () => {
    const index = indexInventory(smallInventory());
    const result = selectCandidates(index, "Un bucket S3 Standard de 100 GB en us-east-1");
    expect(result.map((s) => s.name)).toEqual(["S3 Standard"]);
  });

  it("usa los sinónimos en español", () => {
    const index = indexInventory(smallInventory());
    const result = selectCandidates(index, "Una cola de mensajes y una máquina virtual");
    expect(result.map((s) => s.name).sort()).toEqual([
      "Amazon EC2",
      "Amazon Simple Queue Service (SQS)",
    ]);
  });

  it("corta en 8 candidatos cuando coinciden más, ordenados por puntaje", () => {
    const index = syntheticIndex(12);
    const result = selectCandidates(index, "un bucket de storage service c");
    expect(result).toHaveLength(8);
    expect(result[0].name).toBe("Storage Service C");
    const ec2 = indexInventory(smallInventory()).byName.get("Amazon EC2");
    expect(scoreService(ec2, normalizeText("amazon ec2"))).toBe(5 + 1 + 2);
  });
});

describe("prompt-builder (NFR8.5)", () => {
  it("envía solo los candidatos con sus campos y los nombres canónicos sin campos", () => {
    const index = indexInventory(smallInventory());
    const candidates = [index.byName.get("S3 Standard")];
    const prompt = buildInterpretPrompt({
      instructions: "INSTRUCCIONES",
      text: "Un bucket S3 Standard",
      canonicalNames: index.canonicalNames,
      candidates,
    });
    const payload = JSON.parse(prompt.user);
    expect(prompt.system).toBe("INSTRUCCIONES");
    expect(payload.candidates).toHaveLength(1);
    expect(payload.canonicalServices).toContain("AWS Lambda");
    expect(prompt.user).not.toContain("Standard queue requests"); // campos de SQS fuera
    expect(payload.previousError).toBeUndefined();
  });

  it("agrega el motivo del rechazo anterior en el segundo intento", () => {
    const request = loadFixture("requests.json").mapResidue;
    const prompt = buildResiduePrompt({ instructions: "R", request }, "falta requestKey");
    expect(JSON.parse(prompt.user)).toMatchObject({
      service: "Amazon EC2",
      previousError: "falta requestKey",
    });
  });

  it("arma el lote WAF con la posición global de cada servicio", () => {
    const prompt = buildWafPrompt({
      instructions: "W",
      phase: "post_fill",
      batch: [{ serviceIndex: 5, service: { name: "Amazon EC2", config: { Quantity: "2" } } }],
    });
    expect(JSON.parse(prompt.user)).toEqual({
      phase: "post_fill",
      services: [{ serviceIndex: 5, name: "Amazon EC2", config: { Quantity: "2" } }],
    });
  });
});
