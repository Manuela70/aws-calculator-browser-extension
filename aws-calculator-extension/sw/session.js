// sw/session.js — Token de acceso del SE y login único (NFR5.2, NFR5.4, NFR5.6 a-d).
// Guarda { accessToken, expiresAt } bajo una sola clave de chrome.storage.session
// (nivel de acceso TRUSTED_CONTEXTS, fijado en background.js). El token se trata
// como ausente desde 60 s antes de vencer. Solo hay un login en curso: los
// BRAIN_LOGIN concurrentes comparten la misma promesa, y una cancelación la
// resuelve con login_cancelled para todos.

import { makeEdgeError } from "./messages.js";

export const SESSION_KEY = "brain:session";
export const EXPIRY_MARGIN_MS = 60000;

function isValidRecord(record) {
  return (
    record !== null &&
    typeof record === "object" &&
    typeof record.accessToken === "string" &&
    record.accessToken.length > 0 &&
    Number.isFinite(record.expiresAt)
  );
}

export function createSession({
  storage,
  startLogin,
  keepalive,
  now = () => Date.now(),
  onWarn = (...args) => console.warn("[aws-calc] session", ...args),
}) {
  let pendingLogin = null;

  async function readRecord() {
    try {
      const stored = await storage.get(SESSION_KEY);
      const record = stored?.[SESSION_KEY];
      return isValidRecord(record) ? record : null;
    } catch (error) {
      onWarn("No se pudo leer la sesión:", error?.message);
      return null;
    }
  }

  // Devuelve el token si sigue vigente con el margen de 60 s; si no, null.
  async function getValidToken() {
    const record = await readRecord();
    if (!record || now() >= record.expiresAt - EXPIRY_MARGIN_MS) return null;
    return record.accessToken;
  }

  async function getStatus() {
    const record = await readRecord();
    const authenticated = Boolean(record) && now() < record.expiresAt - EXPIRY_MARGIN_MS;
    return { authenticated, expiresAt: authenticated ? record.expiresAt : null };
  }

  async function clear() {
    try {
      await storage.remove(SESSION_KEY);
    } catch (error) {
      onWarn("No se pudo borrar la sesión:", error?.message);
    }
  }

  async function performLogin() {
    let outcome;
    try {
      outcome = await startLogin();
    } catch (error) {
      onWarn("El login falló:", error?.message);
      return { ok: false, error: makeEdgeError("brain_unavailable") };
    }
    if (!outcome?.ok) {
      const code = outcome?.code === "login_cancelled" ? "login_cancelled" : "brain_unavailable";
      return { ok: false, error: makeEdgeError(code) };
    }
    try {
      const record = { accessToken: outcome.accessToken, expiresAt: outcome.expiresAt };
      await storage.set({ [SESSION_KEY]: record });
    } catch (error) {
      onWarn("No se pudo guardar la sesión:", error?.message);
      return { ok: false, error: makeEdgeError("brain_unavailable") };
    }
    return { ok: true, expiresAt: outcome.expiresAt };
  }

  // Login único: mientras uno está en curso, todos reciben la misma promesa.
  function login() {
    if (pendingLogin) return pendingLogin;
    pendingLogin = keepalive.run(performLogin).finally(() => {
      pendingLogin = null;
    });
    return pendingLogin;
  }

  return { getValidToken, getStatus, clear, login, isLoginPending: () => pendingLogin !== null };
}
