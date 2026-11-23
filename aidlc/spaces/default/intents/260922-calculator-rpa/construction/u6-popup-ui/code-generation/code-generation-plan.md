# Plan de generación de código — u6-popup-ui

## Summary

- Builds: el panel lateral completo: máquina de estados con filtro por `runId`/`requestId`, pestañas JSON y lenguaje natural, vista previa, revisión previa y evaluación final Well-Architected, corrida con progreso por servicio, cancelación confirmada, login con la regla de 15 minutos, resultado con enlace validado o faltantes, historial, y textos en español para todos los códigos.
- Touches: `aws-calculator-extension/lib/panel/` (`panel-state.js` reescrito; `url-check.js`, `history-model.js`, `timers.js`, `session-rule.js`, `waf-model.js`, `effects.js`, `tab-store.js`, `history-view.js` y `render/*.js` nuevos), `lib/history-store.js` nuevo, `lib/messages-es.js`, `lib/messages.js`, `lib/rpa/result-aggregator.js` (retiro de `pct`/`text`), `sidepanel.html`, `sidepanel.js`, `SMOKE.md`, `tests/u6/`, `tests/u1/` (estado del panel y mensajes), `eslint.config.js`, `vitest.config.js`, `package.json`.
- Tests: unas 75 pruebas de Vitest en `node` (5-8 por componente de Zona A en 11 archivos, con reloj y `chrome` simulados), umbral propio de 80 % en líneas y ramas sobre los siete módulos de Zona A, y casos manuales de panel, accesibilidad y tiempos en `SMOKE.md`.

## Contexto

- Diseño de esta unidad: `functional-design/` (functional-spec §2 estados, §3 pestañas y cancelación, §6 textos; frontend-components; rules BR1.x-BR5.x), `nfr-requirements/`, `nfr-design/` (security-design, performance-design, logical-components), `infrastructure-design/`.
- Historias y requisitos: US5.1 (AC5.1.1-AC5.1.4), US6.1-US6.3 (AC6.1.1-2, AC6.2.1-3, AC6.3.1); FR1, FR7.2-FR7.3, FR8.3-FR8.5.
- Brownfield: `panel-state.js` es el provisional de U1 (6 estados, eventos en mayúsculas, sin ids); `sidepanel.js` solo maneja JSON, pasa el puerto del cerebro en `null`, pinta el último resultado al abrir, usa `.style.width` y lee y escribe `chrome.storage.local` directamente.
- Contratos que consume: `normalize` de U2 (`NormalizedRun` o `InputError`, `NL_PRIVACY_NOTICE`); mensajes `RUN_RPA`, `PROGRESS`, `RUN_RESULT`, `CANCEL_RPA` y la forma de `RunResult`/`ServiceResult` de U5 (`perServiceResults`, `missing`, `stoppedAtLabel`, `listedInEstimate`, `brainSubstitutions`, `brainErrorCode`); `lib/connection/brain-port.js` de U7 (`interpret`, `wafEvaluate`, `login`, `session`) y el handshake de U1.
- Es la única unidad del lote: trabaja sobre `main` con u1-u5 y u7 ya integrados.

### Decisiones que este plan fija

