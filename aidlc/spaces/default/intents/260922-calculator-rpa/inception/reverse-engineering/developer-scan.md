# Developer Scan Handoff — AWS Calculator RPA Extension

**Collaborator:** developer
**Conversation language:** Spanish
**Intent:** 260922-calculator-rpa
**Repo:** extension (workspace root)
**Breadth:** FULL (primer escaneo, NO_STORE) · **Depth:** Standard
**Commit:** 45f888e0be2511143434408fb0aa6697fc1400d2

> Nota para el arquitecto (link 2): este documento es el handoff del escaneo. Yo
> (developer, link 1) NO escribo los 9 artefactos de CodeKB; tú los sintetizas a
> partir de aquí. Los nombres de archivo, identificadores, rutas, nombres de API
> y mensajes, y los tokens de encabezado de plantilla se conservan en inglés
> verbatim; la prosa explicativa va en español.

---

## Developer Code Scan Results

### Scan Coverage

- **Analyzed deeply**:
  - `./aws-calculator-extension/manifest.json`
  - `./aws-calculator-extension/popup.html`
  - `./aws-calculator-extension/popup.js`
  - `./aws-calculator-extension/content.js`
  - `./aws-calculator-extension/REVIVAL_PLAN.md`
  - `./requirements/calculator-rpa-requirements.md`
  - `./requirements/constraints.md`
  - `./requirements/AWS Calculator UI Flow.md`
  - `./aidlc-docs/inception/reverse-engineering/` (los 9 docs previos, leídos para validación)
  - `./aidlc-docs/inception/requirements/` (requirement-verification-questions.md, requirement-verification-followup.md)
  - `./aidlc-docs/inception/plans/reverse-engineering-plan.md`
- **Skimmed only**:
  - `./aws-calculator-extension/icon16.png`, `icon48.png`, `icon128.png` (binarios; no se abrieron, solo se registró su presencia como `action.default_icon`)
- **Left out**:
  - `./.git/` (metadatos de control de versiones)
  - `./.kiro/`, `./aidlc/`, `./aidlc.archive/` (workspace y framework AI-DLC; no es código de producto)
  - `./.vscode/` (configuración de IDE)
  - `./body.json` (archivo suelto en raíz, no referenciado por la extensión)

> El código de la extensión es vanilla JS sin paso de build, sin dependencias
> instaladas y sin salida generada; por eso no hay `node_modules/`, `dist/` ni
> similares que excluir. El escaneo profundo cubre el 100% del código fuente del
> producto bajo `./aws-calculator-extension/`.

### Packages Found

- `aws-calculator-extension` — Chrome Extension (Manifest V3) — JavaScript (ES2018+) — RPA que automatiza `calculator.aws` desde un JSON de servicios.

No hay sub-paquetes, monorepo ni workspaces; es un único paquete plano de 4 archivos de código + 3 iconos.

### Build System

- **Type**: Ninguno. Vanilla JS cargado directamente como extensión unpacked; sin transpilación ni bundling.
- **Config Files**: `manifest.json` (configuración de la extensión). No existe `package.json`, `tsconfig.json`, ni archivo de build.
- **Build Dependencies**: Ninguna.

### APIs Discovered

- **Chrome Extension APIs (internas)** — `popup.js` + `content.js` — ver detalle en "Topología de message-passing" abajo.
  - `chrome.tabs` (`query`, `update`, `create`, `onUpdated`, `sendMessage`) — `popup.js`
  - `chrome.scripting.executeScript` — `popup.js` (inyección de `content.js`)
  - `chrome.runtime.sendMessage` / `chrome.runtime.onMessage.addListener` — ambos lados (paso de mensajes)
  - `navigator.clipboard.writeText` — `popup.js` (copiar URL)
- **Webhook externo n8n (saliente)** — `content.js:callN8N()` — 1 endpoint (`POST /webhook/aws-field-mapper`). Ver "El 'cerebro' de mapeo" abajo.
- **DOM de calculator.aws (objetivo RPA)** — `content.js` — no es una API; es manipulación de DOM contra CloudScape (sin backend).

No hay endpoints HTTP servidos por la extensión (no es un servidor).

### Frameworks & Libraries

