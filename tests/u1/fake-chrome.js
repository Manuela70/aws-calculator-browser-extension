// Doble mínimo de la API de Chrome para el handshake y content-main. Un objeto
// nuevo por test; sin globales compartidas.

import { createFakeStorage } from "./fake-storage.js";

export function createFakeChrome({ tabs = [], pingResponses = [], extensionId = "ext-123" } = {}) {
  const listeners = new Set();
  const sent = [];
  const executed = [];
  const responses = [...pingResponses];
  let nextTabId = 100;
  let createdTabStatus = "loading";
  let injectError = null;

  const chromeApi = {
    sent,
    executed,
    tabsList: tabs.map((t) => ({ ...t })),
    setCreatedTabStatus(status) {
      createdTabStatus = status;
    },
    failInjection(error) {
      injectError = error;
    },
    fireTabUpdated(tabId, info) {
      for (const listener of [...listeners]) listener(tabId, info);
    },
    tabs: {
      async query() {
        return chromeApi.tabsList;
      },
      async update(tabId, props) {
        return { id: tabId, ...props };
      },
      async create({ url }) {
        const tab = { id: nextTabId++, url, status: createdTabStatus };
        chromeApi.tabsList.push(tab);
        return tab;
      },
      async get(tabId) {
        const tab = chromeApi.tabsList.find((t) => t.id === tabId);
        if (!tab) throw new Error("No tab");
        return tab;
      },
      // Cada respuesta programada: objeto → respuesta, null → sin receptor.
      async sendMessage(tabId, message) {
        sent.push({ tabId, message });
        const next = responses.length > 0 ? responses.shift() : null;
        if (next === null)
          throw new Error("Could not establish connection. Receiving end does not exist.");
        return next;
      },
      onUpdated: {
        addListener: (fn) => listeners.add(fn),
        removeListener: (fn) => listeners.delete(fn),
      },
    },
    scripting: {
      async executeScript(details) {
        executed.push(details);
        if (injectError) throw injectError;
        return [];
      },
    },
    runtime: {
      id: extensionId,
      messages: [],
      async sendMessage(message) {
        chromeApi.runtime.messages.push(message);
      },
    },
    storage: { local: createFakeStorage() },
  };
  return chromeApi;
}