1. **Historial.** `lib/history-store.js` no existe aunque el diseño lo da por hecho. U6 lo crea fuera de `lib/panel/` como único dueño de `activeRun`, `lastRunResult` y `runLogIndex` (envuelve `lib/log/log-index.js`): `listRuns`, `deleteRun`, `deleteAll`, `readActiveRun`. `sidepanel.js` y `lib/panel/**` ya no tocan `chrome.storage.local`.
2. **Puerto del cerebro.** Se reutiliza `lib/connection/brain-port.js` de U7; no se crea `lib/panel/brain-port.js`. `effects.js` agrega el tope de 2 s a `session()`, los de 30 s y 35 s a las llamadas, y trata el rechazo por cancelación como descarte, no como error.
3. **Cerebro no desplegado.** Mientras `sw/config.js` esté en `null`, toda llamada responde `brain_unavailable`. En la revisión previa (Reviewing) `brain_unavailable` no bloquea: el panel pasa a Connecting y muestra el aviso de BR2.3 ("sin revisión Well-Architected"). La pestaña de lenguaje natural sí lo necesita: termina en InputError con el texto de `brain_unavailable`. La evaluación final en Done con `brain_unavailable` va a WafError con reintento; nunca a una lista vacía.
4. **`RESUME_ACTIVE`.** Es un evento del reductor que sale de `readActiveRun()` con tope de 300 ms; no es un mensaje.
5. **Handshake.** Se conserva el de U1 (un PING inicial más 3 reintentos); el texto del diseño "3 PING" se lee así.
6. **Textos.** El panel siempre pinta `messageFor(code, params)`; nunca `error.message` de U2 ni de U7. `messages-es.js` cubre los 28 códigos de `InputError` de U2, los códigos del cerebro y de la sesión, los `reason`, `failureStep` y `failureDetail` de U5 (incluidos `option_ambiguous`, `share_invalid`, `cancelled`, `exit_not_confirmed`, `timeout:<paso>`, `busy`, `not_ready`, `module_load_failed`), `listedInEstimate`, los `step` de progreso, pilares y severidades. Los textos dejan de llevar emojis ("❌", "✅"); el estado se marca con clases y `aria`.
7. **Progreso.** `serviceIndex` llega en base 0 y el panel muestra "Servicio N de M" con N = índice + 1; el estado "en cola" se deriva. Se retiran `pct` y `text` de `buildProgressEvent` y de `lib/messages.js`, como dejó previsto U5.
8. **Evaluación Well-Architected.** Se agrega `lib/panel/waf-model.js` (Zona A): `buildWafRequest(normalizedRun, runResult, phase)` y `validateWafResponse(value)` (pilar y severidad de las listas cerradas, `serviceIndex` dentro de rango, topes de cantidad y de longitud, `noFindings` coherente). Una respuesta que no valida es WafError.
9. **Regla de sesión.** `lib/panel/session-rule.js` (Zona A): `needsLogin({ authenticated, expiresAt }, now)` verdadero si no hay sesión, falta `expiresAt` o quedan menos de 15 minutos; una respuesta ausente o con error de `BRAIN_SESSION` cuenta como no autenticado.
10. **URL del estimado.** `url-check.js` reexporta `validateShareUrl` de `result-aggregator.js` como `isValidEstimateUrl`, para una sola regla.
11. **Hallazgos abiertos del diseño.** R-11: la cancelación confirmada se modela como marca `cancelPending` dentro de Running, no como estado nuevo. R-13: el texto de Failed con servicios guardados incluye "Abre un estimado nuevo antes de volver a generar.". R-17: editar el texto en Preview o ReviewFindings descarta la vista previa y vuelve a Idle; en WafLoading el texto queda editable sin afectar la evaluación en curso.
12. **ESLint.** El bloque de `sidepanel.js` y `lib/panel/**` suma `selectorSyntax` a sus reglas y queda excluido del bloque final de selectores de U5, igual que `sw/**`, para que ese bloque no le borre sus prohibiciones.
13. **Pruebas de U1.** `tests/u1/panel-state.test.js` y `tests/u1/messages-es.test.js` se reemplazan por las de `tests/u6/` que cubren el comportamiento nuevo; se borran los casos que exigían emojis o el nombre del servicio en el texto.
14. **`SMOKE.md`.** R6 y R9 dejan de usar la consola y usan el botón Cancelar; R1 cambia el texto esperado al de §6. Se agregan los casos del panel (P1-P8): pestañas y aviso de privacidad, vista previa, revisión con y sin cerebro, login y regla de 15 minutos, cancelación, reapertura durante una corrida, historial, y accesibilidad (teclado, lector de pantalla, contraste WCAG 2.1 AA) con tiempos de 500 ms, 200 ms y 1 s (peor de 5).

## Testing Contract

