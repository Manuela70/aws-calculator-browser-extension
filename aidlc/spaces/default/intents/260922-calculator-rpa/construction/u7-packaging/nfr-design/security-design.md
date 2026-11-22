# Diseño de seguridad — u7-packaging

> Cómo el empaquetado y el cliente del cerebro del service worker cumplen sus
> requisitos (`nfr-requirements/security-requirements.md` y
> `tech-stack-decisions.md`). Prosa en español; identificadores en inglés.
> Esta unidad no abrió preguntas.

## Sources

- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u7-packaging/nfr-requirements/security-requirements.md` (NFR1.1, NFR3.1, NFR4.1-NFR4.4, NFR5.1-NFR5.6, NFR7.1, NFR7.2, NFR8.1). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u7-packaging/nfr-requirements/tech-stack-decisions.md` (NFR6.1, NFR7.3). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/contract-design/contract-summary.md` ("Cambios de NFR Requirements": `BRAIN_CALL`, `BRAIN_CANCEL`, códigos, `BrainCallError`). [stage]

## 1. Estructura del bundle

| Ruta | Contenido | ¿Legible por la página? |
|---|---|---|
| `manifest.json` | Permisos, hosts, CSP, recursos accesibles | No aplica |
| `background.js` | Punto de entrada del service worker (`"type": "module"`); registra los oyentes | No |
| `sw/config.js` | URL base del cerebro, dominio y `clientId` público del proveedor de identidad, alcances | No (fuera de `lib/**`) |
| `sw/router.js` | Decisión pura de lista permitida por contexto | No |
| `sw/session.js` | Token, vencimiento y login único | No |
| `sw/auth-flow.js` | Flujo de código con PKCE | No |
| `sw/brain-client.js` | `fetch`, plazo de 30 s, reintento, traducción de códigos | No |
| `sw/call-registry.js` | `callId` → controlador y remitente | No |
| `sw/messages.js` | Textos en español de cada código | No |
| `sw/keepalive.js` | Contador de trabajos en curso y ping de vida | No |
| `lib/**` | Código del content script y del panel (U1-U6) | Sí, solo en calculator.aws con URL dinámica |

La URL del cerebro y los datos del proveedor de identidad viven solo en `sw/config.js` y en `host_permissions`. Esto cumple NFR1.1 y la exigencia de u5 NFR4.2 de que `lib/**` no contenga URL del cerebro ni configuración.

## 2. Decisiones por requisito

### NFR4 — Mínimo privilegio (manifest)

| Requisito | Diseño |
|---|---|
| NFR4.1 | `host_permissions` = `https://calculator.aws/*`, el host del cerebro y el dominio del proveedor de identidad (su endpoint de token), exactamente. `scripts/bundle-policy.json` guarda solo las entradas fijas (`https://calculator.aws/*`, los permisos, la CSP y `web_accessible_resources`). Los hosts del cerebro y del proveedor de identidad **no** se escriben ahí: `check:bundle` los deriva leyendo las exportaciones de `sw/config.js`, arma el conjunto esperado (fijos + derivados) y compara **conjuntos exactos** con `host_permissions`: falla si sobra o falta un host. Así el hogar del cerebro sigue cambiándose en dos lugares (NFR1.1). El host CloudFront muerto se elimina. |
| NFR4.2 | `permissions` = `tabs`, `scripting`, `sidePanel`, `storage`, `unlimitedStorage`, `identity`, contra la misma política de conjunto exacto. |
| NFR4.3 | `web_accessible_resources` = `[{ resources: ["lib/*", "lib/*/*"], matches: ["https://calculator.aws/*"], use_dynamic_url: true }]`. El manifest incluye además la clave pública `key`, para que el identificador de la extensión sea estable entre equipos y la URL de retorno registrada en Cognito (`https://<id>.chromiumapp.org/`) no cambie (dependencia con u4). `use_dynamic_url` requiere Chrome 130, así que el manifest declara `minimum_chrome_version: "130"` (también lo pide u5). |
| NFR4.4 | `content_security_policy.extension_pages` = `"script-src 'self'; object-src 'self'"`, explícita para que `check:bundle` la compare; se rechaza `unsafe-eval`, `unsafe-inline`, `wasm-unsafe-eval` y cualquier origen remoto. |

