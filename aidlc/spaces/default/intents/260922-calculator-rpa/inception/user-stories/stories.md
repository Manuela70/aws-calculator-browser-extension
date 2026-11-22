# User Stories — Revivida de la extensión RPA AWS Pricing Calculator

> Historias finas por journey, persona primario P1 (SE/arquitecto de preventa).
> IDs estables `US{grupo}.{seq}`; acceptance criteria `AC{grupo}.{seq}.{n}` en
> Given/When/Then. Prioridad MoSCoW. Trazan a FR1-FR11 / NFR1-NFR8 de
> `requirements.md`. Integra la ronda de mob (design/developer/quality). Tokens
> técnicos y valores literales de la UI en inglés.

## Sources

- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/requirements-analysis/requirements.md`. [requirements]
- `personas.md` (P1). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/practices-discovery/team-practices.md` (walking skeleton primero; éxito todo-o-nada; errores visibles; Zona A unit / Zona B smoke). [team-practices]
- Contribuciones de mob: `contributions/aidlc-design-agent.md`, `aidlc-developer-agent.md`, `aidlc-quality-agent.md`. [stage]

## Convención transversal de errores (aplica a todos los AC de error)

Ningún mensaje visible al SE expone código de error, nombre de selector, clase `awsui_*` ni traza técnica; todo se expresa en lenguaje de dominio (nombre de servicio, campo, región) y en español. (design; ancla NFR3)

---

## Grupo 1 — Infraestructura y walking skeleton

### US1.0 — Alcanzar (o abrir) la pestaña calculator.aws e inyectar el content script · Must Have
Como SE de preventa, quiero que la extensión encuentre o abra la pestaña de `calculator.aws` e inyecte su motor de forma fiable, para que cualquier corrida pueda empezar. (Traza: FR2, FR2.1, FR2.2) *(developer: historia de infraestructura, antes de US1.1 en la dependencia; lógica pura de `popup.js`: `tabs.query`/`create` → `PING` → `executeScript`)*
- **AC1.0.1** — Given existe una pestaña `calculator.aws`, When acciono "Generar Estimado", Then la extensión la reutiliza y confirma el handshake `PING` antes de enviar la orden de ejecución.
- **AC1.0.2** — Given no existe una pestaña `calculator.aws`, When acciono "Generar Estimado", Then la extensión abre una, espera a que cargue y luego hace el handshake.
- **AC1.0.3** — Given el content script no responde al `PING`, When se intenta el handshake, Then la extensión lo inyecta con `executeScript` y reintenta el `PING`.
- **AC1.0.4** (sad path) — Given el content script sigue sin ser alcanzable tras agotar los reintentos de handshake, When se agota, Then el popup muestra un error visible ("no pude conectar con calculator.aws") y NO inicia el RPA.

### US1.1 — Estimado de un servicio simple desde JSON (walking skeleton) · Must Have
Como SE de preventa, quiero generar un estimado de **un** servicio simple desde un JSON mínimo y recibir su URL pública, para probar que el camino completo entrada → mapeo → RPA → guardar → compartir vuelve a funcionar. (Traza: FR1.2, FR3, FR5, FR9, FR10) *(developer: establece la espina end-to-end que US4.x/US7.x generalizan; agnóstica del cerebro)*
- **AC1.1.1** — Given un JSON válido con un solo servicio (p. ej. S3 Standard, 100 GB, us-east-1) y el content script ya alcanzable (US1.0), When acciono "Generar Estimado", Then la extensión llena ese servicio y lo guarda.
- **AC1.1.2** — Given el servicio se guardó y confirmó por el banner verde `Successfully added <Service> estimate.`, When termina la corrida, Then la extensión devuelve la URL pública del estimado.
- **AC1.1.3** (sad path) — Given el servicio NO se confirmó por el banner verde, When termina la corrida, Then el popup NO contiene URL de estimado y muestra el resultado tipado del servicio no confirmado con su motivo (FR9.3). *(quality: predicado observable = ausencia de URL + resultado tipado presente)*

---

## Grupo 2 — Entrada en lenguaje natural

