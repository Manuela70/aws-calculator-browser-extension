# Requisitos — Revivida de la extensión RPA AWS Pricing Calculator

> Formalización de ingeniería de los requisitos ya escritos en
> `requirements/calculator-rpa-requirements.md` y `requirements/constraints.md`,
> ajustados por la decisión de alcance del humano (cerebro n8n eliminado;
> entrada por lenguaje natural o JSON; WAF on-demand) y por las prácticas
> afirmadas en Practices Discovery. Los IDs `FR{n}` / `NFR{n}` son claves de
> trazabilidad permanentes. Prosa en español; tokens técnicos en inglés.

## Sources

- `requirements/calculator-rpa-requirements.md` — FR1-FR7, P1-P4, criterios de aceptación, esquema de entrada. [doc]
- `requirements/constraints.md` — MV3, sin build step, solo `https://calculator.aws/*`, sin secretos hardcoded, spotlight `pointer-events:none`, UI en español / código en inglés. [doc]
- CodeKB reverse-engineering en `aidlc/spaces/default/codekb/extension/`: `business-overview.md`, `architecture.md`, `code-structure.md` (estado actual del v6, roto). [brownfield]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/practices-discovery/team-practices.md` + reglas afirmadas en `project.md` (MV3, sin build step, mínimo privilegio de permisos, modelo de error explícito, capa de mapeo extraíble, Vitest+80% sobre lógica pura, smoke manual del RPA). [team-practices]
- Entrevista de Requirements Analysis Q1-Q5 (decisiones del humano). [assumption→decidido]
- Decisión de alcance del humano al gate de Reverse Engineering: el webhook n8n ("cerebro"/"skill 3") ya no existe (hay backup); entrada por lenguaje natural o import JSON. [desc]

## Análisis de intención

El objetivo de negocio es **revivir** una herramienta interna de preventa (Applying) que convierte la lista de servicios de una solución en un **estimado de costos AWS compartible**, automatizando `calculator.aws` de punta a punta. La herramienta está **rota hoy**: su cerebro de mapeo (webhook n8n) ya no existe, el camino de red falla por CORS (P1), los selectores CloudScape pueden estar stale tras ~14 meses (P2), los fallos son invisibles (P3) y el manifest tiene higiene de permisos deficiente (P4).

Lo que el usuario quiere lograr, más allá de las funciones:
- Que un SE pueda describir una solución (en **lenguaje natural** o **JSON**) y obtener, sin intervención manual, un estimado AWS **completo y compartible**.
- Que, sobre ese estimado, pueda pedir **recomendaciones Well-Architected** on-demand.
- Que los fallos sean **visibles y claros**, nunca silenciosos.
- Que el "cerebro" de mapeo/razonamiento tenga un **hogar robusto**, sin depender de un webhook frágil.

## Requisitos funcionales

### FR1 — Entrada unificada (lenguaje natural o JSON)
El popup acepta la especificación de servicios en **dos formatos intercambiables**, sin un selector de "modos":
- **FR1.1** — Entrada en **lenguaje natural**: el usuario escribe una expresión en texto libre describiendo los servicios y configuraciones deseadas.
  - Criterio de aceptación verificable: una expresión en lenguaje natural que nombre ≥1 servicio AWS con ≥1 configuración debe normalizarse (FR1.3) a la misma estructura interna que produciría el JSON equivalente del Anexo A, o bien producir un **error visible** en el popup (NFR3) indicando qué no se pudo interpretar — nunca un llenado parcial silencioso.
  - **Ejemplo canónico (caso de prueba del walking skeleton)**: la expresión `"Un bucket S3 Standard de 100 GB en la región us-east-1"` debe normalizarse a un servicio con `name` = S3 (o su `search_term` equivalente), `region` = us-east-1, y el campo de almacenamiento mapeado a 100 GB Standard. Este es el caso canónico contra el que se valida el camino NL del skeleton.
  - El alcance exacto de qué tan libre puede ser la expresión antes de requerir estructura se fija en Functional Design (OQ4); FR1.1 fija el contrato mínimo (normaliza-o-error-visible) y el caso canónico, no la gramática completa.
  - **Cambio registrado en Functional Design de u2 (2026-11-21), resuelve OQ4:** el lenguaje natural lo interpreta el cerebro (u4) con el inventario de calculator.aws y la extensión valida su resultado como un JSON; no hay gramática local. La entrada tiene pestañas JSON / lenguaje natural (reemplaza "sin selector de modos").
- **FR1.2** — Entrada en **JSON**: el usuario pega/carga un JSON con el esquema de servicios (ver Anexo A).
- **FR1.3** — Ambos formatos convergen en la misma estructura interna normalizada antes del llenado; el resultado (estimado construido) es independiente del formato de entrada.
- **FR1.4** — El llenado debe dejar el estimado en un **estado completo y bien mapeado** sobre el cual el WAF (FR8) pueda razonar después.

> Nota: reemplaza el selector "Create Calculator | ReAct" del documento original
> por una entrada unificada. El razonamiento Well-Architected se modela como
> FR8 (acción posterior), no como un modo de entrada.

### FR2 — Inyección y navegación
Al accionar "Generar Estimado", la extensión inyecta el content script en una pestaña `calculator.aws` abierta (o abre una) y navega a `#/estimate`.
- **FR2.1** — Si ya hay una pestaña `calculator.aws`, reutilizarla; si no, abrirla.
- **FR2.2** — Verificar que el content script respondió (handshake `PING`) antes de enviar la orden de ejecución; si no responde, inyectarlo.

