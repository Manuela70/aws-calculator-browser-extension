<!-- INVARIANT: examples are single-line HTML comments so a fresh template parses to total=0 (MEMORY_EMPTY). Do NOT un-comment or split across lines. t100 guards this. -->
> This file is kept up to date automatically while the stage runs. Add observations at the review step, not by editing here directly.

## Interpretations
<!-- example: 2026-05-29T10:14:32Z — chose REST over GraphQL; the consuming team only needs CRUD, revisit if subscriptions land -->
- 2026-11-22T23:19:13Z — u4-D5: el NFR Design decía freno por IP de 300/min y la especificación de infraestructura, aprobada después, fija 1000/min; se verificó contra la especificación aprobada y se anotó la diferencia.
- 2026-11-22T23:19:13Z — Objetivos con "en CI": la parte local (cobertura, `check:bundle`) se verificó aquí; la ejecución en CI es N/A porque el plan no ejecuta CI Pipeline.
- 2026-11-22T23:19:13Z — TC-3 se midió por componente sumando los archivos que lo ejercen (aria-label 3+3, session-rule con panel-state.login); solo `heartbeat.js` queda por debajo de 5.

## Deviations
<!-- example: 2026-05-29T10:14:32Z — skipped the optional caching layer the stage prose suggested; the dataset is small enough that it adds risk -->
- 2026-11-22T23:19:13Z — Halt-and-ask en vez del retorno autónomo; el modo es autónomo y TC-3 tiene arreglo estimado, pero 11 objetivos exigen el cerebro desplegado y ningún arreglo de código los cierra. Además, Construction corre por etapas, así que el retorno reabriría las siete unidades (planes y revisiones nuevas) para agregar unas pocas pruebas a `heartbeat.js`, y Build and Test seguiría fallando. Decide el mantenedor.

## Tradeoffs
<!-- example: 2026-05-29T10:14:32Z — picked TDD over BDD this run; the team is unit-first and the domain is well-understood -->

## Open questions
<!-- example: 2026-05-29T10:14:32Z — confirm the retention window with compliance before the next stage hardens the schema -->
