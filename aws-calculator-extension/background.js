// background.js — Service worker (módulo, MV3). Dueño: U7 (U6 para el panel).
// - El icono de la extensión abre el panel lateral.
// - storage.session solo para contextos confiables: el content script nunca lee el token (NFR5.2).
// - Único oyente de mensajes del borde del cerebro: descarta remitentes ajenos antes de
//   todo, ignora los mensajes que no son del borde (PROGRESS, RUN_RESULT van al panel)
//   y despacha BRAIN_CALL, BRAIN_CANCEL, BRAIN_LOGIN y BRAIN_SESSION (NFR5.3, NFR5.5).
// La lógica vive en sw/**; este archivo solo cablea las APIs de chrome.

import * as config from "./sw/config.js";
import { createKeepalive } from "./sw/keepalive.js";
import { createSession } from "./sw/session.js";
import { createAuthFlow } from "./sw/auth-flow.js";
import { callBrain } from "./sw/brain-client.js";
import { createCallRegistry } from "./sw/call-registry.js";
import { createDispatcher } from "./sw/dispatch.js";
import { isBrainMessage } from "./sw/router.js";
import { BRAIN_MESSAGE_TYPES, makeEdgeError } from "./sw/messages.js";

const PREFIX = "[aws-calc] background";

function enableSidePanelOnActionClick() {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error(PREFIX, "setPanelBehavior falló", error));
}

function restrictSessionStorage() {
  chrome.storage.session
    .setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" })
    .catch((error) => console.error(PREFIX, "setAccessLevel falló", error));
}

function onLifecycle() {
  enableSidePanelOnActionClick();
  restrictSessionStorage();
}

const keepalive = createKeepalive({ ping: () => chrome.runtime.getPlatformInfo() });
const authFlow = createAuthFlow({ identity: chrome.identity, config });
const session = createSession({
  storage: chrome.storage.session,
  startLogin: () => authFlow.login(),
  keepalive,
});
const dispatcher = createDispatcher({
  extensionId: chrome.runtime.id,
  session,
  registry: createCallRegistry(),
  callBrain: (request) => callBrain(request, { config, session, keepalive }),
});

function fallbackReply(message) {
  const error = makeEdgeError("internal_error");
  if (message.type === BRAIN_MESSAGE_TYPES.SESSION)
    return { authenticated: false, expiresAt: null };
  if (message.type === BRAIN_MESSAGE_TYPES.LOGIN) return { ok: false, error };
  return { callId: message.callId, ok: false, error, attempts: 0 };
}

chrome.runtime.onInstalled.addListener(onLifecycle);
chrome.runtime.onStartup.addListener(onLifecycle);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!sender || sender.id !== chrome.runtime.id) return false;
  if (!isBrainMessage(message)) return false;
  dispatcher.handle(message, sender).then(
    (reply) => sendResponse(reply ?? undefined),
    (error) => {
      console.warn(PREFIX, "Falla al despachar", message.type, error?.message);
      sendResponse(fallbackReply(message));
    },
  );
  return true;
});
