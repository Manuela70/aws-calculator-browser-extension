# Requisitos de seguridad — u7-packaging

> Requisitos de seguridad del empaquetado: `manifest.json` con mínimo
> privilegio, estructura del bundle, cliente del cerebro en el service worker
> (login, token y llamadas HTTP, según "Cambios de NFR Requirements" del
> contrato) y el futuro `.zip` sin build step. Prosa en español; identificadores
> en inglés. Cada requisito hereda su ID de inception (`NFRx.y`). Esta unidad no
> abrió preguntas: las respuestas de u4 (login con token en sesión) y las reglas
> del proyecto fijan los criterios.

## Sources

- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/requirements-analysis/requirements.md` (NFR1, NFR4, NFR5, NFR7). [requirements]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/contract-design/contract-summary.md` (C1-C3, "Cambios de NFR Requirements": token, códigos de error, `BRAIN_CALL` y `BRAIN_CANCEL`). [stage]
- `aidlc/spaces/default/codekb/extension/technology-stack.md` (manifest actual: host CloudFront muerto, permisos). [brownfield]
- Reglas afirmadas en `aidlc/spaces/default/memory/project.md` (Mandated: MV3, `host_permissions` mínimos, sin build step, cero dependencias de runtime; Forbidden: credenciales de larga vida en el cliente, código remoto o dinámico). [team-practices]

## 1. Superficie de ataque

| Elemento | Frontera de confianza | Datos que cruzan |
|---|---|---|
| `manifest.json` | Define todo lo que la extensión puede tocar | Permisos, hosts, CSP, recursos accesibles |
| Service worker (`background.js`) | Contexto confiable de la extensión | Token del SE, pedidos y respuestas del cerebro |
| Proveedor de identidad (login) | Externo, vía `chrome.identity.launchWebAuthFlow` | Código de autorización y token de acceso |
| Endpoint del cerebro | Externo, HTTPS | C1-C3 con `Authorization: Bearer` |
| `.zip` de distribución | Artefacto que sale del repositorio | Solo el contenido de `aws-calculator-extension/` |

## 2. Requisitos

### NFR4 — Mínimo privilegio

| ID | Requisito | Criterio de verificación |
|---|---|---|
| NFR4.1 | `host_permissions` contiene exactamente `https://calculator.aws/*`, el host del cerebro y el host del proveedor de identidad, y ninguno más; el host CloudFront muerto `https://dnd5zrqcec4or.cloudfront.net/*` no aparece. | `scripts/check-bundle.js` compara la lista con la permitida y falla si difiere. |
| NFR4.2 | `permissions` contiene solo lo usado: `tabs`, `scripting`, `sidePanel`, `storage`, `unlimitedStorage` (justificado en u1) e `identity` (login). | Mismo chequeo automático. |
| NFR4.3 | `web_accessible_resources` expone solo `lib/**`, con `matches` en `https://calculator.aws/*` y `use_dynamic_url: true`. | Mismo chequeo automático. |
| NFR4.4 | La CSP de páginas de la extensión es la de MV3 por defecto o más estricta (`script-src 'self'`); no se agrega `unsafe-eval` ni orígenes remotos. | Mismo chequeo automático. |

### NFR5 — Credenciales

