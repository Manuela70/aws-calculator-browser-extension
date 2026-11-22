# Requisitos de seguridad — u6-popup-ui

> Requisitos de seguridad del panel lateral: entrada del SE en pestañas JSON y
> lenguaje natural, vista previa, revisión Well-Architected, progreso, resultado
> con URL e historial. Es una página de la extensión (contexto confiable) que
> pinta datos de fuentes no confiables (cerebro, DOM de calculator.aws). Prosa
> en español; identificadores en inglés. Cada requisito hereda su ID de
> inception (`NFRx.y`). Esta unidad no abrió preguntas: las respuestas de u2
> (aviso de datos del cliente, registro) y u4 (login) ya fijan los criterios.

## Sources

- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/requirements-analysis/requirements.md` (NFR3, NFR5, NFR6, NFR8). [requirements]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u6-popup-ui/functional-design/functional-spec.md` (máquina de estados, textos, verificación). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u6-popup-ui/functional-design/rules.md` (BR1.1-BR5.3). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/contract-design/contract-summary.md` (interfaces internas, "Cambios de NFR Requirements": códigos de error, `login_cancelled`, borde con el service worker). [stage]
- `aidlc/spaces/default/codekb/extension/technology-stack.md` (vanilla JS, MV3). [brownfield]
- Reglas afirmadas en `aidlc/spaces/default/memory/project.md` (Forbidden: fallo reportado como éxito, `innerHTML` con datos de red; Mandated: copy de la UI en español). [team-practices]

## 1. Superficie de ataque

| Elemento | Frontera de confianza | Datos que cruzan |
|---|---|---|
| Áreas de texto JSON y lenguaje natural | Entrada del SE | Configuración, posible nombre del cliente |
| Respuestas del cerebro (vía service worker) | No confiables | Fragmentos, hallazgos Well-Architected, mensajes |
| `RunResult` y `ProgressEvent` del content script | Derivados del DOM de terceros | Etiquetas, motivos, URL del estimado |
| Historial (`chrome.storage.local` de U1) | Local al perfil | Resultados de corridas anteriores |
| Portapapeles | Acción del SE | URL del estimado |

## 2. Requisitos

### NFR5 — Datos no confiables y del cliente

| ID | Requisito | Criterio de verificación |
|---|---|---|
| NFR5.1 | Todo texto que no es copy fijo del panel (fragmentos, hallazgos, motivos, etiquetas, URL, entradas del historial) se pinta solo con `textContent` o atributos seguros; no se usa `innerHTML`, `insertAdjacentHTML` ni `document.write` en el panel (BR5.1). | Regla de lint `no-restricted-properties` y `no-restricted-syntax` sobre esas APIs en `sidepanel.js` y `lib/panel/**`. |
| NFR5.2 | La URL del estimado solo se muestra como enlace y se copia si coincide con `https://calculator.aws/#/estimate?id=` más un identificador; si no, el panel la trata como fallo (BR3.4) y no la ofrece. El enlace abre con `rel="noopener noreferrer"`. | Prueba de Zona A del validador del panel con URL válidas, de otro host y con `javascript:`. |
| NFR5.3 | La pestaña de lenguaje natural muestra el aviso de u2 ("No incluyas nombres de clientes ni datos personales; describe solo la arquitectura.") junto al área de texto. | Smoke: aviso visible. |
| NFR5.4 | El texto de las pestañas se guarda solo en `chrome.storage.session` (se borra al cerrar el navegador), como pide el diseño funcional (§3), y nunca en `storage.local`, `storage.sync` ni en el registro técnico. | Revisión de código: el texto solo se escribe en `storage.session`. |
| NFR5.5 | El panel nunca maneja el token: ante `unauthorized` muestra "Iniciar sesión" y solo al pulsarlo pide el login al service worker; `login_cancelled` deja el error con su texto (functional-spec §2 y §6). | Pruebas del reductor: `unauthorized` en Interpreting, Reviewing y WafLoading muestra el botón; login exitoso vuelve al estado previo; `login_cancelled` mantiene el error. |

### NFR3 — Visibilidad de errores

| ID | Requisito | Criterio de verificación |
|---|---|---|
| NFR3.1 | Cada código de error que puede llegar al panel (de u2, del cerebro vía service worker, de u5) tiene un texto en español en las tablas de functional-spec §6, incluida "Errores del cerebro y de la sesión"; un código sin entrada se muestra con el respaldo "Ocurrió un problema ({código}).", nunca con un estado vacío. | Prueba de Zona A: cada código del contrato y de u2/u5 resuelve a un texto; uno desconocido usa el genérico. |
| NFR3.2 | Un `RunResult` con `DONE` pero sin URL válida se muestra como fallo (BR3.4). Un `RunResult` o `ProgressEvent` con `runId` ajeno se ignora (BR3.3). | Pruebas de Zona A del reductor. |

### NFR8 — Estado observable

| ID | Requisito | Criterio de verificación |
|---|---|---|
| NFR8.4 | Ningún estado de espera queda sin salida: Interpreting (tope de 30 s de u2 y Cancelar), Reviewing y WafLoading (tope de 35 s con evento `timeout` y Cancelar), Connecting (handshake de u1, 3 PING, luego ConnectionError) y Running (topes de u5 y Cancelar con confirmación). Durante esos estados el panel muestra el paso actual con `aria-busy` y `aria-live`; en Running además el progreso N de M. | Pruebas de Zona A del reductor: cada estado de espera tiene transición por `timeout` o por cancelación hacia un estado con salida. |

## 3. Otros NFR

NFR6 (testabilidad) se fija en `tech-stack-decisions.md`; NFR1, NFR2, NFR4 y NFR7 no aplican al panel, como se justifica en `traceability.json`.
