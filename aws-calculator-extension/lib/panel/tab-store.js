// lib/panel/tab-store.js — Texto de las pestañas en chrome.storage.session (BR1.2, NFR5.4).
// Dueño: U6. Zona B. Único módulo del panel que toca chrome.storage.session, y
// solo con claves de prefijo "panel:": nunca lee ni escribe la sesión del
// cerebro ni ninguna otra clave. Escribe 500 ms después de la última tecla y
// vacía lo pendiente al perder el foco y en pagehide. Nunca lanza.

import { systemClock } from "./timers.js";

export const TAB_KEY_PREFIX = "panel:";
export const TAB_KEYS = Object.freeze({
  json: `${TAB_KEY_PREFIX}text:json`,
  natural_language: `${TAB_KEY_PREFIX}text:natural_language`,
  activeTab: `${TAB_KEY_PREFIX}activeTab`,
});
export const SAVE_DELAY_MS = 500;

const OWN_KEYS = Object.freeze(Object.values(TAB_KEYS));

export function createTabStore({
  storage = globalThis.chrome?.storage?.session,
  clock = systemClock,
  delayMs = SAVE_DELAY_MS,
  onError = (...args) => console.warn("[aws-calc] panel tabs", ...args),
} = {}) {
  const pending = new Map();
  let timer = null;

  // Lee solo las claves propias; un fallo devuelve los textos vacíos.
  async function load() {
    try {
      const stored = (await storage.get([...OWN_KEYS])) ?? {};
      const text = (key) => (typeof stored[key] === "string" ? stored[key] : "");
      return {
        texts: { json: text(TAB_KEYS.json), natural_language: text(TAB_KEYS.natural_language) },
        activeTab:
          typeof stored[TAB_KEYS.activeTab] === "string" ? stored[TAB_KEYS.activeTab] : null,
      };
    } catch (error) {
      onError("No pude leer el texto guardado:", error?.message);
      return { texts: { json: "", natural_language: "" }, activeTab: null };
    }
  }

  async function flush() {
    if (timer !== null) clock.clearTimeout(timer);
    timer = null;
    if (pending.size === 0) return;
    const items = Object.fromEntries(pending);
    pending.clear();
    try {
      await storage.set(items);
    } catch (error) {
      onError("No pude guardar el texto:", error?.message);
    }
  }

  function schedule(key, value) {
    if (!OWN_KEYS.includes(key)) return;
    pending.set(key, value);
    if (timer !== null) clock.clearTimeout(timer);
    timer = clock.setTimeout(() => {
      timer = null;
      flush();
    }, delayMs);
  }

  function saveText(tab, text) {
    if (typeof text === "string") schedule(TAB_KEYS[tab] ?? "", text);
  }

  function saveActiveTab(tab) {
    if (typeof tab === "string") schedule(TAB_KEYS.activeTab, tab);
  }

  // Vacía lo pendiente en los eventos indicados (blur del área, pagehide de la ventana).
  function bindFlush(target, events) {
    for (const name of events) target.addEventListener(name, () => flush());
  }

  return { load, saveText, saveActiveTab, flush, bindFlush, hasPending: () => pending.size > 0 };
}
