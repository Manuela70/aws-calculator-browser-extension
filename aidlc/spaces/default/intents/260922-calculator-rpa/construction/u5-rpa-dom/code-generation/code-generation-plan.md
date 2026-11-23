# Plan de generación de código — u5-rpa-dom

## Summary

- Builds: el núcleo RPA completo sobre calculator.aws: flujos R1/R2 con región, plantilla, corte de 3 minutos por servicio, salida sin guardar y `not_attempted`; confirmación de guardado solo por banner nuevo con el nombre exacto; resolución de campos en cascada; contador de reintentos; resultados tipados con sustituciones del cerebro, enlace de Share validado, progreso estructurado y cancelación de la corrida; overlay en shadow root.
- Touches: `aws-calculator-extension/lib/rpa/` (`orchestrator.js`, `result-aggregator.js`, `retry.js`, `service-timer.js`), `lib/dom/` (`aria-label.js`, `cascade.js` y `spotlight.js` nuevos, `dom-utils.js`, `dom-resolver.js`, `form-scanner.js`, `selectors.js`), `lib/messages.js`, `lib/messages-es.js`, `lib/content-main.js`, `content.js`, `SMOKE.md`, `tests/u5/`, `tests/u1/` (orquestador, agregador, reintentos y DOM falso), `eslint.config.js`, `vitest.config.js`, `package.json`.
- Tests: unas 60 pruebas de Vitest en `node` (5-8 por componente de Zona A en 9 archivos, con un resolvedor de DOM falso para el orquestador), umbral propio de 80 % en líneas y ramas sobre los seis módulos de Zona A, y nueve casos manuales en `SMOKE.md` para la Zona B.

## Contexto

- Diseño de esta unidad: `functional-design/` (functional-spec con R1/R2, entities, rules BR1.x-BR5.x), `nfr-requirements/` (security-requirements, tech-stack-decisions), `nfr-design/` (security-design, logical-components), `infrastructure-design/cicd-pipeline.md`.
- Brownfield: existen desde U1 los provisionales `orchestrator.js` (`runEstimate`, `stepToFailure`), `result-aggregator.js` (`aggregate`, `estimateMatchesRequest`, `buildErrorRunResult`, `finalizeRunResult`), `retry.js` (`retry`, `canAttempt`), `service-timer.js` (`createServiceTimer`, `raceWithSignal`), `wait.js` (`waitFor` con resultado tipado, `sleep`, `DELAY`), `dom-resolver.js`, `form-scanner.js`, `dom-utils.js` y `aria-label.js` (solo `cleanAriaLabel`, movida por U3). La cadena es `content.js` → `lib/content-main.js` → `runEstimate(..., { dom: createDomResolver() })`.
- Pendientes heredados: U3 deja en el `MappingOutcome` `residueDetail`, `brainErrorCode` y acciones con `substituted`/`requestedValue`, que hoy el orquestador descarta; U2 copia `template` al `ServiceRequest` y reporta un `template` inválido como `invalid_service` con `key: "template"`.
- En paralelo se construye u7. **U7 es dueño** de `manifest.json` (incluido `minimum_chrome_version: "130"`), `tests/u1/manifest.test.js`, `scripts/check-bundle.js`, `sw/**`, `lib/connection/brain-port.js` y la línea de `lib/content-main.js` que pasa `mapResidue`. U5 no toca esos archivos ni esa línea. U6 construirá después el panel que consume `RunResult`, `ProgressEvent` y la cancelación.

### Decisiones que este plan fija

