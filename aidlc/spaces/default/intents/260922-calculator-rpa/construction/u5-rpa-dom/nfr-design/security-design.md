# Diseño de seguridad y robustez — u5-rpa-dom

> Cómo el RPA cumple sus requisitos (`nfr-requirements/security-requirements.md`
> y `tech-stack-decisions.md`). U5 corre como content script en una página de
> terceros que no controlamos: el diseño trata el DOM de calculator.aws como
> entrada no confiable y exige una señal positiva para cada éxito. Prosa en
> español; identificadores en inglés. Esta unidad no abrió preguntas.

## Sources

- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u5-rpa-dom/nfr-requirements/security-requirements.md` (NFR2.1-NFR2.3, NFR3.1-NFR3.5, NFR4.1, NFR4.2, NFR5.1-NFR5.5, NFR8.4-NFR8.6). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u5-rpa-dom/nfr-requirements/tech-stack-decisions.md` (NFR6.1, NFR6.2, NFR7.1, NFR7.2). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u5-rpa-dom/functional-design/functional-spec.md` (módulos, flujos R1/R2, estados). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/contract-design/contract-summary.md` (`aggregate`, `BRAIN_CALL` / `BRAIN_CANCEL`, lista de operaciones por contexto). [stage]

## 1. Principios

1. **Toda espera tiene tope y señal.** Ninguna función de Zona B espera el DOM sin un `AbortSignal` y un tiempo máximo; al vencer, falla con un código tipado.
2. **Éxito solo por señal positiva.** Un guardado, una acción o un estimado final se dan por buenos solo cuando se leen del DOM; la ausencia de error no cuenta como éxito.
3. **El DOM es dato.** Lo que se lee de la página se recorta, se valida y viaja como texto; nunca se inserta como HTML ni se usa como URL sin validar.
4. **Sin red propia.** El content script no habla con ningún host; todo pasa por mensajes al service worker (U7).

## 2. Decisiones por requisito

### NFR2 — Resiliencia ante cambios de UI

| Requisito | Diseño |
|---|---|
| NFR2.1 | `lib/dom/selectors.js` exporta un único objeto congelado (`Object.freeze`) con selectores CSS, prefijos de clase de CloudScape y textos de botón. Una regla ESLint (`no-restricted-syntax`) prohíbe literales con el prefijo `awsui_` y los textos de botón conocidos fuera de ese archivo. `npm run check:selectors` repite la búsqueda en `lib/dom/**` como verificación de NFR2.1. |
| NFR2.2 | Todas las esperas pasan por `waitFor(predicate, { signal, timeoutMs, step, label })` de `dom-utils.js`. Resuelve con el elemento o rechaza con `DomError { code, step, label }`. Tope por defecto: **una espera de 20 s** (`page_wait` de BR4.1) para que aparezca un elemento; el banner de guardado tiene 10 s por intento de guardado (§NFR3.1). Todo dentro del corte de 3 minutos del servicio. La cascada (`selectByCascade`, BR3.1) recorre las estrategias en orden: una estrategia con 0 o varios candidatos pasa a la siguiente, y solo tras la última se falla con `field_not_resolved`. Nunca se elige "el primero" de varios. Los códigos de `DomError` se traducen a los enums de `entities.md` con la tabla de §3. |
| NFR2.3 | Al abrir un dropdown, `form-scanner.js` lee las opciones visibles y las pasa a `matchOption(options, wanted)`, función pura con la misma regla de coincidencia exacta y única que `option-match.js` de U3 (se reutiliza por `import`, Zona A). Resultado: la opción única, `option_no_match` u `option_ambiguous`. No se hace clic en ninguna opción antes de tener el resultado. |

### NFR3 — Sin fallos silenciosos

