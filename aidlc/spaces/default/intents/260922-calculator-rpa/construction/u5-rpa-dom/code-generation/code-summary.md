# Resumen de código — u5-rpa-dom

Los 14 pasos del plan aprobado están implementados y marcados en `code-generation-plan.md`, en orden test-after (cada capa de Zona A se implementa y luego se prueba; la Zona B se verifica con `SMOKE.md`). Prosa en español; identificadores en inglés.

## Archivos creados y modificados

**Zona A (lógica pura, con pruebas y umbral propio)**
- `lib/rpa/result-aggregator.js`: `buildServiceResult` (copia `brainSubstitutions` solo de acciones aplicadas con `substituted = true`, `brainErrorCode`, `durationMs`, `stoppedAtLabel`, `listedInEstimate`), `clip(text, 200)`, `validateShareUrl` (prefijo exacto `https://calculator.aws/#/estimate?id=` + id `[A-Za-z0-9-]{1,128}`), `buildProgressEvent`, tabla `translateDomError` (DomError → `reason`/`failureStep`), `aggregate` con `missing`, `estimateMatchesRequest` como multiconjunto exacto y `finalizeRunResult` con `missing`, `stoppedAtLabel` y `failureDetail` (`share_invalid`, `cancelled`, `exit_not_confirmed`).
- `lib/rpa/orchestrator.js`: reescrito con R1/R2 sobre el resolvedor inyectado: búsqueda con 2 intentos ante espera agotada; región en el primer formulario que se abre (detalle `"Region"`); plantilla antes de los toggles (`template_not_found`); pasadas de mapeo de U3 con `asking_brain`; guardado con 3 intentos sobre `calculatorServiceName`; corte de 3 minutos encadenado a la señal de la corrida; `exitWithoutSave` con su propia señal de 20 s y `RunStopped` (restantes `not_attempted`) si no se confirma; cancelación; progreso estructurado; `cleanup()` del overlay en un `finally`.
- `lib/rpa/retry.js`: clase `RetryCounter` (`save` 3, `search_service` 2, `dropdown_open` 2, `page_wait` 1; `next()`, `exhausted`, `fail(code)`, `snapshot()`); `retry()` se conserva como envoltorio y acepta `operation`.
- `lib/rpa/service-timer.js`: reloj inyectable `{ setTimeout, clearTimeout }`, `runSignal` encadenado (motivo `cancelled` si el abort no trae texto), `reason` configurable para la salida (`exit_timeout`), `abortReason()`, `clear()` idempotente que también quita el oyente; `raceWithSignal` devuelve además el motivo. Sin `AbortSignal.timeout` ni `AbortSignal.any`.
- `lib/dom/aria-label.js`: `parseUnitButtonLabel` (FIX-2) por significado, no por posición; `cleanAriaLabel` sin cambios y sin imports de Zona B.
- `lib/dom/cascade.js` (nuevo): `selectByCascade` (orden `aria_label` → `aria_labelledby` → `label_for` → `section_heading`, filtro por sección, `field_not_resolved` con los conteos), `joinLabelledBy`, `splitRequestedLabel`, `describeAttempts`.

**Zona B (DOM vivo, smoke manual)**
- `lib/dom/selectors.js`: único punto de selectores, `CLASS_PATTERNS` (patrones de clase movidos desde `dom-resolver.js` y `form-scanner.js`), `BUTTON_TEXTS` congelado, `UI_TEXT`, `SUCCESS_BANNER_PATTERN`, `OVERLAY_ATTRIBUTE`.
- `lib/dom/dom-utils.js`: `DomError`, `waitFor` que lanza `DomError` sobre la primitiva pura de `wait.js`, `readBack`/`valuesMatch` (espacios, mayúsculas y separadores de miles), `confirmSave` (lista previa + `MutationObserver`, solo banner nuevo con el nombre exacto, `is required` solo dentro del formulario, 10 s por intento), `exitWithoutSave`, `readEstimateServiceNames`/`verifyEstimate`, `isOverlay`.
- `lib/dom/dom-resolver.js`: tarjeta, región, plantilla y opciones por coincidencia exacta y única; candidatos por estrategia para `selectByCascade` (toggles y acciones cuyo elemento ya no está conectado); opciones leídas al abrir con `option_no_match`/`option_ambiguous`; apertura de dropdown con `RetryCounter("dropdown_open")`; relectura de cada acción; Spotlight alrededor de cada acción; `typed()` convierte un `DomError` en resultado tipado; `cleanup` = `clearSpotlights`.
- `lib/dom/form-scanner.js`: `resolveSection` exportada, exclusión de `[data-aidlc-overlay]`, `parseUnitButtonLabel` y `joinLabelledBy`.
- `lib/dom/spotlight.js` (nuevo): shadow root cerrado, solo `createElement`/`textContent`, `pointer-events: none`, z-index máximo, sin transición con `prefers-reduced-motion`, `remove()` idempotente y `clearSpotlights()`.

