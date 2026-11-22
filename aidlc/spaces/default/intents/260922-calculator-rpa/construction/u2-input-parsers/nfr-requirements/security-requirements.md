# Requisitos de seguridad — u2-input-parsers

> Requisitos de seguridad de la capa de entrada: validación estricta del JSON,
> interpretación de lenguaje natural por el cerebro (U4) a través de un puerto
> inyectado, y normalización a `NormalizedRun`. U2 es lógica pura de Zona A: no
> hace `fetch`, no toca el DOM y no guarda nada por sí misma. Prosa en español;
> identificadores en inglés. Cada requisito hereda su ID de inception (`NFRx.y`).

## Sources

- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/requirements-analysis/requirements.md` (NFR1-NFR8, FR1.1, FR1.2, FR8.1). [requirements]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u2-input-parsers/functional-design/functional-spec.md` (§3 interfaz pública y puerto, W1-W4). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u2-input-parsers/functional-design/rules.md` (BR2.1-BR2.7, BR3.1-BR3.6, BR5.1-BR5.4). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/contract-design/contract-summary.md` (borde u6 → u2, C2 topes, C3 `/interpret`). [stage]
- `aidlc/spaces/default/codekb/extension/technology-stack.md` (vanilla JS, sin dependencias de runtime). [brownfield]
- `nfr-requirements-questions.md` de esta unidad: Q1 (aviso y sin texto de lenguaje natural en el registro), Q2 (JSON rechazado completo en el registro). [Q1, Q2]
- Reglas afirmadas en `aidlc/spaces/default/memory/project.md` (Forbidden: credenciales en el cliente, código dinámico, `innerHTML` con datos de red; Mandated: cero dependencias de runtime, capa de mapeo extraíble). [team-practices]

## 1. Superficie de ataque

| Elemento | Frontera de confianza | Datos que cruzan |
|---|---|---|
| Texto pegado o escrito por el SE (pestañas JSON y lenguaje natural) | Entrada del usuario en la página de la extensión | Configuración de servicios, posible nombre del cliente en `project` o en el texto |
| Puerto `interpretNaturalLanguage` (implementado por U4) | Respuesta de red de un modelo de lenguaje: **no confiable** | `NlInterpretationResponse` (configuración o fragmentos) |
| `NormalizedRun` hacia U3/U5/U6 | Interna (confiable tras validar) | Servicios normalizados, región, toggles |
| Registro técnico local de U1 | Local al perfil del navegador | Códigos de error y, según Q2, el JSON rechazado |

## 2. Requisitos

### NFR3 — Visibilidad de errores

| ID | Requisito | Criterio de verificación |
|---|---|---|
| NFR3.1 | Toda entrada inválida produce un `InputError` tipado con código del enum y mensaje en español; nunca un `NormalizedRun` parcial (BR5.3). | Tests de Zona A: cada código del enum tiene al menos un caso que lo produce y ninguno devuelve servicios. |
| NFR3.2 | Una respuesta del cerebro con forma inválida, fuera de topes o que falla la normalización se informa como `nl_invalid_response`, distinta de `brain_unavailable` (BR3.5, BR3.6). | Tests con un doble del puerto: respuesta mal formada, 21 servicios, valor de 101 caracteres, región desconocida → `nl_invalid_response`; sin respuesta → `brain_unavailable`. |

### NFR4 — Mínimo privilegio

| ID | Requisito | Criterio de verificación |
|---|---|---|
| NFR4.1 | U2 no hace `fetch` ni usa APIs `chrome.*`: la única salida de red es el puerto inyectado, cuyo host declara U7. U2 no añade permisos ni hosts al manifest. | Búsqueda en `lib/input/**`: sin `fetch`, `XMLHttpRequest` ni `chrome.`. |

### NFR5 — Seguridad de secretos y custodia de datos