- JavaScript ES2018+ (async/await, spread, optional chaining) — lenguaje base; sin versión declarada porque no hay manifiesto de paquete.
- Chrome Extension Platform (Manifest V3, Chrome ~88+) — runtime; versión mínima inferida del requisito de MV3, no declarada en el código.
- HTML5 + CSS3 — `popup.html` (estilos inline en bloque `<style>`, tema oscuro, branding Applying). Sin framework de UI.
- Sin librerías de terceros: no hay jQuery, React/Vue/Angular, ni utilidades de DOM. Confirmado: no existe `node_modules/` ni imports de paquetes.
- Dependencias de runtime externas (no empaquetadas): el workflow n8n (`n8n-retirado.example`) y, detrás de él, la Anthropic Claude API. CloudScape Design System es el framework del **sitio objetivo** (AWS), no una dependencia de la extensión.

### Test Coverage

- **Test Directories**: Ninguno.
- **Test Frameworks**: Ninguno.
- **Coverage Config**: Ausente.

No hay tests unitarios, de integración ni e2e; no hay CI/CD. La única verificación es manual (recarga de la extensión + consola de Chrome DevTools). Este hecho es consistente con lo que afirman los docs previos.

### Code Quality Indicators

- **Linting**: Ninguna herramienta ni config (`.eslintrc`, etc.) presente.
- **CI/CD**: Ningún pipeline (`.github/workflows`, etc.) presente.
- **Documentation**: No hay `README.md` del producto. Sí existe `REVIVAL_PLAN.md` (diagnóstico previo, en español) y los comentarios de cabecera en `content.js` que documentan FIX-1..FIX-9. Comentarios inline en español, abundantes y de buena calidad en `content.js`.

### Technical Debt Signals

- **Cerebro externo hardcodeado**: `N8N_MAPPER_URL` fijo en `content.js` (constante al inicio del archivo). Punto único de fallo (P1).
- **Números mágicos**: `DELAY.SHORT/MEDIUM/LONG/TYPING` (600/1200/2500/60 ms) y conteos de reintento (3 intentos en `saveService`, 6 en `selectAwsDropdown`, 5 rondas en `expandAllSections`) dispersos en el código.
- **`DELAY.TYPING` definido pero no usado** — código muerto menor.
- **Fallos silenciosos (P3)**: `callN8N()` captura el error, hace `log()` y devuelve `[]`; `prepareForm()`/`mapFields()` propagan ese `[]`; `executeActions()` registra advertencias y continúa sin lanzar. Nada de esto llega al popup como error. `resolveElementByLabel()` devuelve `null` y la acción se omite en silencio.
- **Desajuste de message-passing (nuevo hallazgo, ver topología)**: `content.js` emite mensajes `PROGRESS_TEXT` que `popup.js` NO maneja (se descartan); `popup.js` maneja `DOM_FIELDS` que `content.js` NUNCA envía (handler muerto).
- **Sin anotaciones de tipo** (ni TypeScript ni JSDoc).
- **`content.js` es un hotspot de complejidad**: ~1264 líneas, un solo archivo, funciones largas (`scanForm`, `fillByLabel`, `addService`).
- **Marcadores FIX-1..FIX-9**: los 9 están presentes y documentados en el comentario de cabecera y en el cuerpo de `content.js`. No son deuda sino parches aplicados; se listan abajo por trazabilidad.
- **`host_permissions` muerto/incompleto (P4)**: ver análisis del manifest.

---

## Inventario de archivos y propósito

| Archivo | Líneas (reales) | Clasificación | Propósito |
|---|---|---|---|
| `manifest.json` | 31 | Configuration | Configuración MV3: permisos, host_permissions, action/popup, content_scripts. |
| `popup.html` | 224 | Static/Asset (UI) | Markup + CSS inline del popup. Tema oscuro, branding Applying, textos en español. |
| `popup.js` | 150 | Controller | Controlador de UI y orquestador: valida JSON, busca/crea pestaña, inyecta `content.js`, envía `RUN_RPA`, recibe progreso/resultado. |
| `content.js` | 1264 | Service/UseCase (motor RPA) | Motor RPA inyectado en `calculator.aws`. Escaneo de DOM, resolución de elementos, ejecución de acciones, orquestación por servicio, llamada al cerebro n8n. |
| `REVIVAL_PLAN.md` | — | Documentation | Diagnóstico previo (3 fases: verificar cerebro n8n → cargar/reproducir → tests de aislamiento A/B/C → fixes). |
| `icon16/48/128.png` | — | Static/Asset | Iconos de la extensión. |

