# Plan de generación de código — u7-packaging

## Summary

- Builds: el service worker como único cliente del cerebro (login con PKCE, sesión, plazo de 30 s, traducción de códigos, cancelación por dueño, keepalive), el adaptador `brain-port` del lado de la página, el manifest de mínimo privilegio y la política del bundle verificada en CI, más los scripts de sincronización con u4 y de `.zip`.
- Touches: `aws-calculator-extension/manifest.json`, `background.js`, `sw/` (nuevo), `lib/connection/brain-port.js` (nuevo), `lib/content-main.js`, `scripts/` (`check-bundle.js`, `bundle-policy.json`, `sync-brain-config.js`, `package-zip.js`), `tests/u7/`, `tests/u1/manifest.test.js`, `eslint.config.js`, `vitest.config.js`, `package.json`, `.gitignore`, `SMOKE.md`.
- Tests: unas 70 pruebas de Vitest en `node` (5-8 por componente en 11 archivos, con `chrome`, `fetch`, `crypto` y el reloj simulados), umbral propio de 80 % en líneas y ramas sobre `sw/**` y `lib/connection/brain-port.js`, y casos manuales nuevos en `SMOKE.md`.

## Contexto

- Diseño de esta unidad: `nfr-requirements/` (security-requirements, tech-stack-decisions), `nfr-design/security-design.md`, `infrastructure-design/` (infrastructure-specification, monitoring-design, cicd-pipeline). U7 no tiene functional-design: su alcance viene de `inception/units-generation/unit-of-work.md` §U7 y del Bolt 6 de `bolt-plan.md` (manifest de mínimo privilegio sin el host CloudFront muerto, estructura del bundle, `.zip` sin build step; traza a NFR4 y P4).
- Contratos: `inception/contract-design/contract-summary.md` (`BRAIN_CALL`, `BRAIN_CANCEL`, `BRAIN_LOGIN`, `BRAIN_SESSION`, `BrainCallError`, C1 `/map-residue`, `/interpret`, `/waf-evaluate`).
- Brownfield: `background.js` solo configura el panel; `manifest.json` declara Chrome 116, sin `identity`, sin CSP explícita y solo `https://calculator.aws/*`; `scripts/check-bundle.js` es un script sin exports que solo revisa dependencias de runtime; no existe `sw/`.
- En paralelo se construye u5 (`lib/dom/**`, `lib/rpa/**`, `content.js`); no estará en esta copia. U7 no toca esos archivos salvo el cableado de `mapResidue` en `lib/content-main.js`. U6 reutilizará `lib/connection/brain-port.js` más tarde.

### Decisiones que este plan fija (diferencias entre diseño y código real de u4)

