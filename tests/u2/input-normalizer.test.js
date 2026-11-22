import { describe, it, expect, vi } from "vitest";
import {
  normalize,
  toLogEntry,
} from "../../aws-calculator-extension/lib/input/input-normalizer.js";
import { getRegionDisplayName } from "../../aws-calculator-extension/lib/mapping/region-map.js";
import {
  makeInterpretedResponse,
  makeResolvingPort,
  makeRunInput,
  makeS3RunInput,
  makeUnresolvedResponse,
  toText,
} from "./fixtures.js";

const NO_BRAIN = { interpretNaturalLanguage: null };

function normalizeJson(input, deps = NO_BRAIN) {
  return normalize({ format: "json", text: toText(input) }, deps);
}

describe("normalize — camino JSON (BR1.1, BR4.1-BR4.5, BR5.4)", () => {
  it("normaliza el caso canónico EC2 a un NormalizedRun completo", async () => {
    const result = await normalizeJson(makeRunInput());
    expect(result).toEqual({
      ok: true,
      value: {
        source: "json",
        project: "Skeleton EC2",
        region: "us-east-1",
        regionDefaulted: false,
        wafReview: "not_available",
        services: [
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
        ],
      },
    });
  });

  it("usa us-east-1 si falta la región, lo marca y lo hereda cada servicio", async () => {
    const input = makeRunInput();
    delete input.region;
    const { value } = await normalizeJson(input);
    expect(value.region).toBe("us-east-1");
    expect(value.regionDefaulted).toBe(true);
    expect(value.services[0].region).toBe("us-east-1");
    expect(getRegionDisplayName("us-east-1")).toBe("US East (N. Virginia)");
  });

  it("rechaza una región desconocida nombrándola, sin servicios (BR4.2, BR5.3)", async () => {
    const result = await normalizeJson(makeRunInput({ region: "mars-north-1" }));
    expect(result.ok).toBe(false);
    expect(result.value).toBeUndefined();
    expect(result.error.code).toBe("unknown_region");
    expect(result.error.message).toContain("mars-north-1");
  });

  it("usa name como searchTerm, pasa valores a texto y conserva template", async () => {
    const input = makeRunInput();
    delete input.services[0].search_term;
    input.services[0].template = "EC2 Instances";
    input.services[0].fields = { "Number of instances": 3, "Detailed monitoring": true };
    const [svc] = (await normalizeJson(input)).value.services;
    expect(svc.searchTerm).toBe("Amazon EC2");
    expect(svc.template).toBe("EC2 Instances");
    expect(svc.fields).toEqual([
      { key: "Number of instances", value: "3" },
      { key: "Detailed monitoring", value: "true" },
    ]);
  });

  it("separa toggles __switch__: y rechaza uno inválido nombrándolo (BR4.4)", async () => {
    const input = makeRunInput();
    input.services[0].fields = { "__switch__:Model A": "ON", "__switch__:Model B": false, X: "1" };
    const [svc] = (await normalizeJson(input)).value.services;
    expect(svc.toggles).toEqual([
      { label: "Model A", wantOn: true },
      { label: "Model B", wantOn: false },
    ]);
    expect(svc.fields).toEqual([{ key: "X", value: "1" }]);

    input.services[0].fields = { "__switch__:Model A": "quizás" };
    const invalid = await normalizeJson(input);
    expect(invalid.error.code).toBe("invalid_toggle");
    expect(invalid.error.message).toContain("Model A");
    input.services[0].fields = { "__switch__: ": "on" };
    expect((await normalizeJson(input)).error.code).toBe("invalid_toggle");
  });

  it("texto vacío o solo espacios → empty_input en ambos formatos (BR1.2)", async () => {
    expect((await normalize({ format: "json", text: "  \n" }, NO_BRAIN)).error.code).toBe(
      "empty_input",
    );
    const { port, calls } = makeResolvingPort(makeInterpretedResponse());
    const nl = await normalize(
      { format: "natural_language", text: " " },
      { interpretNaturalLanguage: port },
    );
    expect(nl.error.code).toBe("empty_input");
    expect(calls).toHaveLength(0);
  });
});