| Requisito | Diseño |
|---|---|
| NFR3.1 | `confirmSave(calculatorServiceName, signal)`. **Nombre de comparación**: el título de la tarjeta leído al elegirla en R2 paso 1 (`calculatorServiceName`), que es el nombre con que la calculadora arma el banner, no el texto pedido. **Banner nuevo (BR2.6)**: justo antes de pulsar Save se toma la lista de nodos de banner presentes y se arranca un `MutationObserver`; solo cuenta un nodo de banner que **aparece después** del clic y no estaba en esa lista. Así, el banner de un servicio homónimo anterior nunca confirma el siguiente. Dentro de 10 s por intento se espera uno de dos estados. (a) **Confirmado**: banner nuevo cuyo texto cumple `^Successfully added (.+) estimate\.$` y cuyo nombre capturado coincide, normalizado, con `calculatorServiceName`. (b) **Rechazado**: algún texto `is required` dentro del formulario abierto → `validation_required` con la etiqueta del campo. Si no aparece ninguno, el intento falla; `RetryCounter` permite 3 intentos y luego `save_not_confirmed`. La URL y el botón `Add service` no participan en la decisión. |
| NFR3.2 | `aggregate(requested, serviceResults)` (Zona A) devuelve `DONE` solo si cada servicio pedido tiene `Confirmed`; si no, `ERROR` con `missing`. Antes de Share, `verifyEstimate` lee la lista de My Estimate y compara el multiconjunto de nombres con el pedido; cualquier diferencia es `ERROR` con `failureStep = estimate_check` y sin URL. |
| NFR3.3 | Cada acción termina con `readBack(element)`: se relee el valor del control, se normaliza (espacios y separadores de miles) y se compara con el esperado. Una diferencia es fallo del servicio con `field_not_applied`, la etiqueta y ambos valores recortados en el detalle. |
| NFR3.4 | `buildServiceResult` (Zona A) copia a `brainSubstitutions` cada acción aplicada con `substituted = true`, con `requested` y `applied`. Una prueba de Zona A comprueba que ninguna sustitución aplicada falte en el resultado. Si el residuo falló por un error del cerebro, `buildServiceResult` copia también `brainErrorCode` desde el `MappingOutcome` de U3, para que el panel pueda ofrecer "Iniciar sesión" ante `unauthorized` (u6, NFR5.5). |
| NFR3.5 | `exitWithoutSave()` usa su **propio** `AbortController` de 20 s, independiente de la señal del servicio (que puede estar ya abortada). Se confirma cuando el formulario se cierra y se ve My Estimate, **esté o no el servicio en la lista**. Si el fallo ocurrió durante el guardado (`save_not_confirmed` o corte en Saving), después de salir se revisa My Estimate: si el servicio aparece igual, el detalle del `ServiceResult` lo indica y la verificación final (NFR3.2) impide la URL, como pide BR2.5. Si la salida no se confirma, la corrida pasa a `RunStopped`: los servicios restantes quedan `not_attempted` y el resultado es `ERROR`. |

### NFR4 y NFR5 — Privilegio y datos

| Requisito | Diseño |
|---|---|
| NFR4.1 | `content_scripts.matches` es solo `https://calculator.aws/*`. ESLint prohíbe `fetch` (también `window.fetch`, `globalThis.fetch` y `self.fetch`), `XMLHttpRequest`, `WebSocket` y `EventSource` en todo el código que corre en el content script: `content.js`, `lib/dom/**`, `lib/rpa/**` y `lib/mapping/**` (módulos de U3). La consulta de residuo viaja por el puerto al service worker con `BRAIN_CALL { callId, operation: "map-residue", body }`; la lista de operaciones por contexto del contrato impide que el content script pida otra. |
| NFR4.2 | El manifest declara `web_accessible_resources` con `resources: ["lib/**"]`, `matches: ["https://calculator.aws/*"]` y `use_dynamic_url: true`. `check:bundle` se amplía para fallar si encuentra en `lib/**` cualquier URL distinta de `https://calculator.aws`, o cadenas con forma de token o clave. Los hosts del cerebro y del proveedor de identidad viven solo en la configuración del service worker (U7), fuera de `lib/**` y fuera de `web_accessible_resources`, así que la página no puede leerlos. `use_dynamic_url` requiere Chrome 130 o posterior: el manifest de U7 declara `minimum_chrome_version: "130"`, y Chrome se niega a instalar la extensión en un navegador anterior. |
| NFR5.1 | U5 no llama a `chrome.storage` (regla ESLint `no-restricted-properties` en `content.js`, `lib/dom/**`, `lib/rpa/**` y `lib/mapping/**`). El token vive en `chrome.storage.session` con el nivel de acceso por defecto, solo para contextos confiables, que es lo que fija U7. Prueba: desde el content script, la lectura de la clave del token falla. |
| NFR5.2 | El overlay Spotlight se construye con `createElement` y `textContent` dentro de un shadow root cerrado propio, para aislar estilos y que la página no lo lea. ESLint prohíbe `innerHTML`, `outerHTML`, `insertAdjacentHTML` y `document.write` en todo el bundle. |
| NFR5.3 | El Spotlight se crea y se quita en un único `try/finally` de la corrida, y también al cancelar o al cerrarse el puerto. El nodo raíz lleva `data-aidlc-overlay`, y `form-scanner.js` excluye ese subárbol del escaneo. |
| NFR5.4 | `validateShareUrl(url)` (Zona A) acepta solo `^https://calculator\.aws/#/estimate\?id=[A-Za-z0-9-]{1,128}$`. Cualquier otro valor (otro host, `javascript:`, vacío o más largo) produce `ERROR` con `failureStep = share` y sin URL. |
| NFR5.5 | `clip(text, 200)` (Zona A) se aplica en `buildServiceResult` y en `buildProgressEvent` a todo texto que venga del DOM (`stoppedAtLabel`, etiquetas, opciones, detalle). U6 lo pinta con `textContent`. |

