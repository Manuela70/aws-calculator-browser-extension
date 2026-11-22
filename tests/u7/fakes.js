// Dobles de U7: chrome.storage.session, chrome.identity, fetch, keepalive, reloj
// y remitentes. Un objeto nuevo por prueba; nada global compartido.

export const EXTENSION_ID = "abcdefghijklmnopabcdefghijklmnop";
export const BRAIN_URL = "https://brain.example.test"; // valor ficticio de prueba
export const COGNITO_URL = "https://login.auth.us-east-1.amazoncognito.com"; // ficticio

export const TEST_CONFIG = Object.freeze({
  BRAIN_BASE_URL: BRAIN_URL,
  COGNITO_DOMAIN: COGNITO_URL,
  CLIENT_ID: "fakeclientid123",
  OAUTH_SCOPES: ["openid", "email"],
});

export const NULL_CONFIG = Object.freeze({
  BRAIN_BASE_URL: null,
  COGNITO_DOMAIN: null,
  CLIENT_ID: null,
  OAUTH_SCOPES: ["openid", "email"],
});

// chrome.storage.session en memoria (get, set, remove, setAccessLevel).
export function createSessionStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  const accessLevels = [];
  return {
    data,
    accessLevels,
    async get(key) {
      return data.has(key) ? { [key]: structuredClone(data.get(key)) } : {};
    },
    async set(items) {
      for (const [key, value] of Object.entries(items)) data.set(key, structuredClone(value));
    },
    async remove(key) {
      data.delete(key);
    },
    async setAccessLevel(options) {
      accessLevels.push(options);
    },
  };
}

// Keepalive de prueba que solo cuenta adquisiciones.
export function createCountingKeepalive() {
  let active = 0;
  let maxActive = 0;
  return {
    get active() {
      return active;
    },
    get maxActive() {
      return maxActive;
    },
    async run(fn) {
      active += 1;
      maxActive = Math.max(maxActive, active);
      try {
        return await fn();
      } finally {
        active -= 1;
      }
    },
  };
}

// Respuesta mínima con la forma de Response que usa el cliente.
export function makeResponse(status, body, { requestId = null, raw = false } = {}) {
  const text = raw ? body : JSON.stringify(body);
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name) => (name.toLowerCase() === "x-request-id" ? requestId : null) },
    text: async () => text,
    json: async () => JSON.parse(text),
  };
}

// fetch falso: cada elemento de la cola es una Response, un Error para rechazar,
// o "hang" para colgar hasta que la señal aborte. Registra cada llamada.
export function createFakeFetch(queue = []) {
  const calls = [];
  const pending = [...queue];
  const fetchFn = (url, init = {}) => {
    calls.push({ url, init });
    const next = pending.length > 0 ? pending.shift() : "hang";
    if (next instanceof Error) return Promise.reject(next);
    if (next === "hang") {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () =>
          reject(new DOMException("abort", "AbortError")),
        );
      });
    }
    return Promise.resolve(next);
  };
  fetchFn.calls = calls;
  return fetchFn;
}

// Sesión falsa para el cliente del cerebro.
export function createFakeSession({ token = "token-de-prueba" } = {}) {
  let current = token;
  return {
    cleared: 0,
    async getValidToken() {
      return current;
    },
    async clear() {
      this.cleared += 1;
      current = null;
    },
  };
}

export function silentLogger() {
  const warnings = [];
  return { warnings, warn: (...args) => warnings.push(args), debug: () => {} };
}

export const contentScriptSender = (overrides = {}) => ({
  id: EXTENSION_ID,
  tab: { id: 7 },
  frameId: 0,
  url: "https://calculator.aws/#/estimate",
  ...overrides,
});

export const panelSender = (overrides = {}) => ({
  id: EXTENSION_ID,
  url: `chrome-extension://${EXTENSION_ID}/sidepanel.html`,
  documentId: "doc-panel-1",
  ...overrides,
});
