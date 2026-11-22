// sw/dispatch.js — Despacho de los mensajes del borde (NFR5.2, NFR5.3, NFR5.5, NFR5.6 g).
// No usa chrome directamente: recibe sus dependencias para poder probarlo.
// handle(message, sender) devuelve la respuesta para sendResponse, o null cuando
// el mensaje se ignora (remitente ajeno, mensaje que no es del borde) o cuando la
// llamada fue cancelada por su dueño (la respuesta tardía se descarta).
// El service worker no escribe almacenamiento persistente: devuelve requestId,
// code y attempts para que el llamador los registre en su corrida (decisión 4).

import { BRAIN_MESSAGE_TYPES, makeEdgeError } from "./messages.js";
import { authorize } from "./router.js";
import { ownerKeyOf } from "./call-registry.js";

function rejection(message, reason) {
  const error = makeEdgeError("bad_request");
  if (message.type === BRAIN_MESSAGE_TYPES.CALL || message.type === BRAIN_MESSAGE_TYPES.CANCEL) {
    return { callId: message.callId, ok: false, error, attempts: 0, reason };
  }
  return { ok: false, error, reason };
}

export function createDispatcher({ extensionId, session, registry, callBrain, logger = console }) {
  async function handleCall(message, sender) {
    const registration = registry.register(message.callId, ownerKeyOf(sender));
    if (!registration.ok) return rejection(message, "duplicate_or_invalid_call");
    const { signal } = registration.controller;
    let result;
    try {
      result = await callBrain({ operation: message.operation, body: message.body, signal });
    } catch (error) {
      logger.warn("[aws-calc] dispatch", "Falla inesperada del cliente:", error?.message);
      result = { ok: false, error: makeEdgeError("internal_error"), attempts: 0 };
    } finally {
      registry.release(message.callId);
    }
    if (result.cancelled || signal.aborted) return null;
    const reply = { callId: message.callId, ok: result.ok, attempts: result.attempts ?? 0 };
    if (result.ok) reply.value = result.value;
    else reply.error = result.error;
    return reply;
  }

  function handleCancel(message, sender) {
    const cancelled = registry.cancel(message.callId, ownerKeyOf(sender));
    return { callId: message.callId, ok: true, cancelled };
  }

  async function handle(message, sender) {
    const decision = authorize(sender, message, { extensionId });
    if (decision.ignore) return null;
    if (!decision.ok) return rejection(message, decision.reason);
    switch (message.type) {
      case BRAIN_MESSAGE_TYPES.CALL:
        return handleCall(message, sender);
      case BRAIN_MESSAGE_TYPES.CANCEL:
        return handleCancel(message, sender);
      case BRAIN_MESSAGE_TYPES.LOGIN:
        return session.login();
      default:
        return session.getStatus();
    }
  }

  return { handle };
}
