# Preguntas de NFR Design — u1-walking-skeleton

> Casi todo el diseño sale directo de los requisitos ya revisados (cancelación
> del corte de 3 min, índice `runLogIndex`, cola de un solo escritor, permisos,
> cotas). Solo quedan dos decisiones que cambian lo que ve o pierde el SE.

## Q1. [observabilidad] ¿Qué pasa con las últimas entradas del registro si la pestaña se cierra de golpe?

Contexto: el registro se escribe por lotes como mucho cada 1 s (para no reescribir la clave en cada evento). Si la pestaña de calculator.aws se cierra o se recarga de golpe, se pierde lo acumulado en ese último segundo. Justo esas entradas suelen ser las que explican el fallo.

A. Las entradas `error` y `warn` se escriben de inmediato (sin esperar el lote); el resto, por lotes de 1 s. Solo podrían perderse entradas `info`/`debug` del último segundo.
B. Se acepta la ventana: puede perderse hasta 1 s de cualquier nivel; se documenta en `SMOKE.md`.
C. Todo se escribe de inmediato, entrada por entrada (más escrituras, sin pérdida por cierre).
X. Other (please specify)

[Answer]: C

## Q2. [observabilidad] ¿El panel muestra el registro técnico o solo lo exporta?

Contexto: el registro es para el mantenedor (detalles técnicos, selectores); el SE ve mensajes en español sin detalle técnico. Mostrarlo en el panel ayuda a diagnosticar sin exportar, pero mete texto técnico en la UI del SE.

A. Solo exportar: el panel lista las corridas (fecha, veredicto, tamaño) con botones Exportar y Borrar; el contenido técnico se ve en el `.json` exportado.
B. Además de A, un visor de solo lectura plegado ("Ver detalle técnico") con las entradas de la corrida, cerrado por defecto.
X. Other (please specify)

[Answer]: A

## Consolidated Summary Confirmation

- Q1: cada entrada del registro técnico se escribe de inmediato, una por una, sin lotes; un cierre de golpe de la pestaña no pierde entradas ya emitidas. Esto reemplaza la escritura por lotes de 1 s de NFR3.6. Para que escribir una entrada no obligue a reescribir todo el registro de la corrida, el registro se parte en trozos (`runLog:<runId>:<n>`) y solo se reescribe el trozo actual.
- Q2: el panel no muestra el contenido técnico: lista las corridas (fecha, veredicto, tamaño) con botones Exportar y Borrar; el detalle se ve en el `.json` exportado.
- Todo lo demás se diseña tal como quedó en NFR Requirements (corte de 3 min con cancelación, índice `runLogIndex`, un solo escritor con cola, permisos, cotas, piso del 80 %).

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