**Mensajes y punto de entrada**
- `lib/messages.js`: `CANCEL_RPA`, `makeCancelRpa`, `isCancelRpaMessage`, `makeCancelRpaResponse`; `makeProgressEvent` copia los campos estructurados.
- `lib/messages-es.js`: textos de `template_not_found`, `field_not_resolved`, `option_no_match`, `option_ambiguous`, `not_attempted`, `share_invalid`, `cancelled`, `exit_not_confirmed`, "Me detuve en …", "aparece igual en My Estimate" y "Pediste X; se usó Y."
- `content.js`: acepta `CANCEL_RPA` con la misma guardia de remitente.
- `lib/content-main.js`: `AbortController` por corrida pasado en `context.signal`; `CANCEL_RPA` solo cancela el `runId` en curso; `emitProgress` acepta el evento estructurado o la forma de U1 y conserva el último texto. No se tocó la llamada a `runEstimateFn` (U7 agrega ahí `mapResidue`).

**Pruebas, configuración y documentación**
- `tests/u5/` (nuevo, 11 archivos): `fixtures.js`, `service-result`, `share-url`, `error-codes`, `cascade`, `aria-label`, `retry-counter`, `service-timer`, `orchestrator-multi`, `eslint-config`, `smoke-doc`.
- `tests/u1/`: `fake-dom.js` (`selectTemplate`, `exitWithoutSave`, `cleanup`, `calculatorServiceName`), `orchestrator.test.js`, `result-aggregator.test.js`, `retry-wait-timer.test.js` y `content-main.test.js` (ver desviaciones).
- `eslint.config.js`: bloque del content script que extiende las listas base con `XMLHttpRequest`, `WebSocket`, `EventSource`, `self.fetch`, `window.XMLHttpRequest`, `chrome.storage` y `document.write`; bloque de Zona A con `document`, `chrome` y `no-restricted-imports` de módulos de Zona B; bloque final del bundle (salvo `selectors.js`) con `Literal[raw=/awsui_/]`, `TemplateElement` equivalente y los textos de `BUTTON_TEXTS` (importados del propio `selectors.js`), conservando las prohibiciones de HTML.
- `vitest.config.js`: `cascade.js` en `coverage.include` y umbral `{ lines: 80, branches: 80 }` sobre los seis módulos de Zona A de U5. El umbral global no cambió.
- `package.json`: `"test:u5": "vitest run tests/u5"`.
- `aws-calculator-extension/SMOKE.md`: sección "Casos del RPA (U5)" con R1-R9 y su resultado esperado en el panel, más filas en el registro de ejecuciones.

## Decisiones del plan (1-13), tal como quedaron

1. **`RunResult`**: se conserva `perServiceResults`; se agregan `missing`, `stoppedAtLabel` y, por servicio, `durationMs`, `brainSubstitutions`, `brainErrorCode` (y `listedInEstimate`, ver desviaciones). `aggregate` solo lleva a `DONE` o `ERROR`.
2. **`ProgressEvent`** estructurado (`runId`, `step`, `serviceIndex`, `serviceCount`, `label`, `serviceStatus`, `requestId`) con `pct` y `text`; el evento de fin de servicio lleva `serviceStatus`.
3. **Share inválido**: `failureStep = share`, `failureDetail = share_invalid`. Sin enlace (espera agotada) no lleva motivo.
4. **`waitFor`**: `lib/rpa/wait.js` sigue como primitiva pura; `dom-utils.js` la envuelve y lanza `DomError`.
5. **Tabla DomError**: `translateDomError` en `result-aggregator.js`.
6. **`RetryCounter`**: clase en `retry.js`; `retry()` como envoltorio.
7. **Cancelación**: `CANCEL_RPA { runId }`; termina en `ERROR` con `failureDetail = cancelled`, el servicio en curso y los restantes `not_attempted`, salida sin guardar si había formulario abierto y overlay limpio.
8. **Textos en español** de los códigos nuevos en `messages-es.js` (U6 es dueño final del copy).
9. **Coincidencias exactas** en tarjeta, `estimateMatchesRequest`, banner y relectura de dropdown; `is required` solo dentro de `form.root`; región en el primer formulario abierto con detalle `"Region"`.
10. **Literales `awsui_`** y textos de botón en `selectors.js`.
11. **Registro técnico de U1**: `content-main.js` sigue usando `chrome.storage.local` vía `run-logger` y queda fuera del bloque de lint del content script.
12. **Formulario parcialmente llenado**: `exitWithoutSave` sale sin guardar y confirma My Estimate; si no, `RunStopped`.
13. **`SMOKE.md`**: verificado por `tests/u5/smoke-doc.test.js`.

