# Especificación de infraestructura — u4-mapping-brain

> Servicios de AWS que implementan el NFR Design del cerebro. Decisiones del
> mantenedor: ECS Fargate (Q1), us-east-1 (Q2), despliegue por GitHub Actions
> con OIDC y aprobación manual (Q3), presupuesto de hasta USD 50 al mes (Q4).
> Prosa en español; identificadores en inglés.

## Sources

- `infrastructure-design-questions.md` de esta unidad (Q1-Q4). [Q1] [Q2] [Q3] [Q4]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u4-mapping-brain/nfr-design/security-design.md`, `performance-design.md`, `scalability-design.md`, `reliability-design.md`, `observability-design.md`, `logical-components.md`. [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u4-mapping-brain/nfr-requirements/tech-stack-decisions.md` (Bedrock, Cognito, Node.js LTS sin transpilar). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u7-packaging/nfr-design/security-design.md` (`sw/config.js`, `host_permissions`, PKCE, `minimum_chrome_version`). [stage]

## 1. Despliegue

| Faceta | Elección | Motivo |
|---|---|---|
| Cómputo | ECS Fargate, un servicio `brain-api` con 2 tareas (`MAX_INSTANCES = 2`), una por zona de disponibilidad, Node.js LTS sin transpilar en una imagen de contenedor propia | Q1. Instancias siempre calientes: el semáforo por instancia (7 lugares) y el arranque de NFR8.7 se cumplen tal como los describe el NFR Design. |
| Tamaño de tarea | 0,5 vCPU y 1 GB de memoria, Linux ARM64 (Graviton) | La memoria cubre dos copias del inventario (≤ 50 MB cada una) durante la recarga en hilo de trabajo, más el proceso. ARM64 tiene menor costo por hora que x86 para la misma tarea. Se ajusta con la medición de Build and Test. |
| Escalado | Fijo en 2 tareas: mínimo 2, máximo 2. Sin autoescalado | El tope global de 15 invocaciones depende de `MAX_INSTANCES = 2` (NFR3.4). Cambiar el número de tareas obliga a recalcular el semáforo y la cuota de Bedrock. |
| Despliegue de tareas | ECS rolling con `minimumHealthyPercent = 50` y `maximumPercent = 100`: reemplaza una tarea a la vez, así que **nunca conviven más de 2 tareas** y el tope de 15 (2 × 7 lugares) y el respaldo `GLOBAL_DAILY_TOKEN_CAP / MAX_INSTANCES` se mantienen también durante un despliegue. Circuit breaker con rollback automático | Se acepta a cambio que, durante los minutos de un despliegue, quede una sola tarea (7 lugares, una zona). El exceso de carga recibe 429 `rate_limited` con `retryAfterSeconds`, nunca un error genérico. Los despliegues pasan por aprobación manual (Q3), así que el mantenedor los hace fuera del horario de uso de los SE. Con `maximumPercent = 200` convivirían 4 tareas (28 lugares), lo que rompe NFR3.4. |
| Red | VPC propia con 2 subredes públicas (una por zona) y sin NAT Gateway. Las tareas del servicio y de `InventoryJob` se lanzan con `assignPublicIp = ENABLED` (sin IP pública no podrían extraer de ECR ni llegar a Bedrock). Security groups: `brain-api-sg` admite entrada **solo** desde el security group del ALB en el puerto de la app; `inventory-job-sg` no admite ninguna entrada. La salida de ambos se limita a TCP 443 hacia internet y a las listas de prefijos de los gateway endpoints de S3 y DynamoDB; ningún otro puerto ni protocolo | Evita el costo fijo de NAT Gateway y de los interface endpoints. Ver riesgo R4. |
| Entrada | Application Load Balancer público con listener HTTPS 443 (TLS 1.2 o superior, política `ELBSecurityPolicy-TLS13-1-2-2021-06`) y certificado de ACM; el listener 80 solo redirige a 443. Tiempo de inactividad del ALB en 35 s, por encima del plazo de 25 s del servicio, para que el ALB nunca corte una respuesta en curso. Chequeo de salud en `/health`, que responde 503 si la tarea no tiene inventario cargado. Si las dos tareas quedan sin inventario, el ALB enruta igual a todas (comportamiento de "fail open" cuando ningún destino está sano), así que el cliente recibe el 503 tipado `inventory_unavailable` del servicio y no un error genérico del balanceador. Grupo de destino: intervalo de 15 s, 3 fallos para marcar no sana y 2 éxitos para sana; `healthCheckGracePeriodSeconds = 180` en el servicio ECS, que cubre la carga inicial con sus reintentos cada 30 s. Una tarea en marcha nunca pierde su última versión buena, así que solo una tarea **nueva** sin inventario puede quedar no sana; si S3 cae durante un despliegue, el circuit breaker detiene el despliegue y las tareas existentes siguen atendiendo | NFR1.1, NFR5.2: el token viaja solo por TLS. NFR8.4, NFR1.6. |
| Dominio | Subdominio `brain.<dominio>` en una hosted zone de Route 53 del mantenedor, con certificado de ACM validado por DNS | El certificado público exige un dominio propio. Es un parámetro del despliegue (`BRAIN_DOMAIN`, `HOSTED_ZONE_ID`), no un valor en el código. |
| Almacenamiento | S3 para el inventario versionado y el puntero `active`; DynamoDB para uso y cuotas | NFR1.8, NFR3.1, NFR3.2. |
| Entornos | Uno solo (`prod`) en us-east-1 | Q2, Q3. |
| IaC | AWS CDK en JavaScript, en `infra/` en la raíz del repo, fuera de `aws-calculator-extension/` | Mismo lenguaje del repo; no entra al bundle de la extensión. |

## 2. Servicios de infraestructura

| Servicio | Rol | Configuración | Notas |
|---|---|---|---|
| AWS WAF (web ACL en el ALB) | Freno previo por IP | Regla basada en tasa por IP de origen con ventana de evaluación de 1 minuto y límite de 1 000 peticiones, acción `Block`; sin reglas administradas de pago | NFR1.1 / paso 1 de la cadena. El límite admite que los 10 SE compartan la IP de una oficina (10 × 60 operaciones por minuto como máximo de la app) y aun así corta inundaciones. El control real por SE es el límite de 60 por minuto de la app. |
| Amazon Cognito | Identidad | User pool `brain-users`; dominio prefijo de Cognito; cliente público `extension` (flujo de código con PKCE, sin secreto, token de acceso de 1 hora). Cognito **siempre emite** refresh token en este flujo; se fija en la validez mínima (60 minutos) con revocación activada, y la extensión lo **descarta sin guardarlo** (u7, ciclo del login, punto f). `redirect_uri = https://<id-extensión>.chromiumapp.org/`, que exige un identificador de extensión estable: u7 lo fija con la clave `key` del manifest antes de registrar la URL de retorno (dependencia con u7). Servidor de recursos `brain` con el alcance `brain/probe`; cliente de máquina `probe` (credenciales de cliente). Federación con el directorio corporativo opcional | NFR5.2, NFR5.4, sonda de NFR1.4. Altas de SE manuales por el mantenedor. |
| Amazon Bedrock | Modelo | Claude, identificador en `config.json` del servicio; acceso al modelo habilitado en us-east-1, invocado por su identificador directo en la región (sin perfil de inferencia entre regiones), para que los datos no salgan de us-east-1 y el permiso `bedrock:InvokeModel` quede acotado a un solo ARN; cuota de invocaciones simultáneas solicitada para al menos 15 | NFR3.4. El registro de invocaciones de Bedrock queda **desactivado** (NFR5.5). |
| Amazon S3 `brain-inventory-<cuenta>` | Inventario | Versionado del bucket activo, bloqueo de acceso público, cifrado SSE-S3, política que exige TLS; prefijos `versions/<version>.json` y objeto `active` | NFR1.8, NFR3.5. Lectura desde las tareas por el gateway endpoint. |
| Amazon DynamoDB `brain-usage` | Uso y cuotas | Bajo demanda; clave `pk` (`se#<sub>#min#<minuto>`, `se#<sub>#day#<día>`, `global#day#<día>`, `probe#day#<día>`) con TTL de 48 horas; recuperación a un punto en el tiempo desactivada (datos efímeros) | NFR3.1, NFR3.2, NFR3.4 (gasto). Consulta con tope de 50 ms en el cliente del SDK. |
| AWS Secrets Manager | Secreto de la sonda | Un secreto: el secreto del cliente de máquina `probe`; solo lo lee el rol de la sonda | NFR5.1. Rotación manual cada 90 días por el mantenedor (ver monitoreo). |
| Amazon ECR `brain-api` | Imágenes | Creada por el stack de arranque `BrainBootstrapStack` (§ prerrequisitos de `cicd-pipeline.md`), no por `BrainStack`, para que exista antes del primer push de imagen. Escaneo al subir, etiquetas inmutables (SHA de git), política de ciclo de vida que conserva las últimas 10 | Rollback a una imagen anterior. |
| EventBridge Scheduler + ECS RunTask | `InventoryJob` semanal | Tarea Fargate con la misma imagen y comando `node jobs/build-inventory.mjs`, rol propio, `assignPublicIp = ENABLED` y `inventory-job-sg`. Una regla de EventBridge sobre `ECS Task State Change` con `lastStatus = STOPPED` y `exitCode ≠ 0` para esa familia de tareas publica en `brain-alarms` | NFR1.8, NFR1.9. |
| EventBridge Scheduler + AWS Lambda (Node.js, ARM64, 128 MB) | `Probe` cada minuto | Llama al endpoint público como un cliente más, con su token de máquina | NFR1.4. Mide el camino completo: DNS, WAF, ALB, tarea y modelo. |
| CloudWatch Logs, métricas y alarmas | Telemetría | Detalle en `monitoring-design.md` | NFR3.6-NFR3.11. |
| Amazon SNS `brain-alarms` | Avisos | Suscripción de correo del mantenedor, dada como parámetro del despliegue (no en el repo) | NFR3.8. |
| AWS Budgets | Gasto | Presupuesto mensual de USD 50 con aviso al 80 % y al 100 % previsto | Q4. |

