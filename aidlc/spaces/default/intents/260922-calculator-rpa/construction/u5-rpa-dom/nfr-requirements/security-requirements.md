# Requisitos de seguridad — u5-rpa-dom

> Requisitos de seguridad y robustez del RPA sobre el DOM de calculator.aws:
> content script en una página de terceros que agrega servicios, aplica
> acciones, confirma guardados por el banner verde y devuelve un resultado por
> servicio. Combina Zona A (cascada, `cleanAriaLabel`, `parseUnitButtonLabel`,
> contador de reintentos) y Zona B (DOM real, smoke manual). Prosa en español;
> identificadores en inglés. Cada requisito hereda su ID de inception
> (`NFRx.y`). Esta unidad no abrió preguntas: el Diseño Funcional, las reglas
> del proyecto y las respuestas de u1 a u4 ya fijan los criterios.

## Sources

- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/requirements-analysis/requirements.md` (NFR2, NFR3, NFR4, NFR5, NFR6, NFR8). [requirements]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u5-rpa-dom/functional-design/functional-spec.md` (módulos `lib/dom/*`, estados por servicio, verificación). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u5-rpa-dom/functional-design/rules.md` (BR1.1-BR5.2). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/contract-design/contract-summary.md` (C1 2.0.0, sustituciones, `aggregate` DONE/ERROR). [stage]
- `aidlc/spaces/default/codekb/extension/technology-stack.md` (content script MV3, vanilla JS). [brownfield]
- Reglas afirmadas en `aidlc/spaces/default/memory/project.md` (Mandated: guardado solo por banner verde y detección de `is required`, `host_permissions` mínimos; Forbidden: fallo reportado como éxito, credenciales en el cliente, `innerHTML` con datos externos). [team-practices]

## 1. Superficie de ataque

| Elemento | Frontera de confianza | Datos que cruzan |
|---|---|---|
| DOM de calculator.aws (CloudScape) | **No confiable**, terceros, puede cambiar sin aviso | Etiquetas, opciones, banners, enlace de Share |
| Mundo aislado del content script | Extensión dentro de la página | `NormalizedRun`, acciones, progreso, resultado |
| Mensajes con el panel (U6) y el service worker | Internos, con `runId` | `RunRequest`, `ProgressEvent`, `RunResult` |
| Puerto del cerebro (vía U3) | Igual que en U3 | Residuo y acciones propuestas |
| Overlay Spotlight | Elemento propio inyectado en la página | Solo texto de estado |
| `web_accessible_resources` (`lib/**`) | Archivos de la extensión que la página puede pedir por URL | Código del bundle (sin secretos ni configuración) |

## 2. Requisitos

### NFR2 — Resiliencia ante cambios de UI

| ID | Requisito | Criterio de verificación |
|---|---|---|
| NFR2.1 | Todos los selectores dependientes de CloudScape viven en `lib/dom/selectors.js`; ningún otro módulo contiene clases ni textos de botón de la página (BR3.5). | Búsqueda en `lib/dom/**`: selectores CSS y textos de UI solo en `selectors.js`. |
| NFR2.2 | Un elemento que no se encuentra (tarjeta del servicio, plantilla, campo, banner) produce un fallo tipado con el paso y la etiqueta (`not_found`, `template_not_found`, `field_not_resolved`, `stoppedAtLabel`), nunca una espera infinita ni una acción sobre otro elemento (BR2.1, BR2.5). | Smoke de servicio inexistente y pruebas de Zona A de la cascada con 0 y varios candidatos. |
| NFR2.3 | Una opción de dropdown que al abrirse no coincide de forma exacta y única falla con `option_no_match` u `option_ambiguous` (BR2.8). | Pruebas de Zona A de la coincidencia; smoke con una opción inexistente. |

### NFR3 — Sin fallos silenciosos (compuerta P3)

