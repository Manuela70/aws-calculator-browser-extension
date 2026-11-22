// Doble de chrome.storage.local en memoria (get, set, remove) con registro de
// operaciones y modo "fallan las próximas N escrituras".

export function createFakeStorage(initial = {}) {
  const data = new Map(Object.entries(structuredClone(initial)));
  const operations = [];
  let failNextWrites = 0;
  let pendingWrite = null;

  function keysOf(query) {
    if (query === null || query === undefined) return [...data.keys()];
    return Array.isArray(query) ? query : [query];
  }

  function maybeFail(kind) {
    if (failNextWrites > 0) {
      failNextWrites -= 1;
      operations.push({ kind, failed: true });
      throw new Error("almacenamiento no disponible");
    }
  }

  return {
    operations,
    data,
    failNextWrites(count = 1) {
      failNextWrites = count;
    },
    // Deja la próxima escritura colgada hasta que el test la libere.
    holdNextWrite() {
      let release;
      pendingWrite = new Promise((resolve) => {
        release = resolve;
      });
      return () => release();
    },
    async get(query) {
      const out = {};
      for (const key of keysOf(query)) {
        if (data.has(key)) out[key] = structuredClone(data.get(key));
      }
      return out;
    },
    async set(items) {
      if (pendingWrite) {
        const wait = pendingWrite;
        pendingWrite = null;
        await wait;
      }
      maybeFail("set");
      for (const [key, value] of Object.entries(items)) {
        data.set(key, structuredClone(value));
        operations.push({ kind: "set", key });
      }
    },
    async remove(query) {
      maybeFail("remove");
      for (const key of keysOf(query)) {
        data.delete(key);
        operations.push({ kind: "remove", key });
      }
    },
  };
}

export function createSilentConsole() {
  const calls = [];
  const record =
    (level) =>
    (...args) =>
      calls.push({ level, args });
  return {
    calls,
    log: record("log"),
    info: record("info"),
    warn: record("warn"),
    error: record("error"),
    debug: record("debug"),
  };
}