### Roles de IAM (mínimo privilegio, NFR4.1)

| Rol | Permisos | Sin |
|---|---|---|
| Tarea `brain-api` | `bedrock:InvokeModel` sobre el ARN del modelo; `s3:GetObject` en el prefijo del inventario; `dynamodb:GetItem/UpdateItem` en `brain-usage`; escritura de sus registros | Escritura en S3, Secrets Manager, comodines |
| Tarea `InventoryJob` | Lectura de las fuentes públicas por HTTPS; `s3:PutObject` en `versions/*` y `active`; escritura de sus registros (las métricas van por EMF en el registro) | Bedrock, DynamoDB, `cloudwatch:PutMetricData` |
| Lambda `Probe` | `secretsmanager:GetSecretValue` sobre su secreto; escritura de sus registros y métricas | Bedrock, S3, DynamoDB |
| Ejecución de tareas ECS | Extraer de ECR y escribir registros | Datos de la aplicación |
| GitHub Actions: `github-brain-build` (OIDC) | Confianza con `sub = repo:<org>/<repo>:ref:refs/heads/main`. `ecr:GetAuthorizationToken`, push solo a la ECR `brain-api` y `ecr:DescribeImageScanFindings` sobre ella; asumir el rol de lectura (`lookup`) de CDK para `cdk diff` | Despliegue, escritura en otros servicios, otras ramas o repos |
| GitHub Actions: `github-brain-deploy` (OIDC) | Confianza con `sub = repo:<org>/<repo>:environment:production`. Asumir los roles de despliegue de CDK; `lambda:InvokeFunction` sobre `Probe` (el job lee el resultado que devuelve la función) y `ecs:DescribeServices` sobre `brain-api` (cuenta las tareas en `RUNNING` con el chequeo sano) para el job `smoke` | Credenciales estáticas, cualquier otro recurso |
| Ejecución de CloudFormation (bootstrap de CDK) | `cdk bootstrap --cloudformation-execution-policies` con la política propia `BrainCfnExecutionPolicy`, limitada a los servicios del stack (ECS, ELB, EC2 de red, WAF, Cognito, S3, DynamoDB, Secrets Manager, Lambda, Scheduler, Events, SNS, CloudWatch, Budgets, IAM sobre roles con prefijo `brain-`) | `AdministratorAccess`, que es el valor por defecto del bootstrap |
| EventBridge Scheduler | Rol del calendario de `InventoryJob`: `ecs:RunTask` sobre su definición de tarea e `iam:PassRole` solo sobre su rol de tarea y de ejecución. Rol del calendario de `Probe`: `lambda:InvokeFunction` sobre `Probe` | Otros recursos |