> Las líneas reales difieren de las que reportan los docs previos (ver subsección
> de validación). Fuente: conteo directo sobre los archivos en disco al commit
> `45f888e`.

---

## Configuración Manifest V3 (declarado vs usado vs faltante)

Contenido real de `manifest.json` (v`2.0.0`, `manifest_version: 3`):

**`permissions`** declarados: `activeTab`, `scripting`, `clipboardWrite`, `tabs`.

| Permiso | ¿Usado? | Evidencia |
|---|---|---|
| `scripting` | Sí | `popup.js` → `chrome.scripting.executeScript(...)` para inyectar `content.js`. |
| `tabs` | Sí | `popup.js` → `chrome.tabs.query/update/create/onUpdated/sendMessage`. |
| `clipboardWrite` | Parcial / dudoso | `popup.js` usa `navigator.clipboard.writeText` al copiar la URL. En MV3 la escritura de clipboard en respuesta a un gesto del usuario normalmente no requiere este permiso; podría ser redundante. A verificar por el arquitecto. |
| `activeTab` | No efectivamente | El flujo real opera por `chrome.tabs.query({url:'https://calculator.aws/*'})` + `host_permissions`, no por el gesto de `activeTab`. Permiso probablemente inerte dado el modelo actual. |

**`host_permissions`** declarados: `https://calculator.aws/*`, `https://dnd5zrqcec4or.cloudfront.net/*`.

| Host | Estado | Evidencia |
|---|---|---|
| `https://calculator.aws/*` | Correcto y usado | Objetivo del content script y del `content_scripts.matches`. |
| `https://dnd5zrqcec4or.cloudfront.net/*` | **MUERTO (P4)** | No se referencia en ningún archivo de código. Propósito desconocido. Candidato a eliminar. |
| `https://n8n-retirado.example/*` | **FALTANTE (P4 + raíz de P1)** | `content.js` hace `fetch` a ese host desde el contexto de la página; al no estar en `host_permissions`, el `fetch` queda sujeto al CORS de `calculator.aws`. Esta es la raíz técnica de la fragilidad CORS de P1. |

**`action`**: `default_popup: popup.html`, `default_icon` 16/48/128.
**`content_scripts`**: `matches: ["https://calculator.aws/*"]`, `js: ["content.js"]`, `run_at: "document_idle"`.
**service worker / background**: **NO existe**. No hay clave `background` en el manifest ni archivo `background.js`. Todo el `fetch` al cerebro corre desde el content script (contexto de página), lo que explica la exposición a CORS (P1). El `REVIVAL_PLAN.md` propone precisamente mover el `fetch` a un service worker como fix estructural.

---

## Topología de message-passing (popup ↔ content ↔ n8n)

Flujo nominal:

1. **Usuario → popup**: pega JSON, clic en "⚡ Generar Estimado".
2. **popup → página**: `popup.js` busca pestaña `calculator.aws` (o la crea), hace `PING` vía `chrome.tabs.sendMessage`; si falla, inyecta `content.js` con `chrome.scripting.executeScript`; luego envía `{ type: 'RUN_RPA', config }`.
3. **content (listener)**: `chrome.runtime.onMessage.addListener` atiende `PING` (responde `{status:'OK', url}`) y `RUN_RPA` (arranca `runRPA`, responde `{status:'started'}`).
4. **content → n8n (saliente)**: dentro de `addService`, `callN8N` hace `POST` al webhook (dos rondas: `prepareForm` ronda 1, `mapFields` ronda 2).
5. **content → popup (progreso/resultado)**: `chrome.runtime.sendMessage` con `{type:'PROGRESS', pct, text}`, y al final `{type:'DONE', url}` o `{type:'ERROR', message}`.

**Mensajes que envía `content.js`**: `PING`-response, `PROGRESS`, `PROGRESS_TEXT`, `DONE`, `ERROR`.
**Mensajes que maneja `popup.js`**: `PROGRESS`, `DOM_FIELDS`, `DONE`, `ERROR`.