### NFR5 — Credenciales y borde del service worker

| Requisito | Diseño |
|---|---|
| NFR5.1 | Sin secretos en el bundle: el `clientId` del proveedor de identidad es público (cliente sin secreto, PKCE). `check:bundle` busca patrones de secreto (`AKIA`, `-----BEGIN`, `sk-ant-`, cadenas con forma de JWT `eyJ…\.eyJ…`, `client_secret`) en todo `aws-calculator-extension/` y falla si encuentra alguno. |
| NFR5.2 | `sw/session.js` guarda `{ accessToken, expiresAt }` en `chrome.storage.session` bajo una sola clave. En `chrome.runtime.onInstalled` y `onStartup` llama a `chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })`. ESLint prohíbe el uso directo de `chrome.storage.local` y `chrome.storage.sync` en `sw/**`; el registro técnico se escribe solo vía `lib/log/run-logger.js` de u1 y nunca recibe el token (se registra solo `requestId` y `code`). |
| NFR5.3 | Solo `sw/brain-client.js` hace `fetch` al cerebro (regla ESLint que prohíbe `fetch` fuera de `sw/brain-client.js` y `sw/auth-flow.js`). Cada pedido lleva `Authorization: Bearer <token>`, `Content-Type: application/json` y `X-Request-Id` (`crypto.randomUUID()`). El oyente de `chrome.runtime.onMessage` descarta todo mensaje con `sender.id !== chrome.runtime.id` antes de cualquier otro paso. `BRAIN_CANCEL` aborta el `AbortController` del `callId` y la respuesta tardía se descarta. |
| NFR5.4 | Un 401 borra la clave del token en `storage.session` y responde `unauthorized` al llamador; ese pedido no se reintenta. |
| NFR5.5 | `sw/router.js` expone `authorize(sender, message)`, función pura. **Content script**: `sender.tab` presente y `new URL(sender.url).origin === "https://calculator.aws"` → solo `map-residue`. **Página de la extensión** (panel): sin `sender.tab` y `sender.url` que empieza por `chrome-extension://<id>/` → `interpret` y `waf-evaluate`. Además se rechaza una `operation` desconocida y un `body` cuyo JSON supera 256 KB, medido en bytes con `TextEncoder`. Todo rechazo es `bad_request` sin llamar al cerebro. |
| NFR5.6 | Ver "Ciclo del login" abajo. |

### Ciclo del login (NFR5.6)

Mensajes internos del borde, que completan `BRAIN_CALL` y `BRAIN_CANCEL` del contrato. Solo los acepta `sw/router.js` desde páginas de la extensión, nunca desde un content script:

- `BRAIN_LOGIN {}` → `{ ok: true, expiresAt } | { ok: false, error: { code: "login_cancelled" | "brain_unavailable" } }`.
- `BRAIN_SESSION {}` → `{ authenticated, expiresAt }`. Con este mensaje el panel aplica la regla de los 15 minutos.

