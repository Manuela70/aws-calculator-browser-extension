# Dependencies — AWS Calculator RPA Extension

## Dependencias externas

### 1. Workflow n8n — el "cerebro" de mapeo (CRÍTICA)

- **Qué**: `POST https://n8n-retirado.example/webhook/aws-field-mapper` (constante `N8N_MAPPER_URL` en `content.js`), que detrás invoca Anthropic Claude.
- **Rol**: toda la inteligencia de mapeo campo↔valor (ronda 1 expand, ronda 2 map). Sin ella, `callN8N` devuelve `[]` y el RPA no llena nada.
- **Riesgos**:
  - **Punto único de fallo**: si el workflow está caído/inactivo, la transacción degrada a vacío **en silencio** (P1 + P3).
  - **CORS (P1)**: el `fetch` corre en el origen `calculator.aws` y el host n8n **falta** en `host_permissions`; sin service worker y sin `Access-Control-Allow-Origin`, el navegador puede bloquear la llamada.
  - **Opacidad / no versionado**: ni el JSON del workflow ni el prompt de Claude están en el repo; cambios fuera de control del código.
  - **Estado no verificado**: el escaneo es estático; no se comprobó la salud del webhook (requeriría REVIVAL_PLAN Test C). Tratar como desconocido.

### 2. DOM de `calculator.aws` / CloudScape Design System (CRÍTICA)

- **Qué**: la SPA de AWS sobre la que el RPA actúa (no es API; es manipulación de DOM).
- **Rol**: superficie objetivo de todas las primitivas de `content.js` (`scanForm`, `resolveElementByLabel`, `selectAwsDropdown`, etc.).
- **Riesgos (P2, no verificado)**:
  - Dependencia de **clases `awsui_*` ofuscadas** por substring (`[class*="awsui_option-content"]`, `awsui_selectable-item`, `awsui_native-input`, `awsui_header`, `awsui_expand`, etc.) y de **textos de botón en inglés** (`"Add service"`, `"Configure"`, `"Save and add service"`, `"Share"`, `"Agree and continue"`, `"Copy public link"`, …).
  - CloudScape evoluciona de forma continua y el código lleva ~14 meses sin tocarse; un cambio de clase o de copy rompe la resolución y, por P3, falla en silencio.
  - **No verificado**: el escaneo estático no puede confirmar si los selectores están stale (requeriría REVIVAL_PLAN Test B contra la UI viva). Tratar como riesgo abierto, no como "funcionando".

### 3. Chrome Extension Platform / Manifest V3 (plataforma)

- **Qué**: runtime del navegador y sus APIs (`chrome.tabs`, `chrome.scripting`, `chrome.runtime`, `navigator.clipboard`).
- **Rol**: hospeda popup y content script y provee el paso de mensajes y la inyección.
- **Riesgos**: cambios de política MV3 (service worker, permisos); hoy, la ausencia de service worker fuerza el `fetch` al contexto de página (contribuye a P1). Permisos muerto/faltante/redundante — ver `technology-stack.md` (P4).

## Dependencias internas (cross-file)

- `popup.js` **inyecta y mensajea** a `content.js` (vía `chrome.scripting.executeScript` + `chrome.runtime`/`chrome.tabs` messages). Acoplamiento por contrato de mensajes.
- `popup.html` **carga** `popup.js` (`<script src="popup.js">`).
- `manifest.json` **declara** `content.js` como content script y `popup.html` como `default_popup`.
- **Riesgo de contrato interno**: el contrato de mensajes tiene dos desajustes — `PROGRESS_TEXT` (emitido sin handler) y `DOM_FIELDS` (handler sin emisor). Ver `api-documentation.md` / `component-inventory.md`. Son deuda de acoplamiento que agrava P3.

## Dependencias de build/test

Ninguna. Sin `package.json`, sin `node_modules/`, sin herramientas de build/test/lint. Ver `technology-stack.md` y `code-quality-assessment.md`.
