# Technology Stack — AWS Calculator RPA Extension

## Lenguajes

- **JavaScript (ES2018+)** — lenguaje base de `popup.js` y `content.js` (async/await, spread, optional chaining). Sin versión declarada porque no hay manifiesto de paquete.
- **HTML5 + CSS3** — `popup.html` (estilos inline en bloque `<style>`; tema oscuro, branding Applying, copy en español). Sin framework de UI.
- **JSON** — `manifest.json` (configuración) y el esquema de entrada del popup.

## Plataforma y frameworks

- **Chrome Extension Platform — Manifest V3** (`manifest_version: 3`, versión del paquete `2.0.0`). Chrome ~88+ inferido del requisito de MV3 (no declarado en el código). APIs usadas: `chrome.tabs`, `chrome.scripting`, `chrome.runtime`, `navigator.clipboard`.
- **Sin build system**: vanilla JS cargado como extensión unpacked; sin transpilación ni bundling. No existe `package.json`, `tsconfig.json` ni archivo de build.
- **Sin librerías de terceros**: no hay jQuery, React/Vue/Angular ni utilidades de DOM; no existe `node_modules/` ni imports de paquetes.

## Dependencias de runtime externas (no empaquetadas)

- **Workflow n8n** (`https://n8n-retirado.example/webhook/aws-field-mapper`) — el "cerebro" de mapeo. Crítico; fuera del repo; estado **no verificado**. Ver `dependencies.md`.
- **Anthropic Claude** — invocado detrás del workflow n8n; versión/modelo no visibles desde el código.
- **CloudScape Design System** — framework del **sitio objetivo** (`calculator.aws`), **no** una dependencia de la extensión; es el DOM sobre el que opera el RPA.

## Testing, linting, CI/CD

- **Tests**: ninguno (sin directorios de test, sin frameworks, sin config de cobertura). Verificación solo manual (recarga de extensión + Chrome DevTools).
- **Linting**: ninguna herramienta ni config (`.eslintrc`, etc.).
- **CI/CD**: ningún pipeline (`.github/workflows`, etc.).

Detalle y deuda técnica en `code-quality-assessment.md`.

## Higiene de permisos del manifest (CORRECCIÓN importante)

Los docs previos afirmaban "Principle of Least Privilege: ✅ Only requests necessary permissions" y "Host Permissions: Scoped to calculator.aws and n8n.cloud". **Esto es inexacto.** Estado real al commit `45f888e`:

### `permissions` declarados: `activeTab`, `scripting`, `clipboardWrite`, `tabs`

| Permiso | ¿Usado? | Nota |
|---|---|---|
| `scripting` | Sí | `popup.js` → `chrome.scripting.executeScript` (inyecta `content.js`). |
| `tabs` | Sí | `popup.js` → `chrome.tabs.query/update/create/onUpdated/sendMessage`. |
| `clipboardWrite` | Dudoso / posiblemente redundante | En MV3 la escritura de clipboard por gesto de usuario normalmente no lo requiere. A verificar. |
| `activeTab` | Probablemente inerte | El flujo real opera por `tabs.query({url:'https://calculator.aws/*'})` + `host_permissions`, no por el gesto de `activeTab`. |

### `host_permissions` declarados: `https://calculator.aws/*`, `https://dnd5zrqcec4or.cloudfront.net/*`

| Host | Estado |
|---|---|
| `https://calculator.aws/*` | Correcto y usado (objetivo del content script). |
| `https://dnd5zrqcec4or.cloudfront.net/*` | **MUERTO (P4)** — no referenciado por ningún código; candidato a eliminar. |
| `https://n8n-retirado.example/*` | **FALTANTE (P4 + raíz de P1)** — `content.js` hace `fetch` a ese host desde el contexto de página; al no estar declarado, el `fetch` queda sujeto al CORS de `calculator.aws`. |

### Otros elementos del manifest

- **`action`**: `default_popup: popup.html`, `default_icon` 16/48/128.
- **`content_scripts`**: `matches: ["https://calculator.aws/*"]`, `js: ["content.js"]`, `run_at: "document_idle"`.
- **service worker / `background`**: **NO existe** (sin clave `background` ni `background.js`). Todo el `fetch` corre desde el content script — raíz estructural de la exposición a CORS (P1). Ver `architecture.md`.

Conclusión de higiene: el manifest NO es un ejemplo limpio de mínimo privilegio — faltante crítico (host n8n), permiso muerto (CloudFront) y permisos probablemente inertes/redundantes (`activeTab`, `clipboardWrite`).