### US2.1 — Llenar desde una expresión en lenguaje natural · Must Have
Como SE de preventa, quiero describir la solución en lenguaje natural, para no tener que construir un JSON a mano cuando aún no lo tengo. (Traza: FR1.1, FR1.3, FR1.4) *(Zona A: normalización unit-testeable con Vitest)*
- **AC2.1.1** — Given escribo `"Un bucket S3 Standard de 100 GB en la región us-east-1"` en el popup, When acciono "Generar Estimado", Then la expresión se normaliza a la misma estructura interna que el JSON equivalente (name=S3, region=us-east-1, 100 GB Standard) y la calculadora se llena.
- **AC2.1.2** — Given una expresión en lenguaje natural que nombra varios servicios, When se procesa, Then todos los servicios nombrados se normalizan a la estructura interna antes del llenado.

### US2.2 — Error visible y recuperable cuando el lenguaje natural no se interpreta · Must Have
Como SE de preventa, quiero ver un error claro y poder corregir mi expresión sin reescribirla, para iterar rápido en vez de recibir un estimado incompleto silencioso. (Traza: FR1.1, FR7, NFR3) *(quality B1 + design: error tipado + recuperación)*
- **AC2.2.1** — Given una expresión en lenguaje natural que no nombra ningún servicio reconocible, When se procesa, Then la normalización devuelve un **error tipado** cuyo campo identifica el/los fragmento(s) no interpretado(s), la estructura normalizada resultante está **vacía** (ningún servicio), y el popup muestra ese error; no se llena nada parcialmente. *(quality B1: predicado Vitest, Zona A)*
- **AC2.2.2** — Given una expresión parcialmente interpretable, When se procesa, Then el mensaje nombra **qué servicio/campo** quedó ambiguo o faltante en lenguaje de dominio (p. ej. "no reconocí la región para el bucket S3"), sin asumir valores faltantes en silencio.
- **AC2.2.3** (recuperación) — Given el popup muestra un error de interpretación, When lo veo, Then el texto que escribí **permanece editable** en el popup (no se borra) y, al corregirlo y reaccionar "Generar Estimado", la corrida arranca limpia sin arrastrar estado parcial de la corrida fallida. *(design)*

---

## Grupo 3 — Entrada JSON

### US3.1 — Llenar desde un JSON estructurado · Must Have
Como SE de preventa, quiero cargar un JSON con el esquema de servicios, para ejecutar un estimado determinístico cuando ya tengo la especificación. (Traza: FR1.2, FR1.3) *(Zona A: parseo/validación unit-testeable)*
- **AC3.1.1** — Given un JSON válido conforme al esquema del Anexo A, When acciono "Generar Estimado", Then los servicios se normalizan y encolan en el orden del JSON para su procesamiento.
- **AC3.1.2** (sad path) — Given un JSON sintácticamente inválido, When lo cargo, Then el popup muestra `❌ JSON inválido.`, el texto pegado **permanece editable** para corregir, y no inicia el RPA.
- **AC3.1.3** (sad path) — Given un JSON válido pero sin `services` o con lista vacía, When acciono "Generar Estimado", Then el popup muestra un error claro y no inicia el RPA.
- **AC3.1.4** (sad path) — Given un JSON parseable pero **no conforme al Anexo A** (p. ej. un servicio sin `name`/`search_term`, o `fields` no-objeto), When acciono "Generar Estimado", Then el popup muestra un error de esquema que nombra el servicio/campo problemático y no inicia el RPA. *(quality: Zona A puro)*

---

## Grupo 4 — Ejecución RPA por servicio

### US4.1 — Agregar, configurar y confirmar un servicio · Must Have
Como SE de preventa, quiero que la extensión agregue, configure y guarde cada servicio solicitado, confirmando el guardado de verdad, para no hacerlo a mano ni creer que se guardó algo que no se guardó. (Traza: FR5, FR3, FR9.1, FR9.2, NFR7) *(Zona B smoke, salvo la decisión confirmado/no-confirmado que es Zona A)*
- **AC4.1.1** — Given un servicio con campos y valores, When el RPA lo procesa, Then ejecuta Add service → Search all services → localiza la tarjeta → Configure, escanea el formulario (analyzeDOM) y mapea cada valor al campo correcto.
- **AC4.1.2** — Given el primer servicio de la corrida, When se configura, Then la región se fija una vez en ese primer servicio (FR5.1).
- **AC4.1.3** — Given un servicio con toggles condicionales (`__switch__`) que habilitan campos, When se procesa, Then los toggles se aplican ANTES del escaneo de esos campos condicionales (FIX-7: Bedrock, SageMaker).
- **AC4.1.4** (sad path) — Given un servicio cuyo guardado no se confirma por el banner verde (banner ausente, o aparece validación `is required`), When el RPA termina ese servicio, Then produce un **resultado tipado de fallo con motivo** y NO lo cuenta como confirmado (FR9.2, FR5.3). *(quality)*
- **AC4.1.5** (estructura) — Given la implementación del mapeo, When se organiza el código, Then la capa de mapeo/"cerebro" queda **aislada en su propio módulo ES**, acoplada solo por message passing o `import` (NFR7), sin prejuzgar dónde vive el cerebro. *(developer: ancla NFR7)*

