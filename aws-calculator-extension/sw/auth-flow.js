// sw/auth-flow.js — Login con el flujo de código y PKCE S256 del proveedor de identidad
// (NFR5.6 d, f). Cliente público: no hay secreto, solo el clientId de sw/config.js.
// - code_verifier de 64 bytes aleatorios, code_challenge = SHA-256 en base64url.
// - state aleatorio que debe volver igual; si no, login_cancelled y nada se guarda.
// - launchWebAuthFlow interactivo con redirect_uri = chrome.identity.getRedirectURL().
// - Intercambio del código por POST application/x-www-form-urlencoded.
// - Se valida access_token, token_type (Bearer) y expires_in; refresh_token e
//   id_token se descartan sin guardarse.
// Devuelve { ok: true, accessToken, expiresAt } o { ok: false, code }; nunca lanza.

export const VERIFIER_BYTES = 64;
export const STATE_BYTES = 32;

export function base64UrlEncode(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function randomToken(cryptoApi, size) {
  const bytes = new Uint8Array(size);
  cryptoApi.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

export async function createPkcePair(cryptoApi) {
  const verifier = randomToken(cryptoApi, VERIFIER_BYTES);
  const digest = await cryptoApi.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: base64UrlEncode(new Uint8Array(digest)) };
}

export function buildAuthorizeUrl({ domain, clientId, redirectUri, scopes, challenge, state }) {
  const url = new URL("/oauth2/authorize", domain);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", scopes.join(" "));
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("state", state);
  return url.toString();
}

// Extrae el código de la URL de retorno; state distinto, error o sin código → cancelado.
export function parseRedirect(redirectUrl, expectedState) {
  let params;
  try {
    params = new URL(redirectUrl).searchParams;
  } catch {
    return { ok: false, code: "login_cancelled" };
  }
  const code = params.get("code");
  if (params.get("state") !== expectedState || params.has("error") || !code) {
    return { ok: false, code: "login_cancelled" };
  }
  return { ok: true, authorizationCode: code };
}

// Valida la respuesta del endpoint de token; solo conserva el access token y su vencimiento.
export function validateTokenResponse(body, nowMs) {
  if (body === null || typeof body !== "object") return { ok: false };
  const { access_token: accessToken, token_type: tokenType, expires_in: expiresIn } = body;
  if (typeof accessToken !== "string" || accessToken.length === 0) return { ok: false };
  if (typeof tokenType !== "string" || tokenType.toLowerCase() !== "bearer") return { ok: false };
  if (!Number.isInteger(expiresIn) || expiresIn <= 0) return { ok: false };
  return { ok: true, accessToken, expiresAt: nowMs + expiresIn * 1000 };
}

async function exchangeCode({ fetchFn, config, authorizationCode, redirectUri, verifier }) {
  const form = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: config.CLIENT_ID,
    code: authorizationCode,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  });
  const response = await fetchFn(new URL("/oauth2/token", config.COGNITO_DOMAIN).toString(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  if (!response.ok) return null;
  return response.json();
}

export function createAuthFlow({
  identity,
  config,
  cryptoApi = globalThis.crypto,
  fetchFn = (...args) => fetch(...args),
  now = () => Date.now(),
  onWarn = (...args) => console.warn("[aws-calc] auth", ...args),
}) {
  async function authorize(redirectUri) {
    const { verifier, challenge } = await createPkcePair(cryptoApi);
    const state = randomToken(cryptoApi, STATE_BYTES);
    const url = buildAuthorizeUrl({
      domain: config.COGNITO_DOMAIN,
      clientId: config.CLIENT_ID,
      redirectUri,
      scopes: config.OAUTH_SCOPES,
      challenge,
      state,
    });
    try {
      const redirectUrl = await identity.launchWebAuthFlow({ url, interactive: true });
      const parsed = parseRedirect(redirectUrl, state);
      return parsed.ok ? { ...parsed, verifier } : parsed;
    } catch (error) {
      onWarn("Ventana de login cerrada o cancelada:", error?.message);
      return { ok: false, code: "login_cancelled" };
    }
  }

  async function login() {
    if (!config.COGNITO_DOMAIN || !config.CLIENT_ID)
      return { ok: false, code: "brain_unavailable" };
    const redirectUri = identity.getRedirectURL();
    const authorized = await authorize(redirectUri);
    if (!authorized.ok) return authorized;
    try {
      const body = await exchangeCode({ fetchFn, config, redirectUri, ...authorized });
      const token = validateTokenResponse(body, now());
      if (!token.ok) {
        onWarn("Respuesta del endpoint de token inválida o rechazada.");
        return { ok: false, code: "brain_unavailable" };
      }
      return { ok: true, accessToken: token.accessToken, expiresAt: token.expiresAt };
    } catch (error) {
      onWarn("Falló el intercambio del código:", error?.message);
      return { ok: false, code: "brain_unavailable" };
    }
  }

  return { login };
}