## 3. Infraestructura compartida

| Recurso compartido | Unidad dueña | Unidades consumidoras | Frontera de acceso |
|---|---|---|---|
| Endpoint HTTPS `https://brain.<dominio>` | u4 | u7 (`sw/config.js` y `host_permissions`) | Solo con token de acceso válido de Cognito |
| Dominio de Cognito y cliente `extension` | u4 | u7 (`sw/config.js`: dominio, `clientId`; `host_permissions` del dominio de Cognito) | Cliente público con PKCE; ningún secreto en la extensión |

Las salidas del stack (`BrainUrl`, `CognitoDomain`, `ExtensionClientId`) se copian a `sw/config.js` y al manifest; `check:bundle` de u7 verifica que coincidan con `host_permissions`.

## 4. Costo y topes de tokens (Q4: USD 50 al mes)

No hay precios validados en esta etapa: la herramienta de precios no estuvo disponible y no se escriben cifras sin fuente. El diseño fija el **mecanismo**, que asegura que el gasto no supere el presupuesto aunque las cifras se completen después.

**Componentes que entran en el estimado** (todos en us-east-1):

| Componente | Base de cálculo |
|---|---|
| ALB | Horas del mes más unidades de capacidad |
| ECS Fargate | 2 tareas × 0,5 vCPU × 1 GB ARM64 × horas del mes; más la tarea semanal de `InventoryJob` |
| IPv4 públicas | 2 tareas + las IP del ALB (una por zona), por hora |
| AWS WAF | Web ACL + 1 regla + peticiones |
| Lambda `Probe` | 43 200 invocaciones de 128 MB al mes |
| Bedrock, sonda | 43 200 operaciones al mes con el `max_tokens` de cada operación (rotación entre las tres) |
| Bedrock, uso de los SE | Tokens de entrada y salida según el tope diario |
| DynamoDB | Bajo demanda: unas 3 escrituras y lecturas por operación |
| S3 | Almacenamiento de versiones del inventario y lecturas cada 5 minutos por tarea |
| CloudWatch | Registros (30 días), 11 alarmas, 1 tablero, métricas EMF con sus dimensiones |
| Route 53, Secrets Manager, ECR | Hosted zone y consultas; 1 secreto; almacenamiento de 10 imágenes |