### US4.2 — Resolución resiliente de campos ante cambios de UI · Should Have
Como SE de preventa, quiero que el mapeo de campos sobreviva a cambios menores de la UI de AWS, para que la herramienta no se rompa a cada actualización de CloudScape. (Traza: FR4, NFR2, P2)
- **AC4.2.1** — Given un campo cuyo selector primario no resuelve, When el ejecutor intenta resolverlo, Then usa estrategias en cascada (aria-label → aria-labelledby → label[for] → sección) antes de rendirse. *(este AC fija el contrato de cascada; la historia Zona B de FIX-8 (US4.4) lo aplica — no duplicar)*
- **AC4.2.2** (sad path) — Given un campo que no se pudo resolver por ninguna estrategia, When se agota la resolución, Then el fallo es visible (US6.1), nunca silencioso. *(verificación: smoke)*

### US4.3 — FIXes de lógica pura: etiquetas y parsing de botones Unit · Should Have
Como SE de preventa, quiero que el saneamiento de etiquetas y el parsing de botones Unit funcionen como antes, para que los servicios con etiquetas complejas se mapeen bien. (Traza: FR6.1, FR6.2 / FIX-1, FIX-2) *(Zona A: `cleanAriaLabel` y `parseUnitButtonLabel` son funciones puras con cobertura unit obligatoria, piso 80%)*
- **AC4.3.1** — Given un aria-label con placeholder embebido (CloudWatch, KMS, SageMaker, ELB, WAF), When `cleanAriaLabel` lo procesa, Then devuelve la etiqueta limpia esperada (tabla de casos unit).
- **AC4.3.2** — Given el texto de un botón Unit (ELB, WAF), When `parseUnitButtonLabel` lo procesa, Then extrae el significado semántico esperado (tabla de casos unit).

### US4.4 — FIXes de resolución de DOM del conjunto completo de servicios · Should Have
Como SE de preventa, quiero que todos los servicios que el v6 manejaba (con sus particularidades de DOM) sigan funcionando, para no perder cobertura al revivir. (Traza: FR6.3-FR6.7 / FIX-3, FIX-5, FIX-6, FIX-8, FIX-9; FIX-7 ya en AC4.1.3) *(Zona B: smoke manual, sin piso de cobertura)*
- **AC4.4.1** — Given CloudWatch sin `role="group"`, When se resuelve la sección, Then se usa el heading precedente (FIX-3).
- **AC4.4.2** — Given una tabla de instancias (EC2), When se escanea, Then los radios se detectan como `instance_radio` por contexto de fila (FIX-5) y el radiogroup toma su nombre del heading (FIX-6).
- **AC4.4.3** — Given botones Unit (ELB, WAF), When se resuelven, Then se resuelven por `aria-labelledby` reconstruido (FIX-8, aplicando la cascada de US4.2).
- **AC4.4.4** — Given toggles (Bedrock, SageMaker) sin `label[for]`, When se resuelven, Then se buscan por `aria-labelledby` (FIX-9).

---

## Grupo 5 — Recomendaciones Well-Architected (on-demand)

### US5.1 — Pedir recomendaciones Well-Architected sobre el estimado · Should Have
Como SE de preventa, quiero pedir una evaluación Well-Architected del estimado ya construido, para enriquecer la propuesta con recomendaciones de AWS. (Traza: FR8)
- **AC5.1.1** — Given un estimado con ≥1 servicio ya construido, When solicito la evaluación WAF, Then recibo ≥1 recomendación con un pilar nombrado (de los seis) y texto accionable no vacío, o el enunciado explícito de "sin hallazgos". *(quality: predicado FR8.4, la parte de parseo del contrato es Zona A si se aísla)*
- **AC5.1.2** (sad path) — Given solicito la evaluación WAF, When el proveedor de razonamiento no está disponible o falla, Then el popup muestra un error visible, nunca una respuesta vacía silenciosa (FR8.5, NFR3).
- **AC5.1.3** (presentación) — Given la evaluación WAF se presenta y hay ≥1 recomendación, When se muestra, Then las recomendaciones aparecen **agrupadas y etiquetadas** (por servicio o por pilar; el agrupamiento exacto se afina en Functional Design), cada una con su pilar visible y su texto accionable; una vista con muchas recomendaciones sigue siendo escaneable (encabezados/agrupación), no una pared de texto. *(design)*
- **AC5.1.4** — Given un servicio sin hallazgos, When se presenta la evaluación, Then se muestra explícitamente como "sin hallazgos" para ese servicio, nunca omitido en silencio. *(design + FR8.4)*

