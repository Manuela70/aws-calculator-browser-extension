# Registro de despliegue — calculator-rpa

> Decisiones: `deployment-execution-questions.md` (Q1 = C, desplegar ahora con guía paso a paso; Q2 = A, el mantenedor corre el smoke en Chrome). Este registro se actualiza en cada paso. Nunca contiene el número de cuenta completo ni ARN completos.

## Sources

- `deployment-execution-questions.md` de esta etapa (Q1 = C, Q2 = A). [Q1] [Q2]
- `operation/deployment-pipeline/cd-config.md`, `deployment-strategy.md`, `rollback-runbook.md`. [stage]
- `construction/build-and-test/test-results.md` (626 pruebas en verde; pendientes conocidos). [stage]
- `brain/README.md` (prerrequisitos y orden de despliegue). [code]

## 1. Chequeo previo

| Hora (UTC) | Chequeo | Resultado |
|---|---|---|
| 2026-11-22 | `aws sts get-caller-identity` (us-east-1) desde la terminal del agente | Válido: cuenta `********9610`, usuario de IAM |
| 2026-11-22 | Remoto de GitHub | **Falta**: el repo no tiene remoto |
| 2026-11-22 | `infra/cost-inputs.json` | **Falta** |
| 2026-11-22 | `infra/deploy-params.json` | **Falta** |
| 2026-11-22 | Clave `key` en `manifest.json` | **Falta** |
| 2026-11-22 | Modelo de `brain/config.json` habilitado en la cuenta | **Sin confirmar** |
| 2026-11-22 | Migraciones de base de datos | No aplica: bucket y tabla nuevos |

## 2. Cambios aplicados al pipeline (`cd-config.md` §3)

| Archivo | Cambio | Verificación |
|---|---|---|
| `infra/lib/brain-stack.mjs` | `bootstrapMode`: `desiredCount` 0 y alarmas de tareas sanas sin acciones; `modelResourceArns` para un modelo directo o un perfil de inferencia | `tests/u4/infra.test.js`: 5 pruebas nuevas, 18/18 |
| `infra/lib/build-app.mjs`, `infra/bin/app.mjs` | Contexto `-c bootstrap=true` → `bootstrapMode` | `cdk synth … -c bootstrap=true --no-lookups` exit 0 |
| `infra/lib/brain-bootstrap-stack.mjs` | `github-brain-build`: `bedrock:GetFoundationModel` y `bedrock:GetInferenceProfile` (solo lectura, acotado a la región y la cuenta) | Prueba "CheckConfiguredModel"; prueba de comodines en verde |
| `.github/workflows/brain.yml` | Entrada `bootstrap`; `-c bootstrap=…` en `diff` y `deploy`; `smoke` se omite en bootstrap; paso de verificación del modelo en `diff` | Formato y lint en verde; el workflow no corrió aún (no hay repo en GitHub) |
| `brain/README.md` | Orden del primer despliegue en dos pasos | — |
| Cerebro, IaC, pipeline y pruebas | **Sonda sintética retirada** (decisión del mantenedor, 2026-11-22): a una llamada por minuto con Opus costaría cientos de USD al mes (precios del modelo tomados de la AWS Price List API) para medir un servicio de uso interno. Se eliminaron `brain/probe/`, la Lambda, su calendario, el cliente de máquina y el resource server de Cognito, el secreto, el tope `PROBE_DAILY_TOKEN_CAP`, la alarma `brain-probe-failed` y los componentes de costo `probeLambda`, `probeBedrock` y `secretsManager`. El filtro de autenticación ahora rechaza cualquier token sin `sub` (solo personas). **NFR1.4 cambia de método**: la disponibilidad se mide con tráfico real en el ALB (alarma `brain-alb-5xx-rate` con 5xx del balanceador > 5 % en 5 min y al menos 20 peticiones; widget de disponibilidad por hora en el tablero), y el `smoke` del pipeline verifica `/health` por el dominio público y 2 tareas. Sin tráfico no hay medición | 633 pruebas en verde (cobertura 96,7 % líneas); lint, formato y `check:bundle` en verde; `cdk synth` sin conexión exit 0, 0 funciones Lambda en `BrainStack` |

