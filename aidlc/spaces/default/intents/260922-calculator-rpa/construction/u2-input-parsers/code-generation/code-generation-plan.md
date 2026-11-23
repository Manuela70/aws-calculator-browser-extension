# Plan de generación de código — u2-input-parsers

## Summary

- Builds: la entrada completa: validación estricta del JSON del Anexo A con esquema cerrado, interpretación del lenguaje natural vía el puerto del cerebro (tope de 30 s, cancelación, forma de la respuesta validada), normalización asíncrona a `NormalizedRun` y errores tipados en español.
- Touches: `aws-calculator-extension/lib/input/` (`input-schema.js`, `input-errors.js` y `nl-interpreter.js` nuevos; `json-parser.js` e `input-normalizer.js` completados), el llamador en `sidepanel.js`, `tests/u2/`, `vitest.config.js`, `package.json`.
- Tests: unas 40 pruebas de Vitest en `node` (5-8 por módulo más una prueba estructural de imports y una de integración de `normalize` con dobles del puerto), umbral propio de 80 % en líneas y ramas sobre `lib/input/**`.

## Contexto

- Diseño de esta unidad: `functional-design/` (functional-spec, entities, rules BR1.x-BR5.x), `nfr-requirements/` (security-requirements, tech-stack-decisions), `nfr-design/` (security-design, logical-components), `infrastructure-design/cicd-pipeline.md`.
- Historias: US2.1, US2.2 y US3.1 (`inception/user-stories/stories.md`); requisitos FR1, FR8, NFR1, NFR3 y Anexo A.
- Brownfield: `json-parser.js` e `input-normalizer.js` existen desde u1 como provisionales; U2 los completa en sitio. `normalize` pasa de síncrono a `normalize(rawInput, deps)` asíncrono, así que se ajusta su llamador en `sidepanel.js`.
- En paralelo se construyen u3 y u4; no estarán en esta copia. El puerto `interpretNaturalLanguage` lo conecta U7 (service worker, `BRAIN_CALL`) más tarde: aquí se diseña contra el contrato (`contract-summary.md`, canal de error `BrainCallError`) y se prueba con dobles. Mientras no haya puerto, el camino de lenguaje natural responde `brain_unavailable` (BR3.5).

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