1. **Cuerpo de error del cerebro.** `brain/core/error-catalog.js` responde un cuerpo plano `{ code, message, requestId, retryAfterSeconds? }`; NFR3.1 dice `body.error.code`. `translateResponse` lee `body.code` (y acepta `body.error.code` por compatibilidad). Un código fuera del conjunto del contrato es `internal_error`.
2. **`model_unavailable`.** Existe en C1/C2 y en `residue-resolver.js` de U3, pero falta en la lista de `BrainCallError` del contrato. El service worker lo acepta como código válido.
3. **`X-Request-Id`.** El servidor de u4 genera su propio `requestId` y su CORS solo admite `authorization, content-type`; enviar `X-Request-Id` haría fallar el preflight. El cliente **no** envía esa cabecera: la correlación usa la cabecera `x-request-id` de la respuesta o `body.requestId`, y el reintento por `rate_limited` registra ambos `requestId` del servidor.
4. **Registro técnico.** `lib/log/run-logger.js` es por corrida (`runId`, `activeRun`) y escribirlo desde el service worker choca con la regla que prohíbe `chrome.storage.local` en `sw/**`. El service worker devuelve `requestId`, `code` y `attempts` en cada respuesta, y el llamador (content script o panel) los registra en su corrida con `run-logger`. El service worker no escribe almacenamiento persistente; solo `console.warn` con `operation`, `code` y `requestId`, nunca el token ni los cuerpos.
5. **Configuración sin desplegar.** Hasta que u4 se despliegue, `sw/config.js` lleva `BRAIN_BASE_URL`, `COGNITO_DOMAIN` y `CLIENT_ID` en `null`; `host_permissions` queda solo con `https://calculator.aws/*`; `BRAIN_CALL` y `BRAIN_LOGIN` responden `brain_unavailable` sin `fetch`. `check:bundle` deriva los hosts esperados de `sw/config.js`, así que el conjunto sigue siendo exacto en ambos estados. `scripts/sync-brain-config.js` llena los valores desde `infra/cdk-outputs.json`.
6. **Clave `key` del manifest.** La genera el mantenedor (la privada nunca entra al repo). `bundle-policy.json` lleva `"key": null` y `check:bundle` exige que el manifest coincida con ese valor (`null` = ausente). Cuando el mantenedor la genere, la agrega en los dos lugares en un mismo commit.
7. **Adaptador de la página.** Nadie lo construyó: U7 crea `lib/connection/brain-port.js` (`createBrainPort({ sendMessage })` → `mapResidue`, `interpret`, `wafEvaluate`, `login`, `session`; `AbortSignal` → `BRAIN_CANCEL`; error → `BrainCallError { code }`; canal perdido → `brain_unavailable`), sin URL ni configuración. `content-main.js` lo pasa como `mapResidue` a las dependencias del orquestador (pendiente que dejó U3). U6 lo reutiliza para el panel.
8. **`REVIVAL_PLAN.md`.** Contiene la URL de un webhook n8n personal. `package-zip.js` excluye todo `*.md` del `.zip`, y `check:bundle` amplía el escaneo de URL ajenas a todos los archivos de texto del bundle con una lista de excepciones explícita para documentación. El archivo no se borra en esta unidad: se informa al mantenedor.
9. **Dos topes de 30 s.** U3 y el service worker usan 30 s. Se conserva: si gana U3, su `residueDetail: timeout` es el motivo visible; si gana el service worker, U3 recibe `BrainCallError { code: "timeout" }`. Ambos caminos terminan en el mismo `timeout`.
10. **`tests/u1/manifest.test.js`.** Exige hoy Chrome 116, permisos sin `identity` y CSP ausente; se actualiza al manifest nuevo en vez de borrarse.

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

