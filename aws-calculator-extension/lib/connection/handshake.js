// lib/connection/handshake.js — W2: reutilizar/abrir la pestaña, PING, inyectar y reintentar
// (US1.0; BR2.1-BR2.5, BR4.10, NFR8.4).
// PROVISIONAL (U1, walking skeleton). Dueño final: U1.
// La API de Chrome se inyecta (chromeApi) para probarla con un doble.
// Devuelve un TabConnection; nunca lanza.

import { makePing } from "../messages.js";
import { sleep } from "../rpa/wait.js";

export const CALCULATOR_URL_PATTERN = "https://calculator.aws/*";
export const CALCULATOR_START_URL = "https://calculator.aws/#/estimate";
export const MAX_PING_ATTEMPTS = 4;
export const PING_INTERVAL_MS = 1000;
export const TAB_LOAD_TIMEOUT_MS = 20000;
export const CONTENT_SCRIPT_FILE = "content.js";

// Espera a que la pestaña termine de cargar, como máximo 20 s (BR2.2, BR4.10).
export function waitForTabComplete(chromeApi, tabId, { timeoutMs = TAB_LOAD_TIMEOUT_MS } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (loaded) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      chromeApi.tabs.onUpdated.removeListener(listener);
      resolve(loaded);
    };
    const listener = (updatedTabId, info) => {
      if (updatedTabId === tabId && info?.status === "complete") finish(true);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    chromeApi.tabs.onUpdated.addListener(listener);
    chromeApi.tabs.get(tabId).then(
      (tab) => {
        if (tab?.status === "complete") finish(true);
      },
      () => finish(false),
    );
  });
}

// PING sin respuesta (no hay receptor) → null; nunca lanza.
async function sendPing(chromeApi, tabId) {
  try {
    const response = await chromeApi.tabs.sendMessage(tabId, makePing());
    return response && typeof response === "object" ? response : null;
  } catch {
    return null;
  }
}

async function findOrOpenTab(chromeApi) {
  const tabs = await chromeApi.tabs.query({ url: CALCULATOR_URL_PATTERN });
  if (tabs.length > 0) {
    await chromeApi.tabs.update(tabs[0].id, { active: true });
    return { tabId: tabs[0].id, origin: "reused" };
  }
  const tab = await chromeApi.tabs.create({ url: CALCULATOR_START_URL, active: true });
  const loaded = await waitForTabComplete(chromeApi, tab.id);
  return { tabId: tab.id, origin: "opened", loaded };
}

function unreachable(connection, failure) {
  return { ...connection, status: "unreachable", failure };
}

export async function connectToCalculator({ chromeApi, sleepFn = sleep }) {
  let target;
  try {
    target = await findOrOpenTab(chromeApi);
  } catch (error) {
    return {
      tabId: null,
      origin: "opened",
      injected: false,
      pingAttempts: 0,
      status: "unreachable",
      failure: "open_failed",
      error: String(error?.message ?? error),
    };
  }
  const connection = {
    tabId: target.tabId,
    origin: target.origin,
    injected: false,
    pingAttempts: 0,
  };
  if (target.loaded === false) return unreachable(connection, "tab_load_timeout");

  let lastFailure = "no_response";
  while (connection.pingAttempts < MAX_PING_ATTEMPTS) {
    if (connection.pingAttempts > 0) await sleepFn(PING_INTERVAL_MS);
    connection.pingAttempts += 1;
    const response = await sendPing(chromeApi, connection.tabId);
    if (response?.ready === true) return { ...connection, status: "connected" };
    if (response?.ok === false) return unreachable(connection, "module_load_failed");
    if (response) {
      lastFailure = "not_ready";
      continue;
    }
    lastFailure = "no_response";
    if (!connection.injected) {
      try {
        await chromeApi.scripting.executeScript({
          target: { tabId: connection.tabId },
          files: [CONTENT_SCRIPT_FILE],
        });
        connection.injected = true;
      } catch (error) {
        return {
          ...unreachable(connection, "inject_failed"),
          error: String(error?.message ?? error),
        };
      }
    }
  }
  return unreachable(connection, lastFailure);
}
