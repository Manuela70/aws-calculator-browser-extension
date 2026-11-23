# Resumen de código — u6-popup-ui

Los 13 pasos del plan aprobado están implementados y marcados en `code-generation-plan.md`, en orden test-after: cada capa de Zona A se implementa y luego se prueba; la Zona B (render, efectos sobre Chrome real) se verifica con `SMOKE.md`. Prosa en español; identificadores en inglés.

## Archivos creados y modificados

**Zona A (lógica pura, con pruebas y umbral propio de 80 % en líneas y ramas)**
- `lib/panel/panel-state.js` (reescrito): máquina completa de functional-spec §2 con 16 estados, `requestId`/`runId` y filtro de eventos ajenos (devuelve el mismo objeto al ignorar), DONE sin URL válida → Failed con `failureStep = share` y sin URL, `canRetry` solo con `connection`/`preconditions` y configuración en memoria, login (`LOGIN_REQUESTED`, `LOGIN_OK`, `LOGIN_CANCELLED`), `needsLogin` en Preview, cancelación con `confirmingCancel`/`cancelPending` dentro de Running (R-11), R-17, `RESUME_ACTIVE`, `RUN_LOST`, `HYDRATE` y `resolveInitialView` conservado.
- `lib/panel/url-check.js`: reexporta `validateShareUrl` como `isValidEstimateUrl`.
- `lib/panel/history-model.js`: orden por fecha, recorte a 200, filas con veredicto, cantidad de servicios y enlace solo si la URL valida; `describeLastRun`.
- `lib/panel/timers.js`: `TIMEOUTS` (30 s, 35 s, 20 s, 2 s, 300 ms, latido 5 s, tic 1 s), `createTimers` y `withTimeout` con reloj inyectable.
- `lib/panel/session-rule.js`: `needsLogin` (sin sesión, error, sin `expiresAt` o menos de 15 minutos).
- `lib/panel/waf-model.js`: `buildWafRequest` (fases `pre_fill`/`post_fill`, topes de C2) y `validateWafResponse` (pilar, severidad, `serviceIndex` en rango y sin repetir, 1-5 recomendaciones de hasta 300 caracteres, `noFindings` coherente, nunca lista vacía).
- `lib/messages-es.js` (reescrito): `messageFor("<tipo>:<código>", params)` con las tablas de §6 ampliadas: 28 códigos de `InputError`, 11 del cerebro y la sesión más `input_limit_exceeded`, los 14 `reason`, los 7 `failureStep`, los `failureDetail` (incluidos `share_invalid`, `cancelled`, `exit_not_confirmed`, `timeout:<paso>`, `busy`, `not_ready`, `module_load_failed` y los fallos del handshake), los 10 `step`, pilares, severidades, veredictos y textos propios del panel. Respaldo "Ocurrió un problema ({código})." y "Trabajando…", parámetros recortados a 200 y sin emojis. `describeServiceResult`, `describeServiceResultParts`, `describeFailure` (con el aviso de R-13) y `substitutionText`.

**Zona B (smoke manual; efectos y almacenamiento con pruebas de dobles)**
- `lib/history-store.js` (nuevo, decisión 1): `listRuns`, `readActiveRun`, `readEntries`, `exportRuns`, `deleteRun`, `deleteAll`, `repairIndex`, `closeLostRun`; resultado tipado `{ ok, code: "storage_error" }`, nunca lanza.
- `lib/panel/tab-store.js`: `chrome.storage.session` solo con claves `panel:`, escritura a los 500 ms, vaciado en `blur` y `pagehide`.
- `lib/panel/effects.js`: reacciona a cada transición; `AbortController` por petición (el brain-port de U7 envía `BRAIN_CANCEL` con el mismo `callId`), topes de 30 s y 35 s, `BRAIN_SESSION` con tope de 2 s, `BRAIN_LOGIN`, repetición de la llamada tras `LOGIN_OK`, handshake de U1 + `RUN_RPA`, `CANCEL_RPA` con tope de 20 s, vigilancia del latido cada 5 s, evaluación final automática al entrar a Done, lectura de la corrida activa con tope de 300 ms.
- `lib/panel/history-view.js`, `lib/panel/render/{dom,input-view,run-view,result-view}.js`: solo `createElement`/`textContent`, clases fijas, `href` solo con URL validada o `blob:` propio y `rel="noopener noreferrer"`, filas de progreso actualizadas una por una, hallazgos agrupados por servicio, pilar y severidad.
- `sidepanel.html`: esqueleto estático con `tablist`/`tab`/`tabpanel`, aviso de privacidad con `aria-describedby`, región de estado `aria-live`/`aria-busy`, `role="alert"` en los errores, diálogo de cancelación, `data-testid` de frontend-components, objetivos de 44 px y ancho mínimo de 320 px, sin estilos en línea.
- `sidepanel.js`: arranque con `Promise.all` (pestañas y corrida activa), `performance.mark("panel-ready")`, render agrupado por `requestAnimationFrame`, foco en errores y en la confirmación, flechas en las pestañas, Escape, sin pintar el último resultado al abrir.

