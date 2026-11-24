# Cerebro de la extensión AWS Calculator (`brain/`)

Servicio server-side de la unidad u4-mapping-brain. Expone tres operaciones HTTPS que consume la extensión a través de su service worker, más el chequeo de salud:

| Ruta                 | Contrato | Qué hace                                                                                                           |
| -------------------- | -------- | ------------------------------------------------------------------------------------------------------------------ |
| `POST /interpret`    | C3 1.0.0 | Convierte lenguaje natural en un `runInput` validado contra el inventario, o devuelve fragmentos no interpretados. |
| `POST /map-residue`  | C1 2.0.0 | Resuelve el residuo de mapeo campo-valor que el mapeo determinístico no resolvió.                                  |
| `POST /waf-evaluate` | C2 1.1.0 | Evalúa servicios con criterio Well-Architected antes (`pre_fill`) o después (`post_fill`) de llenar.               |
| `GET /health`        | —        | 200 con la versión del inventario; 503 sin inventario cargado.                                                     |

Nada de esta carpeta entra al bundle de la extensión: la extensión sigue siendo MV3 unpacked, sin build step y sin dependencias de runtime (`npm run check:bundle`).

## Estructura

| Carpeta                   | Contenido                                                                                                                                                                                                                        |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `core/`                   | Lógica pura, sin SDK de transporte: validación de pedidos y salidas, selección de candidatos, prompts, catálogo de errores, registro con lista blanca, AuthFilter, UsageGuard, ModelGateway, InventoryLoader y los flujos B1-B3. |
| `adapters/`               | Acceso a S3 (inventario), DynamoDB (uso), Bedrock (modelo), JWKS de Cognito y el hilo de trabajo que parsea el inventario.                                                                                                       |
| `server/`                 | Servidor `node:http` con la cadena de filtros y el punto de entrada del contenedor.                                                                                                                                              |
| `jobs/`                   | `InventoryJob` semanal (`build-inventory.mjs`), lista de entradas canónicas y sinónimos en español.                                                                                                                              |
| `prompts/`, `config.json` | Instrucciones al modelo, identificador del modelo, `max_tokens` por operación y tiempos (configuración versionada).                                                                                                              |

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

## Arquitectura de despliegue

Dos Lambdas ARM64 con la misma imagen de ECR (este directorio) y AWS Lambda Web Adapter, sin VPC, ALB ni WAF. El costo fijo es casi nulo: se paga por uso (decisión de costo para 2 SE y proyecto open source).

- **`brain-api`**: expuesta con una Function URL sin autenticación de IAM. El cerebro valida el token de Cognito, el origen (CORS) y los límites por SE y globales (DynamoDB). La concurrencia de la cuenta acota las invocaciones simultáneas a Bedrock.
- **`brain-inventory-job`**: semanal (EventBridge Scheduler, lunes 06:00 hora de Lima). El adaptador le entrega el evento como `POST /events` a `jobs/job-server.mjs`.

## Prerrequisitos del mantenedor (una sola vez, antes del primer despliegue)

1. **Repositorio en GitHub** con el entorno `production` y el mantenedor como revisor obligatorio.
2. **Política `BrainCfnExecutionPolicy`** en IAM, limitada a los servicios del stack (Lambda, Cognito, S3, DynamoDB, Scheduler, SNS, CloudWatch y Logs, Budgets, y acciones de IAM solo sobre roles con prefijo `brain-`). Todos los roles del stack `brain` se llaman `brain-*`.
3. **Bootstrap de CDK** con esa política en lugar de `AdministratorAccess`:
   `cdk bootstrap aws://<cuenta>/us-east-1 --cloudformation-execution-policies arn:aws:iam::<cuenta>:policy/BrainCfnExecutionPolicy`
4. **Stack de arranque** `brain-bootstrap` (proveedor OIDC de GitHub, roles `github-brain-build` y `github-brain-deploy`, ECR `brain-api` con permiso de descarga solo para las Lambdas `brain-*`), desplegado a mano:
   `npx cdk deploy BrainBootstrapStack -c githubRepo=<org>/<repo> ...`
   Si la cuenta ya tiene el proveedor OIDC de GitHub (otro proyecto), agregar `"reuseGithubOidcProvider": "true"` a `deploy-params.json`. Si el repo usa el subject inmutable de OIDC (lo informa `gh api repos/<owner>/<repo>/actions/oidc/customization/sub`), agregar su prefijo como `"githubSubjectPrefix"`.
