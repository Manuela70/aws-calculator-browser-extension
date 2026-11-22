# Diseño de monitoreo — u6-popup-ui

> El panel no envía telemetría. Sus tiempos se miden en el smoke y sus errores
> se ven en el registro técnico local de u1. Prosa en español; identificadores en inglés.

## Sources

- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u6-popup-ui/nfr-design/performance-design.md` (NFR8.5-NFR8.7). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u7-packaging/infrastructure-design/monitoring-design.md`. [stage]

## 1. Métricas y KPI

| Métrica | Fuente | Umbral | Por qué importa |
|---|---|---|---|
| Apertura hasta `panel-ready` | `performance.mark` en el smoke | ≤ 500 ms | NFR8.5 |
| Llegada de `ProgressEvent` hasta pintado | `performance.now()` en el smoke | ≤ 200 ms | NFR8.6 |
| Despliegue del historial de 200 corridas | Smoke | ≤ 1 s | NFR8.7 |

## 2. Alertas

| Alerta | Condición | Severidad | Destino |
|---|---|---|---|
| — | El panel no emite alertas; las del cerebro están en u4 | — | — |

## 3. SLI y SLO

| SLI | Objetivo | Ventana |
|---|---|---|
| Tiempos de §1 | Los umbrales de §1 | Cada smoke antes de una entrega |

## 4. Registros y dueño

Los errores del panel registran solo el código en el registro técnico de u1. Dueño: el mantenedor, que corre el smoke en cada entrega y anota los tiempos en `SMOKE.md`. Protocolo de medición: 5 repeticiones de cada medida en el equipo de referencia del mantenedor, con la extensión recién recargada; el veredicto usa la **peor** de las 5 contra el umbral.