- [x] **Step 1. Estructura.** Crear `aws-calculator-extension/sw/` con `config.js` (valores en `null`, scopes `openid email`, rutas `/map-residue`, `/interpret`, `/waf-evaluate`), `messages.js` y los módulos `router.js`, `session.js`, `auth-flow.js`, `brain-client.js`, `call-registry.js`, `keepalive.js` con sus exports declarados; crear `lib/connection/brain-port.js` vacío con sus exports. Ningún archivo de `sw/` queda dentro de `lib/**` ni de `web_accessible_resources`.
- [x] **Step 2. Runner.** Verificar Vitest existente (`npx vitest run tests/u1` en verde) y registrar el comando `npx vitest run tests/u7`; crear `tests/u7/` y `tests/u7/fakes.js` (simuladores de `chrome.runtime`, `chrome.identity`, `chrome.storage.session`, `fetch`, `crypto` y reloj inyectable), reutilizando `tests/u1/fake-chrome.js` donde aplique.
- [x] **Step 3. Lógica: modelo de sesión y registro de llamadas.** `sw/session.js`: `{ accessToken, expiresAt }` bajo una sola clave de `chrome.storage.session`, token ausente desde 60 s antes de vencer, una sola promesa de login compartida, limpieza ante cancelación, `clear()` ante 401 (NFR5.2, NFR5.4, NFR5.6 a-d). `sw/call-registry.js`: `callId` → `{ controller, ownerKey }` con `ownerKey` `tab:<tabId>:<frameId>` o `doc:<documentId>`; cancelación de otro dueño ignorada; `callId` repetido rechazado; limpieza al terminar (NFR5.6 g). `sw/keepalive.js`: contador de trabajos y `chrome.runtime.getPlatformInfo()` cada 20 s mientras sea mayor que cero (NFR8.1).
- [x] **Step 4. Pruebas de sesión, registro y keepalive.** `tests/u7/session.test.js` (login único con tres pedidos, cancelación que resuelve a todos, margen de 60 s, `expiresAt` inválido, 401 que borra, keepalive tomado durante un login de más de 30 s), `tests/u7/call-registry.test.js` (alta, dueño correcto, cancelación ajena ignorada, duplicado, limpieza), `tests/u7/keepalive.test.js` (ping cada 20 s, parada en cero, trabajos anidados, no baja de cero).
- [x] **Step 5. Lógica: decisión de acceso y login.** `sw/router.js`: `authorize(sender, message)` pura; remitente ajeno rechazado antes de todo; content script de `https://calculator.aws` → solo `map-residue`; página de la extensión → `interpret`, `waf-evaluate`, `BRAIN_LOGIN`, `BRAIN_SESSION`; operación desconocida y `body` de más de 256 KB medido con `TextEncoder` → `bad_request` (NFR5.3, NFR5.5). `sw/auth-flow.js`: PKCE S256 (verifier de 64 bytes con `crypto.getRandomValues`, challenge con `crypto.subtle.digest`), `state` aleatorio y verificado, `launchWebAuthFlow({ url, interactive: true })` con `chrome.identity.getRedirectURL()`, intercambio por POST `application/x-www-form-urlencoded`, validación de `access_token`, `token_type` y `expires_in`, descarte del `refresh_token` (NFR5.6 d, f; PKCE).
- [x] **Step 6. Pruebas de acceso y login.** `tests/u7/router.test.js` (cada contexto permitido y prohibido, remitente ajeno, operación desconocida, cuerpo de más de 256 KB, `BRAIN_LOGIN` desde content script rechazado, URL de calculator.aws con subruta aceptada y otro origen rechazado) y `tests/u7/auth-flow.test.js` (URL con PKCE correcta, `state` distinto, intercambio exitoso, `refresh_token` descartado, `token_type` o `expires_in` inválidos sin guardar nada, ventana cerrada → `login_cancelled`).
- [x] **Step 7. Lógica: cliente del cerebro.** `sw/brain-client.js`: `translateResponse(status, body)` pura (decisiones 1 y 2), validador de forma por operación para respuestas 200 (si no valida, `internal_error`, nunca `ok: true`), `callBrain({ operation, body, signal }, deps)` con `Authorization: Bearer`, `Content-Type: application/json`, plazo total de 30 s con reloj inyectable, un solo reintento por `rate_limited` si `retryAfterSeconds + 12 s ≤ restante` con espera cancelable, `TypeError` de red → `brain_unavailable`, cuerpo no JSON → `brain_unavailable` si 5xx o `internal_error` si no, 401 → borra el token y `unauthorized` sin reintento, sin token válido → `unauthorized` sin abrir login, configuración en `null` → `brain_unavailable` sin `fetch`, `requestId` tomado de la respuesta (decisión 3). Toma y suelta el keepalive en cada llamada.
- [x] **Step 8. Pruebas del cliente.** `tests/u7/brain-client.test.js`: cada código del contrato, código desconocido, `model_unavailable` aceptado, `TypeError`, 200 que no valida, HTML 502 y HTML 400, 401 que borra el token, reintento con `r = 5 s` y sin reintento con `r = 25 s`, plazo de 30 s que aborta, `BRAIN_CANCEL` durante la espera del reintento, configuración ausente sin `fetch`, y que ningún mensaje ni registro contiene el token.
- [x] **Step 9. Borde del service worker.** `background.js`: conserva `setPanelBehavior`; en `onInstalled` y `onStartup` llama a `chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" })`; registra un único `onMessage` que descarta `sender.id !== chrome.runtime.id`, pasa por `authorize` y despacha `BRAIN_CALL`, `BRAIN_CANCEL`, `BRAIN_LOGIN` y `BRAIN_SESSION`, devolviendo `{ callId, ok, value | error: { code, message, requestId, retryAfterSeconds? }, attempts }` con textos de `sw/messages.js` (decisión 4). La lógica de despacho vive en `sw/dispatch.js` (puro respecto de `chrome`, recibe sus dependencias) para poder probarla.
- [x] **Step 10. Pruebas del borde.** `tests/u7/dispatch.test.js`: `BRAIN_CALL` permitido con respuesta exitosa, remitente ajeno sin respuesta, operación prohibida → `bad_request` sin `fetch`, `BRAIN_CANCEL` del dueño aborta y la respuesta tardía se descarta, `BRAIN_SESSION` con y sin token, `BRAIN_LOGIN` concurrente comparte la promesa, `callId` repetido → `bad_request`.
- [x] **Step 11. Lógica de la página: `brain-port` y cableado.** `lib/connection/brain-port.js` según la decisión 7 (sin URL, sin `chrome.storage`, sin `fetch`). `lib/content-main.js`: pasar `mapResidue` del puerto en las dependencias del orquestador, con la señal de la corrida para cancelar. No se tocan `lib/dom/**`, `lib/rpa/**` ni `content.js` (son de u5).
- [x] **Step 12. Pruebas de `brain-port`.** `tests/u7/brain-port.test.js`: respuesta exitosa, error → `BrainCallError` con `code`, `requestId` y `retryAfterSeconds`, `AbortSignal` → `BRAIN_CANCEL` con el mismo `callId`, canal perdido (`chrome.runtime.lastError` o promesa rechazada) → `brain_unavailable`, `callId` único por llamada; más una prueba de `content-main` que confirma que el orquestador recibe `mapResidue`.
- [x] **Step 13. Manifest y política del bundle.** `manifest.json`: `permissions` = `tabs`, `scripting`, `sidePanel`, `storage`, `unlimitedStorage`, `identity`; `host_permissions` = `https://calculator.aws/*` más los hosts derivados de `sw/config.js` (ninguno mientras esté en `null`); CSP `extension_pages` = `"script-src 'self'; object-src 'self'"`; `minimum_chrome_version: "130"`; `web_accessible_resources` sin cambios. `scripts/bundle-policy.json` con las entradas fijas y `"key": null` (decisión 6). `scripts/check-bundle.js` se reorganiza en funciones puras exportadas (`loadPolicy`, `expectedHosts`, `checkManifest`, `scanSecrets`, `scanForeignUrls`, `checkBrainHostPlacement`, más el chequeo de dependencias actual) y un `main` que las usa: conjuntos exactos, host del cerebro solo en `sw/config.js` y `host_permissions`, patrones de secreto (`AKIA`, `-----BEGIN`, `sk-ant-`, forma de JWT, `client_secret`), URL ajenas fuera de calculator.aws en todo el bundle con excepciones de documentación (decisión 8). Actualizar `tests/u1/manifest.test.js` (decisión 10).
- [x] **Step 14. Scripts de entrega.** `scripts/sync-brain-config.js`: lee `infra/cdk-outputs.json` (`BrainUrl`, `CognitoDomain`, `ExtensionClientId` del stack `brain`), valida que sean `https` y reescribe `sw/config.js` y los dos hosts de `host_permissions`; funciones puras `parseOutputs` y `renderConfig`. `scripts/package-zip.js`: lista de archivos de `aws-calculator-extension/` sin `**/*.test.js`, `**/__tests__/**`, `*.md` ni ocultos; `tar -a -c -f` en Windows o `zip` en otros sistemas; verifica que las entradas del `.zip` sean exactamente la lista; función pura `selectFiles`. `.gitignore`: `*.zip` de distribución; `infra/cdk-outputs.json` **sí** se versiona (solo URL públicas e identificadores).
- [x] **Step 15. Pruebas de los scripts.** `tests/u7/check-bundle.test.js` (host de más, host de menos, permiso extra, CSP con `unsafe-eval`, `key` distinta, secreto con forma de JWT, URL n8n en `lib/**`, host del cerebro en un tercer archivo, manifest actual en verde), `tests/u7/sync-brain-config.test.js` (outputs válidos, URL no `https`, salida ausente), `tests/u7/package-zip.test.js` (exclusiones de pruebas, `*.md` y ocultos; lista exacta).
- [x] **Step 16. Configuración.** `eslint.config.js`: bloque para `background.js` y `sw/**` que **extiende** las listas base de `securityRules` (sin perder `innerHTML`, `eval`, `new Function`): `fetch` permitido solo en `sw/brain-client.js` y `sw/auth-flow.js`, `chrome.storage.local` y `chrome.storage.sync` prohibidos; bloque para `lib/connection/brain-port.js` sin `fetch` ni `chrome.storage`. `tests/u7/eslint-sw.test.js` lo comprueba con `ESLint.calculateConfigForFile`. `vitest.config.js`: los módulos de `sw/` y `brain-port.js` en `coverage.include` y umbral `{ lines: 80, branches: 80 }` sobre `aws-calculator-extension/sw/**` y `aws-calculator-extension/lib/connection/brain-port.js`. `package.json`: scripts `"test:u7": "vitest run tests/u7"` y `"package": "node scripts/package-zip.js"`. No se toca el umbral global.
- [x] **Step 17. Verificación manual y documentación.** Agregar a `SMOKE.md` los casos de U7: carga unpacked en Chrome 130 o posterior, login completo, login cancelado, llamada con token vencido (`unauthorized`), cerebro caído o sin configurar (`brain_unavailable`), `import()` con URL dinámica desde el content script y `.zip` generado. Correr `npx vitest run tests/u7`, `npx vitest run tests/u1`, `npm run lint`, `npm run format:check` y `npm run check:bundle`; escribir `source-manifest.json`, `code-summary.md` (con las decisiones 1-10 y la nota sobre `REVIVAL_PLAN.md`) y `traceability.json`.