### FR3 — analyzeDOM (primitiva central de escaneo)
El motor escanea el formulario y enumera **todos** los tipos de campo, resolviendo el `label` y la `section` de cada uno.
- **FR3.1** — Tipos de campo a enumerar: inputs text/number/search, native `select`, dropdowns CloudScape (`button[aria-haspopup]`), radios, radiogroups, sliders, checkboxes/toggles, y radios de tabla de instancias (`instance_radio`).
- **FR3.2** — Cada campo se serializa con su label legible (formato `"Sección > Campo"`) y su sección resuelta.
- **FR3.3** — Preservar los casos ya resueltos por FIX-1..FIX-9 del v6 (ver FR6).

### FR4 — Resolución resiliente de selectores (P2)
`analyzeDOM` y el ejecutor de acciones deben ser **resilientes a cambios de la UI de AWS** (CloudScape).
- **FR4.1** — La resolución de elementos usa estrategias en cascada (aria-label exacto → aria-labelledby → `label[for]` → desambiguación por sección), no un único selector frágil.
- **FR4.2** — La dependencia de clases `awsui_*` ofuscadas y de textos de botón en inglés debe estar aislada y documentada, de modo que un cambio de la UI tenga un punto de ajuste único y no disperso.
- **FR4.3** — Cuando un selector no resuelve, el fallo es **visible** (FR7), nunca silencioso.

### FR5 — Flujo por servicio
Para cada servicio solicitado: Add service → Search all services → localizar la tarjeta del servicio → Configure; fijar la región en el primer servicio; aplicar toggles booleanos; correr `analyzeDOM`; mapear cada valor solicitado al campo correcto y aplicarlo (fill / select / dropdown / radio / instance search); **guardar** el servicio; volver a My Estimate.
- **FR5.1** — La región se fija una vez, en el primer servicio.
- **FR5.2** — Los toggles condicionales (`__switch__`) se aplican ANTES del escaneo cuando habilitan campos condicionales (preservar caso FIX-7: Bedrock, SageMaker).
- **FR5.3** — El guardado se confirma solo por **señal positiva de éxito** (ver FR9), no por URL o botón.

