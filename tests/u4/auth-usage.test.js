import { describe, expect, it, vi } from "vitest";
import { createAuthFilter } from "../../brain/core/auth-filter.js";
import { StoreUnavailableError } from "../../brain/core/errors.js";
import {
  createUsageGuard,
  dayBucket,
  minuteBucket,
  slidingCount,
} from "../../brain/core/usage-guard.js";
import { manualClock } from "./helpers.js";
import {
  EXTENSION_CLIENT,
  ISSUER,
  PROBE_CLIENT,
  createKey,
  fakeJwks,
  signToken,
} from "./token-helpers.js";

const KEY_A = createKey("key-a");
const KEY_B = createKey("key-b");

function authFilter({ jwks = fakeJwks([KEY_A]), clock = manualClock(), onRefreshFailed } = {}) {
  return {
    jwks,
    clock,
    filter: createAuthFilter({
      jwks,
      issuer: ISSUER,
      allowedClientIds: [EXTENSION_CLIENT, PROBE_CLIENT],
      probeClientId: PROBE_CLIENT,
      clock,
      onRefreshFailed,
    }),
  };
}

const bearer = (token) => `Bearer ${token}`;

describe("AuthFilter (NFR5.2, NFR5.4)", () => {
  it("acepta un token de acceso válido de la extensión y reconoce a la sonda", async () => {
    const { filter, clock } = authFilter();
    await filter.init();
    const ok = await filter.authenticate(bearer(signToken(KEY_A, {}, clock.now())));
    expect(ok).toEqual({
      ok: true,
      principal: { sub: "se-0001", clientId: EXTENSION_CLIENT, isProbe: false },
    });
    const probe = await filter.authenticate(
      bearer(signToken(KEY_A, { client_id: PROBE_CLIENT, sub: undefined }, clock.now())),
    );
    expect(probe.principal).toEqual({ sub: PROBE_CLIENT, clientId: PROBE_CLIENT, isProbe: true });
  });

  it("rechaza un token vencido más allá de la tolerancia de 60 s y acepta dentro de ella", async () => {
    const { filter, clock } = authFilter();
    await filter.init();
    const token = signToken(KEY_A, { exp: Math.floor(clock.now() / 1000) - 30 }, clock.now());
    expect((await filter.authenticate(bearer(token))).ok).toBe(true);
    clock.advance(60_000);
    expect((await filter.authenticate(bearer(token))).ok).toBe(false);
  });

  it("rechaza otro emisor, otro cliente, token de id y cabecera mal formada", async () => {
    const { filter, clock } = authFilter();
    await filter.init();
    const now = clock.now();
    const cases = [
      signToken(KEY_A, { iss: "https://evil.example" }, now),
      signToken(KEY_A, { client_id: "otro-cliente" }, now),
      signToken(KEY_A, { token_use: "id" }, now),
      signToken(KEY_A, { exp: undefined }, now),
    ];
    for (const token of cases) expect((await filter.authenticate(bearer(token))).ok).toBe(false);
    expect((await filter.authenticate(undefined)).ok).toBe(false);
    expect((await filter.authenticate("Basic abc")).ok).toBe(false);
    expect((await filter.authenticate("Bearer a.b.c")).ok).toBe(false);
    const tampered = signToken(KEY_A, {}, now).replace(/\.[^.]+$/, ".AAAA");
    expect((await filter.authenticate(bearer(tampered))).ok).toBe(false);
  });

  it("con kid desconocido fuerza un refresco y acepta la clave rotada", async () => {
    const { filter, clock, jwks } = authFilter();
    await filter.init();
    jwks.setKeys([KEY_A, KEY_B]);
    const result = await filter.authenticate(bearer(signToken(KEY_B, {}, clock.now())));
    expect(result.ok).toBe(true);
    expect(jwks.calls).toBe(2);
  });

  it("no refresca más de una vez cada 5 minutos por kid desconocido", async () => {
    const { filter, clock, jwks } = authFilter();
    await filter.init();
    const unknown = createKey("key-z");
    const token = () => bearer(signToken(unknown, {}, clock.now()));
    expect((await filter.authenticate(token())).ok).toBe(false);
    expect((await filter.authenticate(token())).ok).toBe(false);
    expect(jwks.calls).toBe(2); // arranque + un refresco forzado
    clock.advance(300_000);
    jwks.setKeys([KEY_A, unknown]);
    expect((await filter.authenticate(token())).ok).toBe(true);
    expect(jwks.calls).toBe(3);
  });

  it("conserva las claves anteriores si el refresco horario falla", async () => {
    const onRefreshFailed = vi.fn();
    const { filter, clock, jwks } = authFilter({ onRefreshFailed });
    await filter.init();
    jwks.fail();
    clock.advance(3_600_000);
    const result = await filter.authenticate(bearer(signToken(KEY_A, {}, clock.now())));
    expect(result.ok).toBe(true);
    expect(onRefreshFailed).toHaveBeenCalledTimes(1);
    expect(filter.hasKeys()).toBe(true);
  });
});

