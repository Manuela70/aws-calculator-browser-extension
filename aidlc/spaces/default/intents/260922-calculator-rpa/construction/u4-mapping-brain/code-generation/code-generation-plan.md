# Plan de generación de código — u4-mapping-brain

## Summary

- Builds: el cerebro: servicio Node.js (BrainCore puro, AuthFilter, UsageGuard, ModelGateway, InventoryLoader, servidor HTTP con `/interpret`, `/map-residue`, `/waf-evaluate` y `/health`), el job semanal de inventario, la Lambda `Probe`, la IaC en AWS CDK (stacks de arranque y principal, compuerta de costo) y el workflow `brain.yml`. Sin desplegar.
- Touches: carpetas nuevas `brain/` e `infra/` en la raíz (fuera de `aws-calculator-extension/`), `tests/u4/`, `.github/workflows/brain.yml`, `vitest.config.js`, `eslint.config.js`, `package.json` y `package-lock.json`.
- Tests: unas 70 pruebas de Vitest (5-8 por componente con dobles de Bedrock, S3, DynamoDB, JWKS y reloj; integración del servidor HTTP con dobles; aserciones de síntesis de CDK), umbral de 80 % en líneas y ramas sobre `brain/core/**`.

## Contexto

- Diseño de esta unidad: `functional-design/` (functional-spec flujos B1-B4, rules BR1.x-BR7.x, entities), `nfr-requirements/` (seis archivos), `nfr-design/` (security, performance, scalability, reliability, observability, logical-components), `infrastructure-design/` (infrastructure-specification, monitoring-design, cicd-pipeline; Q1 ECS Fargate, Q2 us-east-1, Q3 GitHub Actions con OIDC y aprobación manual, Q4 USD 50 al mes).
- Contratos: C1 2.0.0 `/map-residue` (con `requestKey` requerido, aprobado en la compuerta de Functional Design), C2 1.1.0 `/waf-evaluate`, C3 1.0.0 `/interpret` y "Cambios de NFR Requirements" (códigos `unauthorized`, `rate_limited` con `retryAfterSeconds`, `daily_quota_exceeded`, `inventory_unavailable`, `X-Request-Id`).
- Historias y requisitos: US5.1 (AC5.1.1-AC5.1.4, compartida con U6), FR1.1 vía `/interpret`, FR8.1-FR8.5, NFR1-NFR3, NFR5, NFR7; ADR-005 y ADR-006.
- Código nuevo: no existen `brain/`, `infra/` ni `tests/u4/`. El generador de inventario existe en `aidlc/spaces/default/knowledge/calculator-catalog/tools/build-inventory.mjs` (442 servicios, 3 985 campos); U4 lo porta a `brain/jobs/build-inventory.mjs` y completa lo que falta respecto de `entities.md` (metadatos de versión, `kind` por campo, etiquetas "Sección > Campo", comparación del 10 %, publicación en S3).
- En paralelo se construyen u2 y u3; no estarán en esta copia. El cerebro no depende de ellos.
- **Fuera de esta etapa:** no se ejecuta `cdk deploy` ni se crea ningún recurso en AWS. Se entrega código, IaC sintetizable con `cdk synth` y el workflow. Quedan documentados como prerrequisitos del mantenedor: dominio con hosted zone, modelo de Claude habilitado en Bedrock (us-east-1), `infra/cost-inputs.json` con precios de la AWS Pricing Calculator, par de claves `key` de la extensión y bootstrap de CDK con política propia.
- **Dependencias nuevas** (del servicio y del CDK, nunca del bundle de la extensión): `@aws-sdk/client-bedrock-runtime`, `@aws-sdk/client-s3`, `@aws-sdk/client-dynamodb`, `@aws-sdk/client-secrets-manager` (sonda), `jose` (validación de JWT y JWKS) en `brain/package.json`; `aws-cdk-lib`, `constructs` y `aws-cdk` en `infra/package.json`. Cada `package.json` con su `package-lock.json`; `check:bundle` sigue sin ver ninguna, porque viven fuera de `aws-calculator-extension/`.

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

