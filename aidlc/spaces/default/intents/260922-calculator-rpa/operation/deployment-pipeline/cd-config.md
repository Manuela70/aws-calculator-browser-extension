# Configuración de CD — calculator-rpa

> **Actualización 2026-11-22 (Deployment Execution):** el cerebro pasó de ECS Fargate + ALB + WAF a dos Lambdas ARM64 con la misma imagen (AWS Lambda Web Adapter) y una Function URL, por decisión de costo del mantenedor (2 SE, proyecto open source, presupuesto USD 20/mes). Ya no aplican: el modo `bootstrap` de dos pasos, las tareas de ECS, el dominio propio, el ALB y el WAF. El primer despliegue es uno solo: el `smoke` corre `brain-inventory-job` si aún no hay inventario y exige `/health` 200 por la Function URL. El rollback de la aplicación sigue igual (redesplegar una `image_tag` anterior). Detalle en `deployment-execution/deployment-log.md`.

> Dos entregables con caminos distintos:
> - **El cerebro (U4):** se despliega en AWS con GitHub Actions (`.github/workflows/brain.yml`).
> - **La extensión (U1-U3, U5-U7):** no tiene despliegue automático. Se carga unpacked y, a futuro, se distribuye como `.zip` manual.
>
> No hay etapa CI Pipeline en este plan. La verificación previa al despliegue del cerebro vive en el job `verify` de `brain.yml`, y la de la extensión en `.github/workflows/ci.yml`.

## Sources

- `deployment-pipeline-questions.md` de esta etapa (Q1 = A, Q2 = B, Q3 = A). [Q1] [Q2] [Q3]
- `construction/u4-mapping-brain/infrastructure-design/cicd-pipeline.md` (jobs `verify` → `image` → `diff` → `deploy` → `smoke`, OIDC, prerrequisitos) e `infrastructure-specification.md` (ECS Fargate, ALB, `RemovalPolicy.RETAIN`). [stage]
- `construction/u7-packaging/infrastructure-design/cicd-pipeline.md` (entrega de la extensión, `sync-brain-config.js`, `package-zip.js`). [stage]
- `construction/build-and-test/build-and-test-summary.md` (pendientes de despliegue). [stage]
- `aidlc/spaces/default/memory/team.md` (`## Deployment`: unpacked hoy, `.zip` manual a futuro). [team-practices]
- `.github/workflows/brain.yml` y `.github/workflows/ci.yml` en `main`. [code]

## 1. Pipeline del cerebro: `.github/workflows/brain.yml`

| # | Job | Identidad | Qué hace | Compuerta |
|---|---|---|---|---|
| 1 | `verify` | Sin AWS | `npm ci` (raíz, `brain`, `infra`); `gitleaks` verificado por SHA-256; lint; `vitest run tests/u4 --coverage` (80 % en `brain/core`); `cdk synth` con entradas de ejemplo | Cualquier fallo |
| 2 | `image` | `github-brain-build` (OIDC) | Imagen ARM64 con etiqueta = SHA de git; push a ECR; espera el escaneo de ECR | Hallazgos críticos o altos |
| 3 | `diff` | `github-brain-build` | **Nuevo (Q2):** verifica que el modelo de `brain/config.json` esté habilitado; luego `cdk diff` al resumen del job | Modelo no habilitado o inexistente |
| 4 | `deploy` | `github-brain-deploy`, entorno `production` | Aprobación manual del mantenedor (una vez, con el diff a la vista); `cdk deploy` | Sin aprobación, o el circuit breaker de ECS revierte |
| 5 | `smoke` | `github-brain-deploy`, entorno `production` | `GET https://<dominio>/health` responde 200 (hasta 5 intentos); verifica 2 tareas sanas | `/health` falla o faltan tareas: el mantenedor decide revertir |

**Disparadores:**
- `push` a `main` con cambios en `brain/**`, `infra/**`, `tests/u4/**` o el propio workflow.
- `workflow_dispatch` con las entradas `image_tag` (para rollback) y `bootstrap` (nueva, ver §3).

**Secretos:** ninguno en GitHub. Las variables solo guardan datos no secretos: cuenta, región, ARN de roles, dominio, hosted zone, correo de alarmas, id de la extensión y prefijo de Cognito.

## 2. Matriz de promoción de entornos

| Entorno | Existe | Cómo se llega | Aprobación |
|---|---|---|---|
| Local (desarrollo) | Sí | `npm ci` + pruebas; extensión unpacked en Chrome | Ninguna |
| `prod` (us-east-1) | Sí | `brain.yml`: `verify` → `image` → `diff` → `deploy` → `smoke` | Mantenedor, en el entorno `production` de GitHub |
| Staging | **No** | — | Decisión de u4 Q2: un solo entorno. El diff y la aprobación manual cumplen el papel de puerta |

La regla de `org.md` "deploy on merge a staging" no aplica: no hay staging (`team.md` § Deployment lo declara N/A).

## 3. Cambios de configuración que esta etapa fija

