## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-21T20:44:08Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/260922-calculator-rpa/construction/u1-walking-skeleton/nfr-design/observability-design.md > §2 Escritura inmediata con un solo escritor (y scalability-design.md > §2-§3, security-design.md > §5 Borrar) | El orden de escritura entre el trozo `runLog:<runId>:<n>` y la fila de `runLogIndex` no está definido. La fila se actualiza "cuando cambia `chunks`" y al cerrar. Si la pestaña se cierra entre escribir el trozo `n+1` y actualizar el índice, el trozo queda fuera del índice. Exportar y "Borrar esta corrida" recorren solo `chunks` del índice, así que dejan ese trozo huérfano sin que el SE lo vea. Con retención sin límite, esos huérfanos solo se recuperan con "Reparar índice". `bytes` tiene el mismo problema: solo se actualiza al cambiar `chunks` o al cerrar, así que en una corrida interrumpida el indicador de tamaño subestima lo guardado. Es justo el caso de cierre de golpe que Q1 quiere cubrir. | Fijar el orden: primero actualizar la fila del índice con `chunks = n+1`, y después escribir el trozo, de modo que el índice nunca declare menos trozos de los que existen. Definir cuándo se recalcula `bytes` (por ejemplo, al abrir un trozo nuevo y en `run_end`) y decir que en una corrida interrumpida es una cota inferior. Añadir un caso de test de Zona A del índice y del troceado para el cierre entre ambas escrituras. | New |
| R-02 | Minor | aidlc/spaces/default/intents/260922-calculator-rpa/construction/u1-walking-skeleton/nfr-design/scalability-design.md > §3 tabla de `runLogIndex` (campo `status`) vs observability-design.md > §2 y logical-components.md > Recursos compartidos | `status` admite `lost`, pero la fila del índice solo la escribe `run-logger` en la pestaña, y el panel solo escribe `lastRunResult` cuando cierra una corrida como `lost` (NFR3.6). Nadie puede escribir `lost` en la fila. Además, logical-components.md atribuye a `run-logger` la escritura de `activeRun` y `lastRunResult`, mientras que el inventario asigna `activeRun` a `content-main`. | Quitar `lost` de `status` y derivar "interrumpida" de `finishedAt` vacío, o decir qué escritor lo pone. Corregir la lista de escritores en logical-components.md para que coincida con el inventario y con observability-design.md §2. | New |
| R-03 | Minor | aidlc/spaces/default/intents/260922-calculator-rpa/construction/u1-walking-skeleton/nfr-design/performance-design.md > §6 (`run_end` espera a que la cola se vacíe) y reliability-design.md > §4 | `run_end` espera a que la cola de escritura se vacíe antes de enviar `RUN_RESULT`, pero no hay tope de tiempo para ese vaciado. Cada escritura se reintenta una sola vez, pero una promesa de storage que no se resuelve dejaría la corrida sin cerrar. La tabla de terminación garantizada (NFR8.12) no lista este punto. | Acotar el vaciado de la cola, por ejemplo con `Promise.race` y un tope de unos segundos. Si vence, marcar el índice `degraded`, enviar `RUN_RESULT` igualmente y añadirlo a la tabla de terminación. | New |
| R-04 | Minor | aidlc/spaces/default/intents/260922-calculator-rpa/construction/u1-walking-skeleton/nfr-design/security-design.md > §5 Borrar (botones deshabilitados "mientras hay una corrida en curso") | No se dice de dónde sale ese estado. El panel es por ventana, y un panel de otra ventana, o uno reabierto, podría no estar en `Running` aunque la pestaña esté escribiendo. Entonces borraría claves en uso y haría lectura-modificación-escritura de `runLogIndex` en paralelo con el escritor de la pestaña. | Derivar la deshabilitación de la presencia de `activeRun` con latido vigente en `chrome.storage.local`, no del estado local del panel, y reevaluarla con `chrome.storage.onChanged`. | New |
| R-05 | Minor | aidlc/spaces/default/intents/260922-calculator-rpa/construction/u1-walking-skeleton/nfr-design/observability-design.md > §2 (fallo de escritura) | Tras el reintento fallido, la entrada solo va a consola y la fila se marca `degraded`, pero esa marca se escribe en el mismo almacenamiento que acaba de fallar y puede fallar también. Además, NFR3.6 dice "nunca se descarta una entrada" y el diseño sí descarta la entrada en la persistencia. | Mantener `degraded` también en memoria y mostrarlo en el panel mediante `PROGRESS`/`RUN_RESULT`. Registrar de forma explícita que esta es la excepción acotada a "no se descarta" (solo con storage roto). | New |

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| (ninguna declarada por la etapa) | N/A | No se ejecutaron herramientas. Se revisó a mano la trazabilidad: `traceability.json` cubre los 45 IDs upstream y cada target citado existe en los diseños. |

### Summary

El diseño aplica de forma fiel las decisiones Q1 (escritura inmediata por trozos con cola única) y Q2 (el panel solo lista, exporta y borra), y los permisos del manifest coinciden con NFR4.1. El punto relevante es que el orden entre el trozo y la fila del índice no está fijado. Sin ese orden, el cierre de golpe deja trozos huérfanos que exportar y borrar no ven. Es corregible con una línea de diseño, así que hay un Major y ningún Critical, y el veredicto es READY.