---

## Grupo 6 — Visibilidad de progreso y errores

### US6.1 — Ver errores claros por servicio cuando algo falla · Must Have
Como SE de preventa, quiero ver un resultado tipado por servicio cuando un paso falla, para no entregar un estimado incompleto creyendo que salió bien. (Traza: FR7, FR7.1, FR7.2, FR7.3, NFR3, P3) *(cubre el modelo genérico de fallos de EJECUCIÓN; el error específico de interpretación NL vive en US2.2)*
- **AC6.1.1** — Given un fallo de ejecución que hoy degrada en silencio (fuente de mapeo sin respuesta/vacía, acción no resuelta, dropdown no hallado, guardado no confirmado, toggle no encontrado), When ocurre, Then el popup muestra un **resultado tipado por servicio** con enum {éxito | fallo + motivo} (FR7.2). *(developer: redacción neutral del cerebro; quality: resultado tipado)*
- **AC6.1.2** — Given la corrida produce avisos de progreso (p. ej. esperando a la fuente de mapeo), When ocurren, Then el popup los muestra (corregir `PROGRESS_TEXT` emitido sin handler; eliminar o conectar el handler muerto `DOM_FIELDS`) (FR7.3).

### US6.2 — Ver progreso activo y resumen final por servicio · Should Have
Como SE de preventa, quiero ver progreso activo y un resumen final por servicio, para distinguir "trabajando" de "colgado" y saber de un vistazo qué reintentar. (Traza: FR7, NFR8) *(design: resumen pedido-vs-confirmado)*
- **AC6.2.1** — Given la corrida está en marcha, When procesa cada servicio, Then el popup refleja progreso activo por servicio.
- **AC6.2.2** — Given una operación agota su máximo de reintentos sin avanzar, When se agota, Then produce un resultado tipado de error visible en vez de esperar indefinidamente (NFR8.1, NFR8.2). *(Functional Design debe aislar el contador de reintentos como función pura para que sea unit-testeable — quality)*
- **AC6.2.3** — Given la corrida terminó, When se presenta el resultado, Then el popup muestra una **lista por servicio con su estado** (confirmado / fallido con motivo) en lenguaje de dominio, no solo el veredicto global. *(design)*

### US6.3 — Estado inicial del popup · Could Have
Como SE de preventa, quiero que el popup al abrirse muestre un estado de reposo claro, para saber dónde escribir y qué acción ejecutar sin ruido de corridas previas. (Traza: FR1, FR7) *(design: superficie que el SE toca en cada corrida)*
- **AC6.3.1** — Given abro el popup, When se muestra, Then presenta el área de entrada, una acción primaria única y clara ("Generar Estimado"), y ningún mensaje residual de una corrida anterior.

---

## Grupo 7 — Finalización y compartir

### US7.1 — Obtener la URL pública solo con el estimado completo (todo-o-nada) · Must Have
Como SE de preventa, quiero recibir la URL pública solo cuando el estimado está completo, para entregar al cliente algo correcto. (Traza: FR9, FR10) *(Zona A: agregación pedido-vs-confirmado)*
- **AC7.1.1** — Given todos los servicios solicitados se confirmaron por el banner verde, When termina la corrida, Then la extensión renombra el estimado al nombre del proyecto, hace Share, acepta el modal de enlace público y devuelve la URL.
- **AC7.1.2** (criterio todo-o-nada, inclusión de conjuntos) — Given una corrida terminada, When se decide el resultado, Then la extensión devuelve URL **si y solo si** `{servicios confirmados por banner verde}` ⊇ `{servicios solicitados}`; si falta ≥1, NO devuelve URL y lista los faltantes por nombre. *(quality B2: la función de agregación nace con tests — todos confirmados → URL; uno faltante → sin URL + lista; cero servicios → sin URL, coherente con AC3.1.3)*

