// Integración orquestador ↔ resolvedor del DOM (doble programable).
import { describe, it, expect, vi, afterEach } from "vitest";
import { runEstimate } from "../../aws-calculator-extension/lib/rpa/orchestrator.js";
import { createServiceTimer } from "../../aws-calculator-extension/lib/rpa/service-timer.js";
import { createFakeDom } from "./fake-dom.js";
import { makeRunRequest, makeServiceRequest } from "./fixtures.js";

const now = () => new Date("2026-11-21T10:00:00.000Z");

function run(dom, runRequest = makeRunRequest(), extra = {}) {
  const progress = vi.fn();
  const log = vi.fn();
  const result = runEstimate(runRequest, { dom, progress, log, now, ...extra });
  return { result, progress, log };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("orchestrator (W3/W4)", () => {
  it("caso canónico EC2 → DONE con la URL de Share, renombrado y región fijada", async () => {
    const dom = createFakeDom();
    const { result, progress } = run(dom);
    const runResult = await result;
    expect(runResult).toMatchObject({
      runId: "run-test-1",
      status: "DONE",
      estimateUrl: "https://calculator.aws/#/estimate?id=abc123",
      perServiceResults: [{ requestId: "svc-1", status: "confirmed" }],
    });
    const names = dom.calls.map((c) => c.name);
    expect(dom.calls.find((c) => c.name === "setRegion").args[0]).toBe("US East (N. Virginia)");
    expect(dom.calls.filter((c) => c.name === "applyAction")).toHaveLength(4);
    expect(names.indexOf("renameEstimate")).toBeLessThan(names.indexOf("shareEstimate"));
    // El progreso es estructurado (decisión 2 de U5) y sin pct ni text (decisión 7 de U6).
    expect(progress).toHaveBeenLastCalledWith({
      runId: "run-test-1",
      step: "sharing",
      serviceCount: 1,
    });
    expect(progress.mock.calls.some(([event]) => "pct" in event || "text" in event)).toBe(false);
    expect(runResult.perServiceResults[0].durationMs).toBeGreaterThanOrEqual(0);
    expect(runResult.missing).toEqual([]);
    expect(names).toContain("cleanup");
  });

  it("estimado no vacío → ERROR preconditions sin tocar el estimado", async () => {
    const dom = createFakeDom();
    dom.state.estimateServices.push("Amazon S3");
    const runResult = await run(dom).result;
    expect(runResult).toMatchObject({ status: "ERROR", failureStep: "preconditions" });
    expect(dom.calls.some((c) => c.name === "startService")).toBe(false);
  });

  it("campo no reconocido → field_not_recognized, sin aplicar ni guardar", async () => {
    const dom = createFakeDom();
    const svc = makeServiceRequest({ fields: [{ key: "Campo inexistente", value: "1" }] });
    const runResult = await run(dom, makeRunRequest({ services: [svc] })).result;
    expect(runResult.failureStep).toBe("services");
    expect(runResult.perServiceResults[0]).toMatchObject({
      reason: "field_not_recognized",
      detail: "Campo inexistente: no_match; brain_unavailable (no_port)",
    });
    expect(dom.calls.some((c) => c.name === "applyAction" || c.name === "saveService")).toBe(false);
    expect(runResult.estimateUrl).toBeUndefined();
  });

  it("campo condicional: aplica la pasada 1, vuelve a escanear y mapea el campo nuevo (M2)", async () => {
    const dom = createFakeDom();
    const baseFields = dom.state.domFields;
    let scans = 0;
    dom.scanForm = async () => {
      scans += 1;
      dom.calls.push({ name: "scanForm" });
      const extra = scans > 1 ? [{ label: "EBS > Provisioning IOPS io2", type: "number" }] : [];
      return { ok: true, value: [...baseFields, ...extra] };
    };
    const svc = makeServiceRequest({
      fields: [
        { key: "Operating system", value: "Linux" },
        { key: "Provisioning IOPS io2", value: "3000" },
      ],
    });
    const { result, log } = run(dom, makeRunRequest({ services: [svc] }));
    const runResult = await result;
    expect(runResult.status).toBe("DONE");
    const names = dom.calls.map((c) => c.name);
    expect(names.filter((n) => n === "scanForm")).toHaveLength(2);
    expect(names.indexOf("applyAction")).toBeLessThan(names.lastIndexOf("scanForm"));
    expect(dom.calls.filter((c) => c.name === "applyAction").map((c) => c.args[0])).toEqual([
      "Operating system",
      "EBS > Provisioning IOPS io2",
    ]);
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ event: "mapping_outcome", value: "none", step: "service:svc-1" }),
    );
  });

  it("residuo resuelto por el puerto del cerebro → se aplica y se guarda; sin respuesta válida → falla", async () => {
    const svc = makeServiceRequest({
      fields: [
        { key: "Operating system", value: "Linux" },
        { key: "Cantidad de instancias", value: "2" },
      ],
    });
    const mapResidue = vi.fn().mockResolvedValue({
      actions: [
        {
          requestKey: "Cantidad de instancias",
          fieldLabel: "EC2 specifications > Number of instances",
          actionType: "fill",
          value: "2",
        },
      ],
    });
    const dom = createFakeDom();
    const ok = await run(dom, makeRunRequest({ services: [svc] }), { mapResidue }).result;
    expect(ok.status).toBe("DONE");
    expect(mapResidue).toHaveBeenCalledTimes(1);
    expect(dom.calls.filter((c) => c.name === "applyAction")).toHaveLength(2);

    const failing = createFakeDom();
    const failed = await run(failing, makeRunRequest({ services: [svc] }), {
      mapResidue: vi.fn().mockResolvedValue({ actions: [] }),
    }).result;
    expect(failed.perServiceResults[0]).toMatchObject({
      reason: "field_not_recognized",
      detail: "Cantidad de instancias: no_match",
    });
    expect(failing.calls.some((c) => c.name === "saveService")).toBe(false);
  });

  it("validación 'is required' → validation_required sin reintentar", async () => {
    const dom = createFakeDom({
      async saveService() {
        dom.calls.push({ name: "saveService" });
        return { ok: false, reason: "validation_required", detail: "Operating system" };
      },
    });
    const runResult = await run(dom).result;
    expect(runResult.perServiceResults[0]).toMatchObject({
      reason: "validation_required",
      detail: "Operating system",
    });
    expect(dom.calls.filter((c) => c.name === "saveService")).toHaveLength(1);
  });

  it("el banner nunca aparece → 3 intentos y save_not_confirmed", async () => {
    const dom = createFakeDom({
      async saveService() {
        dom.calls.push({ name: "saveService" });
        return { ok: false, reason: "not_confirmed", selector: "save.successBanner" };
      },
    });
    const runResult = await run(dom).result;
    expect(runResult.perServiceResults[0].reason).toBe("save_not_confirmed");
    expect(dom.calls.filter((c) => c.name === "saveService")).toHaveLength(3);
    expect(runResult.status).toBe("ERROR");
  });

  it("service_timeout: el banner tardío se ignora y solo se sale sin guardar (U5 BR2.5)", async () => {
    vi.useFakeTimers();
    const dom = createFakeDom({
      async saveService() {
        dom.calls.push({ name: "saveService" });
        await new Promise((resolve) => setTimeout(resolve, 5000));
        return { ok: true };
      },
    });
    const { result } = run(dom, makeRunRequest(), {
      createTimer: () => createServiceTimer({ timeoutMs: 1000 }),
    });
    await vi.advanceTimersByTimeAsync(1000);
    const runResult = await result;
    expect(runResult.perServiceResults[0].reason).toBe("service_timeout");
    expect(runResult.failureStep).toBe("services");
    expect(dom.calls.some((c) => c.name === "returnToEstimate")).toBe(false);
    expect(dom.calls.filter((c) => c.name === "exitWithoutSave")).toHaveLength(1);
    expect(dom.calls.filter((c) => c.name === "saveService")).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(5000);
  });

  it("contenido del estimado distinto → estimate_check sin renombrar ni compartir", async () => {
    const dom = createFakeDom();
    const save = dom.saveService;
    dom.saveService = async (name) => {
      dom.state.estimateServices.push("Amazon S3");
      return save(name);
    };
    const runResult = await run(dom).result;
    expect(runResult.failureStep).toBe("estimate_check");
    expect(dom.calls.some((c) => c.name === "renameEstimate" || c.name === "shareEstimate")).toBe(
      false,
    );
  });

  it("renombrado fallido → rename; Share sin enlace válido → share; excepción → unexpected_error", async () => {
    const renameFails = createFakeDom({
      renameEstimate: async () => ({ ok: false, reason: "timeout" }),
    });
    expect((await run(renameFails).result).failureStep).toBe("rename");

    const shareFails = createFakeDom({
      shareEstimate: async () => ({ ok: true, value: "https://evil.com/x" }),
    });
    const shareResult = await run(shareFails).result;
    expect(shareResult.failureStep).toBe("share");
    expect(shareResult.estimateUrl).toBeUndefined();

    const throws = createFakeDom({
      scanForm: async () => {
        throw new Error("nodo desconectado");
      },
    });
    const thrown = await run(throws).result;
    expect(thrown.perServiceResults[0].reason).toBe("unexpected_error");
  });

  it("servicio no encontrado → service_not_found (sin 'primer resultado')", async () => {
    const dom = createFakeDom({
      startService: async () => ({ ok: false, reason: "service_not_found", detail: "Amazon EC2" }),
    });
    const runResult = await run(dom).result;
    expect(runResult.perServiceResults[0].reason).toBe("service_not_found");
    expect(dom.calls.some((c) => c.name === "applyAction")).toBe(false);
  });
});
