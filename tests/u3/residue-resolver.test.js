import { describe, it, expect, vi, afterEach } from "vitest";
import { mapDeterministic } from "../../aws-calculator-extension/lib/mapping/deterministic-mapper.js";
import {
  BRAIN_ERROR_CODES,
  MAX_DOM_FIELDS,
  RESIDUE_TIMEOUT_MS,
  buildResidueRequest,
  resolveResidue,
} from "../../aws-calculator-extension/lib/mapping/residue-resolver.js";
import {
  makeBrainCallError,
  makeBrainResponse,
  makeEc2DomFields,
  makeManyDomFields,
  makeS3DomFields,
  makeS3Values,
} from "./fixtures.js";

// Mapea S3 hasta cerrar las pasadas: queda "Number of requests" como no_match.
function closedS3Outcome(domFields = makeS3DomFields(), values = makeS3Values()) {
  const first = mapDeterministic(domFields, values);
  return mapDeterministic(domFields, values, first);
}

function s3Context(overrides = {}) {
  return {
    serviceName: "Amazon S3",
    domFields: makeS3DomFields(),
    requestedValues: makeS3Values(),
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("buildResidueRequest (NFR5.2, NFR5.3)", () => {
  it("lleva solo servicio, domFields, valores pedidos y residuo enviable", () => {
    const built = buildResidueRequest(closedS3Outcome(), makeS3DomFields(), {
      serviceName: "Amazon S3",
      requestedValues: makeS3Values(),
      project: "Proyecto secreto",
      naturalLanguage: "texto libre",
    });
    expect(built.ok).toBe(true);
    expect(Object.keys(built.request).sort()).toEqual([
      "domFields",
      "requestedValues",
      "service",
      "unresolved",
    ]);
    expect(built.request.unresolved).toEqual([{ key: "Number of requests", value: "1000000" }]);
    expect(JSON.stringify(built.request)).not.toContain("secreto");
  });

  it("más de 500 campos → no arma pedido (form_too_large); sin residuo enviable → nothing_to_send", () => {
    expect(buildResidueRequest(closedS3Outcome(), makeManyDomFields(MAX_DOM_FIELDS + 1))).toEqual({
      ok: false,
      reason: "form_too_large",
    });
    expect(buildResidueRequest({ unresolved: [] }, []).reason).toBe("nothing_to_send");
  });
});

describe("resolveResidue — respuesta del cerebro (BR3.3, NFR3.2, NFR3.3)", () => {
  it("respuesta válida → resolved_by_brain con la acción al final y source = brain", async () => {
    const mapResidue = vi.fn().mockResolvedValue(makeBrainResponse());
    const outcome = await resolveResidue(closedS3Outcome(), s3Context(), { mapResidue });
    expect(mapResidue).toHaveBeenCalledTimes(1);
    expect(mapResidue.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    expect(outcome.residueStatus).toBe("resolved_by_brain");
    expect(outcome.unresolved).toEqual([]);
    expect(outcome.actions.at(-1)).toEqual({
      actionId: "act-3",
      fieldLabel: "S3 Standard > Requests",
      actionType: "fill",
      value: "1000000",
      source: "brain",
      requestKey: "Number of requests",
      substituted: false,
    });
  });

  it("acción sin requestKey, con etiqueta inexistente o con valor distinto → descartada y servicio falla", async () => {
    const variants = [
      { fieldLabel: "S3 Standard > Requests", actionType: "fill", value: "1000000" },
      {
        requestKey: "Number of requests",
        fieldLabel: "Requests",
        actionType: "fill",
        value: "1000000",
      },
      {
        requestKey: "Number of requests",
        fieldLabel: "S3 Standard > Requests",
        actionType: "fill",
        value: "100000",
      },
      {
        requestKey: "Number of requests",
        fieldLabel: "S3 Standard > Requests",
        actionType: "dropdown",
        value: "1000000",
      },
      {
        requestKey: "Number of requests",
        fieldLabel: "S3 Standard > S3 Standard storage",
        actionType: "fill",
        value: "1000000",
      },
    ];
    for (const action of variants) {
      const mapResidue = vi.fn().mockResolvedValue({ actions: [action] });
      const outcome = await resolveResidue(closedS3Outcome(), s3Context(), { mapResidue });
      expect(outcome.residueStatus).toBe("still_unresolved");
      expect(outcome.actions).toEqual([]);
      expect(outcome.unresolved.map((v) => v.key)).toEqual(["Number of requests"]);
    }
  });

  it("opción distinta de la pedida → aceptada con substituted y requestedValue", async () => {
    const values = [{ key: "Storage tier", value: "Standard IA" }];
    const first = mapDeterministic(makeS3DomFields(), values);
    const mapResidue = vi.fn().mockResolvedValue({
      actions: [
        {
          requestKey: "Storage tier",
          fieldLabel: "S3 Standard > Storage class",
          actionType: "select",
          value: "standard-ia",
        },
      ],
    });
    const outcome = await resolveResidue(first, s3Context({ requestedValues: values }), {
      mapResidue,
    });
    expect(outcome.residueStatus).toBe("resolved_by_brain");
    expect(outcome.actions[0]).toMatchObject({
      actionId: "act-1",
      value: "Standard-IA",
      substituted: true,
      requestedValue: "Standard IA",
    });
  });

  it("selector sin options → descartada y la clave queda option_no_match; respuesta mal formada → descartada entera", async () => {
    const fields = [...makeEc2DomFields(), { label: "Tenancy", type: "dropdown" }];
    const values = [{ key: "Tenancy model", value: "Shared" }];
    const outcome = await resolveResidue(
      mapDeterministic(fields, values),
      { serviceName: "Amazon EC2", domFields: fields, requestedValues: values },
      {
        mapResidue: async () => ({
          actions: [
            {
              requestKey: "Tenancy model",
              fieldLabel: "Tenancy",
              actionType: "dropdown",
              value: "Shared",
            },
          ],
        }),
      },
    );
    expect(outcome.unresolved).toEqual([
      { key: "Tenancy model", value: "Shared", reason: "option_no_match", sendable: true },
    ]);
    for (const response of [null, { actions: "x" }, { actions: [{}, {}] }]) {
      const bad = await resolveResidue(closedS3Outcome(), s3Context(), {
        mapResidue: async () => response,
      });
      expect(bad).toMatchObject({ residueStatus: "still_unresolved", actions: [] });
    }
  });

  it("dos acciones para la misma clave → ambas descartadas", async () => {
    const values = [
      { key: "Number of requests", value: "1000000" },
      { key: "Request tier", value: "1000000" },
    ];
    const outcome = await resolveResidue(
      mapDeterministic(makeS3DomFields(), values),
      s3Context({ requestedValues: values }),
      {
        mapResidue: async () => ({
          actions: [
            makeBrainResponse().actions[0],
            { ...makeBrainResponse().actions[0], value: "1000000" },
          ],
        }),
      },
    );
    expect(outcome.residueStatus).toBe("still_unresolved");
    expect(outcome.unresolved).toHaveLength(2);
  });
});

describe("resolveResidue — canal de error, tope y cancelación (BR3.2, NFR8.5)", () => {
  it("cada código del BrainCallError se refleja en brainErrorCode, sin reintentos", async () => {
    for (const code of BRAIN_ERROR_CODES) {
      const mapResidue = vi.fn().mockRejectedValue(makeBrainCallError(code));
      const outcome = await resolveResidue(closedS3Outcome(), s3Context(), { mapResidue });
      expect(mapResidue).toHaveBeenCalledTimes(1);
      expect(outcome).toMatchObject({
        residueStatus: "brain_unavailable",
        brainErrorCode: code,
        actions: [],
      });
    }
    const unknown = await resolveResidue(closedS3Outcome(), s3Context(), {
      mapResidue: () => {
        throw makeBrainCallError("weird_code");
      },
    });
    expect(unknown.brainErrorCode).toBe("internal_error");
  });

  it("puerto que nunca responde e ignora la señal → brain_unavailable a los 30 s", async () => {
    vi.useFakeTimers();
    const mapResidue = vi.fn(() => new Promise(() => {}));
    const pending = resolveResidue(closedS3Outcome(), s3Context(), { mapResidue });
    await vi.advanceTimersByTimeAsync(RESIDUE_TIMEOUT_MS - 1);
    let settled = false;
    pending.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const outcome = await pending;
    expect(outcome).toMatchObject({ residueStatus: "brain_unavailable", residueDetail: "timeout" });
    expect(mapResidue.mock.calls[0][1].signal.aborted).toBe(true);
    expect(mapResidue).toHaveBeenCalledTimes(1);
  });

  it("la señal de la corrida cancela la consulta; ya abortada no llama al puerto", async () => {
    const controller = new AbortController();
    const mapResidue = vi.fn(() => new Promise(() => {}));
    const pending = resolveResidue(closedS3Outcome(), s3Context(), {
      mapResidue,
      signal: controller.signal,
    });
    await Promise.resolve();
    controller.abort();
    expect(await pending).toMatchObject({
      residueStatus: "brain_unavailable",
      residueDetail: "cancelled",
    });
    const neverCalled = vi.fn();
    const aborted = await resolveResidue(closedS3Outcome(), s3Context(), {
      mapResidue: neverCalled,
      signal: controller.signal,
    });
    expect(aborted.residueDetail).toBe("cancelled");
    expect(neverCalled).not.toHaveBeenCalled();
  });

  it("más de 500 campos, sin puerto o residuo no enviable → falla sin llamar al puerto", async () => {
    const mapResidue = vi.fn();
    const tooLarge = await resolveResidue(
      closedS3Outcome(),
      s3Context({ domFields: makeManyDomFields(MAX_DOM_FIELDS + 1) }),
      { mapResidue },
    );
    expect(tooLarge).toMatchObject({
      residueStatus: "brain_unavailable",
      residueDetail: "form_too_large",
    });
    const noPort = await resolveResidue(closedS3Outcome(), s3Context(), { mapResidue: null });
    expect(noPort).toMatchObject({ residueStatus: "brain_unavailable", residueDetail: "no_port" });
    const ambiguous = mapDeterministic(makeEc2DomFields(), [
      { key: "Storage for each EC2 instance", value: "Standard" },
    ]);
    const definitive = await resolveResidue(ambiguous, {}, { mapResidue });
    expect(definitive).toMatchObject({ residueStatus: "still_unresolved", actions: [] });
    expect(mapResidue).not.toHaveBeenCalled();
  });

  it("sin residuo → none; con pasadas pendientes las cierra; una excepción → unexpected_error", async () => {
    const clean = mapDeterministic(makeS3DomFields(), makeS3Values().slice(0, 2));
    expect((await resolveResidue(clean, s3Context(), {})).residueStatus).toBe("none");
    const pendingPasses = mapDeterministic(makeS3DomFields(), makeS3Values());
    expect(pendingPasses.residueStatus).toBe("pending_passes");
    const closed = await resolveResidue(pendingPasses, s3Context(), {
      mapResidue: async () => makeBrainResponse(),
    });
    expect(closed.residueStatus).toBe("resolved_by_brain");
    const broken = await resolveResidue(undefined, {}, {});
    expect(broken).toMatchObject({
      residueStatus: "brain_unavailable",
      residueDetail: "unexpected_error",
    });
  });
});