Suite completa después de los cambios: 70 archivos y 633 pruebas en verde. Lint, formato y `check:bundle` en verde.

### Rediseño a Lambda (2026-11-22, decisión del mantenedor)

Con 1 tarea de ECS el costo fijo seguía en ~USD 57/mes (ALB, Fargate, IPv4, WAF). Para 2 SE y un proyecto que se publicará como open source, el mantenedor eligió **Lambda + Function URL** y un **presupuesto de USD 20/mes**:

- `brain-api` y `brain-inventory-job`: Lambdas ARM64 con la imagen de ECR y AWS Lambda Web Adapter 1.0.1 (fijado por digest). El código del cerebro no cambia; se agregó `brain/jobs/job-server.mjs` para el job.
- Se eliminaron VPC, ALB, WAF, ACM, el registro DNS, ECS y el modo `bootstrap`. La autenticación, el CORS y los límites los aplica el cerebro; la concurrencia de la cuenta acota las invocaciones simultáneas.
- Alarmas: `brain-api-failures` (errores y throttling de la Lambda) reemplaza a las del ALB y de tareas sanas; `brain-inventory-job-errors` reemplaza la regla de EventBridge de ECS.
- `cost-inputs.json`: infraestructura ~USD 8,55/mes (casi todo CloudWatch: 10 métricas, 13 métricas en alarmas y el tablero de USD 3), Haiku 5.5, 2 SE → tope global ~1,25 M tokens/día, ~627 k por SE.
- La hosted zone `brain.manu4tech.com` ya no se usa (USD 0,50/mes); pendiente decidir si se borra. Las variables `BRAIN_DOMAIN`, `HOSTED_ZONE_ID` y `HOSTED_ZONE_NAME` se borraron del repo.
- Verificación: 637 pruebas en verde (4 nuevas del job), lint, formato y `check:bundle` en verde; `cdk synth` con las entradas reales, exit 0.

## 3. Pasos del despliegue