1. **Forma de `RunResult`.** Se conserva `perServiceResults` (lo usan `isRunResult`, `messages-es.js` y `sidepanel.js`) y se agregan `missing`, `stoppedAtLabel` y, por servicio, `durationMs`, `brainSubstitutions` (`{ key, requestedValue, appliedValue }`) y `brainErrorCode` (security-design NFR3.4, aunque `entities.md` no lo liste). `aggregate` sigue devolviendo solo `DONE` o `ERROR`.
2. **`ProgressEvent`.** Pasa a estructurado (`runId`, `step`, `serviceIndex`, `serviceCount`, `label`, `serviceStatus`, `requestId?`) y conserva `pct` y `text` mientras el panel actual los use; U6 los retira.
3. **Enlace de Share inválido.** `failureStep = "share"` con `reason = "share_invalid"`, que se agrega al conjunto de motivos (NFR5.4 de requisitos y diseño quedan reconciliados así).
4. **`waitFor`.** Se mantiene `lib/rpa/wait.js` (resultado tipado, sin rechazar) como primitiva pura; `dom-utils.js` la envuelve y convierte el fallo en `DomError { code, step, label }`.
5. **Tabla `DomError` → `reason`/`failureStep`.** Vive en `result-aggregator.js` para quedar dentro del umbral de Zona A.
6. **`RetryCounter`.** Clase con `operation` (`save` 3, `search_service` 2, `dropdown_open` 2, `page_wait` 1), `next()`, `exhausted` y último código; `retry()` se conserva como envoltorio.
7. **Cancelación.** Mensaje nuevo `CANCEL_RPA { runId }` en `lib/messages.js`, aceptado por `content.js` y `content-main.js`; aborta la señal de la corrida, limpia el overlay y termina con `RunResult` `ERROR` y motivo `cancelled`, con los servicios restantes `not_attempted`.
8. **Textos en español de los códigos nuevos.** `template_not_found`, `field_not_resolved`, `option_ambiguous`, `not_attempted`, `share_invalid`, `cancelled` y el aviso de sustitución ("Pediste X; se usó Y") se agregan a `lib/messages-es.js` (BR4.3). U6 es dueño final del copy y puede reescribirlos.
9. **Coincidencias exactas.** `findServiceCard`, `estimateMatchesRequest`, `isSuccessBanner` y la relectura de `selectDropdownOption` pasan de "contiene" a coincidencia exacta normalizada; `is required` se busca solo dentro del formulario abierto; la región se fija en el primer servicio cuyo formulario se abre (no en `index === 0`), con detalle `"Region"`.
10. **Literales `awsui_`.** Se mueven a `selectors.js` (`dom-resolver.js` y `form-scanner.js` hoy los tienen en línea), junto con `BUTTON_TEXTS`, para cumplir la regla de lint de NFR2.1.
11. **Registro técnico de U1.** `lib/content-main.js` usa `chrome.storage.local` vía `run-logger`; queda fuera del alcance del lint del content script (`content.js`, `lib/dom/**`, `lib/rpa/**`, `lib/mapping/**`) y no se cambia aquí.
12. **Formulario parcialmente llenado** (hallazgo de la revisión de U3). Cuando un servicio falla después de aplicar acciones, `exitWithoutSave` sale sin guardar y confirma que My Estimate está visible; si no se confirma, la corrida se detiene (`RunStopped`). `SMOKE.md` lo verifica.
13. **Verificación de `SMOKE.md`.** La prueba de que existen los nueve casos va en `tests/u5/smoke-doc.test.js`, no en `check-bundle.js` (que es de U7).

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

