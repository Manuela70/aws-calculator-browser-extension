# Plan de generación de código — u3-deterministic-mapper

## Summary

- Builds: el mapeo completo de valores a campos del formulario: pasadas deterministas con cierre a las 3, coincidencia de opciones con patrón numérico y unidades, y el residuo resuelto por el cerebro (validación de la respuesta, tope de 30 s, cancelación, sin reintentos, `brainErrorCode`).
- Touches: `aws-calculator-extension/lib/mapping/` (`deterministic-mapper.js` y `option-match.js` completados, `residue-resolver.js` nuevo), `lib/dom/aria-label.js` nuevo (se mueve `cleanAriaLabel` desde `dom-utils.js`), el llamador en `lib/rpa/orchestrator.js`, `tests/u3/`, `tests/u1/orchestrator.test.js`, `vitest.config.js`, `eslint.config.js`, `package.json`.
- Tests: unas 35 pruebas de Vitest en `node` (5-8 por módulo, una prueba estructural de imports y una de integración del ciclo de pasadas con residuo), umbral propio de 80 % en líneas y ramas sobre los tres módulos de U3.

## Contexto

- Diseño de esta unidad: `functional-design/` (functional-spec con el ciclo M2, entities, rules BR1.x-BR4.x), `nfr-requirements/`, `nfr-design/` (security-design, logical-components), `infrastructure-design/cicd-pipeline.md`.
- Historias y requisitos: US4.1 (parte de mapeo), FR3, FR5.2; contrato C1 2.0.0 `/map-residue` con `requestKey` requerido.
- Brownfield: `deterministic-mapper.js` (`mapDeterministic`, `fieldNamePart`, `actionTypeFor`) y `option-match.js` (`normalizeText`, `matchOption`, `matchInstanceRow`) existen desde u1. Se completan en sitio y se conservan sus exports, porque `dom-resolver.js`, `dom-utils.js`, `form-scanner.js` y `orchestrator.js` los usan. `region-map.js` es de u1 y queda fuera.
- **Nombres del resultado:** se usan los de `entities.md` (`pass` de 1 a 3 y `newActionsInLastPass`); donde `security-design.md` NFR8.4 dice `passCount` y `final`, se lee como esos mismos campos.
- **`cleanAriaLabel`:** hoy vive en `lib/dom/dom-utils.js`. U3 la necesita para normalizar etiquetas y la regla de imports solo le permite `lib/dom/aria-label.js`, que aún no existe. U3 crea ese módulo moviendo allí `cleanAriaLabel` (función pura), y `dom-utils.js` la reexporta para no romper a sus llamadores. U5 agregará después `parseUnitButtonLabel` al mismo archivo.
- En paralelo se construyen u2 y u4; no estarán en esta copia. El puerto `mapResidue` lo conecta U7 (`BRAIN_CALL`) más tarde: aquí se diseña contra el contrato y el canal de error `BrainCallError`, y se prueba con dobles.

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

