<!-- INVARIANT: examples are single-line HTML comments so a fresh template parses to total=0 (MEMORY_EMPTY). Do NOT un-comment or split across lines. t100 guards this. -->
> This file is kept up to date automatically while the stage runs. Add observations at the review step, not by editing here directly.

## Interpretations
<!-- example: 2026-05-29T10:14:32Z — chose REST over GraphQL; the consuming team only needs CRUD, revisit if subscriptions land -->
- 2026-09-22T00:00:00Z — reutilizados los 9 docs previos de RE (aidlc-docs/) como insumo a verificar, no como verdad; el developer los validó contra el código en commit 45f888e y marcó varios como PARTIALLY-OUTDATED (conteos de línea, spotlight no implementado, errata de URL).
- 2026-09-22T00:00:00Z — DECISIÓN DE ALCANCE (del humano, al gate de RE): el cerebro de mapeo en n8n YA NO EXISTE (webhook caído/eliminado; el humano tiene backup). La extensión está rota hoy, no solo frágil. Alcance de la revivida: (1) eliminar la dependencia del webhook n8n / "skill 3" como cerebro; (2) la entrada de servicios debe aceptar LENGUAJE NATURAL o IMPORTAR desde archivo JSON. Pendiente de decidir en diseño (Requirements/Domain/Contract/Functional Design): recrear n8n desde el backup vs. mover el mapeo IA a un service worker (Claude/Bedrock directo) vs. enfoque local sin LLM — con tradeoffs. NO cerrar la elección en RE; llevar como input a Requirements Analysis.

## Deviations
<!-- example: 2026-05-29T10:14:32Z — skipped the optional caching layer the stage prose suggested; the dataset is small enough that it adds risk -->

## Tradeoffs
<!-- example: 2026-05-29T10:14:32Z — picked TDD over BDD this run; the team is unit-first and the domain is well-understood -->

## Open questions
<!-- example: 2026-05-29T10:14:32Z — confirm the retention window with compliance before the next stage hardens the schema -->
- 2026-09-22T00:00:00Z — P2 (selectores CloudScape stale) y el estado del webhook n8n no se pueden verificar con escaneo estático; requieren ejecución viva (REVIVAL_PLAN Tests B y C). Tratados como desconocidos.
