# Requisitos de observabilidad — u1-walking-skeleton

> Dos audiencias: el SE, que ve progreso y resultados en español en el panel, y
> el mantenedor, que necesita un registro técnico para diagnosticar (sobre
> todo selectores stale, P2). No hay backend de logs ni métricas centralizadas
> en el skeleton. Por decisión de esta etapa, el registro técnico se persiste
> completo y sin límite. Prosa en español; identificadores en inglés.

## Sources

- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/requirements-analysis/requirements.md` (NFR3 visibilidad de errores, FR7 progreso y errores, NFR8.2 progreso activo). [requirements]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u1-walking-skeleton/functional-design/functional-spec.md` (contrato de mensajes `PROGRESS`/`RUN_RESULT`, `activeRun`, `lastRunResult`). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u1-walking-skeleton/functional-design/rules.md` (BR6.2-BR6.6). [stage]
- `nfr-requirements-questions.md` de esta unidad: Q3 + Q5 (persistencia y trazabilidad completa, sin límite), Q7 (`unlimitedStorage`). [Q3, Q5, Q7]

## Requisitos

### Lo que ve el SE (panel lateral)

| ID | Requisito | Criterio de verificación |
|---|---|---|
| NFR3.3 | El panel muestra el progreso de la corrida (`ProgressEvent`) y, al terminar, el veredicto y la lista por servicio con su estado y motivo en español, sin códigos técnicos (BR6.4). | Smoke; revisión de la tabla de traducción `reason` → texto. |
| NFR3.4 | El panel muestra cuánto ocupa el registro técnico (suma del índice, NFR3.11) y ofrece exportarlo y borrarlo. | Smoke. |

### Registro técnico (mantenedor)

| ID | Requisito | Criterio de verificación |
|---|---|---|
| NFR3.5 | Cada corrida genera un registro técnico **completo**: una entrada por evento con número de secuencia, hora ISO-8601, `runId`, nivel (`error`, `warn`, `info`, `debug`), paso (`connection`, `preconditions`, `service:<requestId>`, `estimate_check`, `rename`, `share`), mensaje técnico y, cuando aplique, el selector o etiqueta implicados. La primera entrada es el evento `run_start` y la última `run_end` (con el veredicto); de ellas sale la duración que mide el smoke (NFR8.7). Es el registro donde sí van detalles técnicos que el panel no muestra. | Tests de Zona A del formateador de entradas; revisión. |
| NFR3.6 | El registro se **persiste** en `chrome.storage.local`, una clave por corrida (`runLog:<runId>`), escrito de forma incremental durante la corrida (no solo al final), para que un cierre o recarga no pierda lo ya registrado. El content script es el **único escritor** de `runLog:<runId>` y de `runLogIndex`: sus escrituras pasan por una única cola (cada escritura espera a la anterior), así que el orden del registro es el de los eventos; el número de secuencia lo confirma. Para acotar el coste de reescribir la clave, las entradas se acumulan y se escriben por lotes como mucho cada 1 s, y siempre en `run_end`; nunca se descarta una entrada (registro completo, Q5). El panel no escribe el registro: cuando cierra una corrida como `lost` (BR6.6) solo escribe `lastRunResult`, y la fila del índice sin `run_end` se muestra como "interrumpida". | Smoke: cerrar la pestaña a mitad de corrida y comprobar que el registro de esa corrida existe, en orden, hasta el punto del corte. |
| NFR3.7 | **Sin límite de retención:** los registros se conservan hasta que el SE los borra desde el panel (todos o uno). Se usa el permiso `unlimitedStorage` (ver `security-requirements.md`, NFR4.4). | Revisión; smoke de borrado. |
| NFR3.11 | **Índice de registros:** la clave `runLogIndex` guarda una entrada por corrida (`runId`, hora de inicio y fin, veredicto, tamaño aproximado en bytes). Se actualiza en la misma cola de escritura que el registro. El panel lista, mide (suma de tamaños), exporta y borra corridas a partir del índice, sin leer las demás claves; borrar una corrida quita su `runLog:<runId>` y su fila del índice. No se depende de APIs de enumeración de claves del navegador. Si el índice y las claves divergen (p. ej. un cierre a mitad de escritura), el panel ofrece "Reparar índice", que reconstruye el índice desde las claves `runLog:*`; es la única operación que lee todo el almacenamiento y solo corre a pedido del SE. | Tests de Zona A del índice (alta, baja, reparación); smoke de borrar una corrida y todas. |
| NFR3.8 | **Exportación:** el panel exporta el registro de una corrida, o de todas, como archivo `.json` descargado por el SE. | Smoke. |
| NFR3.9 | Además del registro persistido, cada entrada se escribe en la consola (de la pestaña o del panel) con un prefijo fijo (`[aws-calc]`) y el `runId`. El nivel `debug` se persiste pero no se imprime en consola salvo que se active a mano. | Revisión. |
| NFR3.10 | El registro nunca contiene credenciales ni tokens (no existen en el skeleton) y se trata como dato interno (NFR5.2). | Revisión de los puntos de escritura. |

### Correlación

- El `runId` correlaciona panel, content script, `activeRun`, `lastRunResult` y el registro de la corrida.
- El `requestId` de cada servicio aparece en las entradas de su paso.

## Métricas, alertas y trazas distribuidas

No aplican al skeleton: no hay servicio server-side ni backend de telemetría. La trazabilidad entre sesiones y equipos queda para cuando exista el backend junto al cerebro (U4), que podrá recibir estos mismos registros.
