// sw/call-registry.js — callId → { controller, ownerKey } para cancelar por dueño (NFR5.6 g).
// ownerKey identifica al remitente: tab:<tabId>:<frameId> para el content script y
// doc:<documentId> para páginas de la extensión. Un BRAIN_CANCEL de otro dueño se
// ignora y un callId repetido se rechaza.

const MAX_CALL_ID_LENGTH = 128;

export function ownerKeyOf(sender) {
  if (!sender || typeof sender !== "object") return null;
  if (sender.tab && Number.isInteger(sender.tab.id)) {
    const frameId = Number.isInteger(sender.frameId) ? sender.frameId : 0;
    return `tab:${sender.tab.id}:${frameId}`;
  }
  if (typeof sender.documentId === "string" && sender.documentId.length > 0) {
    return `doc:${sender.documentId}`;
  }
  return null;
}

export function isValidCallId(callId) {
  return typeof callId === "string" && callId.length > 0 && callId.length <= MAX_CALL_ID_LENGTH;
}

export function createCallRegistry() {
  const calls = new Map();

  function register(callId, ownerKey) {
    if (!isValidCallId(callId) || typeof ownerKey !== "string") {
      return { ok: false, code: "bad_request" };
    }
    if (calls.has(callId)) return { ok: false, code: "bad_request" };
    const controller = new AbortController();
    calls.set(callId, { controller, ownerKey });
    return { ok: true, controller };
  }

  // Devuelve true solo si el dueño coincide y la llamada seguía en curso.
  function cancel(callId, ownerKey) {
    const entry = calls.get(callId);
    if (!entry || entry.ownerKey !== ownerKey) return false;
    entry.controller.abort();
    return true;
  }

  function release(callId) {
    calls.delete(callId);
  }

  return { register, cancel, release, size: () => calls.size, has: (callId) => calls.has(callId) };
}