**Desajustes de contrato (hallazgo nuevo, relevante a P3):**

- `PROGRESS_TEXT`: lo **emite** `content.js` (dos veces, en `addService`: "🤖 Claude preparando…" / "🤖 Claude configurando…") pero `popup.js` **no tiene handler** para él → esos avisos de progreso se **descartan en silencio**. El usuario no ve que el RPA está esperando a Claude.
- `DOM_FIELDS`: lo **maneja** `popup.js` (logs de debug + status "N campos detectados") pero `content.js` **nunca lo envía** → handler muerto.

Estos dos desajustes agravan P3 (fallos/estados invisibles) y no están documentados en los docs previos; el arquitecto debería preservarlos como hallazgos.

---

## El "cerebro" de mapeo (P1)

- **Dónde vive hoy**: fuera del repo, en un workflow n8n. URL hardcodeada en `content.js`: `https://n8n-retirado.example/webhook/aws-field-mapper` (constante `N8N_MAPPER_URL`).
- **Quién lo llama**: `callN8N(payload)` vía `fetch` `POST` desde el contexto de página; envuelto por `prepareForm()` (ronda 1) y `mapFields()` (ronda 2).
- **Forma del request**: `{ round: 1|2, service, domFields, requestedValues }`.
  - `round 1` (prepareForm): Claude decide qué secciones expandir (acciones `expand`).
  - `round 2` (mapFields): Claude mapea `requestedValues` a campos del DOM escaneado (acciones `fill`/`select`/`dropdown`/`radio`/`checkbox`/`instance_search`/`instance_radio`/`toggle_on`/`toggle_off`).
- **Forma de la respuesta**: `callN8N` acepta 3 formatos — array directo, `{actions:[...]}`, `{mappedFields:[...]}` (y `mappedFields` como string JSON se reparsea). Si nada matchea, devuelve `[]`.
- **Por qué P1 lo llama frágil (evidencia en código)**:
  1. **CORS**: el `fetch` corre en el origen `calculator.aws`; sin `Access-Control-Allow-Origin` del webhook (y sin el host en `host_permissions`), el navegador lo bloquea.
  2. **Punto único de fallo**: si el workflow está inactivo/caído, `callN8N` lanza o devuelve vacío.
  3. **Degradación silenciosa (enlaza con P3)**: cualquier fallo o `[]` hace que `executeActions` no llene nada y el flujo continúe como si todo estuviera bien. No hay mensaje al usuario.
- **El cerebro NO está versionado en el repo**: ni el JSON del workflow n8n ni el prompt de Claude están en el código. La lógica de mapeo es una dependencia externa opaca.

---

## Primitivas RPA de content.js y selectores CloudScape (P2)

Primitivas principales (nombres verbatim):

- **`scanForm()`** — (el "analyzeDOM" de los requirements). Enumera inputs (text/number/search), checkboxes/toggles, radios normales, radios de tabla de instancias (`instance_radio`), native `select`, dropdowns CloudScape (`button[aria-haspopup]`/`button[aria-expanded]`), sliders y radiogroups. Resuelve `label` y `section` por campo y serializa a objetos JSON-safe con formato `"Sección > Campo"`. Helpers internos: `resolveSection()`, `isUIChrome()`, `splitAriaLabel()`.
- **`resolveElementByLabel(labelText)`** — del label `"S1 > S2 > Campo"` reconstruye el elemento DOM real con 4 estrategias en cascada (aria-label exacto → aria-labelledby de botones CloudScape incl. botones Unit [FIX-8] → `label[for]` → desambiguación por sección).
- **`executeActions(actions)`** — despacha cada acción de Claude a su handler (`expand`, `toggle_on/off`, o `fillByLabel` para el resto).
- **`fillByLabel(labelText, value, type)`** — ejecuta una acción: instance_search, instance_radio, `__switch__:` (toggle explícito), o resuelve el elemento y actúa según tipo (radio / radiogroup / checkbox / `SELECT` nativo / `BUTTON` dropdown CloudScape / input de texto).
- **`setToggle(name, wantOn)`** — 3 estrategias (label[for] → aria-labelledby [FIX-9] → texto de container `awsui_native-input`).
- **`selectAwsDropdown(buttonEl, value)`** — abre el botón, espera `awsui_option-content`, clickea el `awsui_selectable-item`.
- **`expandAllSections()`** — fallback: expande `button[aria-expanded="false"]` filtrando triggers de dropdown.
- Orquestación: **`addService(svc, isFirstService)`** (flujo de ~11 pasos, incl. mapa de regiones y timing de toggles FIX-7), **`runRPA(config, sendProgress)`** (runner principal), `saveService()`, `renameEstimate()`, `shareEstimate()`.

