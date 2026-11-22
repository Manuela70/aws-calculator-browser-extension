## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-22
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/260922-calculator-rpa/construction/u6-popup-ui/infrastructure-design/cicd-pipeline.md > §1 "Qué agrega U6", fila Lint | El bloque de lint de U6 lista solo cuatro reglas (sin `fetch`, sin `.style`/`on*`, `setAttribute` con literal, sin `chrome.storage.local`/`sync`). Faltan tres reglas que el diseño de NFR da por impuestas por ESLint: (a) `no-restricted-globals` para `document` y `chrome` en los módulos de Zona A (logical-components §2); (b) prohibir `chrome.storage.session` en `lib/panel/**` fuera de `tab-store.js` (security-design NFR5.5); (c) `document.write` (security-design NFR5.1). La regla (b) es la única barrera real que impide al panel leer la clave del token: `TRUSTED_CONTEXTS` deja el panel con acceso a `storage.session`, y la tabla §3 de infrastructure-specification.md dice que "u6 nunca lee la clave" como si fuera una frontera técnica. | Añadir las tres reglas al bloque de lint de U6 (con los globs de Zona A: `lib/panel/{panel-state,url-check,history-model,timers}.js` y `lib/messages-es.js`). Ajustar la frontera de acceso en infrastructure-specification.md §3 para decir que la separación de claves la hace ESLint y el prefijo `panel:`, no el nivel de acceso. | New |
| R-02 | Minor | aidlc/spaces/default/intents/260922-calculator-rpa/construction/u6-popup-ui/infrastructure-design/cicd-pipeline.md > §1, fila "Umbral propio" | `coverage.thresholds` de U6 cubre `panel-state`, `url-check`, `history-model` y `timers`, pero no `lib/messages-es.js`, que logical-components §1 clasifica como Zona A de U6 (NFR3.1, NFR5.3) y que NFR6.1 incluye en `coverage.include`. Hoy ese archivo solo cae bajo el umbral global de líneas (`vitest.config.js`, `thresholds.lines: 80`), sin umbral de ramas. Además, un patrón con llaves en `coverage.thresholds` agrega los archivos que coinciden; no mide cada módulo por separado, y el diseño no dice cuál de las dos lecturas pretende. | Incluir `messages-es.js` en el patrón de umbral (o justificar que basta el global) y declarar si el umbral es agregado o por archivo (`perFile`). | New |
| R-03 | Minor | aidlc/spaces/default/intents/260922-calculator-rpa/construction/u6-popup-ui/infrastructure-design/cicd-pipeline.md > §2 Etapas | Las etapas nombran "auditoría", pero el pipeline común de u1 (`cicd-pipeline.md` §2, pasos 1-7) no tiene paso de auditoría: va de `npm ci` a formato, lint, cobertura, `check:bundle` e informe. La referencia no resuelve. | Quitar "auditoría" o referirla a un paso que exista (por ejemplo, proponer a u1 un `npm audit` y citarlo como dependencia). | New |
| R-04 | Minor | aidlc/spaces/default/intents/260922-calculator-rpa/construction/u6-popup-ui/infrastructure-design/traceability.json > coverage de NFR3.1, NFR3.2, NFR5.2, NFR5.3, NFR8.1, NFR8.4 | Seis NFR se marcan `N/A` aunque el target diga que se prueban en `tests/u6`; `N/A` debería significar sin trabajo de infraestructura. NFR5.3 (aviso de u2 junto al área de texto con `aria-describedby`) es render de Zona B: no tiene prueba unitaria y solo la cubre el smoke de NFR6.2. NFR8.1 no se explica en ningún artefacto de esta etapa. | Usar `OK` con el target `cicd-pipeline.md §1 (tests/u6)` para los de Zona A, apuntar NFR5.3 al smoke de `SMOKE.md` y anotar qué exige NFR8.1. | New |
| R-05 | Minor | aidlc/spaces/default/intents/260922-calculator-rpa/construction/u6-popup-ui/infrastructure-design/monitoring-design.md > §1 y §4 | Los umbrales (500 ms, 200 ms, 1 s) no dicen cuántas mediciones se toman, en qué máquina ni si se evalúa el máximo o la mediana, así que dos corridas del smoke pueden dar veredictos distintos. El dueño y el mecanismo sí están (mantenedor, `SMOKE.md` en cada entrega). | Fijar en `SMOKE.md` el protocolo: número de aperturas, estadístico (p. ej. el peor de 5) y el perfil de equipo de referencia. | New |
| R-06 | Minor | aidlc/spaces/default/intents/260922-calculator-rpa/construction/u6-popup-ui/infrastructure-design/infrastructure-specification.md > §2 "CSP de páginas de la extensión (U7)" | La defensa en profundidad del panel descansa en una CSP explícita que, según u7 infrastructure-specification §2, hoy no existe en el manifest ("hoy faltan ... la CSP explícita"). Es una dependencia cruzada hacia u7 que no se declara como tal. | Registrarla como dependencia de entrega con u7 y verificar en el smoke de U6 que `sidepanel.html` carga bajo esa CSP, sin script en línea. | New |

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| Verificación de referencias contra `vitest.config.js` | `panel-state.js`, `messages-es.js` y `heartbeat.js` ya están en `coverage.include`; `url-check.js`, `history-model.js` y `timers.js` no están y el diseño los agrega | La afirmación "ya están panel-state.js y messages-es.js" es correcta. Hoy el umbral es solo `lines: 80` global. |
| Verificación contra `eslint.config.js` | Las listas base de `securityRules` se reemplazan al repetir la regla en un bloque posterior; el diseño dice "extiende" | Correcto. Falta listar las reglas (a)-(c) del hallazgo Major. |
| Ejecución de pruebas | No aplica: la etapa es de diseño y `tests/u6` aún no existe | Sin comando que correr. |

### Summary

U6 no tiene recursos en la nube y el diseño es coherente con u7 y con el pipeline de u1 (almacenamiento, mensajes del service worker, rollback, sin secretos). El hallazgo principal es que el bloque de lint omite las reglas que sostienen el aislamiento del token y la pureza de Zona A. Con un solo Major y sin Critical, es implementable tras corregirlo.
