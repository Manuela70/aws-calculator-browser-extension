# API Documentation — AWS Calculator RPA Extension

La extensión **no sirve ningún endpoint HTTP propio** (no es un servidor). Sus superficies de API son: (1) el paso de mensajes interno de Chrome entre `popup.js` y `content.js`, y (2) el contrato saliente con el webhook n8n. La manipulación del DOM de `calculator.aws` (CloudScape) no es una API y se documenta como dependencia en `dependencies.md`.

## 1. Mensajes internos de Chrome (`chrome.runtime` message passing)

Transporte: `chrome.runtime.sendMessage` / `chrome.tabs.sendMessage` + `chrome.runtime.onMessage.addListener`. Estado real por mensaje (confirmado en commit `45f888e`):

| Mensaje | Emisor | Receptor / handler | Payload | Estado real |
|---|---|---|---|---|
| `PING` | `popup.js` → `chrome.tabs.sendMessage` | `content.js` listener → `sendResponse({ status: 'OK', url })` | — | OK (detección de content script ya inyectado) |
| `RUN_RPA` | `popup.js` → `chrome.tabs.sendMessage` | `content.js` listener → arranca `runRPA`, `sendResponse({ status: 'started' })` | `{ type: 'RUN_RPA', config }` | OK |
| `PROGRESS` | `content.js` (callback de `runRPA`) | `popup.js` → `setProgress` + `setStatus` | `{ type: 'PROGRESS', pct, text }` | OK (único progreso visible) |
| `PROGRESS_TEXT` | `content.js` (en `addService`, 2 avisos) | **ninguno** — `popup.js` no tiene handler | `{ type: 'PROGRESS_TEXT', text }` | **DROPPED** — se descarta en silencio (hallazgo, agrava P3) |
| `DONE` | `content.js` (al resolver `runRPA`) | `popup.js` → progreso 100%, status éxito, muestra URL | `{ type: 'DONE', url }` | OK |
| `ERROR` | `content.js` (`.catch` global de `runRPA`) | `popup.js` → status error | `{ type: 'ERROR', message }` | OK (único camino de error visible) |
| `DOM_FIELDS` | **nadie** — `content.js` nunca lo envía | `popup.js` tiene handler (logs debug + status "N campos detectados") | `{ type: 'DOM_FIELDS', service, fields, prompt }` | **DEAD HANDLER** — nunca llega (hallazgo) |

Resumen de los desajustes de contrato:
- **`PROGRESS_TEXT`**: emitido por `content.js`, sin handler en `popup.js` → mensajes perdidos.
- **`DOM_FIELDS`**: handler en `popup.js`, nunca emitido por `content.js` → código muerto.

## 2. Contrato del webhook n8n (API saliente — el "cerebro")

- **Endpoint**: `POST https://n8n-retirado.example/webhook/aws-field-mapper` (constante `N8N_MAPPER_URL` en `content.js`).
- **Llamador**: `callN8N(payload)` vía `fetch`, envuelto por `prepareForm()` (ronda 1) y `mapFields()` (ronda 2).
- **Headers**: `Content-Type: application/json`, `Accept: application/json`.
- **Contexto de ejecución**: corre en el contexto de página `calculator.aws` (no hay service worker). El host n8n **no está** en `host_permissions` → expuesto a CORS (raíz de P1).
- **Estado**: **no verificado**. El escaneo es estático; no se comprobó si el webhook responde (requeriría red/ejecución, REVIVAL_PLAN Test C). Tratar como desconocido.

### Request

```json
{ "round": 1, "service": "<nombre>", "domFields": [ ... ], "requestedValues": { ... } }
```

- **`round: 1`** (`prepareForm`): Claude decide qué secciones expandir → devuelve acciones `expand`.
- **`round: 2`** (`mapFields`): Claude mapea `requestedValues` a campos del DOM escaneado → devuelve acciones de relleno (`fill`/`select`/`dropdown`/`radio`/`checkbox`/`instance_search`/`instance_radio`/`toggle_on`/`toggle_off`).
- `domFields`: array de campos serializados por `scanForm()` (`{ section, label, type, ... }`).
- `requestedValues`: los `fields` del servicio pedidos por el usuario.

### Respuesta (formas aceptadas por `callN8N`)

`callN8N` normaliza tres formas y, si ninguna matchea, devuelve `[]`:

1. **Array directo**: `[ { action, label, value, type }, ... ]`.
2. **`{ actions: [...] }`**.
3. **`{ mappedFields: [...] }`** — si `mappedFields` es un string JSON, se reparsea con `JSON.parse`.
4. **Fallback**: `[]` (ante `!response.ok` lanza `N8N <status>`; el `catch` en `prepareForm`/`mapFields` lo convierte en `[]`).

Forma de cada acción consumida por `executeActions`:

```json
{ "action": "fill|select|dropdown|radio|checkbox|instance_search|instance_radio|expand|toggle_on|toggle_off",
  "label": "Sección > Campo", "value": "<valor>", "type": "<opcional>" }
```

> Contrato de confianza: la respuesta del cerebro es una dependencia externa opaca; cualquier fallo o `[]` hace que `executeActions` no llene nada y el flujo continúe sin avisar al usuario (enlaza con P3; ver `code-quality-assessment.md`).

## 3. APIs de plataforma Chrome usadas (consumidas, no servidas)

- `chrome.tabs` — `query`, `update`, `create`, `onUpdated`, `sendMessage` (`popup.js`).
- `chrome.scripting.executeScript` — inyección de `content.js` (`popup.js`).
- `chrome.runtime.sendMessage` / `chrome.runtime.onMessage.addListener` — paso de mensajes (ambos lados).
- `navigator.clipboard.writeText` — copiar la URL del estimado (`popup.js`).
