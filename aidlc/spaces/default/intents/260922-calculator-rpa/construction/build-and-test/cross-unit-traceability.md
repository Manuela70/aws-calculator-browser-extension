# Trazabilidad entre unidades — calculator-rpa

**Veredicto: PASS.** `aidlc engine sensor-traceability --stage build-and-test` → `pass: true`, `uncovered: []` (2026-11-22, sobre `main` `9d76f46`).

## Requisitos funcionales

| ID | Cubierto | Por dónde | Unidad y archivo |
|---|---|---|---|
| FR1.1 | Sí | directo | U4 `brain/core/operations.js` |
| FR1.2 | Sí | AC1.1.x, AC3.1.x | U1 orquestador, U2 `lib/input/json-parser.js`, `input-normalizer.js` |
| FR1.3 | Sí | AC2.1.x, AC3.1.x | U2 `lib/input/input-normalizer.js`, `json-parser.js` |
| FR1.4 | Sí | AC2.1.x | U2 `lib/input/input-normalizer.js` |
| FR2.1, FR2.2 | Sí | AC1.0.1-AC1.0.4 | U1 `lib/connection/handshake.js` |
| FR3.1, FR3.2, FR5.1-FR5.3, FR9.2 | Sí | AC4.1.1-AC4.1.5 | U3 `lib/mapping/*`, U5 `lib/rpa/orchestrator.js`, `lib/dom/dom-utils.js` |
| FR3.3, FR6.3-FR6.7 | Sí | AC4.3.x, AC4.4.x | U5 `lib/dom/aria-label.js`, `dom-resolver.js`, `form-scanner.js` |
| FR4.1, FR4.2 | Sí | AC4.2.x | U5 `lib/dom/cascade.js` |
| FR4.3 | Sí | AC4.2.x, AC6.1.x | U5 `cascade.js`, U6 `lib/panel/panel-state.js` |
| FR6.1, FR6.2 | Sí | AC4.3.x | U5 `lib/dom/aria-label.js` |
| FR6.8 | Sí | AC1.1.x | U1 `lib/rpa/orchestrator.js`, `result-aggregator.js` |
| FR7.1-FR7.3 | Sí | AC6.1.x | U5 `result-aggregator.js`, U6 `panel-state.js`, `render/run-view.js` |
| FR8.1 | Sí | directo | U4 `brain/server/app.js` |
| FR8.2 | Sí | directo | U4 `brain/core/prompt-builder.js` |
| FR8.3 | Sí | directo | U4 `brain/core/operations.js` |
| FR8.4 | Sí | directo | U4 `brain/core/output-validators.js` |
| FR8.5 | Sí | directo | U4 `brain/core/inventory-model.js` |
| FR9.1 | Sí | AC4.1.x, AC7.1.x | U3, U5 |
| FR9.3 | Sí | AC1.1.x, AC7.1.x | U1, U5 `result-aggregator.js` |
| FR10 | Sí | AC7.1.x | U5 `result-aggregator.js`, `orchestrator.js` |
| FR11.1, FR11.2 | Sí | AC8.1.x | U5 `lib/dom/spotlight.js`, `dom-resolver.js`, `form-scanner.js` |

## Criterios de aceptación

