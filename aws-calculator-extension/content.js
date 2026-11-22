// content.js — Cargador clásico y delgado del content script (v7, walking skeleton U1).
// PROVISIONAL (U1). Dueño final: U5.
// Los content scripts del manifest no pueden ser módulos ES: este archivo solo
// pone la guardia de carga única, registra el ÚNICO listener de mensajes,
// responde PING con { ok, ready } y carga lib/content-main.js con import()
// (BR2.5, NFR5.5). Toda la lógica de la corrida vive en lib/**.
// El v6 (callN8N, prepareForm, mapFields, PROGRESS_TEXT, DOM_FIELDS y el host
// n8n) se retiró; sus helpers de DOM útiles están en lib/dom/dom-resolver.js.

(() => {
  const LOADER_KEY = "__awsCalcRpaLoader";
  const MODULE_PATH = "lib/content-main.js";
  const PREFIX = "[aws-calc] loader";

  // Guardia de carga única: si ya hay un cargador vivo en esta pestaña, no se
  // duplica el listener. Un cargador huérfano (extensión recargada) ya no tiene
  // runtime válido y se reemplaza.
  const existing = globalThis[LOADER_KEY];
  if (existing && typeof existing.isAlive === "function" && existing.isAlive()) return;

  let state = "loading"; // loading | ready | failed
  let main = null;

  globalThis[LOADER_KEY] = {
    isAlive: () => {
      try {
        return Boolean(chrome.runtime?.id);
      } catch {
        return false;
      }
    },
  };

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message.type !== "string") return false;
    if (!sender || sender.id !== chrome.runtime.id) {
      console.warn(PREFIX, "Mensaje de otro remitente ignorado");
      return false;
    }
    if (message.type === "PING") {
      sendResponse({ ok: state !== "failed", ready: state === "ready" });
      return false;
    }
    if (message.type === "RUN_RPA") {
      if (state !== "ready") {
        sendResponse({ accepted: false, reason: "not_ready" });
        return false;
      }
      const response = main.handleMessage(message, sender);
      if (response) sendResponse(response);
      return false;
    }
    return false;
  });

  import(chrome.runtime.getURL(MODULE_PATH))
    .then((module) => {
      main = module.init();
      state = "ready";
    })
    .catch((error) => {
      // Sin reintento: la guardia impide reinyectar; el panel pide recargar la
      // pestaña de calculator.aws (NFR8.13).
      state = "failed";
      console.error(PREFIX, "No se pudo cargar", MODULE_PATH, error);
    });
})();
