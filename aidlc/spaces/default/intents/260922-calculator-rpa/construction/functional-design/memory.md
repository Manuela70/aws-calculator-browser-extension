<!-- INVARIANT: examples are single-line HTML comments so a fresh template parses to total=0 (MEMORY_EMPTY). Do NOT un-comment or split across lines. t100 guards this. -->
> This file is kept up to date automatically while the stage runs. Add observations at the review step, not by editing here directly.

## Interpretations
<!-- example: 2026-05-29T10:14:32Z — chose REST over GraphQL; the consuming team only needs CRUD, revisit if subscriptions land -->
- 2026-11-21T19:32:45Z — [unit u1-walking-skeleton] Los content scripts MV3 declarados en el manifest son scripts clásicos, no módulos ES; la regla "capa de mapeo en su propio módulo ES" + Vitest obliga a decidir el mecanismo de carga en U1 (lo heredan U2/U3/U5). Se pregunta en Q3 en vez de asumirlo.
- 2026-11-21T19:32:45Z — [unit u1-walking-skeleton] El v6 lee la región desde `svc.region`, pero el Anexo A la define en la raíz (`config.region`); el skeleton debe leerla de la raíz. Defecto del v6 a corregir, no una decisión abierta.

- 2026-11-21T19:55:00Z — [unit u1-walking-skeleton] Q2=C (renombrado bloqueante) se interpretó como: si el JSON no trae `project`, el renombrado se omite (no hay nombre al cual renombrar); solo un intento fallido bloquea. BR5.2.

## Deviations
- 2026-11-21T22:40:00Z — [unit u2-input-parsers] El mantenedor pidió analizar todo calculator.aws antes de fijar el alcance del lenguaje natural. Se hizo con las definiciones públicas que carga la calculadora (manifest + 442 definiciones), no recorriendo el DOM, porque la extensión de Chrome no estaba conectada y las definiciones cubren también las secciones condicionales. Inventario en `aidlc/spaces/default/knowledge/calculator-catalog/`.
- 2026-11-21T22:40:00Z — [unit u2-input-parsers] Cambios de alcance por decisión del humano: pestañas JSON / lenguaje natural (Q3=B; FR1 decía "sin selector de modos"), revisión Well-Architected obligatoria antes de llenar y al terminar para toda corrida (Q1b; FR8.1 decía opcional), y lenguaje natural interpretado por el cerebro, no por un parser local (Q1). La revisión obligatoria rige desde que U4 se integra (Q1c) para no romper el skeleton aprobado.
- 2026-11-21T19:55:00Z — [unit u1-walking-skeleton] Por decisión del humano (Q7) la UI pasa de popup a panel lateral ya en el skeleton, y el caso canónico es EC2 (Q10), lo que adelanta de U5 la búsqueda de instancia y FIX-5/FIX-6. Registrado como Change Request en la auditoría; requisitos, mockups, U6 y U7 quedan pendientes de ajuste.
<!-- example: 2026-05-29T10:14:32Z — skipped the optional caching layer the stage prose suggested; the dataset is small enough that it adds risk -->

## Tradeoffs
<!-- example: 2026-05-29T10:14:32Z — picked TDD over BDD this run; the team is unit-first and the domain is well-understood -->
- 2026-11-21T20:10:00Z — [unit u1-walking-skeleton] Estimado acumulado entre corridas: se eligió exigir un estimado vacío al empezar (BR5.5) y verificar el contenido exacto antes de compartir (BR5.6), en vez de vaciar el estimado automáticamente; la extensión nunca borra datos del SE. Vale la pena confirmarlo con el humano en la compuerta.
- 2026-11-21T20:10:00Z — [unit u1-walking-skeleton] Cotas nuevas no fijadas en Q4: espera de página 20 s (BR4.10) y latido del panel 60 s (BR6.6). Se derivan de NFR8 para que el panel nunca quede bloqueado; NFR Requirements puede ajustarlas.
- 2026-11-21T20:10:00Z — [unit u1-walking-skeleton] Tabla de instancias EC2 modelada como un solo DomField instance_radio con acción compuesta (búsqueda + fila) en vez de dos acciones, para mantener 1 valor → 1 acción y la coincidencia única de etiqueta.

## Open questions
<!-- example: 2026-05-29T10:14:32Z — confirm the retention window with compliance before the next stage hardens the schema -->
- 2026-11-21T19:32:45Z — [unit u1-walking-skeleton] Las etiquetas reales del formulario de S3 en CloudScape no son verificables sin el DOM vivo (OQ2/P2); el caso canónico se confirma en el smoke manual.