**Selectores CloudScape de los que depende (los más frágiles para P2):**

- Clases por substring: `[class*="awsui_option-content"]` (opciones de dropdown), `[class*="awsui_selectable-item"]` (items seleccionables), `[class*="awsui_native-input"]` (checkboxes), `[class*="awsui_header"]`, `[class*="awsui_expand"]`, `[class*="awsui_heading"]`, `[class*="awsui_container"]`, `[class*="awsui_card"]`, `[class*="awsui_trigger"]`, `[class*="awsui_section"]`.
- Atributos ARIA: `aria-label`, `aria-labelledby`, `aria-expanded`, `aria-haspopup`, `aria-checked`, `role="radiogroup"/"listbox"/"option"/"row"/"cell"/"gridcell"`.
- Texto de botones (localizable, frágil): `"Add service"`, `"Configure"`, `"Save and add service"`, `"Add to my estimate"`, `"Save"`, `"Share"`, `"Agree and continue"`, `"Edit"`, `"Copy public link"`/`"Copy link"`, `"Search all services"`.

**Por qué P2 es un riesgo real (evidencia):** el código depende de nombres de clase `awsui_*` ofuscados y de textos de botón en inglés; CloudScape evoluciona de forma continua y el código lleva ~14 meses sin tocarse. Un cambio de clase o de copy rompe la resolución y, por P3, falla en silencio.

> Hallazgo importante vs. `AWS Calculator UI Flow.md`: el documento de dominio
> indica que la confirmación de guardado fiable es el **banner verde**
> `Successfully added <Service> estimate.` y que hay **validaciones obligatorias
> bloqueantes** (campos "is required") que deben detectarse antes de asumir éxito.
> El código actual NO detecta ese banner ni los mensajes de error de validación:
> `saveService()` confirma éxito solo por URL `/estimate` o presencia del botón
> `Add service`. Es un gap de robustez a preservar para el arquitecto.

---

## Caminos de manejo de errores y fallos silenciosos (P3)

| Lugar | Comportamiento | ¿Visible al usuario? |
|---|---|---|
| `callN8N` (catch en `prepareForm`/`mapFields`) | `log()` + devuelve `[]` | No |
| `executeActions` (catch por acción) | `log()` advertencia, continúa | No |
| `resolveElementByLabel` → `null` | `log()`, acción omitida | No |
| `selectAwsDropdown` opción no hallada | `log()`, `return false` | No |
| `addService` (catch por servicio) | `log()`, vuelve a `/estimate`, sigue con el siguiente | No |
| `PROGRESS_TEXT` emitido por content | — | No (sin handler en popup) |
| `runRPA` error global | `.catch` → `{type:'ERROR'}` al popup | Sí (único camino visible) |

Solo el error global de `runRPA` llega al popup. Los fallos parciales (cerebro vacío, selector stale, campo no resuelto) son invisibles: el usuario puede recibir una URL de un estimado incompleto creyendo que todo salió bien. Esto confirma y precisa P3.

---

## Marcadores FIX-1..FIX-9 (presentes en content.js)

Los 9 están en el comentario de cabecera y aplicados en el cuerpo. Resumen por trazabilidad (sin repetir el detalle del código):

