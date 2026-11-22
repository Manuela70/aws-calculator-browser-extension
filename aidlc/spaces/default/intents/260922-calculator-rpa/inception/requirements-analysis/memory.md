<!-- INVARIANT: examples are single-line HTML comments so a fresh template parses to total=0 (MEMORY_EMPTY). Do NOT un-comment or split across lines. t100 guards this. -->
> This file is kept up to date automatically while the stage runs. Add observations at the review step, not by editing here directly.

## Interpretations
<!-- example: 2026-05-29T10:14:32Z — chose REST over GraphQL; the consuming team only needs CRUD, revisit if subscriptions land -->
- 2026-09-22T00:00:00Z — Los requisitos NO se levantan desde cero: se adoptan/formalizan los FR1-FR7, P1-P4 y criterios de aceptación ya escritos en requirements/calculator-rpa-requirements.md + constraints.md. La decisión de alcance del humano (cerebro n8n eliminado, backup disponible; entrada por lenguaje natural O import JSON) modifica FR1/P1 del doc original y es autoritativa sobre él. Preguntas de clarificación enfocadas solo en las tensiones doc-existente ↔ decisión de alcance, no en re-elicitar lo ya escrito.

## Deviations
<!-- example: 2026-05-29T10:14:32Z — skipped the optional caching layer the stage prose suggested; the dataset is small enough that it adds risk -->
- 2026-09-22T00:00:00Z — El humano pidió arreglar las 3 observaciones del reviewer (no solo aceptarlas como riesgo): R-01 → FR8.4/FR8.5 (contrato de salida WAF verificable + fallo visible); R-02 → FR1.1 criterio normaliza-o-error-visible + ejemplo canónico S3 para el skeleton; R-03 → NFR8 (cota de tiempo observable: reintentos acotados, terminación observable, sin umbral numérico de latencia).

## Tradeoffs
<!-- example: 2026-05-29T10:14:32Z — picked TDD over BDD this run; the team is unit-first and the domain is well-understood -->

## Open questions
<!-- example: 2026-05-29T10:14:32Z — confirm the retention window with compliance before the next stage hardens the schema -->
