# Estrategia de despliegue — calculator-rpa

> **Actualización 2026-11-22 (Deployment Execution):** el cerebro pasó de ECS Fargate + ALB + WAF a dos Lambdas ARM64 con la misma imagen (AWS Lambda Web Adapter) y una Function URL, por decisión de costo del mantenedor (2 SE, proyecto open source, presupuesto USD 20/mes). Ya no aplican: el modo `bootstrap` de dos pasos, las tareas de ECS, el dominio propio, el ALB y el WAF. El primer despliegue es uno solo: el `smoke` corre `brain-inventory-job` si aún no hay inventario y exige `/health` 200 por la Function URL. El rollback de la aplicación sigue igual (redesplegar una `image_tag` anterior). Detalle en `deployment-execution/deployment-log.md`.

## Sources

- `deployment-pipeline-questions.md` de esta etapa (Q1 = A, Q2 = B, Q3 = A). [Q1] [Q2] [Q3]
- `construction/u4-mapping-brain/infrastructure-design/infrastructure-specification.md` (2 tareas Fargate ARM64, `maximumPercent` 100 / `minimumHealthyPercent` 50, ALB con `/health`, circuit breaker). [stage]
- `construction/u4-mapping-brain/infrastructure-design/cicd-pipeline.md` (aprobación manual; la sonda se retiró en Deployment Execution). [stage]
- `construction/u4-mapping-brain/code-generation/reviews/review-01.md` (hallazgo mayor: el primer despliegue se revierte). [stage]
- `aidlc/spaces/default/memory/team.md` (`## Deployment`). [team-practices]

## 1. Cerebro (U4): despliegue rolling con circuit breaker

| Aspecto | Elección | Motivo |
|---|---|---|
| Estrategia | Rolling de ECS: `maximumPercent` 100, `minimumHealthyPercent` 50 | Dos tareas: se reemplaza una y luego la otra; el servicio nunca baja de una tarea sana. Blue/green o canary no se justifican para una herramienta interna con un solo entorno |
| Protección | Circuit breaker de ECS con rollback automático | Una tarea que no pasa `/health` revierte sola a la definición anterior |
| Chequeo de salud | `/health` del ALB; responde 503 sin inventario o sin modelo | Un cerebro sin inventario no recibe tráfico |
| Aprobación | Entorno `production` de GitHub, revisor obligatorio: el mantenedor, una sola vez, después de ver el `cdk diff` | u4 Q3 |
| Verificación posterior | Job `smoke`: `/health` por el dominio público y 2 tareas en ejecución | Health check definido para producción (guardarraíl de la fase Operation) |
| Criterio de abortar | El circuit breaker revierte, o `smoke` falla | Si `smoke` falla, el mantenedor decide revertir con `rollback-runbook.md` |

## 2. Modelo de Bedrock (Q2 = B)

- **Fuente única:** `brain/config.json` (`model.modelId`, `model.region`), versionado en git. Cambiar de modelo es un commit que pasa por el pipeline completo y su aprobación.
- **Verificación previa:** el job `diff` comprueba que el modelo exista, esté activo y se pueda invocar en la región, antes de que el mantenedor apruebe. Si no, el pipeline se detiene sin tocar producción.
- **Pendiente antes del primer despliegue:** el valor actual, `anthropic.claude-3-5-haiku-20241022-v1:0`, probablemente no se puede invocar de forma directa en us-east-1 y está en retirada. El mantenedor elige el modelo habilitado en su cuenta (o su perfil de inferencia) y lo fija en `config.json`.

## 3. Primer despliegue en dos pasos (Q1 = A)

| Paso | Acción | Resultado esperado |
|---|---|---|
| 0 | Prerrequisitos de `cd-config.md` §5 hechos | `BrainBootstrapStack` desplegado; `cost-inputs.json` real; modelo habilitado y fijado |
| 1 | `workflow_dispatch` de `brain` con `bootstrap = true` | Se crean todos los recursos; el servicio de ECS queda con 0 tareas. Con 0 tareas no hay chequeo de salud que falle, así que el circuit breaker no revierte. `smoke` se omite |
| 2 | Invocar una vez la tarea `brain-inventory-job` (ECS RunTask o la regla programada) | Inventario v1 en S3 y puntero `active` escrito |
| 3 | `workflow_dispatch` (o push) con `bootstrap = false` y la misma imagen | El servicio sube a 2 tareas; `/health` en 200; `smoke` pasa |
| 4 | `cdk deploy … --outputs-file infra/cdk-outputs.json`, o tomar las salidas del stack | `BrainUrl`, `CognitoDomain`, `ExtensionClientId` |
| 5 | `node scripts/sync-brain-config.js`, `npm run format`, `npm run check:bundle`, commit; "Reload" de la extensión | La extensión apunta al cerebro; `host_permissions` con los 3 hosts exactos |
| 6 | Crear las cuentas de los SE en Cognito; smoke S10-S14 de `SMOKE.md` | Login, sesión y llamadas al cerebro verificadas en Chrome |

Cada paso con `cdk deploy` pasa por la aprobación del entorno `production`: el primer despliegue pide dos aprobaciones.

## 4. Despliegues siguientes

- **Cambio de código del cerebro:** push a `main` → pipeline completo → aprobación → rolling → `smoke`.
- **Cambio de inventario:** el job programado publica una versión nueva y la activa solo si pasa la validación (pérdida ≤10 %); no requiere desplegar.
- **Cambio de la extensión:** CI en verde → "Reload" unpacked. Si cambiaron las salidas del stack, primero `sync-brain-config.js`.

## 5. Feature flags (Q3 = A)

No hay feature flags. Para apagar una función se revierte o se redespliega. Sin cerebro configurado, la extensión sigue funcionando sin revisión Well-Architected.

## 6. Extensión

Se carga unpacked hoy y como `.zip` manual a futuro (`team.md` § Deployment). No hay promoción entre entornos ni publicación automática. Su "rollback" es `git revert` y "Reload", o redistribuir el `.zip` anterior.
