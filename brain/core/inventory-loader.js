// brain/core/inventory-loader.js — Carga y recarga del inventario en la instancia
// (NFR1.6, NFR1.8, NFR8.7; reliability-design.md "Activación y recarga"):
// - al arrancar intenta `active` y, si falla, `previous`; sin ninguna versión
//   buena reintenta cada 30 s y el servicio responde inventory_unavailable;
// - cada 5 minutos lee el puntero; si cambió, descarga, verifica el SHA-256 y
//   parsea en un hilo de trabajo (parse inyectado); solo si todo pasa cambia la
//   referencia en un único paso;
// - si la recarga falla conserva la última versión buena y emite
//   InventoryReloadFailed; en cada lectura del puntero emite InventoryAgeDays.

import { indexInventory, snapshotAgeDays } from "./inventory-model.js";

export function createInventoryLoader({
  store,
  parse,
  clock,
  config,
  emitMetric = () => {},
  timers = { setTimeout, clearTimeout },
}) {
  const { reloadMs, startupRetryMs, staleAfterDays } = config;
  let current = null; // { snapshot, index, sha256 }
  let timer = null;
  let stopped = false;
  const readyWaiters = new Set();

  async function loadVersion(ref) {
    const text = await store.readVersion(ref.version, ref.sha256);
    const snapshot = await parse(text);
    return { snapshot, index: indexInventory(snapshot), sha256: ref.sha256 };
  }

  function activate(loaded) {
    current = loaded; // cambio de referencia en un único paso
    for (const resolve of readyWaiters) resolve(true);
    readyWaiters.clear();
  }

  function emitAge() {
    if (current) emitMetric("InventoryAgeDays", snapshotAgeDays(current.snapshot, clock.now()));
  }

  // Carga inicial: active y, si falla, previous. Devuelve true si quedó una versión.
  async function loadInitial() {
    let pointer;
    try {
      pointer = await store.readPointer();
    } catch {
      return false;
    }
    if (!pointer) return false;
    for (const ref of [pointer, pointer.previous]) {
      if (!ref?.version || !ref?.sha256) continue;
      try {
        activate(await loadVersion(ref));
        return true;
      } catch {
        emitMetric("InventoryReloadFailed", 1);
      }
    }
    return false;
  }

  async function reload() {
    let pointer;
    try {
      pointer = await store.readPointer();
    } catch {
      emitMetric("InventoryReloadFailed", 1);
      return false;
    }
    emitAge();
    if (!pointer || pointer.sha256 === current?.sha256) return false;
    try {
      activate(await loadVersion(pointer));
      emitAge();
      return true;
    } catch {
      emitMetric("InventoryReloadFailed", 1); // se conserva la última versión buena
      return false;
    }
  }

  function schedule(fn, ms) {
    if (stopped) return;
    timer = timers.setTimeout(fn, ms);
  }

  async function startupCycle() {
    if (await loadInitial()) {
      emitAge();
      schedule(reloadCycle, reloadMs);
    } else {
      schedule(startupCycle, startupRetryMs);
    }
  }

  async function reloadCycle() {
    await reload();
    schedule(reloadCycle, reloadMs);
  }

  return {
    start() {
      stopped = false;
      return startupCycle();
    },

    stop() {
      stopped = true;
      if (timer) timers.clearTimeout(timer);
      for (const resolve of readyWaiters) resolve(false);
      readyWaiters.clear();
    },

    loadInitial,
    reload,

    // Espera a que haya una versión cargada, como máximo `ms` (tope de arranque de 4 s).
    waitReady(ms) {
      if (current) return Promise.resolve(true);
      return new Promise((resolve) => {
        const done = (value) => {
          timers.clearTimeout(t);
          readyWaiters.delete(done);
          resolve(value);
        };
        const t = timers.setTimeout(() => done(false), Math.max(0, ms));
        readyWaiters.add(done);
      });
    },

    // Índice de la versión activa, o null si la instancia no tiene ninguna.
    getInventory: () => current?.index ?? null,

    health() {
      if (!current) return { ready: false };
      const ageDays = snapshotAgeDays(current.snapshot, clock.now());
      return {
        ready: true,
        version: current.snapshot.version,
        ageDays,
        stale: ageDays > staleAfterDays,
      };
    },
  };
}