- [x] **Step 1. Estructura.** Crear `brain/` (`package.json` con `"type": "module"` y Node LTS, `config.json` con identificador de modelo, `max_tokens` por operación y constantes de tiempo, `prompts/interpret.md`, `prompts/map-residue.md`, `prompts/waf-evaluate.md`), `brain/core/`, `brain/adapters/`, `brain/server/`, `brain/jobs/`, `brain/probe/`, `infra/` (`package.json`, `bin/app.mjs`, `lib/`, `scripts/`), `tests/u4/` y `tests/u4/fixtures/` con un inventario de ejemplo pequeño (5 servicios).
- [x] **Step 2. Runner.** Verificar Vitest existente y registrar el comando `npx vitest run tests/u4` en `unit-test-instructions.md`; agregar `"test:u4"` a `package.json` de la raíz y `brain/**`, `infra/**`, `tests/u4/**` al alcance de `npm run lint`.
- [x] **Step 3. Modelo de datos: inventario.** `brain/core/inventory-model.js`: forma de la versión (`version`, `generatedAt`, `serviceCount`, `fieldCount`, `status`, servicios con `kind` por campo, etiquetas "Sección > Campo", clave `"<Campo> unit"`), índice por nombre de servicio (`Map`) y validador de esquema y tamaño (≤ 50 MB).
- [x] **Step 4. Pruebas del modelo de inventario.** Esquema válido, campo con `subType` desconocido, etiqueta repetida en dos secciones, tamaño excedido, índice por nombre.
- [x] **Step 5. Lógica: BrainCore.** `brain/core/limits.js` (topes de C1-C3), `request-validators.js` (los tres pedidos), `candidate-selector.js` (hasta 8 servicios por código, BR7.1), `prompt-builder.js` (prompts desde archivos, solo candidatos), `output-validators.js` (`validateInterpretOutput`, `validateResidueOutput`, `validateWafOutput`: texto plano sin `<`, `>` ni `http(s)://`, pertenencia al inventario, `requestKey`, `serviceIndex`), `error-catalog.js` (códigos y mensajes fijos de BR7.2) y `log-record.js` (`toLogRecord` con lista blanca y `seHash`).
- [x] **Step 6. Pruebas de BrainCore.** 5-8 por módulo: pedidos válidos y en cada tope, candidatos con 0, 1 y más de 8, prompt sin inventario completo, salidas válidas, con marcado, con URL, con servicio inexistente, con `requestKey` ausente, lote WAF con `serviceIndex` repetido; `toLogRecord` nunca incluye cuerpo ni salida del modelo.
- [x] **Step 7. Acceso a datos: adaptadores.** `brain/adapters/inventory-store.js` (lee el puntero `active` y la versión de S3, verifica SHA-256), `usage-store.js` (DynamoDB: contadores `se#…#min`, `se#…#day`, `global#day`, `probe#day` con TTL y tope de 50 ms), `bedrock-client.js` (invocación con `AbortSignal` y `max_tokens`, sin registro de invocaciones), `jwks-client.js` (descarga del JWKS del user pool).
- [x] **Step 8. Pruebas de los adaptadores.** Con dobles de los clientes del SDK: SHA-256 que no coincide, puntero ausente, contador que supera el tope, almacén que no responde en 50 ms, Bedrock con throttling, 5xx y aborto.
- [x] **Step 9. Lógica: servicios de dominio.** `brain/core/auth-filter.js` (token de acceso de Cognito: firma, `iss`, `token_use = access`, `client_id` permitido, `exp` con 60 s de tolerancia; refresco del JWKS cada hora conservando el anterior; `kid` desconocido con un refresco cada 5 minutos como máximo), `usage-guard.js` (60 por minuto por SE, cuota diaria, tope global, tope de sonda; limitador local y tope global por instancia si el almacén falla; métrica `UsageGuardFallback`), `model-gateway.js` (semáforo de 7, cola FIFO con espera estimada, regla única de reintentos: máximo 2 invocaciones, 10 s por intento, segundo intento solo con ≥ 6 s, códigos finales de `performance-design.md` §2), `inventory-loader.js` (carga inicial con tope de 4 s, recarga cada 5 minutos en `worker_threads`, última versión buena, `previous` al arrancar) y `operations.js` (flujos B1, B2 y B3 con lotes de 5 en paralelo).
- [x] **Step 10. Pruebas de los servicios de dominio.** Con reloj falso y dobles: token válido, vencido, de otro emisor, de otro cliente, `kid` desconocido con y sin refresco; límites por minuto y por día, caída del almacén; semáforo lleno con 429 y `retryAfterSeconds`, reintento por throttling, salida inválida con y sin tiempo para el segundo intento, plazo de 25 s → 504; inventario dañado conserva la versión buena; B1 sin candidatos responde `unresolved` sin invocar el modelo; B3 falla entera si falla un lote.
- [x] **Step 11. API: servidor HTTP.** `brain/server/app.js` con `node:http` (sin framework): cadena de filtros en el orden de `security-design.md` §1 (CORS con `ALLOWED_ORIGINS`, contador de cuerpo de 256 KB, autenticación, límites, esquema, inventario, modelo, validación, registro), `X-Request-Id` en toda respuesta, errores con el catálogo fijo, `/health` (503 sin inventario), plazo de 25 s desde la llegada, arranque con tope de 4 s y métricas EMF en el registro. `brain/server/index.js` como punto de entrada.
- [x] **Step 12. Pruebas del servidor HTTP (integración).** Servidor real en un puerto efímero con dobles de Bedrock, S3, DynamoDB y JWKS: cada operación feliz, CORS rechazado, cuerpo de más de 256 KB, sin token → 401, 429 por minuto, 503 sin inventario, `/health`, `X-Request-Id` presente, el registro no contiene el cuerpo.
- [x] **Step 13. Jobs: `InventoryJob` y `Probe`.** `brain/jobs/build-inventory.mjs`, portado del script de `knowledge/calculator-catalog/tools/` y completado: genera la versión, la valida (esquema, tamaño, pérdida ≤ 10 % frente a la activa), calcula SHA-256, la publica en `versions/<v>.json`, reescribe el puntero `active` con `previous`, o marca `rejected` y emite `InventoryJobFailed`. `brain/probe/handler.mjs`: obtiene el token de máquina con el secreto de Secrets Manager, rota entre las tres operaciones y emite `ProbeSuccess`.
- [x] **Step 14. Pruebas de los jobs.** Versión aceptada, pérdida del 11 % → `rejected` sin tocar el puntero, publicación con SHA-256 correcto; sonda feliz, sonda con 5xx, secreto ilegible.
- [x] **Step 15. Despliegue: contenedor e IaC.** `brain/Dockerfile` (Node LTS ARM64, usuario sin privilegios, solo dependencias de producción). `infra/lib/brain-bootstrap-stack.mjs` (proveedor OIDC, roles `github-brain-build` y `github-brain-deploy` con sus condiciones `sub`, ECR `brain-api`). `infra/lib/brain-stack.mjs` (VPC con 2 subredes públicas sin NAT y gateway endpoints, security groups con salida 443, ALB HTTPS con ACM y `/health`, WAF con regla por IP de 1 000 por minuto, ECS Fargate con 2 tareas fijas, `minimumHealthyPercent = 50`, `maximumPercent = 100` y circuit breaker, Cognito con cliente `extension` y cliente de máquina `probe`, S3 y DynamoDB con `RETAIN`, Secrets Manager, Scheduler para `InventoryJob` y `Probe`, roles de IAM de `infrastructure-specification.md`, alarmas, regla de EventBridge, tablero, SNS y Budgets). `infra/scripts/token-caps.mjs` y la compuerta de `cdk synth` (falla si `cost-inputs.json` está incompleto, si el fijo supera USD 25 o si el presupuesto de tokens no es positivo); `infra/cost-inputs.example.json`.
- [x] **Step 16. Pruebas de la IaC.** `tests/u4/infra.test.js` con `aws-cdk-lib/assertions` sobre el template sintetizado: 2 tareas y `maximumPercent = 100`, sin NAT Gateway, roles sin `*`, `RETAIN` en S3 y DynamoDB, regla de WAF, alarmas presentes; `token-caps.mjs` con entradas completas, incompletas y con fijo excesivo.
- [x] **Step 17. Configuración y CI.** `.github/workflows/brain.yml` (jobs `verify` con `gitleaks` verificado por SHA-256, lint, pruebas y `cdk synth`; `image` y `diff` con `github-brain-build`; `deploy` y `smoke` en el entorno `production` con `github-brain-deploy`; acciones fijadas por SHA). `vitest.config.js`: `brain/core/**` en `coverage.include` con umbral `{ lines: 80, branches: 80 }`. `eslint.config.js`: bloque para `brain/**` e `infra/**` (entorno Node).
- [x] **Step 18. Verificación y documentación.** Correr `npx vitest run tests/u4`, `npm run lint`, `npm run format:check`, `npm run check:bundle` y `npx cdk synth` (con `cost-inputs` de ejemplo); escribir `brain/README.md` con los prerrequisitos y el orden de despliegue, `source-manifest.json`, `code-summary.md` y `traceability.json`.

