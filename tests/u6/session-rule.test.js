// session-rule.js: iniciar sesión si quedan menos de 15 minutos (decisión 9, NFR5.5).
import { describe, it, expect } from "vitest";
import {
  LOGIN_MARGIN_MS,
  needsLogin,
} from "../../aws-calculator-extension/lib/panel/session-rule.js";
import { FIXED_NOW, makeSession } from "./fixtures.js";

describe("needsLogin", () => {
  it("sin sesión o no autenticado pide login", () => {
    expect(needsLogin(null, FIXED_NOW)).toBe(true);
    expect(needsLogin(undefined, FIXED_NOW)).toBe(true);
    expect(needsLogin(makeSession(null), FIXED_NOW)).toBe(true);
  });

  it("con menos de 15 minutos pide login; con 15 o más, no", () => {
    expect(needsLogin(makeSession(5), FIXED_NOW)).toBe(true);
    expect(needsLogin(makeSession(14), FIXED_NOW)).toBe(true);
    expect(needsLogin(makeSession(16), FIXED_NOW)).toBe(false);
    expect(needsLogin(makeSession(60), FIXED_NOW)).toBe(false);
    expect(LOGIN_MARGIN_MS).toBe(900000);
    const exact = { authenticated: true, expiresAt: FIXED_NOW + LOGIN_MARGIN_MS };
    expect(needsLogin(exact, FIXED_NOW)).toBe(false);
  });

  it("una respuesta con error o sin expiresAt cuenta como no autenticado", () => {
    expect(
      needsLogin({ ...makeSession(60), error: { code: "brain_unavailable" } }, FIXED_NOW),
    ).toBe(true);
    expect(needsLogin({ authenticated: true }, FIXED_NOW)).toBe(true);
    expect(needsLogin({ authenticated: true, expiresAt: "mañana" }, FIXED_NOW)).toBe(true);
    expect(needsLogin(makeSession(60), Number.NaN)).toBe(true);
  });
});
