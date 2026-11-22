// lib/panel/session-rule.js — Regla de los 15 minutos antes de la revisión previa (NFR5.5).
// Dueño: U6. Zona A. El panel nunca ve el token: solo la respuesta de
// BRAIN_SESSION { authenticated, expiresAt }, con expiresAt en milisegundos
// desde la época Unix (como Date.now()).

export const LOGIN_MARGIN_MS = 15 * 60 * 1000;

// Verdadero si hay que iniciar sesión antes de llamar al cerebro: sin respuesta,
// respuesta con error, no autenticado, sin expiresAt o con menos de 15 minutos.
export function needsLogin(session, now) {
  if (session === null || typeof session !== "object") return true;
  if (session.error !== undefined || session.authenticated !== true) return true;
  if (!Number.isFinite(session.expiresAt) || !Number.isFinite(now)) return true;
  return session.expiresAt - now < LOGIN_MARGIN_MS;
}