- [x] **Step 1. Estructura.** Crear `lib/dom/cascade.js` y `lib/dom/spotlight.js` con sus exports declarados; mover los literales `awsui_` de `dom-resolver.js` y `form-scanner.js` a `selectors.js` y exportar desde allí `BUTTON_TEXTS` como objeto congelado (decisión 10).
- [x] **Step 2. Runner.** Verificar Vitest existente (`npx vitest run tests/u1` en verde) y registrar el comando `npx vitest run tests/u5`; crear `tests/u5/` y `tests/u5/fixtures.js` (pedidos de uno y varios servicios con plantilla y toggle, `MappingOutcome` con sustituciones y `brainErrorCode`, candidatos por estrategia); ampliar `tests/u1/fake-dom.js` con `selectTemplate`, `exitWithoutSave` y `calculatorServiceName`.
- [x] **Step 3. Modelo de datos: resultados.** En `result-aggregator.js`: `buildServiceResult` (copia `brainSubstitutions` y `brainErrorCode`, `durationMs`, motivo y paso), `clip(text, 200)`, `validateShareUrl` con `^https://calculator\.aws/#/estimate\?id=[A-Za-z0-9-]{1,128}$` (decisión 3), `buildProgressEvent` (decisión 2), la tabla `DomError` → `reason`/`failureStep` (decisión 5) y `finalizeRunResult` con `missing` y `stoppedAtLabel` (decisión 1). `estimateMatchesRequest` compara como multiconjunto exacto (decisión 9). Nuevos motivos en `messages-es.js` (decisión 8).
- [x] **Step 4. Pruebas de resultados.** `tests/u5/service-result.test.js` (sustituciones completas, `brainErrorCode`, recorte a 200, progreso estructurado), `tests/u5/share-url.test.js` (válido, otro host, `javascript:`, vacío, id de más de 128), `tests/u5/error-codes.test.js` (cada fila de la tabla y código desconocido), y ampliación de `tests/u1/result-aggregator.test.js` (multiconjunto con homónimos, `missing`, nunca `DONE` con faltantes).
- [x] **Step 5. Lógica: resolución en cascada y etiquetas.** `aria-label.js`: `parseUnitButtonLabel` (FIX-2/FIX-8, BR3.3), sin tocar `cleanAriaLabel` ni importar nada de Zona B (U3 lo importa). `cascade.js`: `selectByCascade(candidatesByStrategy, requestedSection)` en el orden `aria_label` → `aria_labelledby` → `label_for` → `section_heading`, exactamente un candidato o `field_not_resolved` (BR3.1), y `joinLabelledBy` para `aria-labelledby`.
- [x] **Step 6. Pruebas de cascada y etiquetas.** `tests/u5/cascade.test.js` (cada estrategia con 0, 1 y varios candidatos, con y sin sección, `aria-labelledby` reconstruido) y `tests/u5/aria-label.test.js` (tabla de `parseUnitButtonLabel` con los botones de unidad de ELB y WAF, entradas vacías o sin unidad).
- [x] **Step 7. Lógica: reintentos y corte por servicio.** `retry.js`: `RetryCounter` (decisión 6) con `retry()` como envoltorio. `service-timer.js`: corte de 180 s con reloj inyectable `{ setTimeout, clearTimeout }`, encadenado a la señal de la corrida, sin `AbortSignal.timeout` ni `AbortSignal.any` (BR2.7, NFR8.4).
- [x] **Step 8. Pruebas de reintentos y corte.** `tests/u5/retry-counter.test.js` (cada tope de BR4.1, último código, `exhausted`) y `tests/u5/service-timer.test.js` (reloj falso, corte a 180 s, cancelación de la corrida que se propaga, `clear` sin efecto tardío); ajustar `tests/u1/retry-wait-timer.test.js` a la API nueva.
- [x] **Step 9. Lógica: orquestador.** `orchestrator.js`, flujos R1 y R2 sobre el resolvedor inyectado: región en el primer formulario abierto con detalle `"Region"`, plantilla antes de los toggles (`template_not_found`), ciclo de mapeo de U3 conservando `residueDetail`, `brainErrorCode` y sustituciones en el `ServiceResult`, `calculatorServiceName` leído de la tarjeta hasta `confirmSave`, corte de 3 minutos, `exitWithoutSave` con su propia señal de 20 s y `RunStopped` con `not_attempted` si no se confirma (decisión 12), `stoppedAtLabel`, cancelación (decisión 7), progreso estructurado.
- [x] **Step 10. Pruebas del orquestador.** `tests/u5/orchestrator-multi.test.js` con el DOM falso: multi-servicio con fallo intermedio y continuación, plantilla inexistente, corte de 3 minutos, salida no confirmada → `RunStopped` y `not_attempted`, región fijada tras un `service_not_found`, cancelación a mitad de corrida, sustitución del cerebro visible en el resultado, nunca `DONE` si falta un servicio; actualizar `tests/u1/orchestrator.test.js` a la salida nueva.
- [x] **Step 11. Zona B: DOM.** `dom-utils.js`: `waitFor` con `DomError` sobre `lib/rpa/wait.js` (decisión 4), `readBack` (NFR3.3), `confirmSave(calculatorServiceName, signal)` con lista previa de banners y `MutationObserver` (confirma solo un banner **nuevo** `^Successfully added (.+) estimate\.$` con el nombre exacto; `is required` dentro del formulario abierto → `validation_required`; 10 s por intento, hasta 3), `exitWithoutSave` y `verifyEstimate` exacto. `dom-resolver.js` y `form-scanner.js`: candidatos por estrategia para `selectByCascade`, plantilla, opciones al abrir con `matchOption` (`option_no_match`/`option_ambiguous`, BR2.8), exclusión de `[data-aidlc-overlay]`, coincidencias exactas (decisión 9). `spotlight.js`: shadow root cerrado, solo `textContent`, limpieza en `finally`, respeta `prefers-reduced-motion` (BR5.1, BR5.2).
- [x] **Step 12. Mensajes y punto de entrada.** `lib/messages.js`: `CANCEL_RPA` y validador. `content.js`: acepta `CANCEL_RPA` con la misma guardia de remitente. `lib/content-main.js`: conecta la cancelación con la señal de la corrida y el progreso nuevo (sin tocar la línea de `mapResidue`, que es de U7).
- [x] **Step 13. Configuración.** `eslint.config.js`: bloque del content script (`content.js`, `lib/dom/**`, `lib/rpa/**`, `lib/mapping/**`) que **extiende** las listas base de `securityRules` y suma `XMLHttpRequest`, `WebSocket`, `EventSource`, `self.fetch`, `chrome.storage` y `document.write`; `no-restricted-syntax` contra el prefijo `awsui_` y los textos de `BUTTON_TEXTS` fuera de `selectors.js`; `document` y `chrome` prohibidos en los módulos de Zona A (NFR7.1). `tests/u5/eslint-config.test.js` lo comprueba con `ESLint.calculateConfigForFile`. `vitest.config.js`: `cascade.js` en `coverage.include` y umbral `{ lines: 80, branches: 80 }` sobre `lib/{rpa/orchestrator,rpa/result-aggregator,rpa/retry,rpa/service-timer,dom/aria-label,dom/cascade}.js`. `package.json`: `"test:u5": "vitest run tests/u5"`. No se toca el umbral global ni el manifest.
- [x] **Step 14. Verificación manual y documentación.** Reescribir `SMOKE.md` con nueve casos (servicio simple canónico de EC2, multi-servicio con toggle condicional, servicio inexistente, campo obligatorio vacío, fallo a mitad de corrida con salida sin guardar, cancelación, sustitución del cerebro, homónimos donde el banner del primero no confirma el segundo, overlay ausente tras cancelar), cada uno con su resultado esperado en el panel; `tests/u5/smoke-doc.test.js` verifica que los nueve existen (decisión 13). Correr `npx vitest run tests/u5`, `npx vitest run tests/u1`, `npx vitest run tests/u3`, `npm run lint`, `npm run format:check` y `npm run check:bundle`; escribir `source-manifest.json`, `code-summary.md` (con las decisiones 1-13) y `traceability.json`.

