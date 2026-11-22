# Diseño de seguridad — u6-popup-ui

> Cómo el panel lateral cumple sus requisitos de seguridad y visibilidad
> (`nfr-requirements/security-requirements.md`). El panel es una página de la
> extensión, un contexto confiable, que pinta datos de fuentes no confiables:
> el cerebro y el DOM de calculator.aws. Prosa en español; identificadores en
> inglés. Esta unidad no abrió preguntas.

## Sources

- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u6-popup-ui/nfr-requirements/security-requirements.md` (NFR3.1, NFR3.2, NFR5.1-NFR5.5, NFR8.4). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u6-popup-ui/functional-design/functional-spec.md` (§2 estados, §3 pestañas, §6 textos). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/contract-design/contract-summary.md` (`BRAIN_CALL`, `BRAIN_CANCEL`, `BRAIN_LOGIN`, `BRAIN_SESSION`, códigos). [stage]

## 1. Principios

1. **Todo texto variable es dato.** El panel solo escribe texto con `textContent` y atributos seguros; el HTML del panel es estático, en `sidepanel.html`.
2. **El reductor decide, la vista pinta.** `lib/panel/panel-state.js` es puro: recibe eventos y devuelve estado. La vista nunca decide si algo fue éxito.
3. **El panel no toca credenciales.** Solo envía mensajes al service worker (U7).

## 2. Decisiones por requisito

### NFR5 — Datos no confiables y del cliente

| Requisito | Diseño |
|---|---|
| NFR5.1 | Las funciones de render de `lib/panel/render/*.js` crean nodos con `createElement` y asignan `textContent`. Los únicos atributos que reciben datos variables son `href` (la URL validada de NFR5.2, o la URL `blob:` que el propio panel genera para "Exportar todo"), `data-*` y `aria-*`. Los atributos de evento (`on*`) y `style` nunca reciben datos: los estilos cambian solo con clases fijas. ESLint prohíbe en `sidepanel.js` y `lib/panel/**` `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, la asignación a `.style` y a propiedades `on*`, y `setAttribute` cuyo primer argumento no sea un literal (`no-restricted-syntax`), lo que impide nombres de atributo dinámicos. La CSP `script-src 'self'` de U7 bloquea además cualquier script inyectado. |
| NFR5.2 | `isValidEstimateUrl(url)` (Zona A) acepta solo `^https://calculator\.aws/#/estimate\?id=[A-Za-z0-9-]{1,128}$`, la misma regla que u5 `validateShareUrl`. Con URL válida, el panel crea `<a target="_blank" rel="noopener noreferrer">` y el botón "Copiar" usa `navigator.clipboard.writeText` con esa URL. Con URL inválida, el reductor trata el `RunResult` como fallo (BR3.4) y la vista no crea enlace ni botón. |
| NFR5.3 | El aviso de u2 es copy fijo de `lib/messages-es.js`. Se pinta junto al área de lenguaje natural y el área lo referencia con `aria-describedby`, así que el lector de pantalla también lo anuncia. |
| NFR5.4 | `lib/panel/tab-store.js` es el único módulo que persiste el texto de las pestañas. Escribe en `chrome.storage.session`, bajo claves con prefijo `panel:`, con 500 ms de retardo tras la última tecla, y vacía la escritura pendiente al perder el foco y en `pagehide`, para no perder texto si el panel se cierra dentro de esa ventana. ESLint prohíbe `chrome.storage.local` y `chrome.storage.sync` en `lib/panel/**`. El historial se lee y se borra solo a través del módulo de historial de U1 (`lib/history-store.js`), que es su dueño; el panel llama a sus funciones de listar, borrar una y borrar todas. El texto nunca va al registro técnico: los eventos de error del panel registran solo el código. |
| NFR5.5 | **Botón tras un error.** Ante `unauthorized` en Interpreting, Reviewing o WafLoading, el estado de error muestra "Iniciar sesión". Al pulsarlo, `lib/panel/effects.js` envía `BRAIN_LOGIN {}`. Con `LOGIN_OK`, el reductor vuelve al estado previo a la llamada y `effects.js` repite esa llamada. Con `LOGIN_CANCELLED` (o `brain_unavailable`), se queda el error con su texto. **Chequeo previo a Reviewing.** Al pulsar "Revisar" en Preview, `effects.js` envía `BRAIN_SESSION {}` con tope de 2 s; sin respuesta o con error, se trata como no autenticado. Si `authenticated` es falso o faltan menos de 15 minutos para `expiresAt`, el reductor **se queda en Preview** con la marca `needsLogin` y la vista muestra "Iniciar sesión" en lugar de seguir; no hay estado nuevo en la máquina. Desde Preview, `LOGIN_OK` limpia la marca y pasa a Reviewing (ahí empieza la llamada), y `LOGIN_CANCELLED` deja Preview con el texto de `login_cancelled`. **Token vencido durante una corrida** (u7, ciclo del login, punto e): si algún `ServiceResult` trae `brainErrorCode = unauthorized`, Failed muestra además "Iniciar sesión" y el texto de `unauthorized`; tras el login, el SE vuelve a generar desde un estimado nuevo, como en cualquier Failed con servicios guardados. `expiresAt` es un instante en milisegundos desde la época Unix, como `Date.now()`. El panel nunca lee la clave del token: `tab-store.js` solo usa claves con prefijo `panel:` en `storage.session`, y ESLint prohíbe en `lib/panel/**` las llamadas a `chrome.storage.session` fuera de `tab-store.js`. |

### NFR3 — Visibilidad de errores

| Requisito | Diseño |
|---|---|
| NFR3.1 | `messageFor(code, params)` (Zona A, `lib/messages-es.js`) resuelve el texto con las tablas de functional-spec §6. Un código sin entrada devuelve "Ocurrió un problema ({código})." con el código como texto plano. Una prueba recorre todos los códigos del contrato, de u2 y de u5 y exige un texto no vacío para cada uno. Los parámetros (`{campo}`, `{detalle}`) se insertan como texto y se recortan a 200 caracteres. |
| NFR3.2 | El reductor guarda el `runId` de la corrida activa e ignora todo `ProgressEvent` o `RunResult` con otro `runId` (BR3.3). Un `RunResult` con `DONE` pasa a Done solo si `isValidEstimateUrl` acepta su URL; si no, pasa a Failed (BR3.4). |

### NFR8 — Estado observable

| Requisito | Diseño |
|---|---|
| NFR8.4 | Cada estado de espera tiene un temporizador del panel con reloj inyectable y un evento de salida. **Interpreting**: tope de 30 s de u2 y Cancelar. Ese tope coincide con el plazo del service worker (u7 NFR8.1): gana el primero que llega, ambos se traducen a `timeout`, `effects.js` envía `BRAIN_CANCEL` y una respuesta tardía de un `callId` cancelado se descarta. **Reviewing y WafLoading**: tope de 35 s, que despacha `timeout`, y Cancelar. Tanto el `timeout` como Cancelar hacen que `effects.js` envíe `BRAIN_CANCEL { callId }`. **Connecting**: el handshake de u1 (3 PING) y luego ConnectionError. **Running**: los topes de u5 y Cancelar con confirmación; tras confirmar, el panel espera hasta 20 s la confirmación de la cancelación (functional-spec §3) y luego vuelve a Idle aunque no llegue, con el aviso correspondiente. Una prueba de Zona A recorre la máquina y verifica que todo estado de espera tiene al menos una transición por `timeout` o por cancelación hacia un estado con salida. La región de estado lleva `aria-busy="true"` durante la espera y `aria-live="polite"`; en Running muestra "Servicio N de M". |

## 3. Amenazas consideradas

| Amenaza | Mitigación |
|---|---|
| XSS mediante textos del cerebro, del DOM o del historial | Solo `textContent`; ESLint contra APIs de HTML; CSP `script-src 'self'`. |
| Enlace de estimado manipulado (`javascript:` u otro host) | `isValidEstimateUrl` antes de crear el enlace o copiar; `rel="noopener noreferrer"`. |
| Datos del cliente persistidos de más | Texto solo en `storage.session`; aviso de u2; nada de texto en el registro técnico. |
| Mensajes de otra corrida mezclados en la vista | Filtro por `runId` en el reductor. |
| Exposición del token | El panel no conoce el token; solo `BRAIN_LOGIN` y `BRAIN_SESSION`. |