- [x] **Step 1. Estructura.** Crear `lib/dom/aria-label.js` con `cleanAriaLabel` movida desde `dom-utils.js` (que la reexporta) y `lib/mapping/residue-resolver.js` vacío con sus exports declarados.
- [x] **Step 2. Runner.** Verificar Vitest existente (`npx vitest run tests/u1` en verde) y registrar el comando `npx vitest run tests/u3`; crear `tests/u3/` y `tests/u3/fixtures.js` (fixtures de `DomField` derivadas del inventario, valores pedidos, respuestas de `mapResidue`).
- [x] **Step 3. Lógica: `option-match.js`.** Agregar el patrón numérico (decimal simple sin unidad) y la validación de unidades (BR2.2-BR2.5), manteniendo `normalizeText`, `matchOption` y `matchInstanceRow`.
- [x] **Step 4. Pruebas de `option-match.js`.** Mover `tests/u1/option-match.test.js` a `tests/u3/` y ampliarlo: coincidencia exacta, normalizada, número válido e inválido, unidad válida e inválida, sin coincidencia, ambigua.
- [x] **Step 5. Lógica: `deterministic-mapper.js`.** `mapDeterministic(domFields, requestedValues, previousOutcome?) → MappingOutcome` con índice de etiquetas normalizadas y "Sección > Campo", tabla cerrada `FIELD_TYPE_TO_ACTION`, pasadas con cierre a las 3 (`pass`, `newActionsInLastPass`), motivos de `UnresolvedValue` (`no_match`, `ambiguous_label`, `duplicate_target`, `unsupported_type`, `invalid_number`, `invalid_value`, `option_no_match`, `option_ambiguous`; `sendable` solo para `no_match` y `option_no_match`) y `toLogEntry(outcome, { durationMs })`.
- [x] **Step 6. Pruebas de `deterministic-mapper.js`.** Mover `tests/u1/deterministic-mapper.test.js` a `tests/u3/` y ampliarlo: etiqueta exacta, "Sección > Campo", etiqueta inexistente al residuo, etiqueta ambigua, tipo no soportado, cierre forzado tras 3 pasadas, `toLogEntry` sin valores del cliente fuera de lo que fija el diseño.
- [x] **Step 7. Lógica: `residue-resolver.js`.** `buildResidueRequest(outcome, domFields, ctx)` puro (solo los residuales `sendable`; si hay más de 500 campos, no arma pedido y marca `form_too_large`) y `resolveResidue(outcome, { serviceName, domFields, requestedValues }, { mapResidue, signal })`: tope de 30 s y cancelación con la señal de la corrida, una sola llamada (U3 **nunca** reintenta), validación de la respuesta (`requestKey` presente y pedido, etiqueta exacta, opción válida), acciones inválidas descartadas y sus claves de vuelta al residuo, acciones sustituidas con `substituted` y `requestedValue`, `residueStatus` (`none`, `resolved_by_brain`, `brain_unavailable`, `still_unresolved`) y `brainErrorCode` con el código del `BrainCallError` (`internal_error` si es desconocido).
- [x] **Step 8. Pruebas de `residue-resolver.js`.** Con doble del puerto y reloj falso: respuesta válida aplicada, acción con `requestKey` ausente o con etiqueta inexistente descartada, sustitución marcada, cada código del canal de error reflejado en `brainErrorCode`, el puerto se llama una sola vez, tope de 30 s, cancelación, más de 500 campos sin llamada.
- [x] **Step 9. Lógica: llamador del orquestador.** Ajustar `lib/rpa/orchestrator.js` para el ciclo M2 (hasta 3 pasadas de escaneo y mapeo, luego `resolveResidue` con el puerto inyectado, `null` hasta que U7 lo conecte) y el detalle "clave: motivo" hacia `ServiceResult.reason = field_not_recognized`; actualizar `tests/u1/orchestrator.test.js` a la nueva salida.
- [x] **Step 10. Pruebas de integración y estructura.** `tests/u3/mapping-cycle.integration.test.js`: el ciclo completo con dos dobles distintos del puerto (NFR1.1). `tests/u3/imports.test.js`: quita comentarios, extrae `import`, `export ... from` e `import()` y falla si algo sale de `lib/mapping/**`, `lib/messages*.js` y `lib/dom/aria-label.js`, o si aparece `document.` o `chrome.` (NFR7.1).
- [x] **Step 11. Configuración.** `vitest.config.js`: `residue-resolver.js` y `lib/dom/aria-label.js` en `coverage.include`, y umbral `coverage.thresholds["aws-calculator-extension/lib/mapping/{deterministic-mapper,option-match,residue-resolver}.js"] = { lines: 80, branches: 80 }`. `eslint.config.js`: bloque para `lib/mapping/**` que **extiende** las listas base de `securityRules` y suma `fetch`, `window.fetch`, `globalThis.fetch`, `XMLHttpRequest` y `chrome.storage`. `package.json`: script `"test:u3": "vitest run tests/u3"`. No se toca el umbral global.
- [x] **Step 12. Verificación y documentación.** Correr `npx vitest run tests/u3`, `npx vitest run tests/u1`, `npm run lint`, `npm run format:check` y `npm run check:bundle`; escribir `source-manifest.json`, `code-summary.md` y `traceability.json`.

## Trazabilidad

| Paso | Historias / requisitos |
|---|---|
| 1 | NFR7.1 (`aria-label.js` como módulo puro) |
| 2 | NFR6.2 |
| 3-4 | US4.1; FR3; BR2.1-BR2.6; NFR3.2, NFR3.3 |
| 5-6 | US4.1; FR3; BR1.1-BR1.4, BR4.1; NFR2.1, NFR2.2, NFR3.1, NFR5.4, NFR8.4 |
| 7-8 | US4.1; FR5.2; C1 2.0.0; BR3.1-BR3.4; NFR3.2, NFR5.1-NFR5.3, NFR8.1, NFR8.5 |
| 9 | US4.1 (borde con U5) |
| 10 | NFR1.1, NFR7.1 |
| 11 | NFR4.1, NFR5.1, NFR5.2, NFR6.1, NFR7.2 |
| 12 | NFR6.1, NFR7.2 |
