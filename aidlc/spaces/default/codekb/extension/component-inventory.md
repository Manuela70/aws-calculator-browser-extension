# Component Inventory — AWS Calculator RPA Extension

Inventario completo de componentes del producto, con responsabilidades y dependencias. Los conteos de línea y la estructura de archivos están en `code-structure.md`; el detalle de los contratos de mensajes y del webhook está en `api-documentation.md`.

## popup (UI / orquestador)

- **Archivos**: `popup.html` (Static/Asset), `popup.js` (Controller).
- **Contexto**: página del popup de la extensión (fuera de `calculator.aws`).
- **Responsabilidades**: capturar y validar el JSON de entrada; localizar o crear la pestaña `calculator.aws`; detectar/inyectar `content.js`; disparar `RUN_RPA`; mostrar progreso, estado y URL del estimado; copiar la URL al portapapeles.
- **Depende de**: `chrome.tabs`, `chrome.scripting`, `chrome.runtime`, `navigator.clipboard`; y del componente `content` (vía mensajes).
- **Anomalías**: maneja `DOM_FIELDS` (nunca enviado → handler muerto) y **no** maneja `PROGRESS_TEXT` (emitido por `content` → mensajes descartados).

## content (motor RPA)

- **Archivo**: `content.js` (Service/UseCase, 1264 líneas).
- **Contexto**: inyectado en `https://calculator.aws/*` (`content_scripts` + inyección manual del popup).
- **Responsabilidades**: escanear el DOM (`scanForm`), resolver elementos por etiqueta (`resolveElementByLabel`), ejecutar acciones (`executeActions`), orquestar el flujo por servicio (`addService`, `runRPA`), guardar/renombrar/compartir el estimado, y consultar al cerebro n8n (`callN8N`).
- **Depende de**: el DOM de `calculator.aws` (CloudScape), el webhook n8n, `chrome.runtime` (mensajes). Ver `dependencies.md`.

### Sub-componentes funcionales de content.js (responsabilidades)

| Sub-componente | Responsabilidad |
|---|---|
| `callN8N` / `prepareForm` / `mapFields` | Cliente del cerebro n8n (rondas 1 y 2); normaliza respuesta o devuelve `[]`. |
| `scanForm` (+ `resolveSection` FIX-3, `isUIChrome`, `splitAriaLabel`) | Enumera campos del DOM (text/number, checkbox/toggle, radio, `instance_radio` FIX-5, native select, dropdown CloudScape, slider, radiogroup FIX-6) con `label`/`section`. |
| `resolveElementByLabel` (FIX-8) | Reconstruye el elemento DOM desde un label `"S1 > S2 > Campo"` (4 estrategias en cascada). |
| `executeActions` | Despacha cada acción de Claude a su handler. |
| `fillByLabel` | Ejecuta una acción concreta según tipo (instance_search, instance_radio, `__switch__:`, radio/radiogroup/checkbox/native select/dropdown CloudScape/input de texto). |
| `setToggle` (FIX-9) / `activateToggle` / `deactivateToggle` | Activa/desactiva toggles switch (3 estrategias). |
| `selectAwsDropdown` | Abre un dropdown CloudScape y selecciona la opción. |
| `expandAllSections` | Expande secciones colapsadas (fallback, 5 rondas). |
| `addService` (FIX-7) | Flujo por servicio (~11 pasos): Add service → Search all services → Configure → región → toggles → scan → cerebro → acciones → save. |
| `saveService` | Guarda el servicio (3 reintentos). Confirma éxito solo por URL `/estimate` o botón `Add service` — **no** detecta el banner verde ni errores de validación (gap vs `AWS Calculator UI Flow.md`). |
| `renameEstimate` | Renombra el estimado (botón `Edit` → input → `Save`). |
| `shareEstimate` | Share → `Agree and continue` → `Copy public link`/`Copy link`; devuelve la URL pública. |
| `runRPA` | Runner principal; itera servicios y emite `PROGRESS`. |
| Listener `chrome.runtime.onMessage` | Atiende `PING` y `RUN_RPA`. |

## Assets

- `icon16.png`, `icon48.png`, `icon128.png` (Static/Asset): iconos de `action.default_icon`.

## Cerebro de mapeo n8n (externo, NO versionado)

- **Qué es**: workflow n8n (`n8n-retirado.example`) que invoca Anthropic Claude para decidir expansiones (ronda 1) y mapear valores a campos (ronda 2).
- **Responsabilidad**: toda la "inteligencia" de mapeo campo↔valor.
- **Estado**: fuera del repo (ni el JSON del workflow ni el prompt están versionados); host **faltante** en `host_permissions`; disponibilidad **no verificada**. Punto único de fallo (P1). Ver `dependencies.md`.

## Contrato de mensajes (con anomalías)

Resumen del contrato interno popup ↔ content (detalle y payloads en `api-documentation.md`):

- **OK**: `PING`, `RUN_RPA`, `PROGRESS`, `DONE`, `ERROR`.
- **Anomalía — `PROGRESS_TEXT`**: emitido por `content.js`, sin handler en `popup.js` → **descartado**.
- **Anomalía — `DOM_FIELDS`**: con handler en `popup.js`, nunca emitido por `content.js` → **handler muerto**.

Ambas anomalías son hallazgos nuevos (no documentados por los docs previos) y agravan los fallos invisibles de P3.