## Trazabilidad

| Paso | Historias / requisitos |
|---|---|
| 1 | NFR2.1 (selectores en un solo punto), NFR5.2, NFR5.3 |
| 2 | NFR6.1 |
| 3-4 | US4.1, US4.2; BR2.4, BR2.6, BR4.2, BR4.3; NFR3.2, NFR3.4, NFR5.4, NFR5.5, NFR8.6 |
| 5-6 | US4.1; BR3.1-BR3.3 (FIX-1, FIX-2, FIX-8); NFR2.2 |
| 7-8 | BR2.7, BR4.1; NFR8.4, NFR8.5 |
| 9-10 | US4.1, US4.2; BR1.1-BR1.3, BR2.1-BR2.7; NFR3.5, NFR8.4; borde con U3 (`MappingOutcome`) |
| 11 | BR2.6, BR2.8, BR3.1, BR5.1, BR5.2; NFR2.2, NFR2.3, NFR3.1, NFR3.3, NFR3.5, NFR5.2, NFR5.3 |
| 12 | Contrato de mensajes (`CANCEL_RPA`, progreso, `RunResult`); borde con U6 |
| 13 | NFR2.1, NFR4.1, NFR5.1, NFR5.2, NFR6.1, NFR7.1 |
| 14 | NFR6.1, NFR6.2 |