### NFR8 — Cota de tiempo observable

| Requisito | Diseño |
|---|---|
| NFR8.4 | `lib/rpa/service-timer.js` (Zona A, BR2.7) crea por servicio un `AbortController` que se aborta cuando se aborta la señal de la corrida o cuando vence el corte de 180 s. El reloj se inyecta (`{ setTimeout, clearTimeout }`), así que Vitest controla el corte con temporizadores falsos. No usa `AbortSignal.timeout` ni `AbortSignal.any`. Esa señal llega a cada `waitFor` y a cada consulta al cerebro. Al abortar una consulta en curso, U5 envía `BRAIN_CANCEL { callId }` al service worker. Al vencer el corte, el servicio pasa a `Failed` con `service_timeout` y sigue `exitWithoutSave`. |
| NFR8.5 | `RetryCounter` (Zona A, `lib/rpa/retry.js`) cuenta intentos con `next()`, `exhausted` y el código del último fallo. Lo usan el guardado (3 intentos), el dropdown y la resolución de campo (los topes de U1). Agotado, devuelve el fallo tipado del último intento. |
| NFR8.6 | `buildProgressEvent(serviceIndex, step, label)` se emite al panel por el puerto solo cuando cambia el par servicio-paso. Los pasos son los estados de §5 de la especificación funcional. |

## 3. Traducción de códigos a los enums de `entities.md`

| Origen en el diseño | `ServiceResult.reason` o `RunResult.failureStep` |
|---|---|
| `DomError` `not_found` al buscar la tarjeta (R2 paso 1) | `service_not_found` |
| `DomError` `template_not_found` | `template_not_found` |
| `DomError` `field_not_resolved` (cascada agotada) | `field_not_resolved` |
| `DomError` `not_found` en cualquier otra espera de 20 s | `page_timeout` |
| `DomError` `aborted` por el corte de 3 minutos | `service_timeout` |
| `DomError` `aborted` por cancelación de la corrida | `not_attempted` para los restantes; la corrida termina en `ERROR` |
| Relectura distinta (NFR3.3) | `field_not_applied` |
| `matchOption` sin coincidencia o ambigua | `option_no_match` / `option_ambiguous` |
| Guardado sin banner nuevo tras 3 intentos | `save_not_confirmed` |
| `is required` | `validation_required` |
| Estimado final distinto de lo pedido | `failureStep = estimate_check` |
| Enlace de Share inválido | `failureStep = share` |
| Salida sin guardar no confirmada | `failureStep = services`, restantes `not_attempted` |

## 4. Amenazas consideradas

| Amenaza | Mitigación |
|---|---|
| La página cambia su DOM y el RPA actúa sobre otro elemento | Cascada con exactamente un candidato; relectura de cada acción; selectores en un solo archivo. |
| Un guardado rechazado se reporta como hecho | Banner verde con el nombre del servicio; detección de `is required`; verificación final de My Estimate. |
| El enlace de Share se manipula para llevar a otro sitio | `validateShareUrl` con host y formato fijos. |
| XSS mediante textos leídos de la página o del cerebro | Solo `textContent`; shadow root cerrado; ESLint contra APIs de HTML. |
| La página lee archivos de la extensión por `web_accessible_resources` | Solo `lib/**`, solo en calculator.aws, URL dinámica; sin secretos ni configuración en esos archivos. |
| Robo del token desde el contexto de la página | U5 no toca `chrome.storage`; el token no es accesible a content scripts. |
