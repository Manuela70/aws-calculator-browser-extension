<!-- INVARIANT: examples are single-line HTML comments so a fresh template parses to total=0 (MEMORY_EMPTY). Do NOT un-comment or split across lines. t100 guards this. -->
> This file is kept up to date automatically while the stage runs. Add observations at the review step, not by editing here directly.

## Interpretations
<!-- example: 2026-05-29T10:14:32Z — chose REST over GraphQL; the consuming team only needs CRUD, revisit if subscriptions land -->
- 2026-09-22T00:00:00Z — Rough-mockups en SKIP (expected: true): no hay wireframes/user-flow. Brownfield — diseño sobre el popup.html existente (tema oscuro, branding Applying, español) + AWS Calculator UI Flow.md + las historias. La superficie de UI es: el popup de la extensión (entrada, acción, progreso/errores, resumen por servicio, panel WAF) y el overlay spotlight sobre la página calculator.aws. No hay nueva pantalla fuera del popup.

## Deviations
<!-- example: 2026-05-29T10:14:32Z — skipped the optional caching layer the stage prose suggested; the dataset is small enough that it adds risk -->

## Tradeoffs
<!-- example: 2026-05-29T10:14:32Z — picked TDD over BDD this run; the team is unit-first and the domain is well-understood -->

## Open questions
<!-- example: 2026-05-29T10:14:32Z — confirm the retention window with compliance before the next stage hardens the schema -->