## Trazabilidad

| Paso | Historias / requisitos |
|---|---|
| 1 | NFR1.1, NFR5.1 (estructura `sw/` fuera de `lib/**`) |
| 2 | NFR6.1 |
| 3-4 | NFR5.2, NFR5.4, NFR5.6 (a-d, g), NFR8.1 |
| 5-6 | NFR5.3, NFR5.5, NFR5.6 (d, f); PKCE |
| 7-8 | NFR3.1, NFR5.3, NFR5.4, NFR8.1; contrato `BRAIN_CALL`, `BrainCallError` |
| 9-10 | NFR5.2, NFR5.3, NFR5.5, NFR5.6 (g); contrato `BRAIN_CALL`, `BRAIN_CANCEL`, `BRAIN_LOGIN`, `BRAIN_SESSION` |
| 11-12 | Contrato C1 `/map-residue` (borde con U3 y U5); u6 "Sesión y errores del cerebro" |
| 13 | U7 / Bolt 6 (P4, host CloudFront muerto); NFR4.1-NFR4.4, NFR5.1, NFR1.1, NFR7.1, NFR7.3 |
| 14-15 | NFR1.1, NFR7.2, NFR7.3 |
| 16 | NFR5.2, NFR5.3, NFR6.1, NFR7.3 |
| 17 | NFR6.1, NFR7.1, NFR7.2 |
