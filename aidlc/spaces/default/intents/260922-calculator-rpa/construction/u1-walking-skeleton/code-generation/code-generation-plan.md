# Plan de generación de código — u1-walking-skeleton

## Summary

- Builds: el walking skeleton de la extensión: panel lateral, handshake con calculator.aws, mapeo determinístico, RPA de un servicio (EC2) con banner verde, estimado verificado, renombrado, Share y registro técnico persistido.
- Touches: `aws-calculator-extension/` (manifest, content.js, nuevo sidepanel, background.js, `lib/**`, SMOKE.md; se retiran popup.html/popup.js), y en la raíz `package.json`, configs de Vitest/ESLint/Prettier, `tests/`, `scripts/check-bundle.js`, `.github/workflows/ci.yml`, `.gitignore`.
- Tests: ~65 tests de Vitest (unitarios de Zona A + 2 archivos de integración con fakes de Chrome y del resolvedor del DOM), piso de 80 % de líneas sobre la lógica pura; la Zona B (DOM de calculator.aws) se verifica con el smoke manual de `SMOKE.md`.

## Contexto

- Diseño: `functional-design/` (entities, rules BR1.1-BR6.6, functional-spec), `nfr-requirements/` (incluida la lista de ajustes al Diseño Funcional en `tech-stack-decisions.md`), `nfr-design/`, `infrastructure-design/` de esta unidad.
- Historias: US1.0 (AC1.0.1-AC1.0.4) y US1.1 (AC1.1.1-AC1.1.3). Caso canónico: EC2 t3.micro.
- Brownfield: `content.js` (v6, ~1264 líneas) se convierte en el cargador delgado; sus helpers de DOM útiles (`getText`, `cleanAriaLabel`, `fillInput`, `selectNative`, `selectAwsDropdown`, `scanForm`, `resolveElementByLabel`, `expandAllSections`, búsqueda de servicio y Configure, región, `renameEstimate`, `shareEstimate`) se portan a `lib/dom/dom-resolver.js` corrigiendo lo que el diseño cambia (sin "primer resultado", confirmación solo por banner, sin fallback de URL). Se eliminan `callN8N`, `prepareForm`, `mapFields`, `DOM_FIELDS`, `PROGRESS_TEXT` y el host n8n.
- Hallazgos de revisión que el plan resuelve en código: orden índice-antes-que-trozo en el registro (NFR Design), regla de lint contra `fetch` (Infra), `package-lock.json` versionado y `npm audit` en CI (Infra).

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

## Pasos (test-after: cada capa se implementa y luego se prueba)

Mapeo de capas del contrato a esta unidad: *Data model* = entrada y mensajes; *Repository / data access* = persistencia en `chrome.storage.local` (registro e índice); *Business logic* = mapeo, reintentos, cronómetro, agregación, orquestador; *API / endpoint* = contrato de mensajes (handshake, `content-main`); *Frontend behavior* = estado del panel lateral. La capa DOM (Zona B) se implementa sin tests automatizados y se verifica con el smoke.

