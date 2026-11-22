# Requisitos de rendimiento — u1-walking-skeleton

> El rendimiento del skeleton lo domina el DOM de terceros (`calculator.aws`) y
> sus tiempos de carga, no el código de la extensión. Por eso los requisitos
> son cotas de tiempo con terminación observable (NFR8) más un límite duro por
> servicio decidido en esta etapa. Prosa en español; identificadores en inglés.
> Los IDs derivados de NFR8 empiezan en `NFR8.4` para no chocar con los
> sub-requisitos `NFR8.1`-`NFR8.3` que ya define inception; cada fila dice cuál
> refina.

## Sources

- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/requirements-analysis/requirements.md` (NFR8.1-NFR8.3: cotas por operación, progreso activo, sin umbral total de latencia). [requirements]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u1-walking-skeleton/functional-design/rules.md` (BR2.3 PING, BR4.4/BR4.6 guardado, BR4.10 esperas de 20 s, BR5.5 estimado vacío, BR6.6 latido de 60 s). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u1-walking-skeleton/functional-design/functional-spec.md` (flujos W1-W4, caso canónico EC2). [stage]
- `nfr-requirements-questions.md` de esta unidad: Q2 (referencia dura de 3 min), Q6 (también como corte en la extensión). [Q2, Q6]

## Requisitos

| ID | Refina | Requisito | Objetivo | Medición |
|---|---|---|---|---|
| NFR8.4 | NFR8.1 | Cada operación acotada tiene un máximo de intentos o de tiempo y, agotado, produce un resultado tipado visible. | Handshake: 1 `PING` inicial + hasta 3 tras inyectar, 1 s entre intentos. Guardado: hasta 3 intentos, 10 s de espera del banner cada uno. Toda espera de página: 20 s. | Tests de Zona A sobre `retry` y `handshake` con relojes simulados; smoke con fallo provocado. |
| NFR8.5 | NFR8.2 | El panel refleja progreso activo y distingue "trabajando" de "detenido". | Un `ProgressEvent` por paso (servicio, acción, intento de guardado, verificación, renombrado, Share). Latido de `activeRun` vencido a los 60 s → ERROR `lost`. | Smoke: observar progreso continuo; cerrar la pestaña a mitad de corrida → el panel termina en error en ≤ 60 s. |
| NFR8.6 | NFR8.1 | **Límite duro por servicio con cancelación:** ver la sección siguiente. | 180 s por servicio, medidos en el content script desde el inicio de su búsqueda. | Tests de Zona A del cronómetro y del token de cancelación con reloj simulado; smoke con un servicio forzado a demorar. |
| NFR8.7 | NFR8.3 | **Referencia del smoke:** la corrida canónica de EC2 (de "Generar Estimado" a URL) termina en 3 minutos o menos; si no, el smoke se da por fallido. Es un criterio de verificación, no un umbral de producto (NFR8.3 de inception se mantiene: sin umbral de latencia total para corridas en general). | ≤ 180 s de punta a punta. | Duración = hora del evento `run_end` menos la de `run_start` en el registro técnico de la corrida (NFR3.5); `SMOKE.md` la anota. |
| NFR8.8 | NFR8.1 | El código de la extensión no añade esperas fijas largas: cada pausa entre acciones es un retardo corto nombrado y las esperas de página son por condición con tope (no un `sleep` ciego del tope completo). | Retardos fijos ≤ 1,5 s; esperas por condición hasta 20 s. | Revisión de código. |

## NFR8.6 — Semántica del corte de 3 minutos

El corte es duro: al vencer, el servicio deja de actuar sobre la página, aunque estuviera a mitad de un paso.

1. **Token de cancelación por servicio.** Al empezar cada servicio se crea un token de cancelación (equivalente a `AbortController`) con su fecha límite (inicio + 180 s) y un temporizador que lo dispara al vencer. Cada espera de página, cada retardo y cada acción sobre el DOM comprueban el token **antes** de empezar, y las esperas lo escuchan y terminan en cuanto se dispara; una espera nunca dura más allá de la fecha límite. Precisión del corte: el servicio deja de actuar como mucho 1 s después de los 180 s (la duración de una sola acción sobre el DOM en curso).
2. **Al vencer:** el servicio termina de inmediato con `status = failed`, `reason = service_timeout`. No se ejecuta ninguna acción más sobre el DOM para ese servicio (ni volver a My Estimate). La corrida pasa directo a la agregación, que da ERROR `services` sin URL (todo-o-nada); en el skeleton de un servicio, la corrida termina ahí.
3. **Si vence después de pulsar guardar:** el resultado sigue siendo `service_timeout`, aunque el banner verde aparezca después; un banner tardío no se cuenta. Si el servicio llegó a guardarse, queda en el estimado de `calculator.aws`; la siguiente corrida lo detecta por BR5.5 (estimado no vacío → ERROR `preconditions`) y el SE lo limpia a mano. La extensión nunca borra servicios por su cuenta.
4. **Sin procesos zombis:** al cerrarse la corrida (por DONE, ERROR o corte) se marca como cerrada en memoria. A partir de ahí el content script no emite más `PROGRESS` ni escribe `activeRun` para ese `runId`; cualquier escritura tardía comprueba esa marca y el `runId` antes de escribir, y se descarta si no coinciden.
5. **Mensaje al SE:** "Configurar <servicio> tardó más de 3 minutos; lo detuve." Si pudo haber quedado guardado, se añade: "Revisa el estimado en calculator.aws antes de volver a intentar."

Coherencia de cotas: el peor caso del guardado (3 × 10 s) y de cada espera (20 s) cabe dentro del límite por servicio (180 s) y nunca deja 60 s sin `ProgressEvent`, porque cada intento y cada espera emiten progreso al empezar.

## Fuera de alcance

- Latencia del cerebro (U4) y de la evaluación WAF: no existen en el skeleton.
- Rendimiento con varios servicios: el límite es por servicio; la duración total de una corrida multi-servicio no tiene umbral (NFR8.3 de inception).