### FR6 — Conjunto de servicios y casos preservados
El requisito funcional cubre el **conjunto completo de servicios** que manejaba el v6, preservando los comportamientos de FIX-1..FIX-9:
- **FR6.1** — FIX-1 `cleanAriaLabel` (placeholders embebidos: CloudWatch, KMS, SageMaker, ELB, WAF).
- **FR6.2** — FIX-2 `parseUnitButtonLabel` (parsing semántico de botones Unit: ELB, WAF).
- **FR6.3** — FIX-3 resolución de sección por heading precedente (CloudWatch).
- **FR6.4** — FIX-4/FIX-9 labels de toggle por `aria-labelledby` (Bedrock, SageMaker).
- **FR6.5** — FIX-5 detección de `instance_radio` por contexto de fila (EC2).
- **FR6.6** — FIX-6 nombre de radiogroup desde su heading (EC2 pricing).
- **FR6.7** — FIX-8 resolución de botones Unit por `aria-labelledby` reconstruido (ELB, WAF).
- **FR6.8** — La ENTREGA arranca con el walking skeleton de **un servicio simple** end-to-end (práctica afirmada) y luego amplía al conjunto completo.

### FR7 — Progreso y errores visibles (P3)
El popup muestra progreso y **estados de error claros y visibles**.
- **FR7.1** — Cada fallo que hoy degrada en silencio (cerebro vacío, acción no resuelta, dropdown no hallado, guardado no confirmado, toggle no encontrado) debe **propagar un resultado tipado** hacia el runner y mostrarse en el popup.
- **FR7.2** — El popup recibe un resultado **por servicio** (éxito / fallo con motivo), no solo un `DONE`/`ERROR` global.
- **FR7.3** — Corregir el contrato de mensajes roto: `PROGRESS_TEXT` (hoy emitido sin handler en el popup) debe mostrarse; `DOM_FIELDS` (handler muerto) se elimina o se conecta a un emisor real.

### FR8 — Recomendaciones Well-Architected (WAF), on-demand
Sobre un estimado ya construido, el usuario puede solicitar **evaluación y recomendaciones** basadas en el AWS Well-Architected Framework.
- **FR8.1** — El WAF es una acción **posterior y opcional**, disponible venga la entrada de FR1.1 (NL) o FR1.2 (JSON).
  - **Cambio registrado en Functional Design de u2/u4 (2026-11-21):** la revisión Well-Architected es obligatoria para toda corrida, en dos momentos: antes de llenar (avisa con severidad y el SE decide "llenar igual" o "corregir") y al terminar. Rige desde que se integra el cerebro (u4); hasta entonces la corrida JSON sigue sin revisión y el panel lo avisa.
- **FR8.2** — El llenado (FR1.4) debe dejar el estimado en un estado evaluable para que el WAF razone sobre datos completos.
- **FR8.3** — Las recomendaciones WAF se presentan al usuario de forma legible en español.
- **FR8.4** — Contrato de salida verificable (criterio de aceptación de FR8): una evaluación WAF produce una respuesta estructurada que, como mínimo:
  - identifica cada **servicio del estimado** sobre el que opina (por nombre),
  - clasifica cada recomendación bajo al menos **uno de los seis pilares** del AWS Well-Architected Framework (Operational Excellence, Security, Reliability, Performance Efficiency, Cost Optimization, Sustainability) nombrado explícitamente,
  - para cada recomendación entrega un **texto accionable** (qué cambiar y por qué), y
  - cuando no hay hallazgos para un servicio, lo dice explícitamente en vez de omitirlo en silencio.
  Pass/fail observable: dado un estimado con ≥1 servicio, una evaluación WAF solicitada devuelve ≥1 recomendación con pilar nombrado, o el enunciado explícito de "sin hallazgos"; nunca una respuesta vacía o sin pilar.
- **FR8.5** — Si el proveedor de razonamiento WAF no está disponible o falla, el fallo es **visible** en el popup (NFR3), nunca una respuesta vacía silenciosa.

> El WAF requiere razonamiento de un LLM; su hogar es el mismo "cerebro"
> robusto de NFR1 / P1, cuya implementación se decide en diseño. El formato de
> presentación exacto (orden, agrupación por pilar vs. por servicio) se afina en
> Functional Design; FR8.4 fija el contrato mínimo verificable, no el layout.

