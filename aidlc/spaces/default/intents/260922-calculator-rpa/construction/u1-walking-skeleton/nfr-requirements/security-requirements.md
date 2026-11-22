# Requisitos de seguridad — u1-walking-skeleton

> Requisitos de seguridad del walking skeleton: extensión MV3 unpacked con panel
> lateral, content script en `https://calculator.aws/*`, módulos ES cargados por
> `import()` dinámico y persistencia local. Sin red propia (no hay cerebro en
> el skeleton), sin autenticación de usuario y sin credenciales. Prosa en
> español; identificadores en inglés. Cada requisito hereda su ID de inception
> (`NFRx.y`).

## Sources

- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/requirements-analysis/requirements.md` (NFR4 mínimo privilegio, NFR5 secretos, C2, C6). [requirements]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u1-walking-skeleton/functional-design/functional-spec.md` (estructura de módulos, manifest, contrato de mensajes, persistencia). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u1-walking-skeleton/functional-design/rules.md` (BR2.5, BR6.3, BR6.5, BR6.6). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/contract-design/contract-summary.md` (autenticación del cerebro reservada a header; no aplica al skeleton). [stage]
- `aidlc/spaces/default/codekb/extension/technology-stack.md` (higiene actual del manifest: CloudFront muerto, `activeTab`/`clipboardWrite` dudosos). [brownfield]
- `nfr-requirements-questions.md` de esta unidad: Q1 (mínimo privilegio ya), Q5 (registro sin límite), Q7 (`unlimitedStorage`). [Q1, Q5, Q7]
- Reglas afirmadas en `aidlc/spaces/default/memory/project.md` (Forbidden: credenciales en el cliente, código dinámico; Mandated: `host_permissions` mínimos, cero dependencias de runtime). [team-practices]

## 1. Superficie de ataque del skeleton

| Elemento | Frontera de confianza | Datos que cruzan |
|---|---|---|
| Panel lateral (página de la extensión) | Origen `chrome-extension://` (confiable) | JSON pegado por el SE |
| `content.js` + `lib/**` en `calculator.aws` | Mundo aislado del content script dentro de una página de terceros | `RunRequest`, DOM escaneado, `RunResult` |
| DOM de `calculator.aws` (CloudScape) | No confiable (terceros) | Etiquetas, opciones, banner, enlace de Share |
| `chrome.storage.local` | Local al perfil del navegador | `lastRunResult`, `activeRun`, registro técnico |
| `web_accessible_resources` (`lib/**`) | Recursos que la página puede pedir por URL | Código de la extensión (sin secretos) |

## 2. Requisitos

### NFR4 — Mínimo privilegio

| ID | Requisito | Criterio de verificación |
|---|---|---|
| NFR4.1 | `permissions` del manifest son exactamente `tabs`, `scripting`, `sidePanel`, `storage` y `unlimitedStorage`. Se eliminan `activeTab` y `clipboardWrite` (copiar la URL usa `navigator.clipboard` dentro de un clic del SE en el panel). | Revisión del `manifest.json`: la lista coincide exactamente; el botón de copiar funciona sin `clipboardWrite` (smoke). |
| NFR4.2 | `host_permissions` es exactamente `https://calculator.aws/*`. Se elimina `https://dnd5zrqcec4or.cloudfront.net/*`. El host del cerebro lo añade U7 cuando exista. | Revisión del manifest; búsqueda en el código: ningún `fetch` a otro host. |
| NFR4.3 | `content_scripts` y `web_accessible_resources` se restringen a `https://calculator.aws/*`. `web_accessible_resources` expone solo `lib/**` y usa URL dinámica (`use_dynamic_url: true`) para dificultar que otras páginas detecten la extensión. | Revisión del manifest. |
| NFR4.4 | `unlimitedStorage` se justifica únicamente por el registro técnico sin límite (Q5/Q7) y se documenta así en el manifest y en `tech-stack-decisions.md`. Si en el futuro el registro se acota o pasa a un backend, el permiso se retira. | Revisión de la justificación escrita. |
| NFR4.5 | Se elimina `default_popup`: el icono abre el panel lateral mediante `background.js`. No quedan archivos ni permisos del popup sin uso. | Revisión del manifest y del árbol del bundle. |

### NFR5 — Secretos y datos guardados