| ID | Requisito | Criterio de verificación |
|---|---|---|
| NFR5.1 | U2 no contiene, recibe ni reenvía credenciales: el puerto llega ya autenticado desde U4/U7. | Revisión de código y búsqueda de patrones de clave en `lib/input/**`. |
| NFR5.2 | La pestaña de lenguaje natural muestra el aviso "No incluyas nombres de clientes ni datos personales; describe solo la arquitectura." junto al área de texto (Q1; lo pinta U6, el texto lo fija U2 en `input-errors.js` como constante de copy). | Smoke: el aviso es visible en la pestaña de lenguaje natural. |
| NFR5.3 | U2 expone la función pura `toLogEntry(rawInput, result, { durationMs })`, única fuente de la entrada del registro técnico; U6 mide la duración y entrega la entrada al registro de U1. Para lenguaje natural la entrada contiene solo `format`, longitud del texto, `code` (o `ok`), número de servicios o de fragmentos y `durationMs`; nunca el texto, ni `fragment`, ni `service` en texto libre, ni mensajes que reflejen contenido del cerebro (Q1). | Tests de `toLogEntry`: con texto, fragmentos y `nl_invalid_response`, la entrada serializada no contiene ninguna subcadena del texto de entrada ni de los fragmentos. |
| NFR5.4 | Para un JSON rechazado, `toLogEntry` devuelve el código de error, la ruta (servicio y clave) y el texto JSON completo para reproducir el fallo (Q2). Para un JSON aceptado devuelve solo `format`, longitud, número de servicios y `durationMs`. El registro es solo local (`chrome.storage.local` de U1), nunca sale del navegador y se puede borrar desde el historial (U6). | Tests de `toLogEntry` para JSON rechazado y aceptado; revisión: ningún código envía el registro por red. |
| NFR5.5 | Riesgo aceptado (Q2): el registro local puede contener el nombre del cliente en `project`. Mitigación: queda solo en el perfil del SE, sin sincronización (`storage.local`, no `storage.sync`), y se documenta en `SMOKE.md` cómo borrarlo. | Revisión del uso de `storage.local`; `SMOKE.md` documenta el borrado. |

### NFR3 — Validación de entrada en la frontera (sin fallos silenciosos)

| ID | Requisito | Criterio de verificación |
|---|---|---|
| NFR3.3 | El JSON se parsea solo con `JSON.parse`; nunca `eval`, `new Function` ni reviver con código. El esquema es cerrado (BR2.5): una clave desconocida es un error. | Lint (`no-eval`, `no-new-func`); tests con claves extra. |
| NFR3.4 | Topes duros antes de cualquier procesamiento costoso: 2000 caracteres de lenguaje natural (BR3.1) y, en la configuración, 20 servicios, 30 claves por servicio y 100 caracteres por clave o valor (BR2.7, iguales a C2). Antes de `JSON.parse`, el texto JSON se limita a 100 000 caracteres (`input_too_long`), lo que acota el costo del parseo. | Tests en el borde: 100 000/100 001 caracteres de JSON, 2000/2001 caracteres, 20/21 servicios, 30/31 claves, 100/101 caracteres. |
| NFR3.5 | Protección contra contaminación de prototipos: claves `__proto__`, `constructor` y `prototype` se rechazan como `unknown_key`, y los objetos normalizados se construyen sin heredar de entradas del usuario. | Tests con esas claves en raíz, servicio y `fields`. |
| NFR3.6 | Todo texto que venga del cerebro o del usuario sale de U2 como dato; U2 no produce HTML. La obligación de pintarlo solo con `textContent` es de U6 (BR3.6). | Revisión: `lib/input/**` no genera marcado; la regla figura en el diseño de U6. |

### NFR8 — Cota de tiempo observable

| ID | Requisito | Criterio de verificación |
|---|---|---|
| NFR8.4 | La interpretación tiene un tope de 30 s; vencido, U2 aborta la petición del puerto (señal derivada) y resuelve `brain_unavailable` sin reintento silencioso (BR3.5). | Test con temporizadores falsos. |
| NFR8.5 | La cancelación usa el `AbortSignal` de U6: una respuesta que llega tras abortar se descarta y `normalize` resuelve `cancelled` (BR3.6). | Test: abortar antes de la respuesta → `cancelled`; la respuesta tardía no cambia el resultado. |

## 3. No aplica a esta unidad

| NFR | Motivo |
|---|---|
| NFR1 | U2 es agnóstica del hogar del cerebro: solo depende del puerto (ver `tech-stack-decisions.md`). |
| NFR2 | U2 no toca el DOM de calculator.aws. |
