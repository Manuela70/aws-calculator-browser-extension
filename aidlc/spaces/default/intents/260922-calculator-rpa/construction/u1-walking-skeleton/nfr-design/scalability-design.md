# Diseño de escalabilidad — u1-walking-skeleton

> No hay carga concurrente que escalar: un SE, una corrida a la vez. Lo que sí
> crece es el registro técnico, persistido sin límite. Este diseño mantiene el
> panel rápido y las escrituras baratas aunque el registro sea grande. Prosa en
> español; identificadores en inglés.

## Sources

- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u1-walking-skeleton/nfr-requirements/scalability-requirements.md` (NFR8.9-NFR8.11). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u1-walking-skeleton/nfr-requirements/observability-requirements.md` (NFR3.6, NFR3.11). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u1-walking-skeleton/functional-design/functional-spec.md` (BR6.1 una corrida a la vez). [stage]
- `nfr-design-questions.md` de esta unidad: Q1 (escritura inmediata). [Q1]

## 1. Una corrida a la vez (NFR8.9)

- Panel: el botón se deshabilita en cuanto pasa a `Validating` y se habilita solo en `Idle`/`Done`/`Error`.
- Content script: `content-main.js` guarda la corrida activa en memoria; un segundo `RUN_RPA` recibe `{ accepted: false, reason: "busy" }` (BR6.1).

## 2. Registro partido en trozos (NFR8.11, decisión Q1)

- Cada corrida guarda su registro en claves `runLog:<runId>:<n>` con `n = 0, 1, 2, …`. Cada trozo guarda hasta 200 entradas.
- Al llegar una entrada, se añade al trozo actual y se reescribe **solo ese trozo** (escritura inmediata, Q1). Al llenarse, se abre el trozo `n + 1`.
- Así, el coste de cada escritura es acotado (como mucho 200 entradas), independiente de la longitud de la corrida.

## 3. Índice para no leer todo (NFR8.10, NFR3.11)

`runLogIndex` es una lista con una fila por corrida:

| Campo | Uso |
|---|---|
| `runId` | Clave de las entradas |
| `startedAt`, `finishedAt` | Lista y duración (`finishedAt` vacío = "interrumpida") |
| `status` | Veredicto (`DONE`, `ERROR`, `lost`) |
| `chunks` | Número de trozos, para exportar/borrar sin enumerar claves |
| `bytes` | Tamaño aproximado (longitud del JSON de los trozos), para el indicador |

- El panel, al abrirse, lee solo `activeRun`, `lastRunResult` y `runLogIndex`.
- Exportar una corrida lee sus `chunks` trozos; exportar todo recorre el índice.
- "Reparar índice" (a pedido) es la única lectura completa (`get(null)`) y reconstruye el índice desde las claves `runLog:*`.

## 4. Límites prácticos

- Con `unlimitedStorage` no hay tope fijo; el indicador de tamaño del panel (suma de `bytes`) permite al SE decidir cuándo exportar y borrar.
- El índice crece una fila por corrida (unos cientos de bytes); con miles de corridas sigue siendo una lectura pequeña.
