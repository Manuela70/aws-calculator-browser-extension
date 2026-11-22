# Diseño de seguridad — u1-walking-skeleton

> Cómo se implementan los requisitos de seguridad del skeleton: manifest de
> mínimo privilegio, aislamiento de la carga de módulos, validación de mensajes
> y de datos de la página, inserción segura en el panel y tratamiento de lo
> guardado. Sin autenticación de usuario, sin red propia y sin credenciales.
> Prosa en español; identificadores en inglés.

## Sources

- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u1-walking-skeleton/nfr-requirements/security-requirements.md` (NFR4.1-NFR4.5, NFR5.1-NFR5.8, modelo STRIDE). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u1-walking-skeleton/nfr-requirements/tech-stack-decisions.md` (ajustes al Diseño Funcional, `minimum_chrome_version`). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u1-walking-skeleton/functional-design/functional-spec.md` (§2 módulos, §3 mensajes). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/contract-design/contract-summary.md` (autenticación del cerebro reservada a header; fuera del skeleton). [stage]
- `nfr-design-questions.md` de esta unidad: Q2 (el panel no muestra el contenido técnico). [Q2]

## 1. Manifest (NFR4.1-NFR4.5, NFR7.3)

Forma final del manifest del skeleton (solo las claves con decisión de seguridad):

```json
{
  "manifest_version": 3,
  "minimum_chrome_version": "116",
  "permissions": ["tabs", "scripting", "sidePanel", "storage", "unlimitedStorage"],
  "host_permissions": ["https://calculator.aws/*"],
  "background": { "service_worker": "background.js", "type": "module" },
  "side_panel": { "default_path": "sidepanel.html" },
  "content_scripts": [{ "matches": ["https://calculator.aws/*"], "js": ["content.js"], "run_at": "document_idle" }],
  "web_accessible_resources": [{ "resources": ["lib/*", "lib/*/*"], "matches": ["https://calculator.aws/*"], "use_dynamic_url": true }]
}
```

- Sin `action.default_popup`; `background.js` llama `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` al instalarse.
- Sin `content_security_policy` propia: se usa la CSP por defecto de MV3 (sin `unsafe-eval`, sin scripts remotos).
- Revisión obligatoria en cada cambio del manifest: la lista de `permissions` y `host_permissions` debe coincidir exactamente con la de arriba (comprobable con un test de Zona A que lea `manifest.json`).

## 2. Carga de módulos (NFR5.5, BR2.5)

- `content.js` solo hace `import(chrome.runtime.getURL("lib/content-main.js"))`; los demás módulos se importan con rutas relativas dentro de `lib/`. Ningún `import()` recibe una URL construida con datos de la página o del JSON.
- `use_dynamic_url: true` cambia la URL de los recursos expuestos por sesión, lo que dificulta que otras páginas detecten la extensión; los recursos solo se exponen a `calculator.aws`.

## 3. Validación en los bordes (NFR5.6, NFR5.7, C6)

| Borde | Validación |
|---|---|
| Mensajes entrantes al content script | `sender.id === chrome.runtime.id`; `type` en la lista de `lib/messages.js`; forma del payload validada (`RunRequest`: `runId` texto, `services` lista no vacía) antes de actuar. Lo que no valida se ignora y se registra como `warn`. |
| Mensajes entrantes al panel | `PROGRESS`/`RUN_RESULT` solo si `runId` coincide con la corrida en curso. |
| JSON del SE | BR1.1-BR1.4 (forma, tipos, longitudes, región conocida) en `json-parser`/`input-normalizer`. |
| Texto leído de calculator.aws | Se trata como texto: etiquetas y opciones solo se comparan; el enlace de Share se acepta solo si `new URL(x)` es válida, `protocol === "https:"` y `hostname === "calculator.aws"`. |

Todas estas validaciones viven en `lib/validation.js` (Zona A, con tests).

## 4. Inserción segura en el panel (NFR5.4)

- Todo texto se inserta con `textContent`; no se usa `innerHTML`, `insertAdjacentHTML` ni `outerHTML` en ninguna parte del bundle (regla de ESLint `no-restricted-properties` / `no-restricted-syntax` sobre esos nombres, más `no-eval`, `no-implied-eval`, `no-new-func`).
- El enlace del estimado se construye con `document.createElement("a")`, `href` validado como en §3, `rel="noopener noreferrer"` y `target="_blank"`.
- Por Q2, el panel nunca muestra el contenido técnico del registro (selectores, mensajes técnicos): solo lista las corridas por fecha, veredicto y tamaño, y ofrece exportar o borrar.

## 5. Datos guardados (NFR5.1-NFR5.3, NFR4.4)

| Clave | Contenido | Clasificación | Ciclo de vida |
|---|---|---|---|
| `activeRun` | `runId`, `tabId`, último progreso, latido | Interno | Se borra al cerrar la corrida |
| `lastRunResult` | `RunResult` (incluye enlace público del estimado) | Interno | Se reemplaza en cada corrida; el SE puede borrarlo |
| `runLogIndex` | Una fila por corrida (fechas, veredicto, tamaño, nº de trozos) | Interno | Hasta que el SE lo borre |
| `runLog:<runId>:<n>` | Trozos del registro técnico | Interno | Hasta que el SE lo borre |

- Nunca se guarda una credencial ni un token (no existen en el skeleton). El formateador del registro solo acepta campos de una lista permitida (hora, secuencia, nivel, paso, mensaje, etiqueta/selector, valor pedido) para que nada inesperado termine persistido.
- Exportar: el panel arma el `.json` en memoria y lo descarga con un enlace `blob:` y el atributo `download`, sin el permiso `downloads`.
- Borrar: "Borrar esta corrida" quita sus trozos y su fila del índice; "Borrar todo" quita todas las claves del índice, el índice y `lastRunResult`. Ambos botones están deshabilitados mientras hay una corrida en curso, para que el panel nunca borre claves que el escritor de la pestaña está usando.

## 6. Trazabilidad con STRIDE

Cada amenaza del modelo de `security-requirements.md` §3 queda cubierta así: suplantación de mensajes → §3 (`sender.id`); manipulación del DOM → relectura + banner + verificación del estimado (diseño de fiabilidad); detección de la extensión → §2; registro en el perfil → §5; crecimiento del registro → indicador de tamaño y borrado (§5, diseño de escalabilidad); XSS en el panel → §4.