5. **Modelo de Claude habilitado en Amazon Bedrock (us-east-1)**. `config.json` (`model.modelId`) es la única fuente del modelo: se actualiza a mano con un commit. Admite un modelo directo o un perfil de inferencia (`us.…`); la IaC arma el permiso para cualquiera de los dos y el job `diff` del workflow verifica que esté activo antes de pedir la aprobación. Si Bedrock está en otra cuenta, desplegar allí `infra/cross-account/bedrock-invoke-role.yaml` y pasar su `RoleArn` como `bedrockRoleArn`. **Antes del primer uso, invocar el modelo una vez con una identidad administradora de la cuenta de Bedrock** (consola de Bedrock o `aws bedrock-runtime invoke-model`): los modelos de terceros activan una suscripción de AWS Marketplace en la primera invocación, y el rol de solo invocación no tiene permiso para crearla.
6. **Registro de invocaciones de Bedrock desactivado** en la cuenta (guardaría prompts con datos del cliente).
7. **Par de claves `key` de la extensión** (u7): fija el identificador estable que usa la URL de retorno de Cognito (`https://<id>.chromiumapp.org/`) y el origen permitido por CORS.
8. **`infra/cost-inputs.json`**: precios oficiales de us-east-1 (con su fuente en el archivo), presupuesto mensual y cantidad de SE. Si falta, si el costo de infraestructura alcanza la mitad del presupuesto o si el presupuesto de tokens no es positivo, `cdk synth` se detiene con el motivo.
9. **Parámetros de despliegue**: `infra/deploy-params.json` (no versionado; ver `deploy-params.example.json`) o, en GitHub, las variables `AWS_ACCOUNT_ID`, `AWS_REGION`, `EXTENSION_ID`, `COGNITO_DOMAIN_PREFIX`, `BRAIN_BUILD_ROLE_ARN`, `BRAIN_DEPLOY_ROLE_ARN`, `BEDROCK_ROLE_ARN` (opcional), `GITLEAKS_SHA256` (suma publicada de `gitleaks` 8.21.2 linux_x64) y el secreto `ALARM_EMAIL` (secreto solo para que quede enmascarado en los logs públicos).
10. **Etiqueta de asignación de costos `Project`** activada en Billing, para que el presupuesto `brain-monthly` filtre el gasto del cerebro.

## Orden de despliegue

1. `brain-bootstrap` (a mano, una vez).
2. **Primer despliegue**: `workflow_dispatch` del workflow `brain`. Crea todo; como aún no hay inventario, `smoke` corre `brain-inventory-job` una vez y luego exige `/health` 200 por la Function URL.
3. **Despliegues siguientes**: push a `main` con cambios en `brain/`, `infra/` o `tests/u4/`. El workflow corre `verify` → `image` (ARM64, etiqueta = SHA de git, escaneo de ECR) → `diff` (verifica el modelo y publica el diff) → `deploy` (aprobación del mantenedor en `production`) → `smoke` (`/health` por la Function URL).
4. Crear las cuentas de los SE en el user pool `brain-users`, generar `infra/cdk-outputs.json` con las salidas del stack y correr `node scripts/sync-brain-config.js`, `npm run format` y `npm run check:bundle` en la raíz.

## Operación

- **Rollback de la aplicación**: ejecutar el workflow `brain` con `image_tag` = una etiqueta anterior de ECR (se conservan 10).
- **Inventario dañado**: reescribir el objeto `active` del bucket con la versión anterior (`previous`); las instancias lo toman en 5 minutos sin redesplegar.
- **Alarmas**: llegan al tópico `brain-alarms` (correo del mantenedor). El tablero `Brain` muestra disponibilidad, latencia p95, errores, tokens y la antigüedad del inventario. El detalle por operación y por código de error está en los logs (`/brain/api`, Logs Insights).
- **Disponibilidad**: se mide con el tráfico real (errores 5xx del cerebro y errores o throttling de la Lambda sobre las invocaciones; alarma `brain-api-failures`), sin sonda sintética; sin tráfico no hay medición ni costo.
