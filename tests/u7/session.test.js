// sw/session.js: login único, cancelación, margen de 60 s y borrado (NFR5.2, NFR5.4, NFR5.6 a-d).
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  createSession,
  SESSION_KEY,
  EXPIRY_MARGIN_MS,
} from "../../aws-calculator-extension/sw/session.js";
import { createKeepalive } from "../../aws-calculator-extension/sw/keepalive.js";
import { createSessionStorage, createCountingKeepalive } from "./fakes.js";

const NOW = 1_800_000_000_000;

function setup({ startLogin, initial, keepalive = createCountingKeepalive() } = {}) {
  const storage = createSessionStorage(initial);
  const warnings = [];
  const session = createSession({
    storage,
    startLogin,
    keepalive,
    now: () => NOW,
    onWarn: (...args) => warnings.push(args),
  });
  return { storage, session, keepalive, warnings };
}

function deferred() {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
}

afterEach(() => vi.useRealTimers());

describe("sw/session", () => {
  it("tres BRAIN_LOGIN concurrentes comparten un solo login y guardan el token", async () => {
    const gate = deferred();
    const startLogin = vi.fn(() => gate.promise);
    const { session, storage } = setup({ startLogin });
    const results = [session.login(), session.login(), session.login()];
    expect(session.isLoginPending()).toBe(true);
    gate.resolve({ ok: true, accessToken: "tok-1", expiresAt: NOW + 3_600_000 });
    const values = await Promise.all(results);
    expect(startLogin).toHaveBeenCalledTimes(1);
    expect(values).toEqual([0, 1, 2].map(() => ({ ok: true, expiresAt: NOW + 3_600_000 })));
    expect(storage.data.get(SESSION_KEY)).toEqual({
      accessToken: "tok-1",
      expiresAt: NOW + 3_600_000,
    });
    expect(session.isLoginPending()).toBe(false);
  });

  it("una cancelación resuelve login_cancelled para todos y no guarda nada", async () => {
    const gate = deferred();
    const { session, storage } = setup({ startLogin: () => gate.promise });
    const results = [session.login(), session.login(), session.login()];
    gate.resolve({ ok: false, code: "login_cancelled" });
    for (const result of await Promise.all(results)) {
      expect(result.ok).toBe(false);
      expect(result.error.code).toBe("login_cancelled");
      expect(result.error.message).toMatch(/cancel/i);
    }
    expect(storage.data.size).toBe(0);
    expect(session.isLoginPending()).toBe(false);
  });

  it("un login que lanza o falla sin código conocido responde brain_unavailable", async () => {
    const failing = setup({ startLogin: async () => Promise.reject(new Error("red")) });
    expect((await failing.session.login()).error.code).toBe("brain_unavailable");
    expect(failing.warnings.length).toBe(1);
    const odd = setup({ startLogin: async () => ({ ok: false, code: "otro" }) });
    expect((await odd.session.login()).error.code).toBe("brain_unavailable");
  });

  it("trata el token como ausente desde 60 s antes de vencer", async () => {
    const fresh = setup({
      initial: { [SESSION_KEY]: { accessToken: "a", expiresAt: NOW + EXPIRY_MARGIN_MS + 1 } },
    });
    expect(await fresh.session.getValidToken()).toBe("a");
    expect(await fresh.session.getStatus()).toEqual({
      authenticated: true,
      expiresAt: NOW + EXPIRY_MARGIN_MS + 1,
    });
    const nearly = setup({
      initial: { [SESSION_KEY]: { accessToken: "a", expiresAt: NOW + EXPIRY_MARGIN_MS } },
    });
    expect(await nearly.session.getValidToken()).toBeNull();
    expect(await nearly.session.getStatus()).toEqual({ authenticated: false, expiresAt: null });
  });

  it("un registro con expiresAt inválido o token vacío cuenta como sin sesión", async () => {
    for (const record of [
      { accessToken: "a", expiresAt: "mañana" },
      { accessToken: "a", expiresAt: Number.NaN },
      { accessToken: "", expiresAt: NOW + 3_600_000 },
      "texto",
    ]) {
      const { session } = setup({ initial: { [SESSION_KEY]: record } });
      expect(await session.getValidToken()).toBeNull();
    }
  });

  it("clear() borra la clave (401) y un fallo de almacenamiento se avisa, no se calla", async () => {
    const { session, storage, warnings } = setup({
      initial: { [SESSION_KEY]: { accessToken: "a", expiresAt: NOW + 3_600_000 } },
    });
    await session.clear();
    expect(storage.data.has(SESSION_KEY)).toBe(false);
    storage.remove = async () => Promise.reject(new Error("caído"));
    storage.get = async () => Promise.reject(new Error("caído"));
    await session.clear();
    expect(await session.getValidToken()).toBeNull();
    expect(warnings.length).toBe(2);
  });

  it("si no se puede guardar el token, el login responde brain_unavailable", async () => {
    const { session, storage } = setup({
      startLogin: async () => ({ ok: true, accessToken: "t", expiresAt: NOW + 3_600_000 }),
    });
    storage.set = async () => Promise.reject(new Error("cuota"));
    expect((await session.login()).error.code).toBe("brain_unavailable");
  });

  it("toma el keepalive durante un login de más de 30 s", async () => {
    vi.useFakeTimers();
    const pings = [];
    const keepalive = createKeepalive({ ping: () => pings.push(Date.now()) });
    const { session } = setup({
      keepalive,
      startLogin: () =>
        new Promise((resolve) =>
          setTimeout(
            () => resolve({ ok: true, accessToken: "t", expiresAt: NOW + 3_600_000 }),
            45000,
          ),
        ),
    });
    const result = session.login();
    expect(keepalive.activeCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(45000);
    expect((await result).ok).toBe(true);
    expect(pings.length).toBe(2);
    expect(keepalive.activeCount()).toBe(0);
  });
});