**Retiro de `pct` y `text` (decisión 7)**
- `lib/rpa/result-aggregator.js` (`buildProgressEvent`), `lib/messages.js` (`makeProgressEvent(runId, fields)`), `lib/rpa/orchestrator.js` (sin `pct`/`text` en los `emit`) y `lib/content-main.js` (solo progreso estructurado).

**Pruebas, configuración y documentación**
- `tests/u6/` (16 archivos, 101 pruebas): `fixtures.js`, `panel-paths.js`, `messages-es`, `url-check`, `history-model`, `waf-model`, `history-store`, `tab-store`, `panel-state.transitions`, `panel-state.ids`, `panel-state.login`, `panel-state.waits`, `timers`, `session-rule`, `effects`, `eslint-panel`.
- `tests/u1/messages-es.test.js` y `tests/u1/panel-state.test.js` retirados (decisión 13); ajustados `tests/u1/content-main.test.js`, `messages-validation.test.js`, `orchestrator.test.js` y `tests/u5/service-result.test.js` por el retiro de `pct`/`text`.
- `eslint.config.js`: bloque del panel, excepción de `tab-store.js`, Zona A del panel y exclusión del bloque final de U5 (decisión 12). `vitest.config.js`: cinco módulos nuevos en `coverage.include` y umbral `{ lines: 80, branches: 80 }` sobre los siete de Zona A; el umbral global no cambió. `package.json`: `test:u6`.
- `SMOKE.md`: R1, R6 y R9 con el botón Cancelar y los textos de §6; casos P1-P8 del panel con su registro.

## Decisiones del plan (1-14)

1. **Historial**: `lib/history-store.js` es el único dueño de `activeRun`, `lastRunResult` y `runLogIndex`; `sidepanel.js` y `lib/panel/**` no tocan `chrome.storage.local` (ESLint lo prohíbe).
2. **Puerto del cerebro**: se reutiliza `lib/connection/brain-port.js`; `effects.js` suma los topes y descarta el rechazo por cancelación.
3. **Cerebro no desplegado**: `brain_unavailable` en Reviewing → Connecting con el aviso BR2.3; en lenguaje natural → InputError; en la evaluación final → WafError con reintento.
4. **`RESUME_ACTIVE`**: evento del reductor desde `readActiveRun()` con tope de 300 ms; si la lectura llega tarde, igual reanuda desde Idle.
5. **Handshake**: se conserva el de U1 (`connectToCalculator`).
6. **Textos**: el panel pinta siempre `messageFor`; ningún texto de U2 ni de U7 llega como `error.message`; sin emojis.
7. **Progreso**: "Servicio N de M" con N = `serviceIndex` + 1; "en cola" derivado; `pct` y `text` retirados.
8. **WAF**: `waf-model.js` con `buildWafRequest` y `validateWafResponse`; una respuesta inválida es WafError.
9. **Sesión**: `session-rule.js`; una respuesta ausente o con error de `BRAIN_SESSION` cuenta como no autenticado.
10. **URL**: `url-check.js` reexporta la regla de U5.
11. **R-11, R-13, R-17**: cancelación como `cancelPending` dentro de Running; aviso "Abre un estimado nuevo antes de volver a generar." con servicios guardados; editar en Preview/ReviewFindings vuelve a Idle y en WafLoading no afecta la evaluación.
12. **ESLint**: el bloque del panel suma `selectorSyntax` y queda fuera del bloque final de U5.
13. **Pruebas de U1** reemplazadas por las de `tests/u6/`.
14. **`SMOKE.md`**: R6 y R9 con el botón Cancelar, R1 con el texto de §6, P1-P8 nuevos.

## Resultados de verificación

