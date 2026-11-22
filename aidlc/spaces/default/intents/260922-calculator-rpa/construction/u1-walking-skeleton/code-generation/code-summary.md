# Resumen de código — u1-walking-skeleton

Los 16 pasos del plan aprobado están implementados y marcados en `code-generation-plan.md`, en orden test-after (cada capa se implementa y luego se prueba). Prosa en español; identificadores en inglés.

## Archivos creados, modificados y eliminados

**Herramientas en la raíz (solo desarrollo, fuera del bundle)**
- Nuevos: `package.json` (privado, `type: module`; scripts `lint`, `format`, `format:check`, `test`, `test:u1`, `coverage`, `check:bundle`; solo dev-dependencies: vitest, @vitest/coverage-v8, eslint, @eslint/js, globals, prettier), `package-lock.json`, `vitest.config.js` (cobertura v8 sobre los 19 módulos de Zona A, `thresholds.lines: 80`), `eslint.config.js` (`no-empty`, `no-eval`, `no-implied-eval`, `no-new-func`, prohibición de `innerHTML`/`outerHTML`/`insertAdjacentHTML` y de `fetch`), `.prettierrc`, `scripts/check-bundle.js`, `.github/workflows/ci.yml` (push/PR a `main`, `contents: read`, acciones fijadas por SHA, `npm audit --audit-level=high`, artefacto de cobertura 14 días).
- Modificado: `.gitignore` (añade `coverage`).

**Extensión (`aws-calculator-extension/`)**
- Modificados en sitio: `manifest.json` (MV3, `minimum_chrome_version: "116"`; permisos `tabs`, `scripting`, `sidePanel`, `storage`, `unlimitedStorage`; host único `https://calculator.aws/*`; service worker módulo; `side_panel`; `web_accessible_resources` `lib/*` y `lib/*/*` con `use_dynamic_url`; se quitan CloudFront, `activeTab`, `clipboardWrite` y `default_popup`) y `content.js` (cargador clásico delgado: guardia de carga única, verificación de `sender.id`, `PING {ok, ready}`, `import()` de `lib/content-main.js`, `RUN_RPA` rechazado con `not_ready` si el módulo no cargó; se eliminan `callN8N`, `prepareForm`, `mapFields`, `PROGRESS_TEXT`, `DOM_FIELDS`).
- Eliminados: `popup.html`, `popup.js`.
- Nuevos: `background.js`, `sidepanel.html`, `sidepanel.js`, `SMOKE.md` y los módulos de `lib/`:
  - Zona A: `messages.js`, `validation.js`, `messages-es.js`, `input/json-parser.js`, `input/input-normalizer.js`, `mapping/region-map.js`, `mapping/deterministic-mapper.js`, `mapping/option-match.js`, `rpa/wait.js`, `rpa/retry.js`, `rpa/service-timer.js`, `rpa/result-aggregator.js`, `rpa/orchestrator.js`, `log/log-format.js`, `log/log-index.js`, `log/run-logger.js`, `connection/handshake.js`, `panel/panel-state.js`, `panel/heartbeat.js`.
  - Zona B: `content-main.js`, `dom/selectors.js`, `dom/dom-utils.js`, `dom/form-scanner.js`, `dom/dom-resolver.js`.
  - Cada módulo de `lib/` lleva una cabecera que lo marca como provisional y nombra la unidad que lo completará.

**Tests (`tests/u1/`)**
- Dobles y datos: `fixtures.js`, `fake-storage.js`, `fake-chrome.js`, `fake-dom.js`.
- 17 archivos de test, incluidos los de integración `orchestrator.test.js` y `content-main.test.js`, y `manifest.test.js`.

## Decisiones clave de implementación

- `RUN_RPA` lleva además `tabId`, porque el content script no conoce su pestaña y `activeRun` la necesita.
- `ProgressEvent` admite `logDegraded` opcional (aviso al panel de registro degradado) y `RunResult` admite `failureDetail` opcional (`busy`, `not_ready`, `module_load_failed`, `timeout:<paso>`) para elegir el mensaje en español; se mantienen los 4 tipos de mensaje.
- `lastRunResult` se guarda como `{schemaVersion: 1, value}`; `run_end` lleva el veredicto en `value` y `failureStep` en `detail`.
- El registro técnico usa un único escritor con escritura inmediata en trozos de hasta 200 entradas; el índice se escribe antes que cada trozo nuevo; un reintento ante fallo y luego `degraded`; vaciado de la cola al cerrar con tope de 5 s.
- `finalizeRunResult` es el único productor de `DONE` (todo o nada, contenido del estimado verificado).
- `scanForm` devuelve un registro etiqueta → elemento para que cada acción actúe sobre el elemento escaneado y lo relea después (BR4.3).
- La guardia de carga de `content.js` incluye `isAlive()` para que un cargador huérfano tras recargar la extensión no bloquee la reinyección.

## Cobertura y resultados de las verificaciones

| Comando | Resultado |
|---|---|
| `npx vitest run tests/u1` | 17 archivos, 116/116 tests en verde |
| `npx vitest run --coverage` | 116/116 en verde; líneas 96,81 % (608/628) sobre Zona A (piso 80 %); sentencias 93,74 %, ramas 82,9 %, funciones 94,02 %; el módulo más bajo es `orchestrator.js` (91,12 % de líneas) |
| `npm run lint` | Sin errores ni avisos |
| `npm run format:check` | Todo con estilo Prettier |
| `npm run check:bundle` | 28 archivos revisados, sin dependencias de runtime |
| `npm install` | 0 vulnerabilidades |

No se bajó ningún umbral ni se añadieron exclusiones de cobertura.

## Tests escritos o definidos pero no ejecutados en esta etapa

- **Smoke manual S1–S7 de `aws-calculator-extension/SMOKE.md` (Zona B):** no ejecutado; requiere cargar la extensión unpacked en Chrome 116+ contra `calculator.aws` real. Es lo único que valida los selectores de My Estimate, el heading de la tabla de instancias de EC2, el texto del banner `Successfully added <Service> estimate.`, el flujo de renombrado y las etiquetas del JSON canónico.
- **Workflow de CI `.github/workflows/ci.yml`:** escrito pero no ejecutado en GitHub, porque el repositorio no tiene remoto. Sus pasos se corrieron en local y pasaron.

## Desviaciones respecto del plan

- La capa DOM (Zona B) se partió en cuatro archivos (`selectors.js`, `dom-utils.js`, `form-scanner.js`, `dom-resolver.js`) en lugar de dos, para mantener los archivos manejables; todos quedan cubiertos por `lib/*/*` en `web_accessible_resources`.
- Campos opcionales añadidos al contrato de mensajes (`tabId`, `logDegraded`, `failureDetail`), descritos arriba.

## Riesgos abiertos

- `use_dynamic_url: true` combinado con `import()` desde un content script no se pudo verificar sin Chrome; si el smoke muestra que el módulo no carga, la mitigación (quitar `use_dynamic_url`) requiere una decisión sobre NFR4.3.
- NFR4.4 pide justificar `unlimitedStorage` en el manifest, pero JSON no admite comentarios; la justificación queda en `tech-stack-decisions.md`.
- `sidepanel.js` (~400 líneas) y `dom-resolver.js` (~370) superan la guía de 300 líneas por archivo; U6 y U5 los completan en sitio.
