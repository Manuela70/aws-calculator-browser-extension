# Diseño de observabilidad — u4-mapping-brain

> Métricas, registros y alarmas del cerebro sin datos del cliente
> (`nfr-requirements/observability-requirements.md`). Prosa en español;
> identificadores en inglés.

## Sources

- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u4-mapping-brain/nfr-requirements/observability-requirements.md` (NFR3.6-NFR3.11). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u4-mapping-brain/nfr-design/reliability-design.md` y `scalability-design.md` (métricas de inventario, sonda y gasto). [stage]

## Decisiones

| Requisito | Diseño |
|---|---|
| NFR3.6 | Registro JSON de una línea por operación, armado por `toLogRecord` con lista blanca: `requestId`, `operation`, `inventoryVersion`, `code`, `latencyMs`, `attempts`, `inputTokens`, `outputTokens`, `seHash` (SHA-256 del `sub` con sal de configuración). Los rechazos previos al modelo también pasan por `toLogRecord` (`security-design.md`, NFR5.5). |
| NFR3.7 | Métricas con dimensión `operation`: `Requests`, `Errors` (dimensión `code`), `Latency` (p50/p95), `Tokens`. Métricas operativas: `UsageGuardFallback`, `InventoryReloadFailed`, `InventoryJobFailed`, `InventoryAgeDays`, `ProbeSuccess`. Se emiten en formato de métricas embebidas en el registro para no hacer llamadas extra. |
| NFR3.8 | Alarmas (ver tabla abajo). Destino: correo del mantenedor. |
| NFR3.9 | `requestId` generado al entrar, devuelto en `X-Request-Id` y en el cuerpo de errores; el service worker lo guarda en el registro técnico de la extensión. |
| NFR3.10 | Grupo de registros con retención de 30 días. |
| NFR3.11 | Tablero único con disponibilidad, p95 por operación, errores por código, tokens frente al presupuesto y estado del inventario; revisión semanal del mantenedor junto con la actualización del inventario. |

## Alarmas (NFR3.8)

Las alarmas de tasa exigen una muestra mínima para no dispararse con dos peticiones.

| Alarma | Condición | Muestra mínima |
|---|---|---|
| 5xx | > 5 % en 5 min | ≥ 20 peticiones en la ventana |
| 429 | > 10 % en 15 min | ≥ 20 peticiones en la ventana |
| Latencia | p95 > 20 s en 15 min | ≥ 20 peticiones en la ventana |
| Sonda | 3 fallos seguidos de `ProbeSuccess` | — |
| Limitador degradado | `UsageGuardFallback` > 0 durante 5 min | — |
| Recarga de inventario | `InventoryReloadFailed` > 0 en 15 min | — |
| Tarea de inventario | `InventoryJobFailed` > 0, o versión `rejected` | — |
| Inventario viejo | `InventoryAgeDays` > 14 | — |
| Gasto mensual | consumo ≥ 80 % del presupuesto | — |

**Fuente del consumo mensual**: el presupuesto de la cuenta en AWS Budgets, filtrado por el servicio Bedrock y la etiqueta del proyecto, es la fuente primaria del costo. La métrica `Tokens` sirve de indicador adelantado en el tablero, no de cifra de costo.
