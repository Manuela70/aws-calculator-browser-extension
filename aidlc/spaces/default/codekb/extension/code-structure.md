# Code Structure — AWS Calculator RPA Extension

## Organización general

Un único paquete plano, sin monorepo, sin workspaces, sin sub-paquetes. Todo el código de producto vive bajo `aws-calculator-extension/`. Es vanilla JS (ES2018+) cargado como extensión unpacked: **sin paso de build**, sin transpilación ni bundling, sin `package.json`/`tsconfig.json`, sin `node_modules/` ni `dist/`.

```
aws-calculator-extension/
├── manifest.json     (configuración MV3)
├── popup.html        (UI del popup: markup + CSS inline)
├── popup.js          (controlador de UI / orquestador)
├── content.js        (motor RPA inyectado en calculator.aws)
├── icon16.png        (asset)
├── icon48.png        (asset)
├── icon128.png       (asset)
└── REVIVAL_PLAN.md   (diagnóstico previo, documentación)
```

Contexto del repo: `requirements/` (requisitos y flujo de dominio), `aidlc-docs/` (docs previos de RE/requisitos, insumo a verificar) y el workspace AI-DLC bajo `aidlc/` y `.kiro/` — no son código de producto.

## Inventario de archivos (conteos de línea reales, commit `45f888e`)

| Archivo | Líneas | Clasificación | Propósito |
|---|---|---|---|
| `manifest.json` | 31 | Configuration | Configuración MV3: `permissions`, `host_permissions`, `action`/`default_popup`, `content_scripts`. |
| `popup.html` | 224 | Static/Asset (UI) | Markup + CSS inline (bloque `<style>`). Tema oscuro, branding Applying, textos en español. |
| `popup.js` | 150 | Controller | Controlador de UI y orquestador: valida JSON, busca/crea pestaña, inyecta `content.js`, envía `RUN_RPA`, recibe progreso/resultado. |
| `content.js` | 1264 | Service/UseCase (motor RPA) | Motor RPA inyectado en `calculator.aws`: escaneo de DOM, resolución de elementos, ejecución de acciones, orquestación por servicio, llamada al cerebro n8n. |
| `REVIVAL_PLAN.md` | — | Documentation | Diagnóstico previo (verificar cerebro n8n → cargar/reproducir → tests A/B/C → fixes). |
| `icon16/48/128.png` | — | Static/Asset | Iconos de la extensión (`action.default_icon`). |

> Los conteos reemplazan los de los docs previos, que eran erróneos. Fuente: conteo directo sobre disco al commit `45f888e`. No se citan números de línea individuales en estos artefactos porque los rangos de los docs previos quedaron desfasados.

## Organización interna de `content.js` (el hotspot)

Archivo único de 1264 líneas, sin módulos ES ni separación por archivos; funciones agrupadas por bloques con comentarios de sección (en español, de buena calidad). Agrupaciones principales:

- **Constantes y utilidades base**: `DELAY` (SHORT/MEDIUM/LONG/TYPING), `N8N_MAPPER_URL`, `sleep`, `log`, `getText`, `cleanAriaLabel` (FIX-1), `parseUnitButtonLabel` (FIX-2), `isToggleOn`.
- **Cerebro n8n**: `callN8N` (3 formatos de respuesta aceptados), `prepareForm` (ronda 1), `mapFields` (ronda 2).
- **Ejecución de acciones**: `executeActions` (despacha `expand`/`toggle_on`/`toggle_off`/`fill`/`select`/`dropdown`/`radio`/`checkbox`/`instance_search`/`instance_radio`).
- **Esperas y helpers UI**: `waitForButton`, `waitForEstimatePage`, `waitForText`, `findButton`, `mouseClick`, `click`, `fillInput`, `selectNative`.
- **Toggles**: `setToggle` (3 estrategias, FIX-9), `activateToggle`, `deactivateToggle`, `expandAllSections`.
- **Scanner de DOM**: `scanForm` (el "analyzeDOM" de los requisitos) con helpers `resolveSection` (FIX-3), `isUIChrome`, `splitAriaLabel`; detección de `instance_radio` (FIX-5) y radiogroups (FIX-6).
- **Resolución y relleno**: `resolveElementByLabel` (4 estrategias en cascada, FIX-8), `fillByLabel`, `selectAwsDropdown`.
- **Orquestación**: `addService` (flujo de ~11 pasos, mapa de regiones, timing de toggles FIX-7), `saveService`, `renameEstimate`, `shareEstimate`, `runRPA`.
- **Listener**: `chrome.runtime.onMessage.addListener` (atiende `PING` y `RUN_RPA`).

## Patrones de código

- **Resolución en cascada de elementos**: `resolveElementByLabel` prueba 4 estrategias (aria-label exacto → aria-labelledby de botones CloudScape → `label[for]` → desambiguación por sección); `setToggle` usa 3 estrategias análogas.
- **Selección de CloudScape por substring de clase**: `[class*="awsui_..."]` en vez de clases exactas (las clases AWS vienen ofuscadas). Es a la vez una técnica de resiliencia y el riesgo de P2.
- **Simulación de eventos de usuario**: `mouseClick` dispara la secuencia completa (`mouseover`→`mouseenter`→`mousedown`→`mouseup`→`click` + `el.click()`); `fillInput` usa el native value setter + eventos `input`/`change` para compatibilidad con React/CloudScape.
- **Reintentos y timeouts**: `saveService` (3 intentos), `selectAwsDropdown` (6 intentos), `expandAllSections` (5 rondas), `waitForButton/Text/EstimatePage` (polling con timeout).
- **Números mágicos dispersos**: los valores de `DELAY` y los conteos de reintento están incrustados en el código; `DELAY.TYPING` está definido pero **no se usa** (código muerto menor).
- **Degradación silenciosa (P3)**: `callN8N` devuelve `[]` ante error; `executeActions` registra advertencia y continúa; `resolveElementByLabel` devuelve `null` y la acción se omite. Detalle en `code-quality-assessment.md`.
- **Marcadores FIX-1..FIX-9**: parches aplicados, documentados en el comentario de cabecera de `content.js` y en el cuerpo. Detalle y trazabilidad en `code-quality-assessment.md`.
- **Sin anotaciones de tipo** (ni TypeScript ni JSDoc).

## `popup.js` y `popup.html`

- `popup.js` (Controller): registra listeners de UI (`btn-example`, `btn-copy`, `btn-run`) y un `chrome.runtime.onMessage.addListener` que maneja `PROGRESS`, `DOM_FIELDS`, `DONE`, `ERROR`. Orquesta: validar JSON → `tabs.query`/`create` → `PING` → `executeScript` → `RUN_RPA`. **Nota de contrato**: maneja `DOM_FIELDS` (que `content.js` nunca envía) y **no** maneja `PROGRESS_TEXT` (que `content.js` sí emite). Ver `api-documentation.md` / `component-inventory.md`.
- `popup.html` (Static/Asset): markup + CSS inline (tema oscuro, branding Applying, copy en español). Carga `popup.js` al final.