---

## Grupo 8 — Feedback visual (spotlight)

### US8.1 — Ver qué campo está llenando el RPA (spotlight) · Could Have
Como SE de preventa, quiero ver resaltado el campo que el RPA está llenando, para seguir visualmente lo que hace la automatización. (Traza: FR11)
- **AC8.1.1** — Given el RPA localiza un campo objetivo, When va a llenarlo, Then dibuja un contorno azul sobre ese elemento y atenúa el resto, con tooltip opcional del label.
- **AC8.1.2** — Given el overlay de spotlight está activo, When el RPA actúa, Then el overlay usa `pointer-events:none`, z-index muy alto, sigue el scroll y NO bloquea ni altera los clicks/inputs del RPA (FR11.2, C5).
- **AC8.1.3** — Given termina el llenado de un campo o ocurre un error, When el paso concluye, Then el overlay se limpia siempre (incluido en error) (FR11.1).
- **AC8.1.4** — Given el campo objetivo está fuera del viewport, When el RPA va a llenarlo, Then el elemento se trae a vista (scroll-into-view) antes de dibujar el spotlight. *(design)*
- **AC8.1.5** — Given el spotlight dibuja nodos de overlay en la página, When el RPA vuelve a escanear el DOM (analyzeDOM, FR3), Then los nodos del overlay se **excluyen** del escaneo, para no confundirlos con campos del formulario. *(design: protege la primitiva central)*
- **AC8.1.6** — Given el sistema del usuario pide `prefers-reduced-motion`, When el spotlight se activa, Then se respeta (sin animación de transición; el resalte estático sigue siendo válido). *(design: WCAG 2.1 AA)*

---

## Modo de verificación (Zona A unit / Zona B smoke)

Resumen para Delivery Planning y Code Generation (quality):

- **Zona A (Vitest, piso 80%)**: normalización NL (US2.1, US2.2), validación JSON (US3.1), `cleanAriaLabel`/`parseUnitButtonLabel` (US4.3), decisión confirmado/no-confirmado (AC4.1.4), contador de reintentos (AC6.2.2), agregación todo-o-nada (US7.1), parseo del contrato de salida WAF (US5.1 parcial), lógica de handshake de US1.0.
- **Zona B (smoke manual `SMOKE.md`, sin piso)**: el camino RPA/DOM end-to-end (US1.1, US4.1 ejecución, US4.2, US4.4), presentación (US5.1, US6.x render), y el overlay (US8.1).
- El piso del 80% aplica **solo a Zona A**; ninguna historia Zona B arrastra piso. Baseline brownfield: suite vacía, 0 tests, 0% — el primer test de cada función pura es mejora neta. `SMOKE.md` incluye el caso de fallo provocado (fuente de mapeo caída / `[]` → no `DONE` con URL), que es la verificación end-to-end de AC7.1.2.

## Notas de cumplimiento INVEST

- **Independent**: US1.0 habilita; US1.1 es la espina; las demás generalizan sin bloquearse salvo la dependencia natural entrada→ejecución→finalización→WAF.
- **Valuable**: cada historia tiene beneficio explícito para el SE de preventa.
- **Small**: historias finas por paso; US4.3 (epic original) dividida en US4.3 (Zona A) + US4.4 (Zona B).
- **Testable**: AC en Given/When/Then con happy + sad path; modo de verificación declarado arriba.
- **MVP boundary (informa a Delivery Planning)**: Must Have = US1.0, US1.1, US2.1, US2.2, US3.1, US4.1, US6.1, US7.1. Should = US4.2, US4.3, US4.4, US5.1, US6.2. Could = US6.3, US8.1.

## Dependencias

- **US1.0** (inyección/handshake) habilita toda corrida; antes de US1.1.
- **US1.1** (skeleton) establece la espina end-to-end que US4.x/US7.x generalizan.
- US2.x y US3.x (entradas) alimentan US4.x (ejecución).
- US4.2 fija el contrato de cascada de resolución; US4.4 (FIX-8) lo aplica — no duplicar.
- US5.1 (WAF) depende de un estimado ya construido (US4.x + US7.1).
- US8.1 (spotlight) es transversal a US4.x pero cosmético (Could Have); AC8.1.5 lo acopla a analyzeDOM (FR3) solo para excluir sus nodos.