- **FIX-1** `cleanAriaLabel()` — quita placeholders embebidos en aria-label (CloudWatch, KMS, SageMaker, ELB, WAF).
- **FIX-2** `parseUnitButtonLabel()` — parsing semántico (no posicional) de botones Unit (ELB, WAF).
- **FIX-3** `resolveSection()` — fallback a heading precedente cuando no hay `role="group"` (CloudWatch).
- **FIX-4** `scanForm()` toggles — label por `aria-labelledby` cuando no hay `label[for]` (Bedrock, SageMaker).
- **FIX-5** `scanForm()` — detecta `instance_radio` por contexto de fila de tabla (EC2).
- **FIX-6** `scanForm()` — nombre legible de radiogroup desde su heading (EC2 pricing).
- **FIX-7** `addService()` — aplica toggles `__switch__` ANTES del primer `scanForm` (campos condicionales: Bedrock, SageMaker).
- **FIX-8** `resolveElementByLabel()` — resolución de botones Unit por `aria-labelledby` reconstruido (ELB, WAF).
- **FIX-9** `setToggle()` — búsqueda por `aria-labelledby` además de `label[for]` (Bedrock, SageMaker).

---

## Validación de los docs previos de RE vs código actual

> Los docs previos (`aidlc-docs/inception/reverse-engineering/`, v1.0, 2026-07-15)
> se tratan como **insumo a verificar**, no como verdad. Veredictos contra el
> código en commit `45f888e`.

| Doc previo | Veredicto | Especificidad |
|---|---|---|
| `summary.md` | **PARTIALLY-OUTDATED** | Conteos de líneas erróneos (ver abajo). Lista "visual spotlight feedback" y "ReAct mode" como capacidades/características existentes del v6 — **no están en el código**. Afirma "42 functions / 18 modules" (no verificado 1:1; el conteo de líneas sí es incorrecto). Errata crítica: en "Critical Dependencies" escribe la URL del webhook como `n8n-retirado.example` (falta una `a`), cuando el código usa `n8n-retirado.example`. Los P1–P4 y FIX-1..FIX-9 sí son correctos. |
| `business-overview.md` | **PARTIALLY-OUTDATED** | Afirma como *strength* actual: "Visual spotlight feedback during RPA execution" y el paso "5. Visual Feedback: Spotlight overlay shows RPA progress in real-time". **No existe código de spotlight/overlay** en `content.js` ni `popup.js` (confirmado por búsqueda: 0 coincidencias de spotlight/overlay/z-index/box-shadow/pointer-events). El spotlight es un **requisito futuro** (FR5 en `calculator-rpa-requirements.md`, y la constraint de overlay), no una funcionalidad implementada. El resto (problema de negocio, valor, personas, transacciones) es CONFIRMED. |
| `architecture.md` | **CONFIRMED** (con una omisión) | El diagrama de contexto y el flujo de 10 pasos coinciden con el código. Correctamente nota que NO hay service worker implícito (todo el fetch desde content). Omisión: no menciona los desajustes de mensajes `PROGRESS_TEXT`/`DOM_FIELDS`. |
| `code-structure.md` | **PARTIALLY-OUTDATED** | Tabla de archivos con líneas **incorrectas**: dice `content.js` 1,193 (real **1264**), `popup.js` 88 (real **150**), `popup.html` 147 (real **224**), `manifest.json` 26 (real **31**). Todos los números de línea citados (p.ej. "lines 1126-1175", "content.js:702") derivan de esa base y están desfasados. La descripción funcional de módulos/funciones es sustancialmente correcta. Lista bien los fallos silenciosos (P3). |
| `component-inventory.md` | **PARTIALLY-OUTDATED** | Mismos conteos de línea erróneos y rangos de línea desfasados. La clasificación de componentes y responsabilidades es correcta. El contrato de mensajes que lista para `popup.js` incluye `DOM_FIELDS` pero no advierte que `content.js` nunca lo envía, ni que `PROGRESS_TEXT` no tiene handler. |
| `technology-stack.md` | **CONFIRMED** (con matices) | Stack correcto (MV3, vanilla JS, sin build, sin tests, CloudScape como sitio objetivo, n8n+Claude). Matices: afirma "Principle of Least Privilege: ✅ Only requests necessary permissions" y "Host Permissions: Scoped to calculator.aws and n8n.cloud" — **inexacto**: el host de n8n NO está en `host_permissions` (falta) y hay un host muerto (`dnd5zrqcec4or.cloudfront.net`). Clasifica CORS como "P1 issue" (consistente). |
| `dependencies.md` | **CONFIRMED** | Las 3 dependencias (n8n crítico, calculator.aws, Chrome MV3) y sus riesgos son correctas. URL del webhook correcta aquí (`manuelaballen`). Doc breve, sin conteos de línea, sin desajustes. |
| `interaction-diagrams.md` | **NOT-REVIEWED (no bloqueante)** | El archivo existe pero no se incluyó en el cuerpo validado de este escaneo con detalle de diagramas; por el flujo de 10 pasos coincidente en `architecture.md`/`business-overview.md` se asume mayormente CONFIRMED. El arquitecto debe revalidar los diagramas Mermaid contra la topología real, en particular incorporar `PROGRESS_TEXT`/`DOM_FIELDS`. |
| `known-issues.md` | **CONFIRMED** (con rangos de línea desfasados) | P1–P4 y FIX-1..FIX-9 son correctos y bien evidenciados; la URL del webhook está bien escrita. Los números de línea citados (p.ej. "Line 1126-1175", "content.js:702/717/377") están desfasados por la base de conteo errónea. El plan de tests A/B/C espeja `REVIVAL_PLAN.md`. |