- [x] **Step 1 — Estructura y tooling de desarrollo.** Crear en la raíz: `package.json` (privado, `type: module`, scripts `lint`, `format`, `format:check`, `test`, `test:u1`, `coverage`, `check:bundle`; dev-dependencies `vitest`, `@vitest/coverage-v8`, `eslint`, `@eslint/js`, `globals`, `prettier`), `vitest.config.js` (entorno `node`, `include: ["tests/**/*.test.js"]`, cobertura `v8` con `include` = módulos de Zona A y `thresholds.lines: 80`, `reportsDirectory: "coverage"`), `eslint.config.js` (flat; `no-empty`, `no-eval`, `no-implied-eval`, `no-new-func`, `no-restricted-properties`/`no-restricted-syntax` contra `innerHTML`/`outerHTML`/`insertAdjacentHTML`, `no-restricted-globals` contra `fetch`; globals de navegador y `chrome` para `aws-calculator-extension/`, Node para `tests/` y `scripts/`), `.prettierrc`. Añadir `coverage` a `.gitignore` (cambio necesario en un archivo existente: la salida de cobertura no se versiona). Ejecutar `npm install` y versionar `package-lock.json`. *Traza: NFR6.1, NFR5.4, NFR5.8, NFR1.1.*
- [x] **Step 2 — Runner listo.** Ejecutar `npx vitest run --passWithNoTests` y dejar registrado en `unit-test-instructions.md` el comando acotado de la unidad. *Traza: NFR6.1.*
- [x] **Step 3 — Datos (implementar).** `lib/messages.js` (tipos `PING`, `RUN_RPA`, `PROGRESS`, `RUN_RESULT`; fábricas de payload), `lib/validation.js` (validar `RunRequest`, mensajes entrantes y el enlace `https://calculator.aws/`), `lib/input/json-parser.js` (BR1.1, BR1.2 con coerción de tipos), `lib/input/input-normalizer.js` (BR1.3, BR1.4: región de la raíz, toggles `__switch__:`), `lib/mapping/region-map.js` (tabla portada del v6). Cada módulo es provisional y está marcado como tal en un comentario de cabecera, con su dueño final (U2/U5). *Traza: US1.1 (AC1.1.1), BR1.1-BR1.4, NFR5.6, NFR5.7.*
- [x] **Step 4 — Datos (tests).** `tests/u1/messages-validation.test.js` (≈7: payload válido, `runId` vacío, `services` vacío, tipo desconocido, `sender.id` ajeno, enlace válido, enlace de otro host/`http:`), `tests/u1/json-parser.test.js` (≈7: JSON válido, sintaxis inválida → "❌ JSON inválido.", sin `services`, `services` vacío, servicio sin `name`, valor objeto en `fields`, `project` > 200 caracteres), `tests/u1/input-normalizer.test.js` (≈6: caso canónico EC2, `search_term` por defecto, región por defecto us-east-1, región desconocida, número/booleano a texto, toggle inválido). Ejecutar con el comando de la unidad.
- [x] **Step 5 — Persistencia (implementar).** `lib/log/log-format.js` (lista de campos permitidos, `seq`, eventos `run_start`/`run_end`), `lib/log/log-index.js` (filas de `runLogIndex`: alta, actualización de `chunks`/`bytes`/`finishedAt`/`status`, baja, reconstrucción desde claves `runLog:*`), `lib/log/run-logger.js` (cola de un solo escritor sobre un almacenamiento inyectado; escritura inmediata por entrada en trozos de ≤ 200; **el índice se escribe antes que el trozo nuevo** para que un cierre no deje trozos huérfanos; `bytes` se recalcula en cada escritura de trozo; un reintento ante fallo; marca `degraded` en memoria y aviso al panel por mensaje, sin escribir en el almacenamiento que falló), y el guardado de `activeRun`/`lastRunResult`. *Traza: NFR3.5, NFR3.6, NFR3.10, NFR3.11, NFR8.10, NFR8.11, BR6.3.*
- [x] **Step 6 — Persistencia (tests).** `tests/u1/log-format.test.js` (≈5), `tests/u1/log-index.test.js` (≈6: alta, cambio de trozo, cierre, baja, reparación, fila sin `run_end` = "interrumpida"), `tests/u1/run-logger.test.js` (≈7 con un almacenamiento falso en memoria: orden de `seq`, troceo a 200, índice antes que trozo, fallo y reintento, segundo fallo → `degraded`, ninguna escritura tras cerrar la corrida, vaciado de cola en `run_end` con tope de 5 s).
- [x] **Step 7 — Lógica de negocio (implementar).** `lib/mapping/deterministic-mapper.js` (`mapDeterministic`: coincidencia única normalizada, 1 valor → 1 acción, tipo de acción por tipo de campo, `instance_radio` compuesto, residuo a `unresolved`; BR3.1-BR3.3), `lib/mapping/option-match.js` (BR3.4), `lib/rpa/retry.js` y `lib/rpa/wait.js` (`waitFor`, `sleep` con `signal` y reloj inyectable), `lib/rpa/service-timer.js` (`AbortController` de 180 s), `lib/rpa/result-aggregator.js` (`aggregate(requested, serviceResults)`, BR5.1), `lib/rpa/orchestrator.js` (flujo W3/W4 sobre un resolvedor del DOM inyectado: precondición de estimado vacío, servicio con corte y cancelación, agregación, verificación del contenido, renombrado, Share; marca de corrida cerrada; BR4.x, BR5.x). `lib/messages-es.js`: traducción `reason` → texto en español (BR6.4). *Traza: US1.1 (AC1.1.1-AC1.1.3), BR3.1-BR5.6, NFR8.4, NFR8.6, NFR8.12.*
- [x] **Step 8 — Lógica de negocio (tests).** `tests/u1/deterministic-mapper.test.js` (≈8: canónico EC2, coincidencia por "Sección > Campo", por "Campo", cero coincidencias, dos coincidencias, `slider` no mapeado, tipos de acción, `instance_radio` único), `tests/u1/option-match.test.js` (≈5), `tests/u1/retry-wait-timer.test.js` (≈8 con reloj falso: tope de 20 s, cancelación, 3 intentos, corte a 180 s, precisión ≤ 1 s, limpieza del temporizador), `tests/u1/result-aggregator.test.js` (≈6: todos confirmados, uno faltante, cero servicios, motivos conservados, `status` sin PARTIAL), `tests/u1/orchestrator.test.js` (≈8, **integración** con un resolvedor falso: DONE del caso canónico, estimado no vacío → `preconditions`, campo no reconocido, validación `is required`, banner nunca aparece, `service_timeout` con banner tardío ignorado, contenido del estimado distinto → `estimate_check`, renombrado fallido → `rename`, Share sin enlace válido → `share`), `tests/u1/messages-es.test.js` (≈3).
- [x] **Step 9 — Mensajería (implementar).** `lib/connection/handshake.js` (reutilizar/abrir pestaña, 1 + 3 `PING`, `ready`, inyección, espera de carga ≤ 20 s; API de Chrome inyectada; BR2.1-BR2.5), `content.js` reescrito como cargador clásico delgado (guardia de carga única, único listener, `PING {ok, ready}`, `import()` de `lib/content-main.js`, `RUN_RPA` con `not_ready`), `lib/content-main.js` (guardián `busy`, `activeRun` y latido, `PROGRESS`, cierre con `RUN_RESULT`, verificación de `sender.id`). *Traza: US1.0 (AC1.0.1-AC1.0.4), BR2.1-BR2.5, BR6.1, BR6.6, NFR5.5, NFR5.6, NFR8.13.*
- [x] **Step 10 — Mensajería (tests).** `tests/u1/handshake.test.js` (≈7 con `chrome` falso: pestaña reutilizada, pestaña abierta y cargada, PING inicial listo, inyección + reintentos, `ready:false` consume intentos, `ok:false` → unreachable, carga > 20 s → unreachable), `tests/u1/content-main.test.js` (≈6, **integración** con `chrome` y almacenamiento falsos: `RUN_RPA` aceptado, `busy`, mensaje de otro `sender.id` ignorado, `activeRun` creado y borrado, `RUN_RESULT` tras guardar `lastRunResult`, sin `PROGRESS` tras cerrar).
- [x] **Step 11 — Panel lateral (implementar).** `sidepanel.html` (copy en español, `data-testid` en entrada, botón, progreso, resultado, lista de corridas y botones Exportar/Borrar/Reparar), `sidepanel.js` (W1: validar, handshake, `RUN_RPA`, escuchar mensajes y `chrome.storage.onChanged`, vigilancia de latido y `tabs.onRemoved`, cierre `lost`, lista desde `runLogIndex`, exportar con `blob:` + `download`, borrar deshabilitado durante una corrida; inserción solo con `textContent`), `lib/panel/panel-state.js` (máquina de estados pura Idle/Validating/Connecting/Running/Done/Error), `lib/panel/heartbeat.js` (`isHeartbeatStale`), `background.js` (`setPanelBehavior`). *Traza: BR6.1-BR6.6, NFR3.3, NFR3.4, NFR3.8, NFR5.3, NFR5.4, NFR8.5, NFR8.9.*
- [x] **Step 12 — Panel lateral (tests).** `tests/u1/panel-state.test.js` (≈7: transiciones válidas, `accepted:false` → Error, reapertura con `activeRun` vigente → Running, latido vencido → Error `lost`, nueva corrida desde Done/Error, transición inválida ignorada), `tests/u1/heartbeat.test.js` (≈3).
- [x] **Step 13 — Resolvedor del DOM (Zona B, sin tests automatizados).** `lib/dom/selectors.js` (tabla única de selectores y textos de botón), `lib/dom/dom-resolver.js` portado del v6: navegar a My Estimate y contar servicios, buscar servicio y Configure (sin "primer resultado"), fijar región, toggles, expandir secciones, `scanForm` con la tabla de instancias como un solo `instance_radio`, aplicar acciones con relectura, instancia por fila, guardar con banner verde y detección de `is required`, leer el contenido del estimado, renombrar, Share con enlace validado. Toda espera vía `waitFor` con `signal`. *Traza: AC1.1.1, AC1.1.2, BR4.1-BR4.10, BR5.2, BR5.3, BR5.6, NFR2.1, NFR2.2.*
- [x] **Step 14 — Manifest y limpieza.** `manifest.json` según `security-design.md` §1 (permisos exactos, sin popup, `side_panel`, `background` módulo, `web_accessible_resources` con `use_dynamic_url`, `minimum_chrome_version: "116"`, sin host CloudFront); eliminar `popup.html` y `popup.js`. Test `tests/u1/manifest.test.js` (≈4: permisos exactos, hosts exactos, versión mínima, sin `default_popup`). *Traza: NFR4.1-NFR4.5, NFR7.2, NFR7.3.*
- [x] **Step 15 — Configuración de entorno y CI.** `scripts/check-bundle.js` (falla si algún archivo de `aws-calculator-extension/` importa un paquete o `node_modules`), `.github/workflows/ci.yml` (push y PR a `main`; `contents: read`; `actions/checkout` y `actions/setup-node` fijados por SHA de commit; `npm ci`, `npm audit --audit-level=high`, `format:check`, `lint`, `coverage`, `check:bundle`; artefacto de cobertura 14 días). Ejecutar a mano `npm run lint`, `npm run format:check`, `npm run coverage` y `npm run check:bundle`. *Traza: NFR5.8, NFR6.1.*
- [x] **Step 16 — Smoke y documentación.** `aws-calculator-extension/SMOKE.md` con los casos de NFR6.2 (canónico EC2 sobre estimado vacío ≤ 3 min con su JSON, fallo provocado por etiqueta inexistente, estimado con servicios previos, cierre y reapertura del panel, cierre de la pestaña, carga fallida del módulo) y un registro de ejecuciones (fecha, duración, resultado). Comentarios inline en español; identificadores en inglés. *Traza: NFR6.2, AC1.1.1-AC1.1.3.*

## Trazabilidad historia → pasos

| Historia / AC | Pasos |
|---|---|
| US1.0 — AC1.0.1-AC1.0.4 (handshake) | 9, 10, 11 |
| US1.1 — AC1.1.1 (llenar y guardar) | 3, 4, 7, 8, 13, 16 |
| US1.1 — AC1.1.2 (URL tras banner verde) | 7, 8, 13 |
| US1.1 — AC1.1.3 (sin URL si no se confirma) | 7, 8, 11, 16 |
| NFR4 / NFR5 (manifest y seguridad) | 1, 3, 11, 14, 15 |
| NFR3 / NFR8 (registro, terminación) | 5, 6, 7, 8, 9, 10, 11, 12 |
| NFR6 (tests y smoke) | 1, 2, 15, 16 |
