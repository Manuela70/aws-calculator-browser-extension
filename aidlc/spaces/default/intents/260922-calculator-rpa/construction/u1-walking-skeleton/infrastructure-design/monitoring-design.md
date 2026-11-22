# Diseño de monitoreo — u1-walking-skeleton

> Implementación concreta de la estrategia de observabilidad del NFR Design. Sin
> backend de telemetría ni alertas centralizadas: el "monitoreo" del skeleton es
> el panel lateral para el SE, el registro técnico persistido para el mantenedor
> y las señales del CI. Prosa en español; identificadores en inglés.

## Sources

- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u1-walking-skeleton/nfr-design/observability-design.md` (formato del registro, escritura inmediata, lo que ve el SE). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u1-walking-skeleton/nfr-design/reliability-design.md` (terminación garantizada, Zona A/B). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u1-walking-skeleton/nfr-design/performance-design.md` (medición de duración, presupuesto del caso canónico). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u1-walking-skeleton/nfr-design/logical-components.md` (dominios de fallo). [stage]

## Metrics & KPIs

| Metric | Source | Threshold | Why it matters |
|---|---|---|---|
| Veredicto por corrida (`DONE` / `ERROR` / `lost`) | `runLogIndex.status` | Cualquier `ERROR` o `lost` se revisa | Mide si el skeleton funciona de punta a punta |
| Duración de la corrida | `runLogIndex` (`finishedAt − startedAt`, de `run_start`/`run_end`) | Caso canónico ≤ 180 s (smoke) | NFR8.7; detecta degradación de la UI de terceros |
| Motivo de fallo por servicio | Entradas `run_end` + `ServiceResult.reason` | — | Distingue selector roto (P2) de validación o tiempo |
| Tamaño del registro | Suma de `runLogIndex.bytes` | Sin umbral (decisión de no limitar); visible en el panel | El SE decide cuándo exportar y borrar |
| Huecos de secuencia | `seq` del registro | 0 huecos | Delata escrituras perdidas |
| Cobertura de líneas (Zona A) | Informe de Vitest en CI | ≥ 80 % agregado | NFR6.1 |
| Estado del CI | GitHub Actions | Verde en cada push a `main` | Lint + tests + cobertura |

## Alerts

| Alert | Condition | Severity | Routes to |
|---|---|---|---|
| Corrida fallida | `RunResult.status = ERROR` | Visible | El SE, en el panel (mensaje en español con motivo por servicio) |
| Corrida que dejó de responder | Latido de `activeRun` > 60 s o pestaña cerrada | Visible | El SE, en el panel (`lost`) |
| Módulo no cargó | `PING { ok: false }` | Visible | El SE, en el panel ("recarga la pestaña de calculator.aws") |
| Registro no guardado | Escritura fallida dos veces | Aviso | El SE, en el panel ("no pude guardar parte del registro") |
| CI en rojo | Falla lint, test o cobertura < 80 % | Bloqueante para integrar | El mantenedor, por la notificación de GitHub |

No hay alertas paginadas: herramienta interna de un solo mantenedor.

## SLIs / SLOs

| SLI | SLO target | Measurement window |
|---|---|---|
| Corridas canónicas que terminan en DONE en el smoke | 100 % de las ejecuciones de `SMOKE.md` | Cada ejecución del smoke |
| Duración de la corrida canónica | ≤ 180 s | Cada ejecución del smoke |
| Corridas que terminan (DONE o ERROR, nunca colgadas) | 100 % | Todas las corridas registradas |
| CI verde en `main` | 100 % de los pushes | Continuo |

## Logs & Tracing

- **Registro técnico:** entradas JSON con `seq`, `ts`, `runId`, `level`, `step`, `event` y campos permitidos, escritas de inmediato en `runLog:<runId>:<n>` por un único escritor en la pestaña; índice en `runLogIndex`. Se conservan hasta que el SE los borra; se exportan como `.json` desde el panel.
- **Consola:** cada entrada se imprime con prefijo `[aws-calc] <runId> <level>`; `debug` solo con `localStorage["aws-calc-debug"] === "1"`.
- **Correlación:** `runId` en todo; `requestId` en el paso de cada servicio.
- **Tracing distribuido:** no aplica (un solo proceso local, sin servicios remotos).
- **Dashboard:** el panel lateral es el único tablero: corrida en curso, último resultado y lista de corridas (fecha, duración, veredicto, tamaño). El contenido técnico solo se ve exportando.
