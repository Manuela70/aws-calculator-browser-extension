<!-- INVARIANT: examples are single-line HTML comments so a fresh template parses to total=0 (MEMORY_EMPTY). Do NOT un-comment or split across lines. t100 guards this. -->
> This file is kept up to date automatically while the stage runs. Add observations at the review step, not by editing here directly.

## Interpretations
<!-- example: 2026-05-29T10:14:32Z — chose REST over GraphQL; the consuming team only needs CRUD, revisit if subscriptions land -->
- 2026-09-22T00:00:00Z — El contrato de peso es el del MappingBrain (U4) server-side: HTTP(S) desde la extensión. Dos operaciones: (a) mapeo del residuo ambiguo — recibe DATA escaneada (campos+valores no resueltos), devuelve acciones; (b) WAF — recibe el estimado construido, devuelve recomendaciones por pilar. Nunca screenshots (ADR-005). El contrato debe quedar agnóstico del alojamiento (n8n vs Bedrock) para que esa decisión siga en Infra Design. Los demás "contratos" entre unidades embebidas son interfaces de módulo ES internas (no contratos formales de red), salvo que convenga pinarlas.

## Deviations
<!-- example: 2026-05-29T10:14:32Z — skipped the optional caching layer the stage prose suggested; the dataset is small enough that it adds risk -->
- 2026-09-22T00:00:00Z — El humano pidió aprobar arreglando los 4 del reviewer: Major → C2 WafResponse endurecido (WafServiceResult con oneOf: con-hallazgos requiere recommendations minItems:1 y noFindings:false; sin-hallazgos noFindings:true; recommendations vacío con noFindings:false es inválido → cliente lo trata como empty_result, imponiendo FR8.4). Minor → BrainError documentado como schema por-contrato con enum abierto; nota de ownership de paridad de enums DomField.type/actionType (aditivo, U4 con U5); autenticación reservada a header para que sea aditiva.

## Tradeoffs
<!-- example: 2026-05-29T10:14:32Z — picked TDD over BDD this run; the team is unit-first and the domain is well-understood -->

## Open questions
<!-- example: 2026-05-29T10:14:32Z — confirm the retention window with compliance before the next stage hardens the schema -->
