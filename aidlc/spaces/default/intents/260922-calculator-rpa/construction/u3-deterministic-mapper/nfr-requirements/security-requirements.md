# Requisitos de seguridad — u3-deterministic-mapper

> Requisitos de seguridad del mapeo: `mapDeterministic` (campo↔valor exacto sobre
> el escaneo del formulario) y `resolveResidue` (una consulta al cerebro por el
> residuo, a través de un puerto inyectado). U3 es lógica pura de Zona A: no
> hace `fetch`, no toca el DOM y no guarda nada por sí misma. Prosa en español;
> identificadores en inglés. Cada requisito hereda su ID de inception (`NFRx.y`).
> Esta unidad no abrió preguntas: el Diseño Funcional y las respuestas de u2
> (Q1, Q2 de NFR) ya fijan los criterios que aplican.

## Sources

- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/requirements-analysis/requirements.md` (NFR1-NFR8). [requirements]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u3-deterministic-mapper/functional-design/functional-spec.md` (interfaces `mapDeterministic`, `resolveResidue`, flujos M1-M3). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u3-deterministic-mapper/functional-design/rules.md` (BR1.1-BR4.1). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/contract-design/contract-summary.md` (C1 2.0.0 `/map-residue`, tope de 500 `domFields`, anclaje de opciones). [stage]
- `aidlc/spaces/default/codekb/extension/technology-stack.md` (vanilla JS, sin dependencias de runtime). [brownfield]
- Reglas afirmadas en `aidlc/spaces/default/memory/project.md` (Forbidden: fallo reportado como éxito, credenciales en el cliente, código dinámico; Mandated: capa de mapeo extraíble, cero dependencias de runtime). [team-practices]

## 1. Superficie de ataque

| Elemento | Frontera de confianza | Datos que cruzan |
|---|---|---|
| `domFields` del escaneo de U5 | Derivado del DOM de calculator.aws: **no confiable** (terceros) | Etiquetas, tipos, opciones |
| `requestedValues` de U2 | Confiable (ya validado por U2) | Claves y valores de configuración |
| Puerto `mapResidue` (implementado por U4) | Respuesta de un modelo de lenguaje: **no confiable** | Acciones propuestas para el residuo |
| `MappingOutcome` hacia U5 | Interna | Acciones, residuo, sustituciones |

## 2. Requisitos

### NFR2 — Degradación visible ante cambios de UI

| ID | Requisito | Criterio de verificación |
|---|---|---|
| NFR2.1 | Una etiqueta pedida que no aparece en el escaneo, o que aparece repetida sin sección, nunca se adivina: queda en el residuo con motivo tipado (`no_match`, `ambiguous_label`) y nombra la clave (BR1.1-BR1.3). | Tests con fixtures de DomField: etiqueta cambiada y etiqueta repetida → residuo con el motivo correcto. |
| NFR2.2 | Un `fieldType` que U3 no reconoce produce `unsupported_type` en el residuo, no una acción por defecto (BR2.1). | Test con un tipo desconocido. |

### NFR3 — Sin fallos silenciosos

| ID | Requisito | Criterio de verificación |
|---|---|---|
| NFR3.1 | Un residuo sin resolver hace fallar el servicio con cada clave y su motivo; U3 nunca devuelve un `MappingOutcome` que permita guardar con claves pendientes (BR3.4). | Test: residuo final no vacío → `residueStatus` en `still_unresolved` o `brain_unavailable`, `actions = []` para ese servicio y lista completa de claves. |
| NFR3.2 | La respuesta del cerebro se valida entera: acción sin `requestKey`, etiqueta inexistente, tipo equivocado, campo ya usado, valor distinto del pedido en fill/checkbox/toggle u opción que no está en las escaneadas se descarta y la clave sigue en el residuo (BR3.3). | Tests con un doble del puerto para cada caso. |
| NFR3.3 | Toda opción del cerebro distinta de la pedida se marca `substituted = true` con `requestedValue`; nunca se sustituye en silencio (BR3.3). | Test: opción distinta → acción con `substituted` y `requestedValue`. |

### NFR4 — Mínimo privilegio

| ID | Requisito | Criterio de verificación |
|---|---|---|
| NFR4.1 | U3 no hace `fetch` ni usa APIs `chrome.*`; la única salida de red es el puerto inyectado. | Búsqueda en `lib/mapping/**`: sin `fetch`, `XMLHttpRequest` ni `chrome.`. |

### NFR5 — Secretos y minimización de datos

| ID | Requisito | Criterio de verificación |
|---|---|---|
| NFR5.1 | U3 no contiene, recibe ni reenvía credenciales. | Revisión de código. |
| NFR5.2 | La consulta al cerebro lleva solo el residuo enviable (claves y valores de configuración) y los `domFields` del escaneo actual (hasta 500, C1); nunca el texto en lenguaje natural, el `project` ni otros servicios de la corrida. | Test: el pedido construido para el puerto contiene solo esos campos. |
| NFR5.3 | Si el escaneo supera 500 `domFields`, U3 no envía la consulta: el residuo queda con `brain_unavailable` y el detalle "formulario demasiado grande para el cerebro" (evita un `bad_request` reportado como caída). | Test con 501 campos. |
| NFR5.4 | La entrada del registro técnico de U3 contiene conteos (acciones, residuo, pasadas), las claves pendientes con su motivo y la duración; no incluye opciones del formulario ni la respuesta cruda del cerebro. | Test de la función que arma la entrada. |

### NFR8 — Cota de tiempo observable

| ID | Requisito | Criterio de verificación |
|---|---|---|
| NFR8.4 | El tope de 3 pasadas lo impone U3 con un dato propio: `MappingOutcome.passCount` se incrementa en cada llamada a `mapDeterministic` con `previousOutcome`; al llegar a 3, U3 marca `final = true` y pasa todos los pendientes al residuo con su motivo, aunque el escaneo siga cambiando. U5 solo repite mientras `final` sea falso (BR3.1). | Test: tres llamadas encadenadas con escaneos que nunca convergen → la tercera devuelve `final = true` y residuo con todas las claves pendientes. |
| NFR8.5 | La consulta al cerebro tiene un tope total de 30 s que U3 impone con su propio temporizador (`Promise.race` contra una señal derivada de la de la corrida), sin depender de que el puerto respete `AbortSignal`. Dentro de ese presupuesto se admite como máximo un reintento, solo si quedan al menos 10 s. Vencido o cancelado, U3 aborta la señal derivada, ignora cualquier respuesta tardía y el residuo queda `brain_unavailable` (BR3.2). | Tests con temporizadores falsos: puerto que nunca resuelve e ignora la señal → `brain_unavailable` a los 30 s; primer intento de 25 s fallido → sin reintento. |

## 3. Otros NFR

NFR1 (agnóstica del hogar del cerebro), NFR6 (testabilidad) y NFR7 (módulo extraíble) se fijan en `tech-stack-decisions.md`.
