<!-- INVARIANT: examples are single-line HTML comments so a fresh template parses to total=0 (MEMORY_EMPTY). Do NOT un-comment or split across lines. t100 guards this. -->
> This file is kept up to date automatically while the stage runs. Add observations at the review step, not by editing here directly.

## Interpretations
<!-- example: 2026-05-29T10:14:32Z — chose REST over GraphQL; the consuming team only needs CRUD, revisit if subscriptions land -->
- 2026-11-21T20:25:00Z — [unit u1-walking-skeleton] Q3 "Persistencia y trazabilidad completa" se aclaró con Q5 (registro completo sin límite) y Q7 (`unlimitedStorage`); se modeló como una clave por corrida escrita de forma incremental.

## Deviations
<!-- example: 2026-05-29T10:14:32Z — skipped the optional caching layer the stage prose suggested; the dataset is small enough that it adds risk -->
- 2026-11-21T20:25:00Z — [unit u1-walking-skeleton] NFR añade al Diseño Funcional aprobado: reason `service_timeout` (corte de 3 min, Q6), clave `runLog:<runId>` y el mensaje de recargar la pestaña tras un `import()` fallido (hallazgo menor de la revisión de Functional Design). Se documentan como ajustes en performance-requirements.md.

## Tradeoffs
<!-- example: 2026-05-29T10:14:32Z — picked TDD over BDD this run; the team is unit-first and the domain is well-understood -->
- 2026-11-21T20:25:00Z — [unit u1-walking-skeleton] Q1 (mínimo privilegio) y Q7 (`unlimitedStorage`) tiran en direcciones opuestas; se resolvió justificando `unlimitedStorage` solo por el registro y comprometiendo su retiro si el registro se acota o pasa a backend (NFR4.4).

## Open questions
<!-- example: 2026-05-29T10:14:32Z — confirm the retention window with compliance before the next stage hardens the schema -->
- 2026-11-21T20:25:00Z — [unit u1-walking-skeleton] `minimum_chrome_version: 116` para la Side Panel API con `setPanelBehavior` se basa en conocimiento de la API; confirmar en el smoke con la versión real de Chrome de los SE.