- `npx vitest run tests/u6`: 14 archivos de prueba, 101 pruebas en verde.
- Cobertura de la unidad (`npx vitest run tests/u6 --coverage --coverage.include=…` de `unit-test-instructions.md`): 98,1 % líneas y 88,4 % ramas sobre los siete módulos de Zona A (`messages-es.js` 100 %/85,9 %, `panel-state.js` 97,1 %/88,7 %, `history-model.js` 100 %/91,1 %, `waf-model.js` 98,2 %/87,4 %, `timers.js` 95,7 %/100 %, `url-check.js` y `session-rule.js` 100 %).
- Suite completa con cobertura (`npx vitest run --coverage`): 70 archivos, 626 pruebas en verde, sin umbrales incumplidos.
- `npm run lint`, `npm run format:check` y `npm run check:bundle` en verde.
- `aidlc engine swarm check u6-popup-ui` (desde `C:\extension`): lint, formato, 70 archivos y 626 pruebas con cobertura (98,63 % líneas y 91,82 % ramas en total) y `check:bundle` en verde; `{"unit":"u6-popup-ui","converged":true,"tampered":false,"reason":null}`.

## Desviaciones y notas

- **Evento `HYDRATE` en el reductor** (no estaba en el plan). El texto de las pestañas se lee en paralelo con la reanudación (NFR8.5); si la corrida ya pasó a Running, un `TEXT_CHANGE` se ignora. `HYDRATE` aplica el texto guardado en cualquier estado sin pisar lo escrito ni cambiar de pestaña durante una corrida. Tiene prueba.
- **Login en Preview sin cerebro desplegado → Connecting sin revisión.** Con `sw/config.js` en `null`, `BRAIN_SESSION` siempre responde no autenticado, así que la regla de 15 minutos pediría login y `BRAIN_LOGIN` respondería `brain_unavailable`: la corrida JSON quedaría bloqueada. Se extiende la decisión 3 a ese caso: `brain_unavailable` del login en Preview pasa a Connecting con el aviso BR2.3. `login_cancelled` sigue dejando el error.
- **Done sin cerebro no lanza la evaluación final.** Si en la corrida ya se supo que no hay cerebro (`noReview`), Done ofrece "Nueva corrida" (functional-spec §2). Una corrida reanudada sí la intenta y, sin cerebro, termina en WafError con reintento (decisión 3).
- **Progreso inicial de `content-main.js` retirado.** El evento "Corrida aceptada…" solo llevaba `pct` y `text`; el latido inicial ya lo escribe `logger.start`. También se quitó el `emit` final de "sharing" con `pct: 100`. Con el registro degradado, `content-main.js` deja además un aviso en la consola de la pestaña.
- **Región de estado**: en Running anuncia solo "Servicio N de M"; el paso y el tiempo de `asking_brain` van en la fila del servicio, para no anunciar cada acción (§7). La región nunca se oculta, para que el lector de pantalla la anuncie.
- **ESLint más estricto que el plan**: el panel también prohíbe `XMLHttpRequest`, `WebSocket`, `EventSource`, `self.fetch` y `document.write`; los selectores de almacenamiento cubren `*.storage.local|sync|session` (también por `globalThis.chrome`). Las reglas de `sw/**` y del content script no cambiaron.
- **`data-testid` adicionales** a los de frontend-components: `preview-continue-button`, `login-button`, `cancel-dismiss-button`, `example-button`, `history-repair-button`, `history-row-export-button`, `history-row`, `history-row-link`, `last-run-link`, `result-link`, `status-region`, `error-message` y similares, para los controles nuevos.
- **Volumen de pruebas**: 101 pruebas en 14 archivos más 2 ayudantes (`fixtures.js`, `panel-paths.js`), por encima de las ~75 previstas.
- **`SMOKE.md`**: además de R1, R6 y R9 se actualizaron los textos esperados de S1-S7, R2-R5 y R7 a los de §6; sin `prettier --write` sobre el archivo.
- **Finales de línea del worktree**: el checkout salió con CRLF y `format:check` fallaba en 152 archivos antes de cualquier cambio; se corrió `npm run format`, que solo convirtió a LF. `git diff --stat` muestra solo las rutas de U6, así que esas conversiones no figuran en el manifiesto.
- **Prueba inestable de U5**: en la primera corrida del swarm check (antes de los cambios) `tests/u5/eslint-config.test.js` superó el tope de 5 s de Vitest al cargar ESLint bajo carga. No se modificó; las pruebas de ESLint de U6 usan un tope propio de 30 s.

## Pendientes

- Smoke manual sobre Chrome y calculator.aws reales (S1-S15, R1-R9, P1-P8), incluidos los tiempos de NFR8.5-NFR8.7 y la revisión de contraste.
- Con el cerebro desplegado (u4) y `sw/config.js` sincronizado: P3 y P4 con login real.
- `toLogEntry` de U2 sigue sin enviarse al registro técnico de U1 (pendiente que dejó U2, fuera de este plan).
