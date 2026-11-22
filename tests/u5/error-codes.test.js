// Tabla DomError → reason/failureStep (security-design §3; decisión 5 del plan).
import { describe, it, expect } from "vitest";
import {
  SERVICE_REASONS,
  translateDomError,
} from "../../aws-calculator-extension/lib/rpa/result-aggregator.js";
import { SERVICE_TIMEOUT_REASON } from "../../aws-calculator-extension/lib/rpa/service-timer.js";
import { describeServiceResult } from "../../aws-calculator-extension/lib/messages-es.js";

describe("translateDomError", () => {
  it("not_found al buscar la tarjeta es service_not_found; en otra espera, page_timeout", () => {
    expect(translateDomError("not_found", { step: "search_service" })).toEqual({
      reason: "service_not_found",
      failureStep: "services",
    });
    expect(translateDomError("not_found", { step: "toggle" }).reason).toBe("page_timeout");
    expect(translateDomError("timeout").reason).toBe("page_timeout");
  });

  it("aborted distingue el corte de 3 minutos de la cancelación de la corrida", () => {
    expect(translateDomError("aborted", { abortReason: SERVICE_TIMEOUT_REASON }).reason).toBe(
      "service_timeout",
    );
    expect(translateDomError("aborted", { abortReason: "cancelled" }).reason).toBe("not_attempted");
    expect(translateDomError("cancelled").reason).toBe("not_attempted");
  });

  it("traduce cada fila restante de la tabla", () => {
    const table = {
      template_not_found: "template_not_found",
      field_not_resolved: "field_not_resolved",
      readback_mismatch: "field_not_applied",
      field_not_applied: "field_not_applied",
      option_no_match: "option_no_match",
      option_ambiguous: "option_ambiguous",
      not_confirmed: "save_not_confirmed",
      validation_required: "validation_required",
      toggle_not_applied: "toggle_not_applied",
    };
    for (const [code, reason] of Object.entries(table)) {
      expect(translateDomError(code).reason).toBe(reason);
    }
  });

  it("un código desconocido es unexpected_error y los pasos de corrida se conservan", () => {
    expect(translateDomError("raro").reason).toBe("unexpected_error");
    expect(translateDomError(undefined).reason).toBe("unexpected_error");
    expect(translateDomError("not_found", { step: "share" }).failureStep).toBe("share");
    expect(translateDomError("not_found", { step: "estimate_check" }).failureStep).toBe(
      "estimate_check",
    );
    expect(translateDomError("not_found", { step: "rename" }).failureStep).toBe("rename");
  });

  it("cada reason del enum tiene su texto en español, sin el código ni clases técnicas", () => {
    for (const reason of SERVICE_REASONS) {
      const text = describeServiceResult({
        serviceName: "Amazon Bedrock",
        status: "failed",
        reason,
        detail: "Advanced estimate",
      });
      expect(text).toContain("Amazon Bedrock");
      expect(text).not.toContain(reason);
      expect(text).not.toMatch(/awsui_/);
    }
  });
});
