// Integración del orquestador multi-servicio con el resolvedor falso
// (R1/R2; BR1.1-BR1.3, BR2.1-BR2.7; NFR3.5, NFR8.4; decisiones 7 y 12 del plan).
import { describe, it, expect, vi, afterEach } from "vitest";
import { runEstimate } from "../../aws-calculator-extension/lib/rpa/orchestrator.js";
import { SERVICE_TIMEOUT_MS } from "../../aws-calculator-extension/lib/rpa/service-timer.js";
import { createFakeDom } from "../u1/fake-dom.js";
import { makeDomFields } from "../u1/fixtures.js";
import {
  makeBedrockDomFields,
  makeBedrockRequest,
  makeEc2Request,
  makeHomonymRunRequest,
  makeLambdaRequest,
  makeMultiRunRequest,
} from "./fixtures.js";

const now = () => new Date("2026-11-22T10:00:00.000Z");

// DOM falso cuyo escaneo devuelve los campos del servicio abierto.
function createMultiDom(overrides = {}) {
  const dom = createFakeDom(overrides);
  const fieldsBySearch = {
    "Amazon EC2": makeDomFields(),
    "Amazon Bedrock": makeBedrockDomFields(),
    "AWS Lambda": makeBedrockDomFields(),
  };
  let current = null;
  const start = dom.startService;
  dom.startService = async (searchTerm, opts) => {
    current = searchTerm;
    return start(searchTerm, opts);
  };
  if (!overrides.scanForm) {
    dom.scanForm = async () => {
      dom.calls.push({ name: "scanForm" });
      return { ok: true, value: fieldsBySearch[current] ?? [] };
    };
  }
  dom.current = () => current;
  return dom;
}

function run(dom, runRequest = makeMultiRunRequest(), extra = {}) {
  const progress = vi.fn();
  const log = vi.fn();
  const result = runEstimate(runRequest, { dom, progress, log, now, ...extra });
  return { result, progress, log };
}

const names = (dom, name) => dom.calls.filter((c) => c.name === name);

afterEach(() => {
  vi.useRealTimers();
});