describe("normalize — camino lenguaje natural (BR3.1-BR3.6, BR5.4)", () => {
  it("interpreted → NormalizedRun con source natural_language y wafReview required", async () => {
    const { port } = makeResolvingPort(makeInterpretedResponse());
    const result = await normalize(
      { format: "natural_language", text: "Un bucket S3 Standard de 100 GB en us-east-1" },
      { interpretNaturalLanguage: port, signal: new AbortController().signal },
    );
    expect(result.ok).toBe(true);
    expect(result.value.source).toBe("natural_language");
    expect(result.value.wafReview).toBe("required");
    expect(result.value.services[0].fields).toContainEqual({
      key: "S3 Standard storage",
      value: "100",
    });
  });

  it("puerto ausente → brain_unavailable (BR3.5)", async () => {
    const result = await normalize({ format: "natural_language", text: "Un EC2" }, NO_BRAIN);
    expect(result.error.code).toBe("brain_unavailable");
  });

  it("más de 2000 caracteres → input_too_long sin llamar al puerto (BR3.1)", async () => {
    const { port, calls } = makeResolvingPort(makeInterpretedResponse());
    const deps = { interpretNaturalLanguage: port };
    expect((await normalize({ format: "natural_language", text: "a".repeat(2000) }, deps)).ok).toBe(
      true,
    );
    const result = await normalize({ format: "natural_language", text: "a".repeat(2001) }, deps);
    expect(result.error).toMatchObject({ code: "input_too_long", maxLength: 2000 });
    expect(calls).toHaveLength(1);
  });

  it("región desconocida en la respuesta del cerebro → nl_invalid_response (BR3.6)", async () => {
    const { port } = makeResolvingPort(
      makeInterpretedResponse({ ...makeS3RunInput(), region: "xx-1" }),
    );
    const result = await normalize(
      { format: "natural_language", text: "Un S3" },
      { interpretNaturalLanguage: port },
    );
    expect(result.error.code).toBe("nl_invalid_response");
  });
});

describe("normalize — fallos no previstos (NFR3.1)", () => {
  it("una excepción del interior o un formato desconocido → unexpected_error", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const throwingText = {
      format: "json",
      get text() {
        throw new Error("boom");
      },
    };
    expect((await normalize(throwingText, NO_BRAIN)).error.code).toBe("unexpected_error");
    expect((await normalize({ format: "yaml", text: "a: 1" }, NO_BRAIN)).error.code).toBe(
      "unexpected_error",
    );
    expect((await normalize(null)).error.code).toBe("unexpected_error");
    expect(spy).toHaveBeenCalledTimes(3);
    spy.mockRestore();
  });
});

describe("toLogEntry (NFR5.3, NFR5.4)", () => {
  it("lenguaje natural: nunca guarda el texto ni los fragmentos", async () => {
    const text = "Un S3 de 100 GB para el cliente Acme";
    const { port } = makeResolvingPort(makeUnresolvedResponse());
    const rawInput = { format: "natural_language", text };
    const result = await normalize(rawInput, { interpretNaturalLanguage: port });
    const entry = toLogEntry(rawInput, result, { durationMs: 42 });
    expect(entry).toEqual({
      format: "natural_language",
      textLength: text.length,
      ok: false,
      code: "nl_unresolved",
      fragmentCount: 1,
      durationMs: 42,
    });
    const serialized = JSON.stringify(entry);
    for (const piece of ["Acme", "100 GB", "S3 Standard"]) expect(serialized).not.toContain(piece);
  });

  it("JSON rechazado: código, ruta y texto completo para reproducir el fallo", async () => {
    const text = toText({ services: [{ name: "Amazon S3", feilds: {} }] });
    const rawInput = { format: "json", text };
    const entry = toLogEntry(rawInput, await normalize(rawInput, NO_BRAIN), { durationMs: 3 });
    expect(entry).toMatchObject({
      format: "json",
      ok: false,
      code: "unknown_key",
      service: "Amazon S3",
      serviceIndex: 0,
      key: "feilds",
      text,
      durationMs: 3,
    });
  });

  it("JSON aceptado y JSON demasiado largo: solo longitudes y conteos", async () => {
    const accepted = { format: "json", text: toText(makeRunInput()) };
    expect(toLogEntry(accepted, await normalize(accepted, NO_BRAIN), { durationMs: 5 })).toEqual({
      format: "json",
      textLength: accepted.text.length,
      ok: true,
      serviceCount: 1,
      durationMs: 5,
    });
    const tooLong = { format: "json", text: "{".repeat(100001) };
    const entry = toLogEntry(tooLong, await normalize(tooLong, NO_BRAIN));
    expect(entry).toEqual({
      format: "json",
      textLength: 100001,
      ok: false,
      code: "input_too_long",
      durationMs: 0,
    });
  });
});