// Almacén de uso en memoria con modo caído.
function memoryStore() {
  const counters = new Map();
  let down = false;
  return {
    counters,
    setDown: (value) => {
      down = value;
    },
    async increment(pk, amount) {
      if (down) throw new StoreUnavailableError("timeout");
      counters.set(pk, (counters.get(pk) ?? 0) + amount);
      return counters.get(pk);
    },
    async get(pk) {
      if (down) throw new StoreUnavailableError("timeout");
      return counters.get(pk) ?? 0;
    },
  };
}

const LIMITS = {
  perMinute: 3,
  probePerMinute: 2,
  dailyTokenCap: 1000,
  globalDailyTokenCap: 5000,
  probeDailyTokenCap: 300,
  maxInstances: 2,
};
const SE = { sub: "se-1", isProbe: false };
const PROBE = { sub: PROBE_CLIENT, isProbe: true };

function guard(store = memoryStore(), clock = manualClock(Date.parse("2026-11-22T15:00:00.000Z"))) {
  const emitMetric = vi.fn();
  return {
    store,
    clock,
    emitMetric,
    guard: createUsageGuard({ store, clock, limits: LIMITS, emitMetric }),
  };
}

describe("UsageGuard (NFR3.1, NFR3.2, NFR3.4)", () => {
  it("calcula ventana, minuto y día en UTC-5", () => {
    expect(slidingCount(2, 10, 30_000)).toBe(7);
    expect(minuteBucket(120_000)).toBe(2);
    expect(dayBucket(Date.parse("2026-11-22T03:00:00.000Z"))).toBe("2026-11-21");
  });

  it("limita a N operaciones por minuto por SE con retryAfterSeconds", async () => {
    const { guard: g, clock } = guard();
    clock.advance(15_000);
    for (let i = 0; i < 3; i++) expect((await g.check(SE)).ok).toBe(true);
    expect(await g.check(SE)).toEqual({ ok: false, code: "rate_limited", retryAfterSeconds: 45 });
    expect((await g.check({ sub: "se-2", isProbe: false })).ok).toBe(true);
  });

  it("aplica la cuota diaria por SE y el tope global", async () => {
    const { guard: g } = guard();
    await g.record(SE, 1000);
    expect(await g.check(SE)).toEqual({ ok: false, code: "daily_quota_exceeded" });
    const other = { sub: "se-9", isProbe: false };
    for (let i = 0; i < 4; i++) await g.record({ sub: `se-x${i}`, isProbe: false }, 999);
    expect((await g.check(other)).ok).toBe(true);
    await g.record({ sub: "se-y", isProbe: false }, 10);
    expect(await g.check(other)).toEqual({ ok: false, code: "daily_quota_exceeded" });
  });

  it("cuenta la sonda aparte, con su propio tope por minuto y por día", async () => {
    const { guard: g, store } = guard();
    await g.record(PROBE, 120);
    expect([...store.counters.keys()].some((k) => k.startsWith("global#"))).toBe(false);
    expect((await g.check(PROBE)).ok).toBe(true);
    expect((await g.check(PROBE)).ok).toBe(true);
    expect((await g.check(PROBE)).code).toBe("rate_limited");
    await g.record(PROBE, 200);
    const { guard: fresh, store: freshStore } = guard();
    freshStore.counters.set(`probe#day#${dayBucket(Date.parse("2026-11-22T15:00:00.000Z"))}`, 300);
    expect((await fresh.check(PROBE)).code).toBe("daily_quota_exceeded");
  });

  it("con el almacén caído usa el limitador local y emite UsageGuardFallback", async () => {
    const { guard: g, store, emitMetric } = guard();
    store.setDown(true);
    for (let i = 0; i < 3; i++) expect((await g.check(SE)).ok).toBe(true);
    expect((await g.check(SE)).code).toBe("rate_limited");
    expect(emitMetric).toHaveBeenCalledWith("UsageGuardFallback", 1);
    await g.record({ sub: "se-z", isProbe: false }, 2500); // tope global / 2 instancias
    expect((await g.check({ sub: "se-new", isProbe: false })).code).toBe("daily_quota_exceeded");
    await g.record(PROBE, 150);
    expect((await g.check(PROBE)).code).toBe("daily_quota_exceeded");
    await g.record(SE, 0);
  });

  it("descarta contadores locales viejos al cambiar de minuto y de día", async () => {
    const { guard: g, store, clock } = guard();
    store.setDown(true);
    for (let i = 0; i < 3; i++) await g.check(SE);
    clock.advance(24 * 3_600_000);
    expect((await g.check(SE)).ok).toBe(true);
  });
});