describe("orquestador multi-servicio", () => {
  it("tres servicios confirmados → DONE; región una sola vez y plantilla antes de los toggles", async () => {
    const dom = createMultiDom();
    const { result, progress } = await run(dom);
    const runResult = await result;
    expect(runResult.status).toBe("DONE");
    expect(runResult.perServiceResults.map((r) => r.status)).toEqual([
      "confirmed",
      "confirmed",
      "confirmed",
    ]);
    expect(names(dom, "setRegion")).toHaveLength(1);
    const order = dom.calls.map((c) => c.name);
    expect(order.indexOf("selectTemplate")).toBeLessThan(order.indexOf("applyToggle"));
    const events = progress.mock.calls.map(([event]) => event);
    expect(events.every((e) => e.serviceCount === 3 && e.runId === "run-multi-1")).toBe(true);
    const finished = events.filter((e) => e.serviceStatus === "confirmed");
    expect(finished.map((e) => e.serviceIndex)).toEqual([0, 1, 2]);
  });

  it("fallo intermedio por 'is required': sale sin guardar, sigue con el siguiente y no hay URL", async () => {
    const dom = createMultiDom();
    const save = dom.saveService;
    dom.saveService = async (name, opts) =>
      name === "Amazon Bedrock"
        ? { ok: false, reason: "validation_required", detail: "Number of requests" }
        : save(name, opts);
    const runResult = await run(dom).result;
    expect(runResult).toMatchObject({
      status: "ERROR",
      failureStep: "services",
      missing: ["Amazon Bedrock"],
      stoppedAtLabel: "Number of requests",
    });
    expect(runResult.perServiceResults[1]).toMatchObject({
      reason: "validation_required",
      stoppedAtLabel: "Number of requests",
    });
    expect(runResult.perServiceResults[2].status).toBe("confirmed");
    expect(names(dom, "exitWithoutSave")).toHaveLength(1);
    expect(names(dom, "shareEstimate")).toHaveLength(0);
    expect(runResult.estimateUrl).toBeUndefined();
  });

  it("plantilla inexistente → template_not_found con el nombre pedido", async () => {
    const dom = createMultiDom();
    const request = makeMultiRunRequest({
      services: [makeEc2Request(), makeBedrockRequest({ template: "Plantilla fantasma" })],
    });
    const runResult = await run(dom, request).result;
    expect(runResult.perServiceResults[1]).toMatchObject({
      status: "failed",
      reason: "template_not_found",
      detail: "Plantilla fantasma",
    });
    expect(names(dom, "applyToggle")).toHaveLength(0);
  });

  it("corte de 3 minutos en un servicio → service_timeout, salida sin guardar y el siguiente sigue", async () => {
    vi.useFakeTimers();
    const dom = createMultiDom();
    const save = dom.saveService;
    dom.saveService = (name, opts) =>
      name === "Amazon Bedrock" ? new Promise(() => {}) : save(name, opts);
    const { result } = run(dom);
    await vi.advanceTimersByTimeAsync(SERVICE_TIMEOUT_MS);
    const runResult = await result;
    expect(runResult.perServiceResults.map((r) => r.reason ?? r.status)).toEqual([
      "confirmed",
      "service_timeout",
      "confirmed",
    ]);
    expect(names(dom, "exitWithoutSave")).toHaveLength(1);
    expect(runResult.status).toBe("ERROR");
  });

  it("salida no confirmada → RunStopped: los restantes quedan not_attempted (decisión 12)", async () => {
    const dom = createMultiDom({
      exitWithoutSave: async () => ({ ok: false, reason: "not_found", selector: "form.cancel" }),
    });
    const save = dom.saveService;
    dom.saveService = async (name, opts) =>
      name === "Amazon EC2" ? { ok: false, reason: "not_confirmed" } : save(name, opts);
    const { result, log } = run(dom);
    const runResult = await result;
    expect(runResult).toMatchObject({ status: "ERROR", failureDetail: "exit_not_confirmed" });
    expect(runResult.perServiceResults.map((r) => r.reason)).toEqual([
      "save_not_confirmed",
      "not_attempted",
      "not_attempted",
    ]);
    expect(runResult.missing).toEqual(["Amazon EC2", "Amazon Bedrock", "AWS Lambda"]);
    expect(names(dom, "startService")).toHaveLength(1);
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ event: "exit_not_confirmed" }));
  });

  it("región: tras un service_not_found la fija el siguiente; si no se puede, detalle Region", async () => {
    const dom = createMultiDom();
    const start = dom.startService;
    dom.startService = async (term, opts) =>
      term === "Amazon EC2"
        ? { ok: false, reason: "service_not_found", detail: term }
        : start(term, opts);
    const runResult = await run(dom).result;
    expect(runResult.perServiceResults[0].reason).toBe("service_not_found");
    expect(names(dom, "setRegion")).toHaveLength(1);
    expect(names(dom, "exitWithoutSave")).toHaveLength(0);

    const setRegion = vi.fn(async () => ({ ok: false, reason: "not_found" }));
    const noRegion = createMultiDom({ setRegion });
    const failed = await run(noRegion).result;
    expect(failed.perServiceResults[0]).toMatchObject({
      reason: "field_not_applied",
      detail: "Region",
    });
    // Una región no fijada no cuenta como fijada: cada servicio lo vuelve a intentar.
    expect(setRegion).toHaveBeenCalledTimes(3);
  });

  it("cancelación a mitad de corrida → ERROR cancelled, sale sin guardar y limpia el overlay", async () => {
    const controller = new AbortController();
    const dom = createMultiDom();
    const apply = dom.applyAction;
    dom.applyAction = async (action, opts) => {
      if (dom.current() === "Amazon Bedrock") controller.abort("cancelled");
      return apply(action, opts);
    };
    const runResult = await run(dom, makeMultiRunRequest(), { signal: controller.signal }).result;
    expect(runResult).toMatchObject({
      status: "ERROR",
      failureStep: "services",
      failureDetail: "cancelled",
    });
    expect(runResult.perServiceResults.map((r) => r.reason ?? r.status)).toEqual([
      "confirmed",
      "not_attempted",
      "not_attempted",
    ]);
    expect(names(dom, "exitWithoutSave")).toHaveLength(1);
    expect(names(dom, "startService")).toHaveLength(2);
    expect(names(dom, "cleanup")).toHaveLength(1);
  });

  it("una sustitución del cerebro queda visible en el ServiceResult (NFR3.4)", async () => {
    const dom = createMultiDom();
    const svc = makeEc2Request({
      fields: [
        { key: "Sistema operativo", value: "linux server" },
        { key: "Number of instances", value: "2" },
      ],
    });
    const mapResidue = vi.fn().mockResolvedValue({
      actions: [
        {
          requestKey: "Sistema operativo",
          fieldLabel: "Operating system",
          actionType: "dropdown",
          value: "Linux",
        },
      ],
    });
    const { result, progress } = run(dom, { runId: "r-sub", services: [svc] }, { mapResidue });
    const runResult = await result;
    expect(runResult.status).toBe("DONE");
    expect(runResult.perServiceResults[0].brainSubstitutions).toEqual([
      { key: "Sistema operativo", requestedValue: "linux server", appliedValue: "Linux" },
    ]);
    expect(progress).toHaveBeenCalledWith(expect.objectContaining({ step: "asking_brain" }));
  });

  it("un error tipado del cerebro se copia como brainErrorCode", async () => {
    const dom = createMultiDom();
    const svc = makeEc2Request({ fields: [{ key: "Sistema operativo", value: "Linux" }] });
    const mapResidue = vi.fn().mockRejectedValue({ code: "unauthorized" });
    const runResult = await run(dom, { runId: "r-auth", services: [svc] }, { mapResidue }).result;
    expect(runResult.perServiceResults[0]).toMatchObject({
      reason: "field_not_recognized",
      brainErrorCode: "unauthorized",
    });
  });

  it("homónimos: si el banner del primero no confirma el segundo, nunca hay DONE", async () => {
    const dom = createMultiDom();
    let saves = 0;
    dom.saveService = async (name) => {
      dom.calls.push({ name: "saveService", args: [name] });
      saves += 1;
      if (saves > 1) return { ok: false, reason: "not_confirmed" };
      dom.state.estimateServices.push(name);
      return { ok: true };
    };
    const runResult = await run(dom, makeHomonymRunRequest()).result;
    expect(runResult.status).toBe("ERROR");
    expect(runResult.perServiceResults[1].reason).toBe("save_not_confirmed");
    expect(names(dom, "saveService")).toHaveLength(4);
    expect(runResult.missing).toEqual(["Amazon EC2"]);
  });

  it("estimado con un servicio de menos → estimate_check aunque todos se confirmaron", async () => {
    const dom = createMultiDom();
    const save = dom.saveService;
    dom.saveService = async (name, opts) => {
      const saved = await save(name, opts);
      if (name === "AWS Lambda") dom.state.estimateServices.pop();
      return saved;
    };
    const runResult = await run(dom).result;
    expect(runResult).toMatchObject({ status: "ERROR", failureStep: "estimate_check" });
    expect(runResult.estimateUrl).toBeUndefined();
  });

  it("búsqueda con espera agotada se reintenta una vez; un DomError lanzado se traduce", async () => {
    const dom = createMultiDom();
    let attempts = 0;
    const start = dom.startService;
    dom.startService = async (term, opts) => {
      if (term === "Amazon EC2" && attempts++ === 0) return { ok: false, reason: "page_timeout" };
      return start(term, opts);
    };
    dom.applyAction = async () => {
      throw Object.assign(new Error("cascada agotada"), { code: "field_not_resolved" });
    };
    const runResult = await run(dom, { runId: "r-x", services: [makeLambdaRequest()] }).result;
    expect(runResult.perServiceResults[0].reason).toBe("field_not_resolved");

    const retried = createMultiDom();
    const original = retried.startService;
    let first = true;
    retried.startService = async (term, opts) => {
      if (first) {
        first = false;
        return { ok: false, reason: "page_timeout" };
      }
      return original(term, opts);
    };
    const ok = await run(retried, { runId: "r-y", services: [makeEc2Request()] }).result;
    expect(ok.status).toBe("DONE");
  });
});