```json
{
  "version": 1,
  "methodology": "test-after",
  "source": "team",
  "ordering": "Implementar cada capa testeable del cambio y, a continuación, escribir y ejecutar los tests de esa capa (primero la lógica pura extraíble de la Zona A, luego verificación manual del RPA de la Zona B contra la UI viva).",
  "scope": "rpa-extension-full-lifecycle",
  "test_strategy": "standard",
  "project_type": "brownfield",
  "applicable_notes": [
    {
      "layer": "org",
      "text": "We treat tests as a first-class deliverable in every Bolt. The specific\nmethodology (TDD, BDD, ATDD, or classic test-after) is affirmed at\npractices-discovery and recorded in `team.md` under this heading with explicit\n`Methodology` and `Ordering` fields; Code Generation resolves those fields\nindependently from coverage, tooling, and scope notes.\n\nWhen no posture has been affirmed, our default per scope is:\n- **Methodology**: test-after\n- **Ordering**: implement each applicable testable layer, then write and run\n  that layer's tests.\n- `mvp`, `enterprise`, `feature`, `infra`, `classic` add an 80% line-coverage\n  floor and CI execution before merge.\n- `bugfix`, `security-patch` add a targeted regression for the specific\n  bug/vulnerability and require the existing suite to remain green.\n- `express` uses the Minimal strategy: requirement-driven unit tests (one per\n  requirement, with a happy-path floor per component); existing tests remain\n  green.\n- `poc`, `refactor`, `workshop` add no extra new-test floor and require the\n  existing suite to remain green.\n\nThe active `Test Strategy` still applies in every scope and determines test\nvolume/types. Scope floors are additive; they never reduce or replace the\nselected strategy.\n\nBuild and Test verifies defined coverage floors and affirmed quality targets;\nthey may not be weakened to make a step pass.\n\nAffirm a stricter posture in `team.md` if the team commits to one."
    },
    {
      "layer": "team",
      "text": "Hoy **no hay tests, ni framework de test, ni config de cobertura, ni CI**\n(`code-quality-assessment.md`, `technology-stack.md`); la única verificación es\nmanual. Baseline brownfield explícito: **suite vacía, 0 tests, 0% cobertura,\nverificación solo manual** — el primer test escrito es, por definición, mejora\nneta y no regresión. Decisión afirmada (Q3 = C): `test-after` más estricto que\nel borrador, con runner y piso de cobertura sobre la lógica pura.\n\n- **Methodology**: test-after\n- **Methodology evidence**: No existe ninguna señal de TDD/BDD/ATDD en el repo\n  (0 archivos de test, 0 `.feature`, sin framework, sin `package.json`). El\n  flujo observado es escribir código y verificarlo después; `test-after` es la\n  postura elegida, coherente con esa evidencia y con el default de `org.md`.\n- **Ordering**: Implementar cada capa testeable del cambio y, a continuación,\n  escribir y ejecutar los tests de esa capa (primero la lógica pura extraíble de\n  la Zona A, luego verificación manual del RPA de la Zona B contra la UI viva).\n\n### Runner y restricción de \"sin build step\"\n\n- **Runner: Vitest**, introducido **solo como dev-dependency**. Esto introduce\n  `package.json` + `node_modules` **exclusivamente como dependencia de\n  desarrollo**. El bundle unpacked que carga Chrome **sigue siendo vanilla JS\n  sin paso de build** (sin transpilación ni bundling): Vitest no participa de la\n  carga unpacked. La restricción dura \"sin build step\" (`discovered-rules.md`)\n  se preserva.\n\n### Partición Zona A / Zona B (gobierna todo lo demás)\n\n- **Zona A — lógica pura, aislable del DOM (SÍ se unit-testea).** Inventario de\n  funciones testeables:\n  - parseo/validación del JSON de entrada (`JSON.parse` + validar `services`:\n    happy path, JSON inválido, forma válida sin `services`/vacía),\n  - parseo de lenguaje natural (capacidad nueva del alcance; nace con tests por\n    requisito),\n  - normalización de entrada (natural-language/JSON → estructura interna),\n  - la **capa de mapeo relocalizada** (campo↔valor como función pura\n    `(entrada normalizada) → acciones`, testeable sin cargar la extensión,\n    independientemente de dónde se aloje),\n  - `parseUnitButtonLabel` (FIX-2),\n  - `cleanAriaLabel` (FIX-1),\n  - agregación de resultados (contar pedido-vs-confirmado y decidir\n    `DONE`/`ERROR`/`PARTIAL`; función pura que ancla la compuerta P3).\n- **Coverage floor: 80%** sobre la lógica pura de la Zona A. Cada función pura\n  extraída nace con al menos su test de happy-path más sus casos de error\n  conocidos.\n- **Zona B — núcleo RPA dependiente del DOM CloudScape (NO se automatiza como\n  e2e).** `scanForm`, `fillByLabel`, `resolveElementByLabel`,\n  `selectAwsDropdown`, `saveService`, `addService`, `executeActions` dependen de\n  un DOM de terceros no determinista y posiblemente stale (P2). Verificación:\n  **solo smoke manual**; **sin piso de cobertura** ni e2e automatizado sobre ese\n  DOM. Un journey contra un DOM emulado probaría un DOM fabricado por nosotros,\n  no el CloudScape real donde vive el riesgo P2; un e2e real (Playwright contra\n  una SPA de terceros, con efectos de lado en `calculator.aws`) no justifica el\n  costo para un mantenedor solo.\n\n### Smoke manual versionado (Zona B)\n\nChecklist de smoke reproducible, versionado en `aws-calculator-extension/SMOKE.md`\n(sin build, sin tooling), derivado del data-flow de `architecture.md`. Mínimo:\n\n1. Recargar la extensión unpacked; abrir `calculator.aws`.\n2. Caso canónico de 1 servicio simple (el mismo del walking skeleton) **y** un\n   caso **multi-servicio con al menos un toggle condicional**\n   (Bedrock/SageMaker — FIX-7).\n3. Verificar que la URL devuelta abre un estimado **completo** (todos los\n   servicios pedidos presentes), no solo que llegó una URL.\n4. **Caso de fallo provocado** (cerebro caído / `[]`): confirmar que **no**\n   produce `DONE` con URL (ver la compuerta P3 en `discovered-rules.md`)."
    }
  ],
  "obligations": {
    "strategy": "standard",
    "strategy_volume": [
      "Five to eight tests per component.",
      "Unit tests plus integration tests for key boundaries.",
      "Add E2E, performance, or security tests when requirements demand them."
    ],
    "scope_floor": [
      "Keep the existing test suite green.",
      "This scope adds no extra new-test floor beyond the selected test strategy."
    ],
    "combination_rule": "Apply every selected-strategy obligation and every scope-floor obligation; neither replaces the other, and a targeted scope regression may add the narrowest necessary test type beyond the strategy default."
  },
  "plan_profile": {
    "methodology": "test-after",
    "runner_step": "Verify the existing test runner/configuration and record the exact unit-scoped command.",
    "runner_ready_before_first_test": true,
    "testable_layers": [
      "Data model / database behavior",
      "Repository / data access",
      "Business logic",
      "API / endpoint",
      "Frontend behavior"
    ],
    "steps": [
      "Project structure and production configuration skeleton.",
      "Verify the existing test runner/configuration and record the exact unit-scoped command.",
      "Data model / database behavior - implement.",
      "Data model / database behavior - write and run its tests after implementation.",
      "Repository / data access - implement.",
      "Repository / data access - write and run its tests after implementation.",
      "Business logic - implement.",
      "Business logic - write and run its tests after implementation.",
      "API / endpoint - implement.",
      "API / endpoint - write and run its tests after implementation.",
      "Frontend behavior - implement.",
      "Frontend behavior - write and run its tests after implementation.",
      "Environment/build configuration.",
      "Documentation and traceability."
    ]
  },
  "input_sha256": "sha256:72b76659843faaac48ac24801b735c563a9df049e9c11ca2942aeba55e79f6d7",
  "contract_sha256": "sha256:ad86b0d4b1e8dd0bc5a2ed622d47420dac0685e91b5f163da3c572da7c7d7f48"
}
```

