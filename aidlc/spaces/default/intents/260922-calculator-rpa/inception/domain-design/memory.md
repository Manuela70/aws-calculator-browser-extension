<!-- INVARIANT: examples are single-line HTML comments so a fresh template parses to total=0 (MEMORY_EMPTY). Do NOT un-comment or split across lines. t100 guards this. -->
> This file is kept up to date automatically while the stage runs. Add observations at the review step, not by editing here directly.

## Interpretations
<!-- example: 2026-05-29T10:14:32Z — chose REST over GraphQL; the consuming team only needs CRUD, revisit if subscriptions land -->
- 2026-09-22T00:00:00Z — Domain Design modela los COMPONENTES (código a escribir), no topología de despliegue (eso es Units Generation). La decisión central aquí es el hogar del cerebro (P1): define el ComponentMapper/Brain y su frontera. Tres alternativas de requirements OQ1: recrear n8n (backup), service worker con LLM directo (Claude/Bedrock), o local sin LLM. El WAF (FR8) necesita LLM, así que condiciona la elección: un enfoque "local sin LLM" no puede servir el WAF por sí solo. Perspectivas inline: platform engineer (WAF/costo/credencial server-side) y designer (componentes UI del popup).

## Deviations
<!-- example: 2026-05-29T10:14:32Z — skipped the optional caching layer the stage prose suggested; the dataset is small enough that it adds risk -->
- 2026-09-22T00:00:00Z — El humano pidió aprobar arreglando los 3 hallazgos del reviewer: (Major) frontera de entrada — parsers llaman a InputNormalizer, simetría depends_on/dependents fijada, diagrama/tablas alineados; (Minor) ADR-006 registra la tensión NL→FM vs invariante determinístico-primero (dos presupuestos de tokens distintos); (Minor) RunResult movido a ResultAggregator (dueño = constructor), PopupController lo consume.

## Tradeoffs
<!-- example: 2026-05-29T10:14:32Z — picked TDD over BDD this run; the team is unit-first and the domain is well-understood -->

## Open questions
<!-- example: 2026-05-29T10:14:32Z — confirm the retention window with compliance before the next stage hardens the schema -->
