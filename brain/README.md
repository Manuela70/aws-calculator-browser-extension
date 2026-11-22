# Cerebro de la extensión AWS Calculator (`brain/`)

Servicio server-side de la unidad u4-mapping-brain. Expone tres operaciones HTTPS que consume la extensión a través de su service worker, más el chequeo de salud:

| Ruta | Contrato | Qué hace |
|---|---|---|
| `POST /interpret` | C3 1.0.0 | Convierte lenguaje natural en un `runInput` validado contra el inventario, o devuelve fragmentos no interpretados. |
| `POST /map-residue` | C1 2.0.0 | Resuelve el residuo de mapeo campo-valor que el mapeo determinístico no resolvió. |
| `POST /waf-evaluate` | C2 1.1.0 | Evalúa servicios con criterio Well-Architected antes (`pre_fill`) o después (`post_fill`) de llenar. |
| `GET /health` | — | 200 con la versión del inventario; 503 sin inventario cargado. |

Nada de esta carpeta entra al bundle de la extensión: la extensión sigue siendo MV3 unpacked, sin build step y sin dependencias de runtime (`npm run check:bundle`).

## Estructura

| Carpeta | Contenido |
|---|---|
| `core/` | Lógica pura, sin SDK de transporte: validación de pedidos y salidas, selección de candidatos, prompts, catálogo de errores, registro con lista blanca, AuthFilter, UsageGuard, ModelGateway, InventoryLoader y los flujos B1-B3. |
| `adapters/` | Acceso a S3 (inventario), DynamoDB (uso), Bedrock (modelo), JWKS de Cognito y el hilo de trabajo que parsea el inventario. |
| `server/` | Servidor `node:http` con la cadena de filtros y el punto de entrada del contenedor. |
| `jobs/` | `InventoryJob` semanal (`build-inventory.mjs`), lista de entradas canónicas y sinónimos en español. |
| `probe/` | Lambda `Probe`, la sonda sintética del SLI de disponibilidad. |
| `prompts/`, `config.json` | Instrucciones al modelo, identificador del modelo, `max_tokens` por operación y tiempos (configuración versionada). |

La IaC está en `../infra/` (AWS CDK en JavaScript) y el pipeline en `../.github/workflows/brain.yml`.

## Desarrollo local

```bash
npm ci                 # raíz: Vitest, ESLint, Prettier
npm ci --prefix brain  # dependencias del servicio
npm ci --prefix infra  # AWS CDK
npx vitest run tests/u4
npx vitest run tests/u4 --coverage --coverage.include="brain/core/**"
```

Las pruebas no necesitan credenciales de AWS ni red: Bedrock, S3, DynamoDB y el JWKS se reemplazan por dobles.

Síntesis local de la IaC, sin credenciales ni consultas a la cuenta (valores de ejemplo, no reales):

```bash
cd infra
npx cdk synth --no-lookups -c account=111111111111 -c region=us-east-1 \
  -c costInputs=cost-inputs.example.json -c params=deploy-params.example.json
```

## Prerrequisitos del mantenedor (una sola vez, antes del primer despliegue)

1. **Repositorio en GitHub** con el entorno `production` y el mantenedor como revisor obligatorio.
2. **Política `BrainCfnExecutionPolicy`** en IAM, limitada a los servicios del stack (ECS, ELB, EC2 de red, WAF, Cognito, S3, DynamoDB, Secrets Manager, Lambda, Scheduler, Events, SNS, CloudWatch, Budgets, y acciones de IAM solo sobre roles con prefijo `brain-`). Todos los roles del stack `brain` se llaman `brain-*`.
3. **Bootstrap de CDK** con esa política en lugar de `AdministratorAccess`:
   `cdk bootstrap aws://<cuenta>/us-east-1 --cloudformation-execution-policies arn:aws:iam::<cuenta>:policy/BrainCfnExecutionPolicy`
4. **Stack de arranque** `brain-bootstrap` (proveedor OIDC de GitHub, roles `github-brain-build` y `github-brain-deploy`, ECR `brain-api`), desplegado a mano:
   `npx cdk deploy BrainBootstrapStack -c githubRepo=<org>/<repo> ...`
5. **Modelo de Claude habilitado en Amazon Bedrock (us-east-1)** y cuota de al menos 15 invocaciones simultáneas. Confirmar que el identificador de `config.json` (`model.modelId`) está habilitado en la cuenta y admite invocación directa en la región, sin perfil de inferencia entre regiones; si no, cambiarlo en `config.json` (la IaC toma el ARN del permiso de ahí).
6. **Registro de invocaciones de Bedrock desactivado** en la cuenta (guardaría prompts con datos del cliente).
7. **Dominio con hosted zone en Route 53** para `brain.<dominio>` (certificado de ACM validado por DNS).
8. **Par de claves `key` de la extensión** (u7): fija el identificador estable que usa la URL de retorno de Cognito (`https://<id>.chromiumapp.org/`) y el origen permitido por CORS.
9. **`infra/cost-inputs.json`**: copiar `cost-inputs.example.json` y reemplazar cada valor con precios de la AWS Pricing Calculator (us-east-1). Sin ese archivo, o si el costo fijo alcanza USD 25 o el presupuesto de tokens no es positivo, `cdk synth` se detiene con el motivo.
10. **Parámetros de despliegue**: `infra/deploy-params.json` (no versionado; ver `deploy-params.example.json`) o variables del repositorio en GitHub: `AWS_ACCOUNT_ID`, `AWS_REGION`, `BRAIN_DOMAIN`, `HOSTED_ZONE_ID`, `HOSTED_ZONE_NAME`, `ALARM_EMAIL`, `EXTENSION_ID`, `COGNITO_DOMAIN_PREFIX`, `BRAIN_BUILD_ROLE_ARN`, `BRAIN_DEPLOY_ROLE_ARN`, `GITLEAKS_SHA256` (suma publicada de `gitleaks` 8.21.2 linux_x64).
11. **Etiqueta de asignación de costos `Project`** activada en Billing, para que el presupuesto `brain-monthly` filtre el gasto del cerebro.

## Orden de despliegue

1. `brain-bootstrap` (a mano, una vez).
2. Push a `main` con cambios en `brain/`, `infra/` o `tests/u4/`: el workflow `brain` corre `verify` → `image` (imagen ARM64 con etiqueta = SHA de git, escaneo de ECR) → `diff` → `deploy` (aprobación del mantenedor en `production`) → `smoke` (sonda una vez y 2 tareas en ejecución).
3. **Primera versión del inventario**: el cerebro no responde sin inventario activo (BR7.3). Antes de habilitar la extensión, correr una vez la tarea `brain-inventory-job` (desde la consola de ECS o con `aws ecs run-task` usando su definición, subred pública y security group) y confirmar que `/health` responde 200.
4. Crear las cuentas de los SE en el user pool `brain-users` y copiar las salidas del stack (`BrainUrl`, `CognitoDomain`, `ExtensionClientId`) a `sw/config.js` y al manifest de u7.

## Operación

- **Rollback de la aplicación**: ejecutar el workflow `brain` con `image_tag` = una etiqueta anterior de ECR (se conservan 10).
- **Inventario dañado**: reescribir el objeto `active` del bucket con la versión anterior (`previous`); las tareas lo toman en 5 minutos sin redesplegar.
- **Alarmas**: llegan al tópico `brain-alarms` (correo del mantenedor). El tablero `Brain` muestra disponibilidad, p95 por operación, errores por código, tokens y estado del inventario.
- **Secreto de la sonda**: rotación manual cada 90 días (nuevo secreto del cliente `probe` en Cognito y en `brain/probe-client`).
