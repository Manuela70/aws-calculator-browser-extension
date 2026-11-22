<!-- INVARIANT: examples are single-line HTML comments so a fresh template parses to total=0 (MEMORY_EMPTY). Do NOT un-comment or split across lines. t100 guards this. -->
> This file is kept up to date automatically while the stage runs. Add observations at the review step, not by editing here directly.

## Interpretations
<!-- example: 2026-05-29T10:14:32Z — chose REST over GraphQL; the consuming team only needs CRUD, revisit if subscriptions land -->
- 2026-09-22T00:00:00Z — Units Generation produce solo la TOPOLOGÍA (DAG); el orden económico de Bolts es de Delivery Planning. Skeleton-on aplica: el primer Unit debe ser el slice end-to-end (un servicio simple: entrada→mapeo determinístico→RPA→guardar→URL), ejecutable antes que los demás y agnóstico del cerebro. 9 componentes de domain-design a agrupar en unidades. Es una extensión MV3 monolítica unpacked (no microservicios): el "deployment model" es un único bundle, así que las unidades son particiones lógicas/de entrega, no artefactos desplegables independientes.

## Deviations
<!-- example: 2026-05-29T10:14:32Z — skipped the optional caching layer the stage prose suggested; the dataset is small enough that it adds risk -->
- 2026-09-22T00:00:00Z — El humano pidió aprobar arreglando los 3 Minor del reviewer: R-01 nota de cobertura corregida (U7 traza vía NFR4/P4, no historia); R-02 arista u7->u4 documentada como dependencia de decisión de alojamiento (no de build); R-03 nota de integración sobre módulos provisionales del skeleton (U2/U3/U5 reemplazan en sitio, nombres de módulo los fija Functional Design). traceability.json también corregida antes del gate: un solo Unit por target (el sensor rechaza listas con ';'); el story-map conserva las filas multi-unidad con ';'.

## Tradeoffs
<!-- example: 2026-05-29T10:14:32Z — picked TDD over BDD this run; the team is unit-first and the domain is well-understood -->

## Open questions
<!-- example: 2026-05-29T10:14:32Z — confirm the retention window with compliance before the next stage hardens the schema -->