- [x] **Step 1. Estructura.** Crear `lib/input/input-schema.js` (topes: 2 000 caracteres de lenguaje natural, 100 000 de JSON, servicios y campos máximos; claves permitidas y rechazadas del esquema cerrado, incluida `template`) e `lib/input/input-errors.js` (enum `InputError` completo: los de BR1-BR5 más `unauthorized`, `login_cancelled`, `rate_limited`, `daily_quota_exceeded`, `inventory_unavailable`, `timeout`, `unexpected_error`, `cancelled`, `input_limit_exceeded`; mensajes en español; `NL_PRIVACY_NOTICE`). Sin dependencias de runtime.
- [x] **Step 2. Runner.** Verificar Vitest existente (`npx vitest run tests/u1` en verde) y registrar el comando de la unidad `npx vitest run tests/u2` en `unit-test-instructions.md`; crear `tests/u2/` y `tests/u2/fixtures.js` (JSON válido del Anexo A, respuestas `interpreted` y `unresolved`, dobles del puerto).
- [x] **Step 3. Lógica: `json-parser.js`.** Completar el grupo 2: tope de tamaño antes de parsear, `JSON.parse`, raíz, `services`, tipos, esquema cerrado con `template` admitido, primer error con servicio y clave (BR2.1-BR2.7). Exportar el validador común que reutiliza la respuesta del cerebro (BR3.3).
- [x] **Step 4. Pruebas de `json-parser.js`.** Mover las pruebas existentes de `tests/u1/json-parser.test.js` a `tests/u2/json-parser.test.js` y ampliarlas: caso feliz, JSON inválido, raíz no objeto, `services` vacío o ausente, clave desconocida (`feilds`), `template` admitido, tope de tamaño. Ejecutar `npx vitest run tests/u2/json-parser.test.js`.
- [x] **Step 5. Lógica: `nl-interpreter.js`.** Armar `NlInterpretationRequest` (`{ text, locale: "es", schemaVersion: 1 }`); `AbortController` propio encadenado a la señal de la corrida, temporizador de 30 s y `Promise.race`, gana el primer evento; validar la forma de la respuesta (paso 2b, BR3.6) con el validador común; traducir cada `BrainCallError.code` a su `InputError`: los códigos con equivalente pasan igual (`unauthorized`, `login_cancelled`, `rate_limited` con `retryAfterSeconds`, `daily_quota_exceeded`, `inventory_unavailable`, `timeout`); `empty_result` → `nl_invalid_response`; `bad_request`, `internal_error`, `brain_unavailable` y cualquier código desconocido → `brain_unavailable` (NFR3.2). El vencimiento del tope propio de 30 s devuelve `timeout`, igual que el `timeout` del puerto, para que el SE vea un solo texto para "tardó demasiado" (corrige la frase de `security-design.md` NFR8.4 que decía `brain_unavailable`). `unresolved` → `nl_unresolved` con fragmentos (BR3.4). Se conserva el nombre `parseRunInput` del validador común.
- [x] **Step 6. Pruebas de `nl-interpreter.js`.** Con un doble del puerto y `vi.useFakeTimers()`: `interpreted` válido, `unresolved`, respuesta con forma inválida, cada código del canal de error, tope de 30 s → `timeout`, cancelación antes de la respuesta → `cancelled`, respuesta tardía descartada.
- [x] **Step 7. Lógica: `input-normalizer.js`.** `normalize({ format, text }, { interpretNaturalLanguage, signal })` asíncrono: vacío → `empty_input`, topes, rama JSON o lenguaje natural, construcción de `NormalizedRun` con `regionDefaulted` (BR4.1) y `wafReview` (BR5.4), `try/catch` → `unexpected_error`; `toLogEntry` sin texto de lenguaje natural y con el JSON rechazado completo hasta 100 000 caracteres (`input_too_long` registra solo la longitud).
- [x] **Step 8. Pruebas de `input-normalizer.js`.** Mover `tests/u1/input-normalizer.test.js` a `tests/u2/` y ampliarlo: camino JSON feliz, camino lenguaje natural feliz, puerto ausente → `brain_unavailable`, región por defecto, marca de revisión, excepción no prevista, `toLogEntry` en sus tres casos.
- [x] **Step 9. Lógica: llamador del panel.** Ajustar `sidepanel.js` para `await normalize(...)` con la señal de la corrida y puerto `null` hasta que U7 lo conecte; el texto de error sale de `input-errors.js` y se pinta con `textContent`.
- [x] **Step 10. Pruebas de integración y estructura.** `tests/u2/normalize.integration.test.js`: la misma suite de interpretación con dos dobles distintos del puerto (NFR1.1). `tests/u2/imports.test.js`: lee `lib/input/**`, extrae `import`, `export ... from` e `import()` y falla si algo sale de `lib/input/**`, `lib/messages*.js` y `lib/mapping/region-map.js` (tabla de regiones de u1 que U2 usa para `isKnownRegion` y `DEFAULT_REGION`; son datos puros y se admiten de forma explícita) (NFR7.1). Prueba de "sin marcado": las salidas públicas no contienen `<` ni `>` generados por U2 (NFR3.6).
- [x] **Step 11. Configuración.** `vitest.config.js`: agregar `input-schema.js`, `nl-interpreter.js`, `input-errors.js` a `coverage.include` y el umbral `coverage.thresholds["aws-calculator-extension/lib/input/**"] = { lines: 80, branches: 80 }`; `package.json`: script `"test:u2": "vitest run tests/u2"`. `eslint.config.js`: bloque para `lib/input/**` que **extiende** las listas base de `securityRules` y suma `fetch`, `XMLHttpRequest` y `chrome` a `no-restricted-globals`. No se toca el umbral global.
- [x] **Step 12. Verificación y documentación.** Correr `npx vitest run tests/u2`, `npm run lint`, `npm run format:check` y `npm run check:bundle`; escribir `source-manifest.json`, `code-summary.md` y `traceability.json` de la etapa.

## Trazabilidad

| Paso | Historias / requisitos |
|---|---|
| 1 | US2.1, US2.2, US3.1; BR1.2, BR2.5, BR2.7, BR3.1; NFR3.3-NFR3.5, NFR5.2 |
| 2 | NFR6.2 |
| 3-4 | US2.1, US2.2; FR1; BR2.1-BR2.7, BR3.3; NFR3.1, NFR3.4 |
| 5-6 | US3.1; BR3.2-BR3.6; NFR3.2, NFR8.1, NFR8.4, NFR8.5 |
| 7-8 | US2.1, US3.1; FR8; BR1.1, BR1.2, BR4.1, BR5.4; NFR3.6, NFR5.3, NFR5.4 |
| 9 | US2.1, US3.1 (borde con U6) |
| 10 | NFR1.1, NFR3.6, NFR7.1 |
| 11 | NFR6.1, NFR7.2 |
| 12 | NFR6.1, NFR7.2 |
