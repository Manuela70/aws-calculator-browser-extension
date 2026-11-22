# Diseño de observabilidad — u1-walking-skeleton

> Diseño del registro técnico persistido (escritura inmediata por trozos, un solo
> escritor, índice) y de lo que ve el SE en el panel. Sin backend de telemetría,
> sin métricas ni alertas centralizadas. Prosa en español; identificadores en
> inglés.

## Sources

- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u1-walking-skeleton/nfr-requirements/observability-requirements.md` (NFR3.3-NFR3.11). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u1-walking-skeleton/nfr-requirements/security-requirements.md` (NFR5.2 clasificación). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u1-walking-skeleton/functional-design/functional-spec.md` (contrato de mensajes, `activeRun`, `lastRunResult`). [stage]
- `nfr-design-questions.md` de esta unidad: Q1 (escritura inmediata), Q2 (solo exportar). [Q1, Q2]

## 1. Entrada del registro (NFR3.5)

```json
{ "seq": 17, "ts": "2026-11-21T20:40:12.345Z", "runId": "run-…", "level": "warn",
  "step": "service:svc-1", "event": "field_not_applied",
  "message": "Relectura distinta en 'Operating system'", "selector": "form.dropdown", "label": "Operating system", "value": "Linux" }
```

- Campos permitidos únicamente: `seq`, `ts`, `runId`, `level`, `step`, `event`, `message`, `selector`, `label`, `value`, `detail`. `log-format.js` descarta cualquier otro campo.
- Eventos fijos de inicio y fin: `run_start` (con el `RunRequest` resumido: nombres de servicio y número de valores) y `run_end` (con el veredicto y `failureStep`).
- `seq` es consecutivo por corrida y lo asigna la cola; un hueco en `seq` delata una escritura perdida.

## 2. Escritura inmediata con un solo escritor (NFR3.6, decisión Q1)

- `run-logger.js` vive en la pestaña y es el único que escribe `runLog:*` y `runLogIndex`.
- Cada `log(entry)` entra a una cola de promesas: la escritura N+1 empieza cuando termina la N. Cada entrada se escribe **de inmediato** al llegar su turno, sin lotes; un cierre de golpe solo puede perder la entrada que estaba escribiéndose en ese instante.
- Escritura = reescribir el trozo actual `runLog:<runId>:<n>` (≤ 200 entradas) y, cuando cambia `chunks` o al cerrar la corrida, la fila del índice.
- Si una escritura falla, se reintenta una vez; si vuelve a fallar, la entrada se imprime en consola con nivel `error`, se marca la fila del índice como `degraded` y el panel muestra "No pude guardar parte del registro". La corrida no se detiene por esto.
- Esto **reemplaza** la escritura por lotes de 1 s de NFR3.6 (decisión de esta etapa).

## 3. Consola (NFR3.9)

Cada entrada se imprime también en la consola del contexto que la produce con el prefijo `[aws-calc] <runId> <level>`; `debug` solo si `localStorage["aws-calc-debug"] === "1"` en esa página.

## 4. Lo que ve el SE (NFR3.3, NFR3.4, NFR3.7, NFR3.8, decisión Q2)

| Zona del panel | Contenido |
|---|---|
| Corrida en curso | Último `PROGRESS` (texto en español) y barra de avance |
| Resultado | Veredicto, lista por servicio con estado y motivo traducido; enlace solo si DONE |
| Registro técnico | Lista de corridas desde `runLogIndex` (fecha, duración, veredicto o "interrumpida", tamaño), tamaño total, y botones "Exportar", "Exportar todo", "Borrar", "Borrar todo", "Reparar índice". **No** se muestra el contenido técnico (Q2). |

Exportar genera un `.json` con `{ runId, index: <fila>, entries: [...] }` (o una lista para "todo") y lo descarga con `blob:` + `download`.

## 5. Correlación (NFR3.10 y correlación)

- `runId` en cada entrada, en `activeRun`, `lastRunResult`, `PROGRESS` y `RUN_RESULT`.
- `requestId` del servicio en `step` (`service:svc-1`).
- Ninguna entrada contiene credenciales o tokens; `log-format.js` es el único punto por donde pasan y aplica la lista de campos permitidos.

## 6. Métricas y alertas

No aplican al skeleton. Cuando exista el backend del cerebro (U4), las mismas entradas exportables podrán enviarse allí sin cambiar su formato.