Estos cambios hacen falta antes del primer despliegue y se aplican en Deployment Execution, con sus pruebas, antes de correr el pipeline.

### 3.1 Primer despliegue en dos pasos (Q1 = A)

| Archivo | Cambio |
|---|---|
| `infra/lib/brain-stack.mjs` | Leer el contexto `bootstrap` (`true`/`false`, por defecto `false`). Con `bootstrap=true`, `desiredCount: 0` y la alarma de tareas en ejecución (umbral `TASK_COUNT`) queda deshabilitada; con `false`, `desiredCount: TASK_COUNT` (2) como hoy |
| `tests/u4/infra.test.js` | Casos: `bootstrap=true` → `DesiredCount 0`; por defecto → 2; la alarma de tareas no actúa en el arranque |
| `.github/workflows/brain.yml` | Entrada `bootstrap` (booleana) en `workflow_dispatch`, pasada como `-c bootstrap=${{ inputs.bootstrap }}` a `diff` y `deploy`. El job `smoke` se omite cuando `bootstrap` es verdadero, porque con 0 tareas la sonda fallaría siempre |
| `brain/README.md` | Orden del primer despliegue (ver `deployment-strategy.md` §3) |

### 3.2 Verificación del modelo antes de desplegar (Q2 = B)

`brain/config.json` sigue siendo la única fuente del `modelId`. El mantenedor lo actualiza a mano, con un commit, antes de desplegar.

| Archivo | Cambio |
|---|---|
| `infra/lib/brain-bootstrap-stack.mjs` | Permiso de solo lectura para `github-brain-build`: `bedrock:GetFoundationModel` y `bedrock:GetInferenceProfile` en us-east-1 |
| `.github/workflows/brain.yml`, job `diff` | Paso previo al `cdk diff`: lee `model.modelId` de `brain/config.json`. Si empieza por un prefijo de perfil de inferencia (`us.`, `global.`), llama a `aws bedrock get-inference-profile`; si no, a `aws bedrock get-foundation-model`. Falla el job si el modelo no existe, no está activo o no admite invocación bajo demanda en la región |
| `infra/lib/brain-stack.mjs` | Si `modelId` es un perfil de inferencia, el ARN de IAM del rol de la tarea debe apuntar al perfil y a los modelos de destino, no a `foundation-model/<id>` (hoy solo arma ese ARN). Se agrega la rama para perfiles, con su prueba en `tests/u4/infra.test.js` |

El job `verify` no tiene credenciales de AWS. Por eso la verificación va en `diff`, que ya asume `github-brain-build` y corre antes de la aprobación.

### 3.3 Feature flags (Q3 = A)

No se agregan. El control de cambios es el despliegue aprobado y el rollback (`rollback-runbook.md`). Sin cerebro configurado, la extensión ya se degrada sola: sigue sin revisión Well-Architected y lo avisa.

## 4. Entrega de la extensión

| Paso | Comando o acción | Cuándo |
|---|---|---|
| Verificación | `.github/workflows/ci.yml`: `npm ci`, `npm audit`, formato, lint, cobertura, `check:bundle` | En cada pull request o push a `main` |
| Unir la extensión con el cerebro | `node scripts/sync-brain-config.js` (lee `infra/cdk-outputs.json`), luego `npm run format` y `npm run check:bundle`, y commit | Después de un despliegue del cerebro que cambie las salidas del stack |
| Clave `key` del manifest | El mantenedor genera el par RSA con `openssl`, guarda la privada en su gestor de contraseñas y pone la pública en `manifest.json` y en `scripts/bundle-policy.json`, en el mismo commit | Una vez, **antes** del primer despliegue del cerebro: el id de la extensión es un parámetro de U4 (`extensionId`) |
| Carga diaria | "Load unpacked" o "Reload" en `chrome://extensions` | Hoy |
| Distribución a futuro | Subir `version` del manifest; `npm run package`; adjuntar el `.zip` a un release de GitHub con la versión | Cuando se decida distribuir; sin publicación automática |

## 5. Prerrequisitos del mantenedor antes del primer `deploy`

1. Publicar el repo en GitHub y configurar el entorno `production` con el mantenedor como revisor obligatorio y las variables no secretas.
2. Generar la clave `key` y obtener el id estable de la extensión (§4).
3. Crear `BrainCfnExecutionPolicy`, correr `cdk bootstrap` con esa política y desplegar a mano `BrainBootstrapStack` (OIDC, roles, ECR).
4. Habilitar en Bedrock (us-east-1) el modelo elegido y fijarlo en `brain/config.json`. Pedir la cuota de 15 invocaciones simultáneas.
5. Completar `infra/cost-inputs.json` con precios reales y su fuente: sin eso `cdk synth` falla. El ejemplo tiene valores ficticios y no sirve para desplegar.
6. Activar la etiqueta `Project=brain` como etiqueta de asignación de costos (presupuesto).
7. Aplicar y probar los cambios de §3 (Deployment Execution).