| Punto | Diseño |
|---|---|
| (a) Quién inicia | Solo `BRAIN_LOGIN`, que el panel envía cuando el SE pulsa "Iniciar sesión". Un `BRAIN_CALL` sin token válido, venga del panel o del content script, responde `unauthorized` de inmediato, sin esperar ni abrir ventanas. |
| (b) Login único | `sw/session.js` guarda una sola promesa de login en curso. Los `BRAIN_LOGIN` que llegan mientras tanto reciben la misma promesa. **Lectura del requisito**: los "pedidos que esperan el login" de NFR5.6 (b) y (c) son estos `BRAIN_LOGIN`. Un `BRAIN_CALL` no espera, porque el panel ya reintenta la llamada después de un login exitoso (u6, "Sesión y errores del cerebro") y esperar consumiría su tope de 35 s. |
| (c) Cancelación | Si `launchWebAuthFlow` rechaza (ventana cerrada o cancelada), la promesa resuelve `login_cancelled` para todos los que esperan, y se limpia. |
| (d) Vencimiento | La respuesta del endpoint de token se valida: `access_token` no vacío, `token_type` igual a `Bearer` (sin distinguir mayúsculas) y `expires_in` entero positivo. Si algo no cumple, nada se guarda y el login responde `brain_unavailable`. `expiresAt = ahora + expires_in`. El token se trata como ausente desde 60 s antes de `expiresAt`. |
| (e) 15 minutos | El panel consulta `BRAIN_SESSION` antes de pasar de Preview a Reviewing; si quedan menos de 15 minutos, muestra "Iniciar sesión" (u6). **Vencimiento durante una corrida**: una corrida larga puede superar lo que queda del token. Entonces `map-residue` desde el content script recibe `unauthorized` sin abrir el login. Ese servicio falla con su motivo (U3 lo registra en `brainErrorCode`), la corrida termina en `ERROR` sin URL y el panel muestra el texto de `unauthorized` con "Iniciar sesión". Es el comportamiento esperado: nunca se reporta éxito ni se abre una ventana de login en medio del RPA. |
| (f) Sin refresh token | Si la respuesta del endpoint de token incluye `refresh_token`, se descarta sin guardarlo. Al vencer, el SE vuelve a iniciar sesión. |
| (g) Cancelación por dueño | `sw/call-registry.js` guarda por `callId` la clave del remitente: `tab:<tabId>:<frameId>` para el content script, `doc:<documentId>` para páginas de la extensión. `BRAIN_CANCEL` de otra clave se ignora. Un `callId` repetido se rechaza con `bad_request`. |
| PKCE | `sw/auth-flow.js` genera `code_verifier` de 64 bytes con `crypto.getRandomValues`, `code_challenge` S256 con `crypto.subtle.digest` y un `state` aleatorio. Llama a `launchWebAuthFlow({ url, interactive: true })` con `redirect_uri = chrome.identity.getRedirectURL()`. Verifica que el `state` devuelto coincida (si no, `login_cancelled` y nada se guarda) e intercambia el código en el endpoint de token con `fetch` POST `application/x-www-form-urlencoded`. |

### NFR3 — Errores visibles

| Requisito | Diseño |
|---|---|
| NFR3.1 | `translateResponse(status, body)` (puro, en `sw/brain-client.js`) devuelve `{ ok: false, error: { code, message, requestId, retryAfterSeconds? } }`. `code` sale de `body.error.code` si pertenece al conjunto del contrato; si no, `internal_error`. Un `TypeError` de `fetch` (red o CORS) es `brain_unavailable`. `message` sale de `sw/messages.js`, en español. Un 200 se valida contra un validador de forma por operación (`status` admitido y claves obligatorias del contrato); si no valida, `internal_error` y nunca `ok: true`. La validación semántica completa queda en las unidades consumidoras. |

### NFR8 — Plazo en el borde

| Requisito | Diseño |
|---|---|
| NFR8.1 | Plazo total de 30 s por `BRAIN_CALL`, medido con un reloj inyectable (`{ now, setTimeout, clearTimeout }`) para probarlo con temporizadores falsos. El primer intento usa todo el plazo restante. Ante `rate_limited` con `retryAfterSeconds = r`, se reintenta una vez solo si `r + 12 s ≤ tiempo restante`; si no, se devuelve `rate_limited` con `retryAfterSeconds`. No hay otros reintentos. Al vencer el plazo se aborta el `fetch` y se responde `timeout`. **Respuestas raras**: un cuerpo que no es JSON (por ejemplo, el HTML de un gateway) es `brain_unavailable` si el estado es 5xx y `internal_error` en otro caso. La espera previa al reintento por `rate_limited` es un temporizador que `BRAIN_CANCEL` y el plazo cancelan. El reintento lleva un `X-Request-Id` nuevo, y el registro técnico guarda ambos. **Vida del service worker**: `sw/keepalive.js` lleva un contador de trabajos en curso; mientras sea mayor que cero, invoca `chrome.runtime.getPlatformInfo()` cada 20 s. Lo toman `sw/brain-client.js` (cada llamada, incluida la espera del reintento) y `sw/session.js` (cada login, que con contraseña, MFA o federación puede durar más de 30 s), porque cada llamada a una API de la extensión reinicia el contador de inactividad de 30 s de MV3 (Chrome 110 o posterior). Así el service worker no se detiene en medio de un pedido. Si aun así se reinicia, el llamador no recibe respuesta y trata la pérdida del canal como `brain_unavailable`. |