**Topes derivados del presupuesto**, calculados por `infra/scripts/token-caps.mjs` a partir de `infra/cost-inputs.json` (archivo versionado que el mantenedor completa con los precios de la AWS Pricing Calculator):

- `FIXED_MONTHLY` = suma de todos los componentes salvo Bedrock de los SE.
- `TOKEN_BUDGET_MONTHLY = (USD 50 × 0,8) − FIXED_MONTHLY`. El 0,8 deja 20 % de margen por el retraso de facturación y la alarma al 80 %.
- `GLOBAL_DAILY_TOKEN_CAP = floor(TOKEN_BUDGET_MONTHLY / 30 / precio_mezclado_por_token)`, donde el precio mezclado usa la proporción de entrada y salida medida con la métrica `Tokens` (1:1 hasta tener datos).
- `DAILY_TOKEN_CAP` por SE = `floor(GLOBAL_DAILY_TOKEN_CAP / 10)`, porque son 10 SE (Q2 de NFR Requirements). Los tokens de la sonda ya están dentro de `FIXED_MONTHLY`, así que **no** suman al contador `global#day`: van a su propio contador `probe#day` con `PROBE_DAILY_TOKEN_CAP = ceil(1 440 operaciones × tokens medios por operación de sonda × 1,2)`, calculado por el mismo script. Si la sonda llega a su tope, deja de invocar el modelo ese día y emite `ProbeSuccess = 0`, que dispara su alarma; nunca consume capacidad de los SE.