| ID | Requisito | Criterio de verificación |
|---|---|---|
| NFR5.1 | Ninguna credencial de larga vida (clave de Claude, Bedrock u otra) existe en el bundle, en `chrome.storage`, en el service worker ni en git. El skeleton no hace llamadas de red propias. | Búsqueda de patrones de claves en el repo (revisión + escáner de secretos si está disponible); ausencia de `fetch` en el código del skeleton. |
| NFR5.2 | Clasificación de lo guardado en `chrome.storage.local`: **interno**. Puede contener nombres de proyecto, configuraciones de servicios y el enlace público del estimado; nunca credenciales ni tokens. El registro técnico no copia el JSON completo de entrada más allá de lo necesario para diagnosticar (nombres de servicio, etiquetas, valores pedidos). | Revisión de los puntos de escritura del registro. |
| NFR5.3 | El SE puede borrar todo lo guardado (registro, `lastRunResult`) desde el panel; el panel muestra cuánto ocupa el registro. | Smoke: borrar desde el panel deja `chrome.storage.local` vacío para esas claves. |

### C6 / C2 — Ejecución de código y aislamiento

| ID | Requisito | Criterio de verificación |
|---|---|---|
| NFR5.4 | Sin `eval`, `new Function()`, `<script src>` remoto ni `innerHTML` con datos de la página, del JSON o del registro. El panel inserta texto con `textContent` y solo enlaza URLs que empiezan por `https://calculator.aws/` (BR6.5). | ESLint con `no-eval`, `no-implied-eval`, `no-new-func`; revisión de cada inserción en el DOM del panel. |
| NFR5.5 | `content.js` y `lib/**` solo se cargan en `https://calculator.aws/*`; el `import()` dinámico solo resuelve URLs `chrome.runtime.getURL('lib/...')`. | Revisión del manifest y de los `import()`. |
| NFR5.6 | Los mensajes entrantes se validan por tipo y forma antes de actuar: el content script ignora mensajes que no vengan de la propia extensión (`sender.id` igual al id de la extensión) y el panel ignora `PROGRESS`/`RUN_RESULT` con `runId` ajeno. | Tests de Zona A sobre los validadores de mensajes. |
| NFR5.7 | El texto leído del DOM de `calculator.aws` (etiquetas, enlace de Share) se trata como dato no confiable: se valida el enlace (prefijo `https://calculator.aws/`) y se guarda o muestra solo como texto. | Revisión + test del validador de URL. |

### Cero dependencias de runtime

| ID | Requisito | Criterio de verificación |
|---|---|---|
| NFR5.8 | El bundle cargado no incluye `node_modules/` ni librerías de terceros; Vitest, ESLint y Prettier son solo dependencias de desarrollo y no se referencian desde el bundle. | Revisión del árbol cargado por Chrome; ningún `import` a paquetes. |

## 3. Modelo de amenazas (STRIDE, alcance del skeleton)

| Amenaza | Elemento | Riesgo | Mitigación |
|---|---|---|---|
| Spoofing: otra extensión o la página envía `RUN_RPA` | Listener de mensajes | Bajo | NFR5.6 (verificar `sender.id`); `chrome.runtime.onMessage` no recibe mensajes de la página |
| Tampering: la página de terceros cambia etiquetas o el banner para engañar al RPA | DOM de `calculator.aws` | Medio | Confirmación solo por banner + relectura de campos + verificación del contenido del estimado (BR4.3, BR4.4, BR5.6); el peor caso es un estimado incorrecto que no se comparte |
| Repudiation | — | No aplica | Herramienta interna de un solo usuario; el registro técnico deja rastro de cada corrida |
| Information disclosure: otra página detecta la extensión vía `web_accessible_resources` | `lib/**` | Bajo | NFR4.3 (`use_dynamic_url`, solo `calculator.aws`); los módulos no contienen secretos |
| Information disclosure: registro con nombres de proyecto en el perfil del navegador | `chrome.storage.local` | Bajo-medio | NFR5.2 (clasificación interna, sin credenciales), NFR5.3 (borrado desde el panel); el perfil del navegador es del propio SE |
| Denial of service: el registro sin límite crece hasta afectar el perfil | `chrome.storage.local` | Bajo | Indicador de tamaño en el panel y borrado manual (NFR5.3); aceptado por el mantenedor (Q5/Q7) |
| Elevation of privilege: XSS en el panel con texto de la página o del JSON | Panel lateral | Medio si se usa `innerHTML` | NFR5.4 (solo `textContent`, CSP de MV3) |

## 4. Fuera de alcance del skeleton

- Autenticación extensión↔cerebro y credencial del FM: pertenecen a U4 (contrato C1/C2, header reservado).
- Backend de memoria del agente: capacidad nueva, a planificar (decisión de Functional Design Q8/Q9).