## Pasos

- [x] **Step 1. Estructura.** Crear en `lib/panel/` los módulos de Zona A (`url-check.js`, `history-model.js`, `timers.js`, `session-rule.js`, `waf-model.js`) y de Zona B (`effects.js`, `tab-store.js`, `history-view.js`, `render/`) con sus exports declarados, y `lib/history-store.js` (decisión 1).
- [x] **Step 2. Runner.** Verificar Vitest existente (`npx vitest run tests/u1` en verde) y registrar el comando `npx vitest run tests/u6`; crear `tests/u6/` y `tests/u6/fixtures.js` (`NormalizedRun` de JSON y de lenguaje natural, `InputError` de cada familia, `RunResult` DONE/ERROR con faltantes, sustituciones y `brainErrorCode`, `ProgressEvent`, respuestas WAF válidas e inválidas, sesiones con distintos `expiresAt`).
- [x] **Step 3. Modelo de datos: textos, URL, historial y WAF.** `messages-es.js`: `messageFor(code, params)` con las tablas de §6 ampliadas (decisión 6), respaldo "Ocurrió un problema ({código})." y "Trabajando…", parámetros como texto recortado a 200, aviso de sustitución "Pediste X; se usó Y" y el texto de R-13. `url-check.js` (decisión 10). `history-model.js`: orden por fecha, recorte a 200 y filas con veredicto, servicios y enlace solo si la URL valida. `waf-model.js` (decisión 8).
- [x] **Step 4. Pruebas del modelo.** `tests/u6/messages-es.test.js` (cada código de U2, U4, U5 y U7 con texto no vacío, código desconocido, recorte a 200, sustitución, sin emojis), `tests/u6/url-check.test.js` (válida, otro host, `javascript:`, id de más de 128, vacía), `tests/u6/history-model.test.js` (500 corridas sintéticas, orden, recorte, enlace inválido sin `href`), `tests/u6/waf-model.test.js` (pedido armado, respuesta válida, pilar o severidad fuera de lista, índice fuera de rango, vacío sin `noFindings` → inválido). Reemplazar `tests/u1/messages-es.test.js` (decisión 13).
- [x] **Step 5. Acceso a datos: historial y texto de pestañas.** `lib/history-store.js` (decisión 1) sobre `lib/log/log-index.js`. `tab-store.js`: `chrome.storage.session` con prefijo `panel:`, retardo de 500 ms, vaciado en `blur` y `pagehide`, sin leer ninguna otra clave.
- [x] **Step 6. Pruebas de acceso a datos.** `tests/u6/history-store.test.js` con `chrome` simulado (listar, borrar una, borrar todas, corrida activa presente y ausente, error de almacenamiento → resultado tipado) y `tests/u6/tab-store.test.js` (retardo, vaciado, prefijo, no toca `brain:session`).
- [x] **Step 7. Lógica: reductor, temporizadores y sesión.** `panel-state.js` reescrito con la máquina completa de functional-spec §2 (Idle, Validating, Interpreting, InputError, Preview con `needsLogin`, Reviewing, ReviewFindings, ReviewError, Connecting, ConnectionError, Running con `cancelPending`, Done, Failed, WafLoading, WafResult, WafError), `requestId`/`runId` y filtro de eventos ajenos (BR3.3), DONE con URL inválida → Failed (BR3.4), `canRetry` solo con `failureStep` `connection` o `preconditions` y `normalizedRun` en memoria, login (`unauthorized`, `LOGIN_OK` vuelve al estado previo, `LOGIN_CANCELLED` deja el error; Failed con `brainErrorCode = unauthorized` ofrece login), `brain_unavailable` en Reviewing → Connecting con aviso (decisión 3), R-11 y R-17 (decisión 11), `RESUME_ACTIVE` (decisión 4), conservando `resolveInitialView`. `timers.js`: reloj inyectable con 30 s, 35 s, 20 s, 2 s y 300 ms. `session-rule.js` (decisión 9).
- [x] **Step 8. Pruebas de la lógica.** `tests/u6/panel-state.transitions.test.js` (todas las transiciones de §2), `tests/u6/panel-state.ids.test.js` (`runId` y `requestId` ajenos, eventos sin transición), `tests/u6/panel-state.login.test.js` (`unauthorized`, `LOGIN_OK`, `LOGIN_CANCELLED`, `needsLogin`, Failed con `brainErrorCode`), `tests/u6/panel-state.waits.test.js` (recorre la máquina y verifica que todo estado de espera tiene salida por `timeout` o cancelación, NFR8.4; `canRetry`; nunca Done sin URL válida), `tests/u6/timers.test.js` y `tests/u6/session-rule.test.js` (sin sesión, menos de 15 min, más de 15 min, respuesta con error). Reemplazar `tests/u1/panel-state.test.js` (decisión 13).
- [x] **Step 9. Bordes: efectos.** `effects.js` (Zona B): crea `callId`, llama a `brain-port` de U7 con los topes de la decisión 2, envía `BRAIN_CANCEL` al cancelar o vencer, descarta respuestas tardías, repite la llamada tras `LOGIN_OK`, consulta `BRAIN_SESSION` antes de Reviewing, envía `RUN_RPA` y `CANCEL_RPA`, y traduce todo a eventos del reductor. Retirar `pct` y `text` de `buildProgressEvent` y `lib/messages.js` (decisión 7) y ajustar sus pruebas.
- [x] **Step 10. Pruebas de los bordes.** `tests/u6/effects.test.js` con `chrome`, `brain-port` y reloj simulados (reutilizando `tests/u7/fakes.js` y `tests/u1/fake-chrome.js`): cancelación envía `BRAIN_CANCEL` con el mismo `callId`, respuesta tardía descartada, repetición tras `LOGIN_OK`, `BRAIN_SESSION` sin respuesta en 2 s → `needsLogin`, `CANCEL_RPA` con el `runId` activo. Sin piso de cobertura (Zona B).
- [x] **Step 11. Frontend.** `sidepanel.html` estático (pestañas con `tablist`, aviso `NL_PRIVACY_NOTICE` con `aria-describedby`, `StatusRegion` con `aria-live`/`aria-busy`, los `data-testid` de frontend-components, diseño usable desde 320 px). `render/*.js` con `createElement` y `textContent`, clases fijas (sin `.style`), `href` solo con URL validada o `blob:` propio y `rel="noopener noreferrer"`, agrupado por `requestAnimationFrame`. `history-view.js`. `sidepanel.js`: arranque con `Promise.all` de pestañas y corrida activa, tope de 300 ms, `performance.mark('panel-ready')`, sin pintar el último resultado al abrir (AC6.3.1), Escape para cancelar, foco y `role="alert"` en errores, evaluación final automática en Done (BR4.1).
- [x] **Step 12. Configuración.** `eslint.config.js`: bloque para `sidepanel.js` y `lib/panel/**` que extiende `securityRules` y suma `selectorSyntax`, prohíbe `fetch`, `chrome.storage.local`/`sync`, `chrome.storage.session` fuera de `tab-store.js`, asignación a `.style` y a `on*`, y `setAttribute` con nombre no literal; `document` y `chrome` prohibidos en los módulos de Zona A; el bloque final de selectores de U5 excluye `sidepanel.js` y `lib/panel/**` (decisión 12). `tests/u6/eslint-panel.test.js` lo comprueba con `ESLint.calculateConfigForFile`. `vitest.config.js`: Zona A en `coverage.include` y umbral `{ lines: 80, branches: 80 }` sobre `lib/{panel/panel-state,panel/url-check,panel/history-model,panel/timers,panel/session-rule,panel/waf-model,messages-es}.js`. `package.json`: `"test:u6": "vitest run tests/u6"`. No se toca el umbral global.
- [x] **Step 13. Verificación manual y documentación.** `SMOKE.md` según la decisión 14, manteniendo el formato que comprueba `tests/u5/smoke-doc.test.js`. Correr `npx vitest run tests/u6`, la suite completa, `npm run lint`, `npm run format:check` y `npm run check:bundle`; escribir `source-manifest.json`, `code-summary.md` (con las decisiones 1-14) y `traceability.json`.

## Trazabilidad

| Paso | Historias / requisitos |
|---|---|
| 1 | NFR6.1 (estructura Zona A / Zona B) |
| 2 | NFR6.1 |
| 3-4 | US5.1, US6.1, US6.3; BR3.2, BR3.4, BR4.1, BR5.3; NFR3.1, NFR5.2, NFR5.3, NFR8.7 |
| 5-6 | US6.3; BR1.1, BR5.3; NFR5.4, NFR8.7 |
| 7-8 | US5.1, US6.1, US6.2; FR1, FR7.2, FR7.3; BR1.1-BR1.3, BR2.1-BR2.3, BR3.1-BR3.4; NFR3.2, NFR5.5, NFR8.4 |
| 9-10 | US6.2; FR8.3-FR8.5; NFR5.5, NFR8.4; contratos `BRAIN_*`, `RUN_RPA`, `CANCEL_RPA` |
| 11 | US5.1, US6.1-US6.3; BR1.2, BR1.3, BR2.2, BR4.1, BR5.1, BR5.2; NFR5.1, NFR8.5, NFR8.6 |
| 12 | NFR5.1, NFR5.4, NFR6.1 |
| 13 | NFR6.1, NFR6.2 |