| # | Paso | Quién | Estado |
|---|---|---|---|
| 1 | Publicar el repo en GitHub; entorno `production` con revisor obligatorio | Mantenedor y agente | **Hecho en parte:** repo `Manuela70/aws-calculator-browser-extension` (público). Antes del push se reescribió el historial de `main` con permiso explícito del mantenedor: se reemplazó la URL del webhook n8n personal por `n8n-retirado.example` en todos los commits y el correo del autor por `Manuela70@users.noreply.github.com`; se verificó con `git grep` en los 8 commits que no queda ninguno de los dos. Push de `main` hecho. La copia local se alineó con `git reset --mixed origin/main`, conservando los cambios sin commit. Falta crear el entorno `production` en GitHub |
| 2 | Generar el par de claves `key`; pública en `manifest.json` y `scripts/bundle-policy.json`; obtener el id de la extensión | Mantenedor (la privada nunca entra al repo) | **Hecho:** clave pública en ambos archivos; id de la extensión `elmgfjeildmnpibocclddedklgohmdfd`; `check:bundle` en verde. Sin commit todavía, por decisión del mantenedor |
| 3 | Modelo: Bedrock desde otra cuenta (decisión del mantenedor: esta cuenta es nueva y no tiene límites de Bedrock), con un modelo Opus | Mantenedor (rol en la otra cuenta) y agente (código y pruebas) | **Código hecho y probado:** `brain/config.json` → `anthropic.claude-opus-5-5`, `effort: "low"` y `max_tokens` 4000/2000/6000 (el razonamiento de Opus 5.5 siempre está activo y cuenta dentro de `max_tokens`). El adaptador ya no envía `temperature` (Opus 5.5 la rechaza con 400). La tarea asume el rol de la otra cuenta con credenciales temporales (`@aws-sdk/credential-providers`, nueva dependencia del cerebro, no de la extensión). La IaC acepta `bedrockRoleArn`. Plantilla del rol: `infra/cross-account/bedrock-invoke-role.yaml`. El pipeline verifica el modelo con ese rol. 637 pruebas en verde. En la cuenta de Bedrock (`****6571`) el modelo solo admite perfil de inferencia: `modelId` pasa a `us.anthropic.claude-opus-5-5` (perfil `ACTIVE`, verificado con `get-foundation-model` y `list-inference-profiles`). Stack `brain-bedrock-invoke` desplegado el 2026-11-22 con el perfil SSO de esa cuenta: `CREATE_COMPLETE`; `bedrockRoleArn` guardado en `deploy-params.json`. Falta la variable `BEDROCK_ROLE_ARN` del repo |
| 4 | `infra/cost-inputs.json` con precios de fuentes oficiales de AWS; validarlos después con un estimado hecho con la extensión | Agente, con revisión del mantenedor | **Hecho, valores provisionales por confirmar:** precios de la AWS Price List API (el MCP `aws-pricing` no conectó), con fuente y supuesto por componente dentro del archivo. Con Opus el costo fijo era ~USD 81/mes y no pasaba la compuerta con USD 50. Decisión del mantenedor (2026-11-22): **1 tarea en una sola AZ** (el ALB sigue en 2 AZ porque AWS lo exige; durante un despliegue conviven como máximo 2 tareas, así el semáforo de 15 invocaciones se mantiene), **solo las métricas necesarias** (EMF sin dimensiones: 6 métricas de petición + 4 operativas; se quitó la alarma `brain-healthy-hosts`, redundante con 1 tarea) y **Claude Haiku 5.5** (`us.anthropic.claude-haiku-5-5`, USD 0,11/0,55 por millón; rol de Bedrock actualizado). Costo fijo nuevo ~USD 57,3/mes; presupuesto provisional USD 120 y 10 SE → tope global ~6,5 M tokens/día, ~650 k por SE. 633 pruebas en verde; `cdk synth` con las entradas reales, exit 0 |
| 5 | `infra/deploy-params.json` y variables del repositorio en GitHub | Mantenedor y agente | **En parte:** `deploy-params.json` creado (no versionado) con `brain.manu4tech.com`, correo de alarmas, id de la extensión, prefijo `manu4tech-calc-brain` y el repo. Hosted zone pública `brain.manu4tech.com` creada el 2026-11-22 en la cuenta del cerebro (`****0345`, sesión SSO `manu4tech`, con aprobación del mantenedor); `hostedZoneId` completado. Pendiente: los 4 registros NS en Namecheap (host `brain`) |
| 6 | Crear `BrainCfnExecutionPolicy`, `cdk bootstrap` y desplegar `BrainBootstrapStack` | Agente, con aprobación explícita del mantenedor por comando | Pendiente |
| 7 | `brain` con `bootstrap = true` | Pipeline, con aprobación en `production` | Pendiente |
| 8 | `brain-inventory-job` una vez | Agente o mantenedor, con aprobación | Pendiente |
| 9 | `brain` con `bootstrap = false` → 2 tareas, `smoke` | Pipeline, con aprobación en `production` | Pendiente |
| 10 | Cuentas de SE en Cognito; `sync-brain-config.js`; "Reload" de la extensión | Mantenedor y agente | Pendiente |
| 11 | Smoke en Chrome: S1-S9, R1-R11 y P1-P2 sin cerebro; S10-S14 con cerebro | Mantenedor | Pendiente |

## 4. Rollback

`rollback-runbook.md` cubre cada paso. Hasta el paso 6 no hay nada desplegado en AWS que revertir.
