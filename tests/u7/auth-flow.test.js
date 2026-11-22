// sw/auth-flow.js: PKCE S256, state verificado, intercambio y validación del token (NFR5.6 d, f).
import { describe, it, expect, vi } from "vitest";
import { webcrypto, createHash } from "node:crypto";
import {
  createAuthFlow,
  createPkcePair,
  base64UrlEncode,
  validateTokenResponse,
  parseRedirect,
} from "../../aws-calculator-extension/sw/auth-flow.js";
import { TEST_CONFIG, NULL_CONFIG, COGNITO_URL, createFakeFetch, makeResponse } from "./fakes.js";

const NOW = 1_800_000_000_000;
const REDIRECT = "https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/";

function fakeIdentity(respond) {
  return {
    requests: [],
    getRedirectURL: () => REDIRECT,
    async launchWebAuthFlow(details) {
      this.requests.push(details);
      return respond(new URL(details.url));
    },
  };
}

// Devuelve el state recibido, como lo haría el proveedor de identidad.
const echoState = (authorizeUrl) =>
  `${REDIRECT}?code=codigo-123&state=${authorizeUrl.searchParams.get("state")}`;

const tokenBody = (extra = {}) => ({
  access_token: "eyJ-ficticio",
  token_type: "Bearer",
  expires_in: 3600,
  ...extra,
});

function setup({
  respond = echoState,
  fetchQueue = [makeResponse(200, tokenBody())],
  config,
} = {}) {
  const identity = fakeIdentity(respond);
  const fetchFn = createFakeFetch(fetchQueue);
  const flow = createAuthFlow({
    identity,
    config: config ?? TEST_CONFIG,
    cryptoApi: webcrypto,
    fetchFn,
    now: () => NOW,
    onWarn: vi.fn(),
  });
  return { identity, fetchFn, flow };
}

describe("sw/auth-flow", () => {
  it("arma la URL de autorización con PKCE S256, state y redirect de chrome.identity", async () => {
    const { identity, flow } = setup();
    await flow.login();
    const [request] = identity.requests;
    expect(request.interactive).toBe(true);
    const url = new URL(request.url);
    expect(url.origin + url.pathname).toBe(`${COGNITO_URL}/oauth2/authorize`);
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      response_type: "code",
      client_id: TEST_CONFIG.CLIENT_ID,
      redirect_uri: REDIRECT,
      scope: "openid email",
      code_challenge_method: "S256",
    });
    expect(url.searchParams.get("state")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(url.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("el challenge es el SHA-256 en base64url del verifier de 64 bytes", async () => {
    const { verifier, challenge } = await createPkcePair(webcrypto);
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{86}$/);
    const expected = createHash("sha256").update(verifier).digest("base64url");
    expect(challenge).toBe(expected);
    expect(base64UrlEncode(new Uint8Array([251, 255]))).toBe("-_8");
  });

  it("intercambia el código por POST form-urlencoded con el verifier y guarda el vencimiento", async () => {
    const { flow, fetchFn, identity } = setup();
    const result = await flow.login();
    expect(result).toEqual({ ok: true, accessToken: "eyJ-ficticio", expiresAt: NOW + 3_600_000 });
    const [{ url, init }] = fetchFn.calls;
    expect(url).toBe(`${COGNITO_URL}/oauth2/token`);
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    const form = new URLSearchParams(init.body);
    expect(form.get("grant_type")).toBe("authorization_code");
    expect(form.get("code")).toBe("codigo-123");
    expect(form.get("redirect_uri")).toBe(REDIRECT);
    const challenge = new URL(identity.requests[0].url).searchParams.get("code_challenge");
    expect(createHash("sha256").update(form.get("code_verifier")).digest("base64url")).toBe(
      challenge,
    );
  });

  it("descarta el refresh_token y el id_token", async () => {
    const { flow } = setup({
      fetchQueue: [makeResponse(200, tokenBody({ refresh_token: "r", id_token: "i" }))],
    });
    const result = await flow.login();
    expect(Object.keys(result).sort()).toEqual(["accessToken", "expiresAt", "ok"]);
    expect(JSON.stringify(result)).not.toContain('"r"');
  });

  it("un state distinto o un error del proveedor es login_cancelled sin intercambio", async () => {
    const wrongState = setup({ respond: () => `${REDIRECT}?code=c&state=otro` });
    expect(await wrongState.flow.login()).toEqual({ ok: false, code: "login_cancelled" });
    expect(wrongState.fetchFn.calls.length).toBe(0);
    expect(parseRedirect(`${REDIRECT}?error=access_denied&state=s`, "s").ok).toBe(false);
    expect(parseRedirect("no es url", "s").ok).toBe(false);
    expect(parseRedirect(`${REDIRECT}?state=s`, "s").ok).toBe(false);
  });

  it("ventana cerrada (launchWebAuthFlow rechaza) es login_cancelled", async () => {
    const { flow, fetchFn } = setup({
      respond: () => {
        throw new Error("The user did not approve access.");
      },
    });
    expect(await flow.login()).toEqual({ ok: false, code: "login_cancelled" });
    expect(fetchFn.calls.length).toBe(0);
  });

  it("token_type o expires_in inválidos no guardan nada y responden brain_unavailable", async () => {
    for (const body of [
      tokenBody({ token_type: "mac" }),
      tokenBody({ expires_in: 0 }),
      tokenBody({ expires_in: "3600" }),
      tokenBody({ access_token: "" }),
    ]) {
      const { flow } = setup({ fetchQueue: [makeResponse(200, body)] });
      expect(await flow.login()).toEqual({ ok: false, code: "brain_unavailable" });
    }
    expect(validateTokenResponse(null, NOW).ok).toBe(false);
    expect(validateTokenResponse(tokenBody({ token_type: "bearer" }), NOW).ok).toBe(true);
  });

  it("endpoint de token caído, 400 o sin configuración → brain_unavailable", async () => {
    const down = setup({ fetchQueue: [new TypeError("Failed to fetch")] });
    expect((await down.flow.login()).code).toBe("brain_unavailable");
    const rejected = setup({ fetchQueue: [makeResponse(400, { error: "invalid_grant" })] });
    expect((await rejected.flow.login()).code).toBe("brain_unavailable");
    const unconfigured = setup({ config: NULL_CONFIG });
    expect(await unconfigured.flow.login()).toEqual({ ok: false, code: "brain_unavailable" });
    expect(unconfigured.identity.requests.length).toBe(0);
  });
});
