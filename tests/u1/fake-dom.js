// Doble programable del resolvedor del DOM (mismas funciones que
// lib/dom/dom-resolver.js). La Zona B real no se prueba con DOM emulado: este
// doble solo ejercita el borde orquestador ↔ resolvedor.

import { makeDomFields } from "./fixtures.js";

export function createFakeDom(overrides = {}) {
  const calls = [];
  const state = {
    estimateServices: [],
    savedServices: [],
    domFields: makeDomFields(),
    shareUrl: "https://calculator.aws/#/estimate?id=abc123",
  };
  const record = (name, ...args) => calls.push({ name, args });

  const dom = {
    calls,
    state,
    async openEstimate() {
      record("openEstimate");
      return { ok: true };
    },
    async listEstimateServices() {
      record("listEstimateServices");
      return { ok: true, value: [...state.estimateServices] };
    },
    async startService(searchTerm) {
      record("startService", searchTerm);
      return { ok: true };
    },
    async setRegion(displayName) {
      record("setRegion", displayName);
      return { ok: true };
    },
    async applyToggle(toggle) {
      record("applyToggle", toggle.label);
      return { ok: true };
    },
    async expandSections() {
      record("expandSections");
      return { ok: true, value: 0 };
    },
    async scanForm() {
      record("scanForm");
      return { ok: true, value: state.domFields };
    },
    async applyAction(action) {
      record("applyAction", action.fieldLabel);
      return { ok: true };
    },
    async saveService(serviceName) {
      record("saveService", serviceName);
      state.estimateServices.push(serviceName);
      return { ok: true };
    },
    async returnToEstimate() {
      record("returnToEstimate");
      return { ok: true };
    },
    async renameEstimate(name) {
      record("renameEstimate", name);
      return { ok: true };
    },
    async shareEstimate() {
      record("shareEstimate");
      return { ok: true, value: state.shareUrl };
    },
  };
  return Object.assign(dom, overrides);
}
