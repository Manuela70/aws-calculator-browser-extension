// tests/u4/token-helpers.js — Claves RSA y tokens de acceso de prueba, firmados
// con node:crypto (RS256), con la forma de los tokens de acceso de Cognito.

import { generateKeyPairSync, sign } from "node:crypto";

export const ISSUER = "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_TEST";
export const EXTENSION_CLIENT = "extension-client";
export const PROBE_CLIENT = "probe-client";

export function createKey(kid) {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: "jwk" }), kid, alg: "RS256", use: "sig" };
  return { kid, privateKey, jwk };
}

function b64url(value) {
  return Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString(
    "base64url",
  );
}

// Firma un token; `claims` reemplaza los valores por defecto.
export function signToken(key, claims = {}, nowMs = Date.now()) {
  const nowSec = Math.floor(nowMs / 1000);
  const payload = {
    sub: "se-0001",
    iss: ISSUER,
    token_use: "access",
    client_id: EXTENSION_CLIENT,
    iat: nowSec,
    exp: nowSec + 3600,
    ...claims,
  };
  const header = { alg: "RS256", kid: key.kid, typ: "JWT" };
  const data = `${b64url(header)}.${b64url(payload)}`;
  const signature = sign("sha256", Buffer.from(data), key.privateKey).toString("base64url");
  return `${data}.${signature}`;
}

// JWKS programable: keys() devuelve la lista actual; fail() hace fallar las descargas.
export function fakeJwks(initialKeys) {
  let keys = initialKeys.map((k) => k.jwk);
  let failing = false;
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    setKeys: (list) => {
      keys = list.map((k) => k.jwk);
    },
    fail: (value = true) => {
      failing = value;
    },
    async fetchKeys() {
      calls += 1;
      if (failing) throw new Error("jwks caído");
      return keys;
    },
  };
}
