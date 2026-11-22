# Diseño de monitoreo — u4-mapping-brain

> Implementación en CloudWatch de la estrategia de `nfr-design/observability-design.md`.
> Prosa en español; identificadores en inglés.

## Sources

- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u4-mapping-brain/nfr-design/observability-design.md` (NFR3.6-NFR3.11, tabla de alarmas). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u4-mapping-brain/nfr-design/reliability-design.md` (SLO, sonda, recarga del inventario). [stage]
- `infrastructure-specification.md` de esta unidad (servicios, SNS, Budgets). [stage]
- `infrastructure-design-questions.md` de esta unidad (Q4: presupuesto). [Q4]

## 1. Métricas y KPI

Todas se emiten con el formato de métricas embebidas (EMF) dentro del registro JSON, en el espacio `Brain`, sin llamadas extra a la API de CloudWatch.

| Métrica | Fuente | Umbral | Por qué importa |
|---|---|---|---|
| `Requests` (dimensión `operation`) | `brain-api` | — (base de las tasas) | Volumen por operación |
| `Errors` (dimensiones `operation`, `code`) | `brain-api` | Ver alarmas 5xx y 429 | Separa fallas propias, del modelo y de cuota |
| `Latency` p50 / p95 (dimensión `operation`) | `brain-api` | p95 ≤ 12 s (NFR8.5); alarma a 20 s | Experiencia del SE |
| `Tokens` (`input`, `output`) | `brain-api` | Indicador adelantado del gasto | Prever el presupuesto antes de la factura |
| `UsageGuardFallback` | `brain-api` | > 0 | Límites aproximados mientras el almacén está caído |
| `InventoryReloadFailed` | `brain-api` | > 0 | Una versión activa dañada |
| `InventoryJobFailed` | `InventoryJob` (EMF en su registro) | > 0 | Versión rechazada por la validación |
| `InventoryAgeDays` | `brain-api`: cada tarea la emite al leer el puntero `active` cada 5 minutos | > 14 días | Inventario obsoleto; al emitirla el servicio y no la tarea semanal, la métrica existe aunque la tarea deje de correr |
| `ProbeSuccess` | Lambda `Probe` | 0 tres minutos seguidos | SLI de disponibilidad |
| `HealthyHostCount` (ALB) | CloudWatch de ELB | < 2 | Se perdió una zona |
| `BlockedRequests` (WAF) | CloudWatch de WAF | Solo en el tablero | Señal de abuso |

## 2. Alarmas

Todas avisan al tópico SNS `brain-alarms` (correo del mantenedor). Las alarmas de tasa exigen al menos 20 peticiones en la ventana, con métricas matemáticas (`IF(Requests >= 20, Errors5xx / Requests, 0)`).

| Alarma | Condición | Severidad | Destino |
|---|---|---|---|
| `brain-5xx-rate` | 5xx > 5 % en 5 min con ≥ 20 peticiones | Alta | SNS `brain-alarms` |
| `brain-429-rate` | 429 > 10 % en 15 min con ≥ 20 peticiones | Media | SNS `brain-alarms` |
| `brain-latency-p95` | p95 > 20 s en 15 min con ≥ 20 peticiones | Media | SNS `brain-alarms` |
| `brain-probe-failed` | `ProbeSuccess` = 0 en 3 períodos seguidos de 1 min (datos faltantes = incumple) | Alta | SNS `brain-alarms` |
| `brain-usage-fallback` | `UsageGuardFallback` > 0 durante 5 min | Media | SNS `brain-alarms` |
| `brain-inventory-reload` | `InventoryReloadFailed` > 0 en 15 min | Media | SNS `brain-alarms` |
| `brain-inventory-job` | `InventoryJobFailed` > 0 | Media | SNS `brain-alarms` |
| `brain-inventory-job-exit` | Regla de EventBridge sobre `ECS Task State Change`: tarea de la familia `InventoryJob` con `lastStatus = STOPPED` y `exitCode ≠ 0` | Media | SNS `brain-alarms` |
| `brain-inventory-age` | `InventoryAgeDays` > 14, con datos faltantes tratados como incumplimiento | Baja | SNS `brain-alarms` |
| `brain-healthy-hosts` | `HealthyHostCount` < 2 durante 15 min (un despliegue con `maximumPercent = 100` deja una sola tarea unos minutos, por eso la ventana es mayor) | Media | SNS `brain-alarms` |
| `brain-no-hosts` | `HealthyHostCount` = 0 durante 2 min | Alta | SNS `brain-alarms` |
| `brain-budget-80` | AWS Budgets: gasto real ≥ 80 % de USD 50 en el mes | Alta | Correo del mantenedor (aviso de Budgets) |
| `brain-budget-forecast` | AWS Budgets: gasto previsto ≥ 100 % de USD 50 | Media | Correo del mantenedor |

## 3. SLI y SLO

| SLI | Objetivo | Ventana de medición |
|---|---|---|
| Minutos con `ProbeSuccess = 1` sobre minutos del período | 99,5 % (unos 216 minutos de presupuesto de error) | 30 días móviles |
| p95 de `Latency` de `interpret` y `map-residue` | ≤ 12 s | 1 día, revisado semanalmente |
| p95 de `Latency` de `waf-evaluate` | ≤ 12 s con 5 servicios; ≤ 18 s con 20 | 1 día, revisado semanalmente |

## 4. Registros y trazas

- **Registros**: un grupo por componente (`/brain/api`, `/brain/inventory-job`, `/brain/probe`), retención de 30 días (NFR3.10). Una línea JSON por operación armada por `toLogRecord` con lista blanca (NFR3.6). Los registros de acceso del ALB **no** se activan: no aportan más que el registro de la app y guardarían datos de query. El registro de invocaciones de Bedrock queda desactivado.
- **Correlación**: `requestId` en `X-Request-Id`, en el cuerpo de errores y en cada línea; la extensión lo guarda en su registro técnico (NFR3.9). No se agrega trazado distribuido: hay un solo salto propio (ALB → tarea → Bedrock) y el `requestId` alcanza para seguirlo.
- **Tablero** `Brain` (NFR3.11): disponibilidad de 30 días, p95 por operación, errores por código, tokens frente al presupuesto, estado del inventario (versión, antigüedad), tareas sanas y bloqueos del WAF. Revisión semanal del mantenedor junto con la tarea de inventario.

## 5. Dueños y mecanismo

| Qué | Dueño | Frecuencia | Mecanismo |
|---|---|---|---|
| Revisión del tablero y del SLO | Mantenedor | Semanal | Revisión con el tablero `Brain` |
| Respuesta a alarmas altas | Mantenedor | Al recibir el correo | Runbook en Operation |
| Rotación del secreto de la sonda | Mantenedor | Cada 90 días | Nuevo secreto en Cognito y en Secrets Manager; recordatorio en el calendario del mantenedor |
| Gasto frente al presupuesto | Mantenedor | Mensual y con cada aviso de Budgets | AWS Budgets y la métrica `Tokens` |
