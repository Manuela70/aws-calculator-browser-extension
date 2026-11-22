import { describe, it, expect } from "vitest";
import {
  describeFailure,
  describeRunResult,
  describeServiceResult,
} from "../../aws-calculator-extension/lib/messages-es.js";

describe("messages-es (BR6.4)", () => {
  it("traduce cada reason a español nombrando servicio y campo, sin códigos técnicos", () => {
    const reasons = [
      "service_not_found",
      "page_timeout",
      "toggle_not_applied",
      "field_not_recognized",
      "field_not_applied",
      "validation_required",
      "save_not_confirmed",
      "service_timeout",
      "unexpected_error",
    ];
    for (const reason of reasons) {
      const text = describeServiceResult({
        serviceName: "Amazon EC2",
        status: "failed",
        reason,
        detail: "Operating system",
      });
      expect(text).toContain("EC2");
      expect(text).not.toContain(reason);
      expect(text).not.toMatch(/awsui_/);
    }
    expect(
      describeServiceResult({
        serviceName: "Amazon EC2",
        status: "failed",
        reason: "field_not_recognized",
        detail: "Campo inexistente",
      }),
    ).toBe("No reconocí el campo Campo inexistente en Amazon EC2.");
  });

  it("traduce el paso fallido, las variantes de conexión y las esperas agotadas", () => {
    expect(describeFailure({ failureStep: "preconditions" })).toContain("ya tiene servicios");
    expect(
      describeFailure({ failureStep: "connection", failureDetail: "module_load_failed" }),
    ).toContain("Recarga la pestaña");
    expect(describeFailure({ failureStep: "connection", failureDetail: "busy" })).toBe(
      "Ya hay una corrida en curso en calculator.aws.",
    );
    expect(
      describeFailure({ failureStep: "preconditions", failureDetail: "timeout:abrir My Estimate" }),
    ).toBe("calculator.aws tardó demasiado en abrir My Estimate.");
    expect(describeFailure({ failureStep: "desconocido" })).toBe(
      "No pude conectar con calculator.aws.",
    );
  });

  it("solo permite mostrar la URL si la corrida terminó en DONE (BR5.4)", () => {
    const done = describeRunResult({
      status: "DONE",
      estimateUrl: "https://calculator.aws/#/e",
      perServiceResults: [{ serviceName: "Amazon EC2", status: "confirmed" }],
    });
    expect(done.showUrl).toBe(true);
    expect(done.lines).toEqual(["Amazon EC2: guardado y confirmado."]);
    const error = describeRunResult({
      status: "ERROR",
      failureStep: "share",
      perServiceResults: [],
    });
    expect(error.showUrl).toBe(false);
    expect(error.title).toBe("❌ No pude obtener el enlace público del estimado.");
  });
});
