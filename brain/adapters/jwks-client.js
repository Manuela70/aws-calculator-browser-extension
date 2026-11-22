// brain/adapters/jwks-client.js — Descarga del JWKS público del user pool de
// Cognito (NFR5.2, NFR5.4). Solo claves públicas: no hay secretos en juego.
// AuthFilter decide cuándo refrescar y conserva las claves anteriores si esto falla.

export function jwksUrl(issuer) {
  return `${issuer.replace(/\/$/, "")}/.well-known/jwks.json`;
}

export function createJwksClient({ issuer, fetchImpl = globalThis.fetch, timeoutMs = 2000 }) {
  return {
    async fetchKeys() {
      const response = await fetchImpl(jwksUrl(issuer), {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { accept: "application/json" },
      });
      if (!response.ok) throw new Error(`jwks_http_${response.status}`);
      const body = await response.json();
      if (!Array.isArray(body?.keys)) throw new Error("jwks_invalid");
      return body.keys.filter((key) => typeof key?.kid === "string" && key.kty === "RSA");
    },
  };
}