describe("orquestador: cancelación en cada paso y bordes", () => {
  // Bedrock con plantilla, toggle y proyecto: recorre todos los pasos de R1/R2.
  function bedrockRun() {
    return { runId: "r-edge", project: "Bordes", services: [makeBedrockRequest()] };
  }

  it.each([
    ["openEstimate", 1, "preconditions"],
    ["startService", 1, "services"],
    ["setRegion", 1, "services"],
    ["selectTemplate", 1, "services"],
    ["applyToggle", 1, "services"],
    ["scanForm", 1, "services"],
    ["applyAction", 1, "services"],
    ["saveService", 1, "services"],
    ["listEstimateServices", 2, "estimate_check"],
    ["renameEstimate", 1, "rename"],
    ["shareEstimate", 1, "share"],
  ])("cancelar durante %s termina en ERROR cancelled sin URL", async (method, onCall, step) => {
    const controller = new AbortController();
    const dom = createMultiDom();
    const original = dom[method];
    let count = 0;
    dom[method] = async (...args) => {
      count += 1;
      if (count === onCall) controller.abort("cancelled");
      return original(...args);
    };
    const runResult = await run(dom, bedrockRun(), { signal: controller.signal }).result;
    expect(runResult).toMatchObject({
      status: "ERROR",
      failureStep: step,
      failureDetail: "cancelled",
    });
    expect(runResult.estimateUrl).toBeUndefined();
  });

  it("fallos tipados de toggle, escaneo y acción conservan su motivo y detalle", async () => {
    const toggle = createMultiDom({ applyToggle: async () => ({ ok: false, reason: "raro" }) });
    const toggled = await run(toggle, bedrockRun()).result;
    expect(toggled.perServiceResults[0]).toMatchObject({
      reason: "toggle_not_applied",
      detail: "Anthropic",
      stoppedAtLabel: "Anthropic",
    });

    const scan = createMultiDom({ scanForm: async () => ({ ok: false, reason: "timeout" }) });
    expect((await run(scan, bedrockRun()).result).perServiceResults[0].reason).toBe("page_timeout");

    const action = createMultiDom({
      applyAction: async () => ({ ok: false, reason: "option_ambiguous" }),
      expandSections: async () => ({ ok: false, selector: "form.collapsedSections" }),
    });
    const { result, log } = run(action, bedrockRun());
    expect((await result).perServiceResults[0]).toMatchObject({
      reason: "option_ambiguous",
      detail: "Number of requests: 1000",
    });
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ event: "expand_failed" }));
  });

  it("búsqueda agotada, región desconocida y guardado rechazado sin detalle", async () => {
    const timeouts = createMultiDom({
      startService: async () => ({ ok: false, reason: "timeout" }),
    });
    const searched = await run(timeouts, bedrockRun()).result;
    expect(searched.perServiceResults[0]).toMatchObject({
      reason: "page_timeout",
      detail: "buscar el servicio",
    });

    const region = createMultiDom();
    const unknown = await run(region, {
      runId: "r-reg",
      services: [makeBedrockRequest({ region: "xx-none-1" })],
    }).result;
    expect(unknown.perServiceResults[0]).toMatchObject({ detail: "Region" });

    const required = createMultiDom({
      saveService: async () => ({ ok: false, reason: "validation_required" }),
    });
    const rejected = await run(required, bedrockRun()).result;
    expect(rejected.perServiceResults[0]).toMatchObject({
      reason: "validation_required",
      detail: "un campo obligatorio",
    });
  });

  it("errores inesperados: sin código, fuera de un servicio, en la salida y al limpiar", async () => {
    const throws = createMultiDom({
      selectTemplate: async () => {
        throw "texto suelto";
      },
      exitWithoutSave: async () => {
        throw new Error("modal colgado");
      },
      cleanup: () => {
        throw new Error("overlay ya quitado");
      },
    });
    const { result, log } = run(throws, bedrockRun());
    const runResult = await result;
    expect(runResult).toMatchObject({ failureDetail: "exit_not_confirmed" });
    expect(runResult.perServiceResults[0].reason).toBe("unexpected_error");
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ event: "cleanup_failed" }));

    const outer = createMultiDom({
      openEstimate: async () => {
        throw new Error("pestaña cerrada");
      },
    });
    expect(await run(outer, bedrockRun()).result).toMatchObject({
      status: "ERROR",
      failureStep: "preconditions",
    });
  });

  it("precondiciones: My Estimate que no abre o no se puede leer", async () => {
    const closed = createMultiDom({ openEstimate: async () => ({ ok: false, selector: "x" }) });
    expect((await run(closed).result).failureDetail).toBe("timeout:abrir My Estimate");
    const unreadable = createMultiDom({
      listEstimateServices: async () => ({ ok: false, selector: "y" }),
    });
    expect((await run(unreadable).result).failureDetail).toBe("timeout:leer My Estimate");
  });

  it("dependencias por defecto, tarjeta sin nombre y regreso fallido a My Estimate", async () => {
    const dom = createMultiDom({
      returnToEstimate: async () => ({ ok: false, selector: "estimate.addServiceButton" }),
    });
    const start = dom.startService;
    dom.startService = async (term, opts) => {
      await start(term, opts);
      return { ok: true };
    };
    const runResult = await runEstimate(
      { runId: "r-def", services: [makeLambdaRequest()] },
      { dom },
    );
    expect(runResult.status).toBe("DONE");
    expect(dom.calls.find((c) => c.name === "saveService").args[0]).toBe("AWS Lambda");
  });
});