| ID | Requisito | Criterio de verificación |
|---|---|---|
| NFR3.1 | Un servicio se confirma solo por el banner verde `Successfully added <Service> estimate.` y la ausencia de mensajes `is required`; URL o botón por sí solos no confirman (BR2.6). | Smoke de guardado normal y de campo obligatorio vacío (fallo con `is required`). |
| NFR3.2 | `DONE` con URL solo si todos los servicios pedidos están confirmados y el estimado final contiene exactamente esos servicios; cualquier otro caso es `ERROR` sin URL (BR1.2). | Pruebas de Zona A de `aggregate`; smoke con un servicio fallido → sin URL. |
| NFR3.3 | Cada acción aplicada se relee del DOM; una diferencia con el valor esperado es fallo del servicio (BR2.4). | Smoke con un campo que la página reformatea. |
| NFR3.4 | Toda sustitución del cerebro aplicada aparece en `brainSubstitutions` con valor pedido y aplicado. | Prueba de Zona A del armado de `ServiceResult`. |
| NFR3.5 | Ante un fallo con formulario abierto, U5 sale sin guardar y lo confirma; si la salida no se confirma en 20 s, los servicios restantes quedan `not_attempted` y la corrida termina en `ERROR` (BR2.5). | Smoke de fallo provocado a mitad de corrida. |

### NFR4 y NFR5 — Privilegio y datos

| ID | Requisito | Criterio de verificación |
|---|---|---|
| NFR4.1 | El content script corre solo en `https://calculator.aws/*` y no hace `fetch` propio: la consulta al cerebro de U3 llega al service worker por mensaje, y es el service worker (U7) quien hace la llamada HTTP con el token (contrato, "Cambios de NFR Requirements"). | Revisión del manifest y búsqueda de `fetch` en `lib/dom/**` y `content.js`. |
| NFR4.2 | `web_accessible_resources` expone solo `lib/**`, con `matches` limitado a `https://calculator.aws/*` y `use_dynamic_url: true`. Esos archivos no contienen secretos, tokens, URL del cerebro ni configuración: solo código. | Revisión del manifest; búsqueda en `lib/**` de URL y claves. |
| NFR5.1 | El content script nunca recibe ni guarda el token del cerebro (`chrome.storage.session` con acceso solo para contextos confiables). | Prueba: el content script no puede leer la clave del token. |
| NFR5.2 | El overlay Spotlight y cualquier texto que U5 inserte en la página usan solo `textContent`; nunca `innerHTML` con datos del DOM, del cerebro o del usuario (BR5.1). | Regla de lint contra `innerHTML`; revisión de `spotlight.js`. |
| NFR5.4 | El enlace del estimado leído del DOM se valida antes de devolverlo: debe ser `https://calculator.aws/#/estimate?id=` seguido de un identificador alfanumérico con guiones. Si no coincide, la corrida termina en `ERROR` con motivo `share_invalid` y sin URL. | Prueba de Zona A del validador con enlaces válidos, de otro host, con `javascript:` y vacíos. |
| NFR5.5 | Todo texto leído del DOM que viaja al panel (`stoppedAtLabel`, etiquetas, opciones, detalle) se recorta a 200 caracteres y viaja como dato; U6 lo pinta solo con `textContent`. | Prueba de Zona A del armado de `ServiceResult` con un texto de 500 caracteres. |
| NFR5.3 | El Spotlight se quita siempre al terminar, fallar o cancelar, y queda fuera del escaneo del formulario (BR5.2). | Smoke: tras cancelar, no queda overlay en la página. |

### NFR8 — Cota de tiempo observable

| ID | Requisito | Criterio de verificación |
|---|---|---|
| NFR8.4 | Cada servicio tiene un tope de 3 minutos; todas las esperas del DOM y la consulta al cerebro reciben la señal de la corrida y se abortan al vencer o al cancelar (BR2.7). | Smoke con un servicio forzado a colgarse; prueba de Zona A del contador. |
| NFR8.5 | Los reintentos (guardado: 3 intentos; dropdown y resolución de campo: los de U1) se cuentan con un contador puro y, agotados, producen un fallo tipado (BR4.1). | Pruebas de Zona A del contador. |
| NFR8.6 | El progreso se emite por servicio y paso (BR4.2), cada vez que cambia el paso, para que el SE distinga "trabajando" de "detenido". | Smoke: el panel muestra cada paso de la corrida canónica. |

## 3. Otros NFR

NFR6 (testabilidad) y NFR7 (estructura) se fijan en `tech-stack-decisions.md`. NFR1 no aplica: U5 no aloja el cerebro.
