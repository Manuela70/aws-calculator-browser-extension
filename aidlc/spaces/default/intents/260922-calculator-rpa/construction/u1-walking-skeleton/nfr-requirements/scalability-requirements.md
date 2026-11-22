# Requisitos de escalabilidad — u1-walking-skeleton

> El skeleton es una extensión de navegador de un solo usuario que corre una
> corrida a la vez sobre una pestaña. No hay servidor ni carga concurrente que
> escalar. Lo único que crece con el uso es el registro técnico persistido sin
> límite (decisión de esta etapa). Prosa en español; identificadores en inglés.

## Sources

- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/requirements-analysis/requirements.md` (NFR8; C1 MV3 unpacked, sin servidor). [requirements]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u1-walking-skeleton/functional-design/rules.md` (BR6.1 una corrida a la vez, BR6.3 último resultado). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u1-walking-skeleton/functional-design/functional-spec.md` (alcance: un servicio por corrida canónica). [stage]
- `nfr-requirements-questions.md` de esta unidad: Q5 (registro sin límite), Q7 (`unlimitedStorage`). [Q5, Q7]

## Dimensiones de capacidad

| Dimensión | Hoy (skeleton) | Mecanismo | Comentario |
|---|---|---|---|
| Usuarios concurrentes | 1 SE por navegador | Ninguno (cliente local) | Cada SE corre su propia copia de la extensión |
| Corridas simultáneas | 1 por pestaña y por panel | BR6.1 (`busy`) | Evita dos RPA sobre el mismo DOM |
| Servicios por corrida | 1 (caso canónico); la lógica admite N en orden | Bucle secuencial | El multi-servicio lo valida U5 |
| Registro técnico | Crece por corrida, sin límite | `unlimitedStorage` + borrado manual | Ver NFR3.x de observabilidad |

## Requisitos

| ID | Requisito | Criterio de verificación |
|---|---|---|
| NFR8.9 | Las corridas son secuenciales: nunca dos corridas a la vez sobre la misma pestaña ni desde el mismo panel. | Test de Zona A del guardián `busy`; smoke pulsando dos veces "Generar Estimado". |
| NFR8.10 | El crecimiento del registro no degrada el panel: al abrirse, el panel lee solo `activeRun`, `lastRunResult` y el índice `runLogIndex` (NFR3.11), nunca las entradas `runLog:<runId>` ni `get(null)`. El registro completo de una corrida se lee solo al exportarla. | Revisión de código; smoke con un registro grande (p. ej. 50 corridas) abriendo el panel sin demora perceptible. |
| NFR8.11 | El registro se guarda por corrida (una clave `runLog:<runId>`) y se enumera por el índice `runLogIndex`, de modo que listar, medir, exportar o borrar una corrida no requiere leer ni reescribir las demás. | Revisión del esquema de claves en `chrome.storage.local`; tests de Zona A del índice. |

## Fuera de alcance

- Escalado server-side del cerebro (U4) y del futuro backend de memoria del agente.
