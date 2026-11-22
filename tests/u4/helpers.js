// tests/u4/helpers.js — Datos y dobles compartidos por las pruebas del cerebro.
// Cada prueba obtiene copias nuevas: nada mutable compartido entre pruebas.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const FIXTURES = new URL("./fixtures/", import.meta.url);

export function readFixtureText(name) {
  return readFileSync(new URL(name, FIXTURES), "utf8");
}

export function loadFixture(name) {
  return JSON.parse(readFixtureText(name));
}

// Inventario pequeño (5 entradas derivadas del inventario real) y su SHA-256.
export function smallInventory() {
  return loadFixture("inventory-small.json");
}

export function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

// Reloj manual: now() devuelve el tiempo fijado; advance() lo mueve.
export function manualClock(start = Date.parse("2026-11-22T15:00:00.000Z")) {
  let current = start;
  return {
    now: () => current,
    advance: (ms) => {
      current += ms;
    },
    set: (ms) => {
      current = ms;
    },
  };
}

// Registro en memoria: guarda cada línea emitida para inspeccionarla.
export function memoryLogger() {
  const lines = [];
  return {
    lines,
    write: (record) => lines.push(JSON.stringify(record)),
    text: () => lines.join("\n"),
  };
}