## Trazabilidad

| Paso | Historias / requisitos |
|---|---|
| 1-2 | NFR6.1, NFR7.1 |
| 3-4 | FR8.5 (inventario); BR5.1, BR5.2; NFR3.5 |
| 5-6 | US5.1 (AC5.1.1-AC5.1.4); FR1.1, FR8.1-FR8.4; BR1.1-BR1.6, BR2.1-BR2.3, BR3.1, BR3.2, BR4.1-BR4.3, BR6.1, BR7.1, BR7.2; NFR1.3, NFR1.10, NFR5.5 |
| 7-8 | NFR1.8, NFR3.1, NFR3.2, NFR5.5 |
| 9-10 | BR7.3; NFR1.6, NFR1.7, NFR3.1-NFR3.4, NFR5.2, NFR5.4, NFR8.4-NFR8.7 |
| 11-12 | C1 2.0.0, C2 1.1.0, C3 1.0.0; NFR1.1, NFR1.2, NFR3.6, NFR3.7, NFR3.9, NFR8.4 |
| 13-14 | BR5.1-BR5.3; NFR1.4, NFR1.8, NFR1.9 |
| 15-16 | NFR1.5, NFR3.3, NFR3.4, NFR4.1, NFR4.2, NFR5.1; infraestructura Q1-Q4 |
| 17 | NFR5.1, NFR6.1; cicd-pipeline Q3 |
| 18 | NFR6.1 |
