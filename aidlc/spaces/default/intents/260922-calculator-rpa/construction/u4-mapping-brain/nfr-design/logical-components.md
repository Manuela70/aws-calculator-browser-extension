# Componentes lógicos — u4-mapping-brain

> Inventario lógico del cerebro para Infrastructure Design: fronteras de
> servicio, dominios de fallo y recursos compartidos. Prosa en español;
> identificadores en inglés.

## Sources

- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u4-mapping-brain/nfr-requirements/tech-stack-decisions.md` (NFR1.10, NFR6.1, NFR7.1). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u4-mapping-brain/functional-design/functional-spec.md` (operaciones B1-B4). [stage]

## 1. Componentes

| Componente | Tipo | Responsabilidad | NFR que aloja |
|---|---|---|---|
| ApiEntry | Endpoint HTTPS gestionado | Freno por IP, CORS, tamaño (primera capa), terminación TLS, registros de acceso sin cuerpo | NFR1.1, NFR1.2, NFR5.5 |
| AuthFilter | Módulo del servicio | Validación del token de acceso de Cognito con JWKS en caché | NFR5.2, NFR5.4 |
| UsageGuard | Módulo + tabla de uso | Límite por minuto, cuota diaria por SE, tope global de gasto, limitador local de respaldo | NFR3.1, NFR3.2, NFR3.4 |
| BrainCore | Módulos puros | Validación de pedidos, selección de candidatos, prompts, validación de salidas | NFR1.3, NFR1.10, NFR7.1 |
| ModelGateway | Módulo | Invocación de Bedrock con semáforo, cola, topes por intento y regla única de reintentos | NFR3.4, NFR8.4, NFR1.7 |
| InventoryStore | Almacenamiento de objetos | Versiones del inventario y puntero `active` con SHA-256 y `previous` | NFR1.8, NFR3.5 |
| InventoryLoader | Módulo del servicio | Recarga en hilo de trabajo y conservación de la última versión buena | NFR1.6, NFR1.8, NFR8.7 |
| InventoryJob | Tarea programada semanal, rol propio | Genera, valida (esquema, tamaño, pérdida ≤ 10 %) y activa la versión nueva | NFR1.8, NFR1.9 |
| Telemetry | Registros y métricas | Registro con lista blanca, métricas, alarmas, tablero | NFR3.6-NFR3.11 |
| Probe | Tarea programada por minuto, rol propio | Sonda sintética del SLI con cliente de máquina de Cognito | NFR1.4 |

## 2. Dominios de fallo

| Falla | Contención | Impacto |
|---|---|---|
| Bedrock caído o con throttling | ModelGateway (regla única de reintentos, 503/429 tipado) | Las tres operaciones fallan de forma visible; la extensión no llena nada sin revisión. |
| Versión activa del inventario corrupta | InventoryLoader conserva la última versión buena; alarma `InventoryReloadFailed` | Sin corte para las instancias arriba; el mantenedor revierte el puntero. |
| Ninguna versión cargable en una instancia nueva | InventoryLoader prueba `active` y `previous` | 503 `inventory_unavailable` solo en esa instancia hasta que cargue. |
| Tabla de uso no disponible | UsageGuard pasa al limitador local y al tope global por instancia; alarma `UsageGuardFallback` | Límites aproximados por instancia; el gasto sigue con techo. |
| Emisor de identidad caído | AuthFilter conserva el JWKS anterior sin vencimiento | Los tokens ya emitidos siguen válidos hasta su `exp`; los logins nuevos fallan. |

## 3. Verificación

Pruebas unitarias de BrainCore, UsageGuard (incluido el limitador local), AuthFilter (con claves de prueba), InventoryLoader (versión corrupta y `previous`) y la regla de reintentos de ModelGateway, con dobles (NFR6.1). Las pruebas de latencia y carga descritas en los requisitos se corren contra el entorno desplegado en Build and Test.