| ID | Unidad | Archivo |
|---|---|---|
| AC1.0.1-AC1.0.3 | U1 | `lib/connection/handshake.js` |
| AC1.0.4 | U1 | `tests/u1/handshake.test.js` |
| AC1.1.1 | U1 | `lib/rpa/orchestrator.js` |
| AC1.1.2 | U1 | `lib/rpa/result-aggregator.js` |
| AC1.1.3 | U1 | `tests/u1/result-aggregator.test.js` |
| AC2.1.1, AC2.1.2 | U2 | `lib/input/input-normalizer.js` |
| AC2.2.1 | U2 | `lib/input/nl-interpreter.js` |
| AC2.2.2 | U2 | `lib/input/input-errors.js` |
| AC2.2.3 | U2 | `sidepanel.js` |
| AC3.1.1 | U2 | `lib/input/input-normalizer.js` |
| AC3.1.2-AC3.1.4 | U2 | `lib/input/json-parser.js` |
| AC4.1.1, AC4.1.3 | U3, U5 | `lib/mapping/deterministic-mapper.js`, `lib/rpa/orchestrator.js` |
| AC4.1.2 | U5 | `lib/rpa/orchestrator.js` |
| AC4.1.4 | U3, U5 | `lib/mapping/residue-resolver.js`, `lib/dom/dom-utils.js` |
| AC4.1.5 | U3 | `lib/mapping/residue-resolver.js` |
| AC4.2.1, AC4.2.2 | U5 | `lib/dom/cascade.js` |
| AC4.3.1, AC4.3.2 | U5 | `lib/dom/aria-label.js` |
| AC4.4.1, AC4.4.4 | U5 | `lib/dom/dom-resolver.js` |
| AC4.4.2, AC4.4.3 | U5 | `lib/dom/form-scanner.js` |
| AC5.1.1 | U4, U6 | `brain/core/output-validators.js`, `lib/panel/effects.js` |
| AC5.1.2 | U4, U6 | `brain/core/model-gateway.js`, `lib/panel/render/result-view.js` |
| AC5.1.3 | U4, U6 | `brain/core/operations.js`, `lib/messages-es.js` |
| AC5.1.4 | U4, U6 | `brain/core/output-validators.js`, `lib/panel/waf-model.js` |
| AC6.1.1, AC6.2.1 | U5, U6 | `lib/rpa/result-aggregator.js`, `lib/panel/panel-state.js` |
| AC6.1.2 | U5, U6 | `lib/rpa/orchestrator.js`, `lib/panel/render/run-view.js` |
| AC6.2.2 | U5, U6 | `lib/rpa/retry.js`, `lib/panel/effects.js` |
| AC6.2.3 | U5, U6 | `lib/messages-es.js`, `lib/panel/render/result-view.js` |
| AC6.3.1 | U6 | `lib/panel/history-model.js` |
| AC7.1.1 | U5 | `lib/rpa/result-aggregator.js` |
| AC7.1.2 | U5 | `lib/rpa/orchestrator.js` |
| AC8.1.1, AC8.1.2, AC8.1.4, AC8.1.6 | U5 | `lib/dom/spotlight.js` |
| AC8.1.3 | U5 | `lib/dom/dom-resolver.js` |
| AC8.1.5 | U5 | `lib/dom/form-scanner.js` |

## Requisitos no funcionales (agregados)

| ID | Cubierto | Unidades | N/A declarados |
|---|---|---|---|
| NFR1 | Sí | U1, U2, U3, U4 (NFR1.1-1.10), U7 | — |
| NFR2 | Sí | U1, U3, U5 | — |
| NFR3 | Sí | U1, U2, U3, U4, U5, U6, U7 | — |
| NFR4 | Sí | U1, U2, U3, U4, U5, U7 | u5 NFR4.2: entregado por U7 (recursos accesibles y `check:bundle`) |
| NFR5 | Sí | U1-U7 | u2 NFR5.5: almacenamiento del registro es de U1 y su borrado de U6; u4 NFR5.3: entregado por U7 (`sw/session.js`) |
| NFR6 | Sí | U1-U7 | — |
| NFR7 | Sí | U2, U3, U4, U5, U7 | — |
| NFR8 | Sí | U1-U7 | u6 NFR8.1: tope de 30 s del service worker, entregado por U7 |

## Elementos sin cubrir

Ninguno.

## Correcciones hechas en esta etapa para llegar al PASS

- `u2-input-parsers/code-generation/traceability.json`: `target` traía la ruta con descripción pegada ("archivo (detalle); prueba"), y el sensor no encontraba el archivo. Se dejó la ruta sola en `target` y el detalle en `note`.
- `u4-mapping-brain/code-generation/traceability.json`: NFR5.3 (token en `storage.session`) no tenía fila; se agregó como `N/A`, entregado por U7.

La evidencia de este PASS es de construcción (dónde se implementa cada ID). El comportamiento en navegador de los criterios de U5 y U6 se comprobó solo en Node.
