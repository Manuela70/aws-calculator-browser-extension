// url-check.js: una sola regla para la URL del estimado (NFR5.2, decisión 10).
import { describe, it, expect } from "vitest";
import { isValidEstimateUrl } from "../../aws-calculator-extension/lib/panel/url-check.js";
import { validateShareUrl } from "../../aws-calculator-extension/lib/rpa/result-aggregator.js";
import { VALID_URL } from "./fixtures.js";

describe("isValidEstimateUrl", () => {
  it("acepta el enlace de Share de calculator.aws y es la misma regla de U5", () => {
    expect(isValidEstimateUrl(VALID_URL)).toBe(true);
    expect(isValidEstimateUrl).toBe(validateShareUrl);
  });

  it("rechaza otro host, http y javascript:", () => {
    expect(isValidEstimateUrl("https://evil.example/#/estimate?id=abc")).toBe(false);
    expect(isValidEstimateUrl("http://calculator.aws/#/estimate?id=abc")).toBe(false);
    expect(isValidEstimateUrl("javascript:alert(1)")).toBe(false);
    expect(isValidEstimateUrl("https://calculator.aws.evil.example/#/estimate?id=abc")).toBe(false);
  });

  it("rechaza un id de más de 128 caracteres, con caracteres raros o vacío", () => {
    const prefix = "https://calculator.aws/#/estimate?id=";
    expect(isValidEstimateUrl(`${prefix}${"a".repeat(128)}`)).toBe(true);
    expect(isValidEstimateUrl(`${prefix}${"a".repeat(129)}`)).toBe(false);
    expect(isValidEstimateUrl(`${prefix}abc"><script>`)).toBe(false);
    expect(isValidEstimateUrl(prefix)).toBe(false);
  });

  it("rechaza lo que no es texto", () => {
    expect(isValidEstimateUrl("")).toBe(false);
    expect(isValidEstimateUrl(undefined)).toBe(false);
    expect(isValidEstimateUrl({ href: VALID_URL })).toBe(false);
  });
});