**Resumen de los desajustes más importantes a corregir por el arquitecto:**

1. **Spotlight NO implementado** (contra `summary.md` y `business-overview.md`): es requisito futuro (FR5 + constraint), no capacidad actual.
2. **Conteos y números de línea** en `summary.md`, `code-structure.md`, `component-inventory.md`, `known-issues.md`: usar los reales (`content.js` 1264, `popup.js` 150, `popup.html` 224, `manifest.json` 31).
3. **Errata de URL** en `summary.md` (`manuelabellen` → `manuelaballen`).
4. **Permisos del manifest**: `technology-stack.md` sobreestima la higiene de permisos; el host de n8n FALTA y hay un host MUERTO.
5. **Desajustes de message-passing** (`PROGRESS_TEXT` sin handler; `DOM_FIELDS` nunca enviado): ningún doc previo los documenta; agravan P3.
6. **ReAct mode**: los docs lo tratan como futuro (correcto), pero `calculator-rpa-requirements.md` FR1 lo exige como selector de modo en el popup; el código **no tiene selector de modo** — es un gap requisito↔código a trazar.
7. **Detección de banner de éxito y de validaciones obligatorias** (per `AWS Calculator UI Flow.md`): no implementada; `saveService()` asume éxito por URL/botón.

---

## Handoff Summary

- **Intent-relevant finding**: El cerebro de mapeo vive 100% fuera del repo en el webhook n8n hardcodeado en `content.js` (`N8N_MAPPER_URL = https://n8n-retirado.example/webhook/aws-field-mapper`), invocado por `callN8N` vía `fetch` desde el contexto de página; su host **no está en `host_permissions`** y no hay service worker, lo que es la raíz técnica exacta de P1 (CORS + punto único de fallo) y, combinado con el retorno `[]` silencioso, de P3. Este es el hallazgo central para la revivida.
- **Risks / follow-up**:
  - Preservar los conteos reales de línea (content.js 1264 / popup.js 150 / popup.html 224 / manifest.json 31) y descartar los números de línea de los docs previos.
  - Preservar que el **spotlight (FR5) NO está implementado** — es trabajo pendiente, no una capacidad del v6; corregir `summary.md` y `business-overview.md`.
  - Preservar los dos **desajustes de message-passing** (`PROGRESS_TEXT` sin handler, `DOM_FIELDS` handler muerto) como evidencia adicional de P3.
  - Preservar el **gap de robustez de guardado**: no se detecta el banner verde de éxito ni los mensajes de validación obligatoria (per `AWS Calculator UI Flow.md`).
  - Preservar el **gap ReAct**: FR1 pide selector de modo Create Calculator | ReAct; el popup actual no lo tiene.
  - P2 sigue sin verificar contra la UI viva de `calculator.aws`: los selectores `awsui_*` y los textos de botón en inglés son el riesgo; el escaneo estático no puede confirmar si están stale (requeriría ejecutar REVIVAL_PLAN Test B).
  - No se verificó el estado del webhook n8n (requiere red/ejecución; REVIVAL_PLAN Test C). Tratar su estado como desconocido.
