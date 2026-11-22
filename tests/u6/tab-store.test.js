// tab-store.js: texto de las pestañas en storage.session con prefijo panel: (BR1.2, NFR5.4).
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  SAVE_DELAY_MS,
  TAB_KEYS,
  createTabStore,
} from "../../aws-calculator-extension/lib/panel/tab-store.js";
import { createFakeStorage } from "../u1/fake-storage.js";

const SESSION = { "brain:session": { accessToken: "secreto", expiresAt: 1 } };

function makeStore(storage = createFakeStorage(SESSION)) {
  vi.useFakeTimers();
  const clock = {
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (id) => clearTimeout(id),
  };
  return { storage, store: createTabStore({ storage, clock, onError: () => {} }) };
}

afterEach(() => vi.useRealTimers());

describe("tab-store", () => {
  it("escribe 500 ms después de la última tecla, una sola vez", async () => {
    const { storage, store } = makeStore();
    store.saveText("json", "{");
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS - 1);
    store.saveText("json", "{}");
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS - 1);
    expect(storage.data.has(TAB_KEYS.json)).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(storage.data.get(TAB_KEYS.json)).toBe("{}");
    expect(storage.operations.filter((op) => op.kind === "set")).toHaveLength(1);
  });

  it("flush vacía lo pendiente sin esperar (blur y pagehide)", async () => {
    const { storage, store } = makeStore();
    const listeners = {};
    const target = { addEventListener: (name, fn) => (listeners[name] = fn) };
    store.bindFlush(target, ["blur", "pagehide"]);
    store.saveText("natural_language", "dos EC2");
    store.saveActiveTab("natural_language");
    expect(store.hasPending()).toBe(true);
    await listeners.pagehide();
    expect(storage.data.get(TAB_KEYS.natural_language)).toBe("dos EC2");
    expect(storage.data.get(TAB_KEYS.activeTab)).toBe("natural_language");
    expect(store.hasPending()).toBe(false);
    await listeners.blur();
    expect(storage.operations.filter((op) => op.kind === "set")).toHaveLength(2);
  });

  it("solo usa claves con prefijo panel: y no toca brain:session", async () => {
    const { storage, store } = makeStore();
    store.saveText("json", "x");
    store.saveText("brain:session", "robo");
    await store.flush();
    const touched = storage.operations.map((op) => op.key);
    expect(touched.every((key) => key.startsWith("panel:"))).toBe(true);
    expect(storage.data.get("brain:session")).toEqual(SESSION["brain:session"]);
    const loaded = await store.load();
    expect(loaded).toEqual({ texts: { json: "x", natural_language: "" }, activeTab: null });
    expect(JSON.stringify(loaded)).not.toContain("secreto");
  });

  it("un fallo de lectura o escritura no lanza y deja los textos vacíos", async () => {
    const storage = createFakeStorage();
    storage.get = async () => {
      throw new Error("sin acceso");
    };
    const { store } = makeStore(storage);
    expect(await store.load()).toEqual({
      texts: { json: "", natural_language: "" },
      activeTab: null,
    });
    storage.failNextWrites(1);
    store.saveText("json", "y");
    await expect(store.flush()).resolves.toBeUndefined();
  });
});