**Entrega al servicio**: `cdk synth` escribe los tres topes como variables de entorno de la definición de tarea (`GLOBAL_DAILY_TOKEN_CAP`, `DAILY_TOKEN_CAP`, `PROBE_DAILY_TOKEN_CAP`); cambiarlos es un despliegue aprobado más. La proporción de entrada y salida la actualiza el mantenedor cada mes en `cost-inputs.json`, con la métrica `Tokens` del tablero.

**Compuerta**: `cdk synth` falla si `infra/cost-inputs.json` está incompleto, si `FIXED_MONTHLY ≥ USD 25` (la mitad del presupuesto) o si `TOKEN_BUDGET_MONTHLY ≤ 0`, con un mensaje que explica cuál de las tres condiciones falló. Así el estimado es un requisito del primer despliegue, no un paso opcional. **Dueño**: el mantenedor. **Cuándo**: antes del primer `cdk deploy`, y otra vez cada vez que cambie el modelo o el tamaño de las tareas.

## 5. Riesgos y supuestos

| ID | Riesgo o supuesto | Mitigación |
|---|---|---|
| R1 | **Presupuesto.** Con ECS Fargate, el ALB, las 2 tareas siempre encendidas, las IPv4 públicas y el web ACL tienen costo fijo por hora aunque no haya uso, y la sonda invoca el modelo unas 43 200 veces al mes. Ese fijo puede consumir buena parte de los USD 50. | La compuerta de §4 impide desplegar si el fijo supera la mitad del presupuesto. Si eso ocurre, las palancas que no cambian decisiones del mantenedor son: (1) reemplazar el web ACL por el límite de tasa del propio servicio; (2) bajar la sonda a una operación cada 5 minutos, que cambia la resolución del SLI y pasa por NFR Requirements (NFR1.4). Cambiar el hogar (Q1) o el presupuesto (Q4) es decisión del mantenedor y se le consulta. Una tarea en vez de dos rompe NFR1.5, así que no es palanca. |
| R2 | El modelo de Claude elegido debe estar habilitado en Bedrock en us-east-1 para la cuenta. | Paso previo del despliegue: habilitar el acceso al modelo y verificar la cuota de invocaciones simultáneas. |
| R3 | Se necesita un dominio con hosted zone en Route 53. | Parámetros `BRAIN_DOMAIN` y `HOSTED_ZONE_ID`; sin ellos el despliegue falla en `cdk synth` con un mensaje claro. |
| R4 | Tareas en subredes públicas (sin NAT). | Security groups con entrada solo desde el ALB (o ninguna, en `InventoryJob`) y salida limitada a TCP 443 y a los gateway endpoints; sin puertos de administración; imagen mínima escaneada en ECR. |