| ID | Requisito | Criterio de verificación |
|---|---|---|
| NFR5.1 | El bundle no contiene claves, tokens ni secretos; la URL del cerebro y el `clientId` público del proveedor de identidad viven en `sw/config.js`, fuera de `lib/**` y de `web_accessible_resources`, así que la página no puede leerlos (no son secretos, pero u5 NFR4.2 exige que `lib/**` no contenga URL del cerebro ni configuración). | Escaneo de secretos del bundle en `check:bundle`. |
| NFR5.2 | Solo el service worker guarda el token, en `chrome.storage.session` con `setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })`; nunca en `storage.local`, `storage.sync` ni en el registro técnico. | Prueba: el content script no lee la clave; búsqueda de la clave en el código. |
| NFR5.3 | Solo el service worker hace `fetch` al cerebro, por el borde `BRAIN_CALL` / `BRAIN_CANCEL`; agrega el token y el `X-Request-Id`, y aborta el `fetch` al recibir `BRAIN_CANCEL`. Solo acepta mensajes de la propia extensión (`sender.id === chrome.runtime.id`) y aplica NFR5.5. | Pruebas de Zona A del cliente con `fetch` y `chrome.runtime` simulados. |
| NFR5.4 | Un 401 `unauthorized` borra el token y devuelve `unauthorized` al llamador; nunca reintenta con el mismo token. | Prueba del cliente con respuesta 401 simulada. |
| NFR5.5 | Lista permitida por contexto: un mensaje de un content script (`sender.tab` presente y URL en `https://calculator.aws/`) solo puede pedir `map-residue`; las páginas de la extensión (panel lateral, sin `sender.tab`) pueden pedir `interpret` y `waf-evaluate`. Cualquier otra combinación, una `operation` desconocida o un `body` de más de 256 KB se rechaza en el service worker con `bad_request` sin llamar al cerebro. | Pruebas de Zona A del enrutador con cada combinación permitida y prohibida. |
| NFR5.6 | Ciclo del login: (a) solo el panel inicia el login, siempre por una acción del SE; un `BRAIN_CALL` sin token desde el content script devuelve `unauthorized` sin abrir ventanas; (b) hay un solo `launchWebAuthFlow` a la vez y los pedidos concurrentes del panel esperan ese mismo login; (c) si el SE cierra o cancela el flujo, todos los pedidos en espera reciben `login_cancelled` (mensaje en español, sin reintento); (d) el service worker guarda el vencimiento del token y lo trata como ausente desde 60 s antes de vencer; (e) antes de iniciar una corrida, el panel exige que queden al menos 15 minutos (u4) y si no pide un login nuevo; (f) no se pide ni se guarda refresh token: al vencer, el SE vuelve a iniciar sesión; (g) un `BRAIN_CANCEL` solo cancela un `callId` creado por el mismo remitente (misma pestaña o misma página). El host del proveedor de identidad se declara porque el service worker hace `fetch` a su endpoint de token (intercambio del código con PKCE). | Pruebas de Zona A del gestor de sesión con `chrome.identity` simulado: login único con 3 pedidos concurrentes, cancelación, vencimiento cercano. |

### NFR3 — Errores visibles en el borde del cerebro

| ID | Requisito | Criterio de verificación |
|---|---|---|
| NFR3.1 | El service worker traduce cada respuesta del cerebro a `{ ok: false, error: { code, message, requestId } }` con el `code` del contrato (incluidos `unauthorized`, `rate_limited`, `daily_quota_exceeded`, `inventory_unavailable`) y su mensaje en español; un `code` desconocido se trata como `internal_error`, y un fallo de red o CORS como `brain_unavailable`. Nunca devuelve `ok: true` con un cuerpo que no valida contra el esquema de la operación. | Pruebas de Zona A con cada código, uno desconocido, un error de red y un cuerpo 200 inválido. |

### NFR8 — Tope de tiempo en el borde

| ID | Requisito | Criterio de verificación |
|---|---|---|
| NFR8.1 | Cada `BRAIN_CALL` tiene un tope total de 30 s en el service worker, que incluye el único reintento permitido: ante `rate_limited` reintenta una vez tras `retryAfterSeconds` solo si la espera más 12 s caben en lo que queda del tope; no hay otros reintentos. Vencido el tope responde `timeout` y aborta el `fetch`. | Pruebas con temporizadores falsos: `rate_limited` con 5 s (reintenta), con 25 s (no reintenta), cerebro que no responde (timeout a los 30 s). |

### NFR1 — Hogar del cerebro y reversibilidad

| ID | Requisito | Criterio de verificación |
|---|---|---|
| NFR1.1 | Cambiar el hogar del cerebro (n8n o proxy) solo cambia `sw/config.js` y el host en `host_permissions`; ningún otro archivo. | Revisión: la URL aparece solo en esos dos lugares. |

### NFR7 — Empaquetado sin build step

| ID | Requisito | Criterio de verificación |
|---|---|---|
| NFR7.1 | El bundle se carga unpacked tal como está en `aws-calculator-extension/`, sin transpilar ni empaquetar; `manifest_version` es 3. | Carga en `chrome://extensions` y `check:bundle`. |
| NFR7.2 | El futuro `.zip` se genera con un script que solo comprime `aws-calculator-extension/` (sin `node_modules`, tests ni archivos del workflow) y verifica la lista de archivos contra el bundle. | Prueba del script sobre una copia; lista de entradas del `.zip`. |
