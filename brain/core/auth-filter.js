// brain/core/auth-filter.js — Validación local del token de acceso de Cognito
// (NFR5.2, NFR5.4; security-design.md §2):
// - firma RS256 con la clave cuyo `kid` está en el JWKS del user pool;
// - `iss` igual a la URL del user pool; `token_use = access`;
// - `client_id` dentro de la lista permitida (cliente `extension`);
// - `sub` presente: solo se aceptan tokens de una persona (SE), nunca de máquina;
// - `exp` vigente con 60 s de tolerancia de reloj (no se valida `aud`: los
//   tokens de acceso de Cognito no lo traen).
// Caché del JWKS: refresco cada hora; un refresco fallido conserva las claves
// anteriores sin límite de tiempo. `kid` desconocido: un refresco forzado como
// máximo cada 5 minutos por instancia.

import { decodeProtectedHeader, importJWK, jwtVerify } from "jose";

const BEARER = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/;

const DENIED = Object.freeze({ ok: false });

export function createAuthFilter({
  jwks,
  issuer,
  allowedClientIds,
  clock,
  refreshMs = 3_600_000,
  unknownKidMinIntervalMs = 300_000,
  clockToleranceSec = 60,
  onRefreshFailed = () => {},
}) {
  let keys = new Map();
  let lastRefreshAttempt = Number.NEGATIVE_INFINITY;
  let lastForcedRefresh = Number.NEGATIVE_INFINITY;
  let inFlight = null;
  const allowed = new Set(allowedClientIds);

  async function doRefresh() {
    lastRefreshAttempt = clock.now();
    try {
      const list = await jwks.fetchKeys();
      const next = new Map();
      for (const jwk of list) next.set(jwk.kid, await importJWK(jwk, "RS256"));
      keys = next;
      return true;
    } catch {
      // Se conservan las claves anteriores (emisor caído: los tokens ya emitidos
      // siguen válidos hasta su exp).
      onRefreshFailed();
      return false;
    }
  }

  // Un solo refresco en vuelo a la vez.
  function refresh() {
    if (!inFlight) inFlight = doRefresh().finally(() => (inFlight = null));
    return inFlight;
  }

  async function resolveKey(kid) {
    if (clock.now() - lastRefreshAttempt >= refreshMs) await refresh();
    let key = keys.get(kid);
    if (!key && clock.now() - lastForcedRefresh >= unknownKidMinIntervalMs) {
      lastForcedRefresh = clock.now();
      await refresh();
      key = keys.get(kid);
    }
    return key;
  }

  return {
    // Carga inicial del JWKS (arranque de la instancia).
    init: () => refresh(),

    hasKeys: () => keys.size > 0,

    // Devuelve { ok: true, principal: { sub, clientId } } o { ok: false }.
    async authenticate(authorizationHeader) {
      const match = typeof authorizationHeader === "string" && BEARER.exec(authorizationHeader);
      if (!match) return DENIED;
      const token = match[1];
      let header;
      try {
        header = decodeProtectedHeader(token);
      } catch {
        return DENIED;
      }
      if (header.alg !== "RS256" || typeof header.kid !== "string") return DENIED;
      const key = await resolveKey(header.kid);
      if (!key) return DENIED;
      let payload;
      try {
        ({ payload } = await jwtVerify(token, key, {
          issuer,
          algorithms: ["RS256"],
          clockTolerance: clockToleranceSec,
          currentDate: new Date(clock.now()),
          requiredClaims: ["exp"],
        }));
      } catch {
        return DENIED;
      }
      if (payload.token_use !== "access") return DENIED;
      if (typeof payload.client_id !== "string" || !allowed.has(payload.client_id)) return DENIED;
      if (typeof payload.sub !== "string" || payload.sub === "") return DENIED;
      return { ok: true, principal: { sub: payload.sub, clientId: payload.client_id } };
    },
  };
}
