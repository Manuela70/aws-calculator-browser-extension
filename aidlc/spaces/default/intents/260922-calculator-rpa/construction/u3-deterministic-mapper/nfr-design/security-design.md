# Diseño de seguridad — u3-deterministic-mapper

> Cómo u3 cumple sus requisitos (`nfr-requirements/security-requirements.md` y
> `tech-stack-decisions.md`). U3 es lógica pura de Zona A: el diseño se apoya en
> funciones sin efectos secundarios, resultados tipados y una sola salida
> externa (el puerto `mapResidue`). Prosa en español; identificadores en inglés.
> Esta unidad no abrió preguntas.

## Sources

- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u3-deterministic-mapper/nfr-requirements/security-requirements.md` (NFR2.1-NFR8.5). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u3-deterministic-mapper/nfr-requirements/tech-stack-decisions.md` (NFR1.1, NFR6.1, NFR6.2, NFR7.1, NFR7.2). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u3-deterministic-mapper/functional-design/functional-spec.md` y `rules.md` (BR1.1-BR4.1). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/contract-design/contract-summary.md` (C1 2.0.0, canal de error de los puertos, "Cambios de NFR Requirements"). [stage]

## 1. Patrón general

Dos funciones puras y un adaptador:

- `mapDeterministic(domFields, requestedValues, previousOutcome?)` → `MappingOutcome`: sin red, sin tiempo, determinística para la misma entrada.
- `resolveResidue(outcome, ctx, { mapResidue, signal })` → `Promise<MappingOutcome>`: única función asíncrona; envuelve el puerto con tope, cancelación y validación de la respuesta.
- `toLogEntry(outcome, { durationMs })`: arma la entrada del registro técnico.

Ninguna lanza hacia el llamador: un `try/catch` en cada frontera pública convierte una excepción inesperada en `residueStatus = brain_unavailable` con detalle `unexpected_error`, de modo que el servicio falla visible y no se guarda.

## 2. Decisiones por requisito

| Requisito | Diseño |
|---|---|
| NFR2.1 | Índice de `domFields` por etiqueta normalizada (`cleanAriaLabel` + minúsculas + espacios colapsados) y por "Sección > Campo". Búsqueda exacta: 0 coincidencias → `no_match`; más de una sin sección → `ambiguous_label`. Nunca similitud difusa. |
| NFR2.2 | Tabla `FIELD_TYPE_TO_ACTION` cerrada; un `fieldType` ausente de la tabla → `unsupported_type`. |
| NFR3.1 | Al cerrar (`final = true` o tras `resolveResidue`), si queda residuo: `actions = []` para ese servicio, `residueStatus` en `still_unresolved` o `brain_unavailable`, y la lista completa de claves con su motivo. |
| NFR3.2 | Validador de la respuesta de `/map-residue` en este orden: forma (`actions` lista, tamaño ≤ claves enviadas), luego por acción: `requestKey` enviado y único, `fieldLabel` presente en el último escaneo, `actionType` igual al de BR2.1, campo sin acción previa, valor válido según BR2.2/2.4/2.5, igualdad con el valor pedido para fill/checkbox/toggle y pertenencia a las opciones escaneadas para selectores. La acción que falla una regla se descarta y la clave sigue en el residuo. |
| NFR3.3 | Si la opción aceptada difiere del valor pedido normalizado, la acción lleva `substituted = true` y `requestedValue`. |
| NFR4.1 | Regla ESLint `no-restricted-globals` y `no-restricted-properties` (`fetch`, `XMLHttpRequest`, `chrome`, `globalThis.fetch`, `self.fetch`) en `lib/mapping/**`. |
| NFR5.1 | U3 solo conoce la firma del puerto; la autenticación vive en u7. |
| NFR5.2 | El pedido al puerto se arma con una función pura `buildResidueRequest(outcome, domFields, ctx)` que copia solo `requestedValues` del servicio, el residuo enviable y los `domFields` del escaneo actual; tiene una prueba que verifica que no hay otras claves. |
| NFR5.3 | Antes de llamar, si `domFields.length > 500` no se llama al puerto y el residuo queda `brain_unavailable` con detalle `form_too_large`. |
| NFR5.4 | `toLogEntry` incluye conteos (acciones, residuo, pasadas), claves pendientes con motivo, `residueStatus` y duración; no recibe `domFields` ni la respuesta cruda del puerto. |
| NFR8.4 | `MappingOutcome.passCount` se incrementa en cada llamada con `previousOutcome`; al llegar a 3, `final = true` y todos los pendientes pasan al residuo. |
| NFR8.5 | `AbortController` propio, abortado por `setTimeout` de 30 s o por la señal externa; `Promise.race` con el puerto. U3 no reintenta: el único reintento (`rate_limited`) lo hace el service worker dentro de sus 30 s (u7 NFR8.1). Si el puerto rechaza con `BrainCallError` (contrato) de cualquier código, el residuo queda `brain_unavailable` y el `code` va en `MappingOutcome.brainErrorCode` (un `code` desconocido se guarda como `internal_error`); U5 lo copia a `ServiceResult.detail` y U6 lo traduce con su tabla "Errores del cerebro y de la sesión", de modo que una cuota agotada no se ve igual que una caída. Una señal ya abortada al entrar se trata como cancelación inmediata sin llamar al puerto. |

## 3. Amenazas consideradas

| Amenaza | Mitigación |
|---|---|
| Etiquetas o textos del DOM manipulados por la página | Coincidencia exacta; lo dudoso va al residuo, nunca se adivina. |
| Respuesta del cerebro que apunta a otro campo o cambia el valor | Validación por acción contra el escaneo y el valor pedido; sustituciones marcadas. |
| Respuesta enorme del cerebro | Tope de acciones (≤ claves enviadas) antes de procesar. |
| Formulario gigante que dispara un `bad_request` | Corte local a 500 campos con detalle propio. |
| Puerto que no respeta la señal | Carrera con temporizador propio. |
