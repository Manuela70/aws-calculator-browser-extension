// brain/core/usage-guard.js — Límites de uso (NFR3.1, NFR3.2, NFR3.4;
// security-design.md §1 pasos 5-6; scalability-design.md):
// - 60 operaciones por minuto por SE (ventana deslizante aproximada con el
//   minuto actual y el anterior) → rate_limited con retryAfterSeconds;
// - cuota diaria de tokens por SE y tope global diario → daily_quota_exceeded;
// - la sonda tiene su propio tope por minuto y su contador diario (probe#day),
//   fuera de la cuota de los SE.
// Si el almacén compartido no responde (50 ms), cae al limitador local de la
// instancia con el mismo tope por minuto y al tope global / MAX_INSTANCES, y
// emite la métrica UsageGuardFallback: el límite pasa a ser aproximado, nunca
// desaparece.

const MINUTE_MS = 60_000;
const DAY_OFFSET_MS = 5 * 3_600_000; // el día se cuenta en UTC-5
const TTL_SECONDS = 48 * 3600;

export function minuteBucket(nowMs) {
  return Math.floor(nowMs / MINUTE_MS);
}

export function dayBucket(nowMs) {
  return new Date(nowMs - DAY_OFFSET_MS).toISOString().slice(0, 10);
}

// Ventana deslizante: el minuto anterior pesa la fracción del minuto que falta.
export function slidingCount(current, previous, nowMs) {
  const elapsed = (nowMs % MINUTE_MS) / MINUTE_MS;
  return previous * (1 - elapsed) + current;
}

function secondsToNextMinute(nowMs) {
  return Math.max(1, Math.ceil((MINUTE_MS - (nowMs % MINUTE_MS)) / 1000));
}

export function createUsageGuard({ store, clock, limits, emitMetric = () => {} }) {
  const localMinutes = new Map();
  const localDayTokens = new Map();

  function scopeOf(principal) {
    return principal.isProbe ? "probe" : `se#${principal.sub}`;
  }

  function minuteLimitOf(principal) {
    return principal.isProbe ? limits.probePerMinute : limits.perMinute;
  }

  function addLocal(map, key, amount) {
    const next = (map.get(key) ?? 0) + amount;
    map.set(key, next);
    return next;
  }

  function pruneLocal(nowMs) {
    const oldestMinute = minuteBucket(nowMs) - 1;
    for (const key of localMinutes.keys()) {
      if (Number(key.split("|")[1]) < oldestMinute) localMinutes.delete(key);
    }
    const today = dayBucket(nowMs);
    for (const key of localDayTokens.keys()) {
      if (!key.endsWith(today)) localDayTokens.delete(key);
    }
  }

  function rejectRate(nowMs) {
    return { ok: false, code: "rate_limited", retryAfterSeconds: secondsToNextMinute(nowMs) };
  }

  const QUOTA = Object.freeze({ ok: false, code: "daily_quota_exceeded" });
  const OK = Object.freeze({ ok: true });

  function checkLocal(principal, nowMs) {
    pruneLocal(nowMs);
    const scope = scopeOf(principal);
    const minute = minuteBucket(nowMs);
    const current = addLocal(localMinutes, `${scope}|${minute}`, 1);
    const previous = localMinutes.get(`${scope}|${minute - 1}`) ?? 0;
    if (slidingCount(current, previous, nowMs) > minuteLimitOf(principal)) return rejectRate(nowMs);
    const day = dayBucket(nowMs);
    const perInstance = Math.max(1, limits.maxInstances);
    if (principal.isProbe) {
      const spent = localDayTokens.get(`probe|${day}`) ?? 0;
      return spent >= limits.probeDailyTokenCap / perInstance ? QUOTA : OK;
    }
    const spent = localDayTokens.get(`global|${day}`) ?? 0;
    return spent >= limits.globalDailyTokenCap / perInstance ? QUOTA : OK;
  }

  async function checkShared(principal, nowMs) {
    const scope = scopeOf(principal);
    const minute = minuteBucket(nowMs);
    const ttl = Math.floor(nowMs / 1000) + TTL_SECONDS;
    const current = await store.increment(`${scope}#min#${minute}`, 1, ttl);
    const previous = await store.get(`${scope}#min#${minute - 1}`);
    if (slidingCount(current, previous, nowMs) > minuteLimitOf(principal)) return rejectRate(nowMs);
    const day = dayBucket(nowMs);
    if (principal.isProbe) {
      const spent = await store.get(`probe#day#${day}`);
      return spent >= limits.probeDailyTokenCap ? QUOTA : OK;
    }
    if ((await store.get(`${scope}#day#${day}`)) >= limits.dailyTokenCap) return QUOTA;
    if ((await store.get(`global#day#${day}`)) >= limits.globalDailyTokenCap) return QUOTA;
    return OK;
  }

  return {
    // Decide si la operación puede seguir. Nunca lanza.
    async check(principal) {
      const nowMs = clock.now();
      try {
        return await checkShared(principal, nowMs);
      } catch {
        emitMetric("UsageGuardFallback", 1);
        return checkLocal(principal, nowMs);
      }
    },

    // Suma los tokens reales informados por Bedrock. Nunca lanza.
    async record(principal, tokens) {
      const amount = Math.max(0, Math.round(tokens));
      if (amount === 0) return;
      const nowMs = clock.now();
      const day = dayBucket(nowMs);
      // Contador local siempre al día: sostiene el tope por instancia si el almacén cae.
      addLocal(localDayTokens, `${principal.isProbe ? "probe" : "global"}|${day}`, amount);
      const ttl = Math.floor(nowMs / 1000) + TTL_SECONDS;
      try {
        if (principal.isProbe) {
          await store.increment(`probe#day#${day}`, amount, ttl);
        } else {
          await store.increment(`se#${principal.sub}#day#${day}`, amount, ttl);
          await store.increment(`global#day#${day}`, amount, ttl);
        }
      } catch {
        emitMetric("UsageGuardFallback", 1);
      }
    },
  };
}