### FR9 — Confirmación de guardado y criterio de éxito (P3)
- **FR9.1** — Un guardado de servicio se confirma **únicamente** por la señal positiva de éxito: el banner verde `Successfully added <Service> estimate.`
- **FR9.2** — Detectar los mensajes de validación obligatoria (`is required`) antes de asumir guardado.
- **FR9.3** — Criterio de éxito de la corrida (**todo-o-nada**): la extensión devuelve la **URL pública del estimado solo si TODOS los servicios solicitados se confirmaron** (contraste pedido-vs-confirmado). Cualquier fallo parcial se muestra como error en el popup y **no** devuelve una URL "a medias".

### FR10 — Finalización y compartir
Tras todos los servicios: renombrar el estimado al nombre del proyecto, click en Share, aceptar el modal de enlace público, y devolver la **URL pública** del estimado.

### FR11 — Spotlight visual (cosmético)
Mientras el RPA corre autónomamente, al localizar cada campo objetivo y antes de llenarlo, dibujar un contorno azul alrededor del elemento y atenuar el resto de la página (técnica box-shadow spotlight), con tooltip opcional del label; remover el overlay al terminar el campo.
- **FR11.1** — El overlay usa `pointer-events:none`, z-index muy alto, sigue el scroll, y **siempre** se limpia (incluido en error).
- **FR11.2** — Es **cosmético**: el RPA actúa por sí solo; el overlay nunca bloquea ni altera sus propios clicks/inputs.

## Requisitos no funcionales

### NFR1 — Hogar robusto del "cerebro" (P1)
El mapeo campo↔valor **y** el razonamiento WAF (FR8) deben residir en un hogar robusto que **no dependa del webhook n8n frágil**. La implementación concreta (recrear n8n desde el backup / service worker con LLM / enfoque local) se decide en las etapas de diseño; este requisito solo fija la propiedad de robustez (sin punto único de fallo accesible por CORS desde el contexto de página).

### NFR2 — Resiliencia ante cambios de UI (P2)
La resolución de selectores debe degradar de forma controlada y **visible** ante cambios de la UI CloudScape: ningún cambio de clase o de copy de botón debe producir un fallo silencioso; el punto de ajuste de selectores debe estar centralizado.

### NFR3 — Visibilidad de errores (P3)
Ningún camino de ejecución puede reportar éxito ante un fallo. Todo fallo (parcial o total) es observable por el usuario en el popup con un mensaje claro en español.

### NFR4 — Higiene de permisos / mínimo privilegio (P4)
El `manifest.json` declara en `host_permissions` **únicamente** los hosts a los que el código hace `fetch`, y elimina los no usados (quitar el host muerto `https://dnd5zrqcec4or.cloudfront.net/*`; declarar el host del cerebro si el diseño elige un destino de red). `permissions` se reduce a los efectivamente usados.

### NFR5 — Seguridad de secretos
Ninguna credencial de larga vida (clave de API de Claude/Bedrock u otra) reside en el bundle, `chrome.storage`, el service worker ni git. Si el diseño mueve el razonamiento al cliente, la credencial debe ser server-side (proxy / n8n) o de corta vida federada.

### NFR6 — Testabilidad (práctica afirmada)
La lógica pura aislable del DOM (parseo JSON, parseo de lenguaje natural, normalización de entrada, capa de mapeo, `parseUnitButtonLabel`, `cleanAriaLabel`, agregación de resultados) debe ser unit-testeable con **Vitest** y alcanzar un **piso de cobertura del 80%** sobre esa lógica. El núcleo RPA dependiente del DOM se verifica por **smoke manual** versionado (`aws-calculator-extension/SMOKE.md`), sin e2e automatizado.

### NFR7 — Mantenibilidad / estructura
La capa de mapeo/"cerebro" debe ser **extraíble a su propio módulo ES** (MV3 `"type": "module"`), acoplada solo por message passing o `import`, de modo que la decisión de ubicación del cerebro siga siendo reversible sin tocar el scanner de DOM ni la orquestación.