## Cobertura y resultados de las verificaciones

| Comando | Resultado |
|---|---|
| `npx vitest run` (línea base, antes de editar) | 36 archivos, 350/350 en verde |
| `npx vitest run tests/u5` | 10 archivos de prueba, 90/90 en verde |
| `npx vitest run tests/u1` | 13 archivos, 93/93 en verde |
| `npx vitest run tests/u3` | 6 archivos, 48/48 en verde |
| Umbral de la unidad (comando de `unit-test-instructions.md`) | Líneas 100 %, ramas 96,35 %, funciones 100 %; `orchestrator.js` 100 % líneas / 95,83 % ramas; `result-aggregator.js` 100 % / 97,27 %; `aria-label.js` y `cascade.js` 100 % / 91,66 %; `retry.js` y `service-timer.js` 100 % |
| `npx vitest run --coverage` (suite completa) | 46 archivos, 443/443 en verde; líneas 99,11 %, ramas 92,07 %; ningún umbral incumplido |
| `npm run lint` | Sin errores |
| `npm run format:check` | Todo con estilo Prettier |
| `npm run check:bundle` | OK, 35 archivos, sin dependencias de runtime |

No se bajó ningún umbral ni se desactivó ninguna regla.

## Desviaciones y notas

- **Finales de línea y dependencias del worktree.** El checkout del worktree salió con CRLF y `format:check` fallaba en 114 archivos antes de cualquier cambio: se corrió `npm run format`, que solo convirtió esos archivos a LF (git no ve diferencias de contenido). Además, `tests/u4` no cargaba porque el worktree no tenía `brain/node_modules` ni `infra/node_modules`: se corrió `npm ci` en `brain/` e `infra/` desde sus lockfiles existentes, sin paquetes nuevos ni cambios en los lockfiles (como hizo u4). Nada entra al bundle.
- **`SMOKE.md` ampliado, no reemplazado.** El plan dice "reescribir con nueve casos"; se conservaron los casos S1-S7 de U1 (panel, conexión, registro técnico), que U5 no cubre, y se agregó la sección R1-R9. U7 también agrega casos a este archivo en paralelo.
- **Prueba de `CANCEL_RPA` en `tests/u1/content-main.test.js`.** El plan no listaba ese archivo; se agregó un caso porque el contrato nuevo de cancelación vive en `content-main.js`.
- **Casos de borde del orquestador en `orchestrator-multi.test.js`.** Para superar el 80 % de ramas se agregaron allí (cancelación en cada paso, fallos tipados, errores inesperados), sin crear un archivo nuevo. `tests/u5` tiene 11 archivos (10 de prueba más `fixtures.js`).
- **`listedInEstimate`.** Campo booleano extra en `ServiceResult` para BR2.5 ("si el servicio aparece igual, el detalle lo indica"): en vez de mezclarlo en `detail`, el panel lo traduce con "aparece igual en My Estimate". `estimate_check` sigue impidiendo la URL.
- **Fallo de búsqueda.** Una tarjeta exacta que no aparece es `service_not_found`; una espera agotada del buscador o del formulario es `page_timeout` (se reintenta una vez, `search_service` 2).
- **`"Save"` como texto de guardado.** `BUTTON_TEXTS.SAVE_SERVICE` lista "Save and add service" y "Add to my estimate"; `UI_TEXT.SAVE_SERVICE` agrega "Save" por compatibilidad con el walking skeleton.
- **Pendiente para otras unidades.** U6: botón de cancelar (enviar `CANCEL_RPA`), mostrar `missing`, `stoppedAtLabel`, `listedInEstimate` y sustituciones, y retirar `pct`/`text`. U7: pasar `mapResidue` en `content-main.js` y la ampliación de `check:bundle` (NFR4.2); en `lib/**` la única URL es `https://calculator.aws`. La verificación sobre calculator.aws real (R1-R9) queda para el smoke manual.