### NFR1 y NFR7 — Reversibilidad y empaquetado

| Requisito | Diseño |
|---|---|
| NFR1.1 | El hogar del cerebro se cambia en `sw/config.js` (URL base) y en `host_permissions`; ningún otro archivo lo contiene, tampoco `bundle-policy.json` (ver NFR4.1). `check:bundle` verifica que el host del cerebro aparezca solo en esos dos lugares. |
| NFR7.1 | `manifest_version: 3`. El service worker se declara con `"type": "module"`. MV3 no admite módulos en `content_scripts`, así que `content.js` es un cargador pequeño, sin `import` estático, que carga `lib/**` con `import(chrome.runtime.getURL('lib/...'))`; por eso `lib/**` está en `web_accessible_resources` con URL dinámica. Todo se carga tal como está en `aws-calculator-extension/`; no hay transpilación ni bundling. |
| NFR7.2 | `scripts/package-zip.js` (Node, desarrollo) arma la lista de archivos de `aws-calculator-extension/` excluyendo `**/*.test.js`, `**/__tests__/**`, `SMOKE.md` y archivos ocultos. Comprime con la utilidad del sistema (`tar -a -c -f` en Windows 10 o posterior, `zip` en otros sistemas). Luego lista las entradas del `.zip` y falla si no son exactamente las de la lista. No incluye `node_modules`, `tests/` ni archivos del workflow, que están fuera del directorio. |
| NFR7.3 | `check:bundle` corre en CI con `scripts/bundle-policy.json` y falla ante cualquier desviación de NFR4.1-NFR4.4, NFR5.1 o NFR1.1. También aplica la regla de u5 NFR4.2: en `lib/**` no puede haber ninguna URL distinta de `https://calculator.aws`, ni el host del cerebro o del proveedor de identidad, ni cadenas con forma de token. |
| NFR6.1 | Pruebas de Zona A, con `fetch`, `chrome.runtime`, `chrome.identity`, `chrome.storage.session` y el reloj simulados, sobre `router.js`, `session.js`, `auth-flow.js` (verificación de `state`, descarte del refresh token), `brain-client.js` (cada código, código desconocido, red caída, 200 inválido, 401, reintento con 5 s y sin reintento con 25 s, plazo de 30 s) y `call-registry.js`. Piso de 80 % en líneas y ramas con `coverage.thresholds`. |

## 3. Amenazas consideradas

| Amenaza | Mitigación |
|---|---|
| Una página o extensión ajena usa el service worker como proxy del cerebro | `sender.id` propio obligatorio; lista permitida por contexto; content script limitado a `map-residue` y a calculator.aws. |
| Robo del token desde la página | `storage.session` solo para contextos confiables; el content script nunca recibe el token. |
| Intercepción del código de autorización | PKCE S256 y `state` verificado; `redirect_uri` de `chrome.identity`. |
| Token de larga vida en el cliente | Sin refresh token; token de 1 hora en memoria de sesión. |
| Inyección de código | CSP `script-src 'self'` explícita y verificada; sin orígenes remotos. |
| Permisos de más | Conjuntos exactos en `bundle-policy.json`; host muerto eliminado. |
| Configuración legible por la página | `sw/config.js` fuera de `lib/**` y de `web_accessible_resources`. |