### NFR8 — Cota de tiempo observable (distinguir "lento" de "colgado")
El RPA depende de delays y reintentos fijos (`DELAY.SHORT/MEDIUM/LONG`, reintentos en `saveService`/`selectAwsDropdown`); una corrida larga no debe confundirse con una colgada.
- **NFR8.1** — Cada operación acotada por reintentos (resolver un campo, abrir un dropdown, confirmar un guardado) tiene un **número máximo de intentos** y, agotado, produce un **resultado tipado de error** (FR7.1) visible en el popup, en lugar de esperar indefinidamente.
- **NFR8.2** — El popup refleja **progreso activo** (FR7) de modo que el usuario pueda distinguir "trabajando" de "detenido por error"; un servicio que no avanza tras agotar sus reintentos se reporta como fallo (y, por FR9.3, hace fallar la corrida todo-o-nada).
- **NFR8.3** — No se fija un umbral numérico de latencia total (el tiempo depende del DOM de terceros y del número de servicios); la garantía es de **terminación observable**, no de velocidad.

## Restricciones

- **C1** — Manifest V3; vanilla JS **sin build step** salvo justificación explícita del mantenedor. Las dev-dependencies (Vitest, ESLint, Prettier) no entran al bundle y no violan esta restricción.
- **C2** — El content script corre **solo** en `https://calculator.aws/*`.
- **C3** — Sin secretos hardcoded (ver NFR5).
- **C4** — Copy de la UI orientado al usuario **en español**; código, identificadores y comentarios **en inglés**.
- **C5** — El overlay de spotlight nunca bloquea ni altera los clicks/inputs del RPA (ver FR11).
- **C6** — Sin ejecución de código remoto/dinámico (`eval`, `new Function()`, `<script src>` remoto, `innerHTML` con datos de red sin sanitizar) — CSP de MV3.
- **C7** — Cero dependencias de runtime empaquetadas sin aprobación del mantenedor.

## Supuestos

- **A1** — El usuario tiene permiso para usar `calculator.aws` y crear/compartir estimados públicos. Razón: es el flujo de negocio actual del v6.
- **A2** — El backup del workflow n8n está disponible si el diseño elige recrearlo. Razón: declarado por el humano.
- **A3** — El conjunto de servicios objetivo es el mismo que soportaba el v6 (los cubiertos por FIX-1..FIX-9), salvo que el diseño/entrega reduzca el alcance. Razón: decisión Q4.
- **A4** — El WAF requiere un LLM; su disponibilidad y costo se resuelven junto con la ubicación del cerebro en diseño. Razón: FR8 + NFR1.

## Fuera de alcance

- Migración fuera de Manifest V3 o a otra plataforma de navegador.
- Introducir un build step (transpilación/bundling) en el artefacto cargado.
- Publicar en la Chrome Web Store en esta revivida (el empaquetado `.zip` es un paso manual futuro; ver prácticas de Deployment).
- Automatizar e2e contra el DOM vivo de `calculator.aws` (se verifica por smoke manual).
- Soportar sitios distintos de `calculator.aws`.

## Preguntas abiertas (para etapas posteriores)

- **OQ1** — Ubicación definitiva del cerebro (recrear n8n / service worker con LLM / local). Se decide en Domain/Contract/Functional Design (NFR1). 
- **OQ2** — Estado real de los selectores CloudScape (P2) y del DOM vivo: no verificable con análisis estático; se valida en el smoke manual y en Construction.
- **OQ3** — Si el WAF usa el mismo proveedor de LLM que el mapeo o uno distinto, y el modelo/costo asociado. Diseño.
- **OQ4** — Alcance exacto de la interpretación de lenguaje natural (qué tan libre puede ser la expresión antes de requerir estructura). Diseño/Functional Design.

## Anexo A — Esquema de entrada JSON (del documento original)

```
{ project, region, services: [ { name, search_term,
  fields: { "<field label>": "<value>" }, "__switch__:<toggle>": "on|off" } ] }
```

Interpretación vigente (Functional Design, 2026-11-21): cada servicio admite además `template`; los toggles `__switch__:<toggle>` van dentro de `fields`; la unidad de un campo con unidad va en su propia clave `"<Campo> unit"`; las claves desconocidas son error. Detalle en `contract-design/contract-summary.md`, sección "Cambios de Functional Design".
