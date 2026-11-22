**Collaborator:** aidlc-design-agent

## Contribution

Lente: UX / fidelidad de persona. Revisé `personas.md` y `stories.md` contra `requirements.md` (FR1-FR11, NFR3/NFR8) y contra el contexto declarado (herramienta interna, un solo persona SE/preventa, popup en español, única superficie nueva = mensajería de error/progreso del popup + overlay spotlight). El borrador es sólido y el desglose fino por journey mapea bien a los FR. Mis hallazgos son adiciones de experiencia de usuario que el lead puede plegar; ninguno contradice una historia existente.

### 1. Persona P1 — fiel y suficiente, con dos contextos UX sub-modelados

El persona único es correcto (decisión Q1) y el no-modelar al cliente que recibe la URL es la decisión acertada: no interactúa con la extensión. Dos matices de P1 cambian cómo deben leerse varias historias y conviene que estén explícitos en `personas.md`, porque son la justificación UX de los AC de error:

- **Bucle de trabajo iterativo bajo presión**: el SE arma el estimado muchas veces, a menudo frente al cliente o contra reloj. El camino "escribir entrada → fallar → corregir → reintentar" **es** un flujo primario, no un caso de borde. Esto ancla el gap de recuperación de US2.2 (abajo) y el estado de resumen final de US6.x. Sugiero añadir a Objetivos de P1: *"corregir y reintentar rápido cuando una entrada no se interpreta, sin rehacer el trabajo desde cero"*.
- **Alto en AWS, no desarrollador de la extensión** (ya está en `personas.md`): consecuencia UX que conviene elevar a criterio observable — los mensajes de error deben hablar el idioma del dominio del SE (nombre de servicio, nombre de campo, región), **nunca** un código de error, nombre de selector CloudScape, `awsui_*`, ni traza técnica. Esto es Nielsen #9 ("ayudar a diagnosticar y recuperar") y refuerza NFR3. Hoy los AC dicen "mensaje claro" pero no acotan el registro de lenguaje; propongo un AC transversal (ver punto 3).

### 2. US2.2 — falta el camino de RECUPERACIÓN del error de lenguaje natural (gap UX principal)

US2.2 cubre bien la *detección* (muestra qué no se pudo interpretar, no llena nada parcial), pero no la *recuperación*, que es el valor real para el SE iterativo. Sin ella, el usuario no sabe qué hacer después del error. Adiciones concretas que el lead puede plegar como AC nuevos de US2.2 (o una US2.3 fina):

- **AC propuesto (preservación de entrada)**: Given una expresión en lenguaje natural que falla la interpretación, When el popup muestra el error, Then el texto que el SE escribió **permanece editable en el popup** (no se borra), para corregirlo y reintentar sin reescribir todo. (Nielsen #3 control y libertad; evita pérdida de datos.)
- **AC propuesto (reintento in-situ)**: Given corregí la expresión tras un error, When vuelvo a accionar "Generar Estimado", Then la corrida arranca limpia (sin arrastrar estado parcial de la corrida fallida).
- **AC propuesto (especificidad accionable)**: Given una expresión parcialmente interpretable (AC2.2.2), When se reporta lo que falta, Then el mensaje nombra **qué servicio/campo** quedó ambiguo o faltante en lenguaje de dominio ("no reconocí la región para el bucket S3"), no un mensaje genérico. Esto hace verificable la cláusula "pide aclaración o reporta lo que falta" de FR1.1/NFR3.
- Nota de simetría: US3.1 (JSON) tiene el mismo gap menor — tras `❌ JSON inválido.` (AC3.1.2), el JSON pegado debe quedar editable para corregir. Vale un AC paralelo o una nota de consistencia entre US2.2 y US3.1.

### 3. US6.x — visibilidad de progreso y errores: tres gaps de experiencia

El modelo "resultado tipado por servicio, nunca silencioso" es exactamente lo correcto (FR7/NFR3). Faltan tres piezas de experiencia observable:

- **Estado inicial / vacío del popup**: ninguna historia describe qué ve el SE al abrir el popup antes de accionar (área de entrada, botón "Generar Estimado", ausencia de ruido). Es la primera pantalla que toca y hoy no tiene historia. Sugiero una nota de estado inicial en US6.1 o una US fina de "estado de reposo del popup" (Could/Should): campo de entrada visible, acción primaria única y clara, sin mensajes de corridas previas.
- **Estado de resumen al terminar (parcial vs total)**: US7.1/AC7.1.2 dice que ante fallo parcial "muestra qué servicio(s) fallaron", pero la experiencia necesita un **resumen legible pedido-vs-confirmado**: lista por servicio con su estado (confirmado / fallido con motivo), para que el SE sepa de un vistazo qué reintentar. Propongo elevar esto a AC explícito de US6.1 o US7.1: Given la corrida terminó, When se presenta el resultado, Then el popup muestra una **lista por servicio con estado y motivo de fallo** en lenguaje de dominio, no solo el veredicto global. (Esto también da coherencia visual entre el progreso por-servicio de US6.2 y el resultado final.)
- **Registro de lenguaje de los errores (AC transversal)**: como en el punto 1, propongo un AC/NFR-nota de UX aplicable a US2.2, US3.1, US5.1 y US6.1: ningún mensaje visible al SE expone código de error, nombre de selector, clase `awsui_*`, ni traza; todo se expresa por servicio/campo/región en español. Lo hace testeable y ancla NFR3 desde la experiencia.

### 4. US5.1 — presentación legible del WAF: AC5.1.3 está sub-especificado desde UX

AC5.1.3 pide "en español y legibles", lo cual no es observable. FR8.4 fija el contrato de datos (pilar nombrado, servicio, texto accionable, "sin hallazgos" explícito); la pieza UX que falta es cómo se escanea esa salida (los usuarios no leen, escanean). Adiciones:

- **AC propuesto (estructura escaneable)**: Given la evaluación WAF se presenta, When hay ≥1 recomendación, Then se muestran **agrupadas y etiquetadas** (por servicio o por pilar — el agrupamiento exacto se afina en Functional Design, pero el AC debe exigir *alguna* agrupación legible, no un bloque de prosa corrido), cada recomendación con su pilar visible como etiqueta y su texto accionable.
- **AC propuesto (estado "sin hallazgos")**: Given un servicio sin hallazgos (FR8.4), When se presenta, Then se muestra explícitamente como "sin hallazgos" para ese servicio (estado vacío legible), nunca omitido en silencio. Hace observable la cláusula de FR8.4 desde la vista.
- **AC propuesto (lista larga)**: Given una evaluación con muchas recomendaciones, When se presentan, Then la vista sigue siendo escaneable (agrupación/encabezados), no una pared de texto. Caso de borde "contenido largo" del checklist de estados de pantalla.

### 5. US8.1 — spotlight: completo en lo esencial, tres adiciones de borde

Visibilidad (contorno azul + atenuado), no-interferencia (`pointer-events:none`, z-index alto, no altera clicks, C5/FR11.2) y limpieza-siempre-incluido-en-error (AC8.1.3) están bien cubiertos. Adiciones UX:

- **AC propuesto (traer a vista)**: Given el campo objetivo está fuera del viewport, When el RPA va a llenarlo, Then el elemento se trae a vista (scroll-into-view) antes de dibujar el spotlight, para que el resalte sea realmente visible. Sin esto el overlay puede "seguir el scroll" (AC8.1.2) pero resaltar un campo que el SE no ve. Esto sirve el propósito declarado ("seguir visualmente lo que hace la automatización").
- **AC propuesto (no auto-captura)**: Given el spotlight dibuja nodos de overlay en la página, When el RPA vuelve a escanear el DOM (`analyzeDOM`, FR3), Then los nodos del overlay **se excluyen** del escaneo (no se confunden con campos del formulario). Protege a la primitiva central de un falso positivo introducido por la propia pieza cosmética.
- **AC propuesto (movimiento reducido)**: Given el sistema del usuario pide `prefers-reduced-motion`, When el spotlight se activa, Then se respeta (sin animación de transición; el resalte estático sigue siendo válido). WCAG 2.1 AA; barato porque el spotlight es box-shadow, no animación compleja. Marcar como Could, acorde a la prioridad de la historia.

### 6. Nota menor de trazabilidad/consistencia

- US2.2 y US6.1 ambas trazan a FR7/NFR3/P3 y pueden solaparse en el AC de "error de interpretación visible". Sugiero que US2.2 mantenga el error *específico de NL* (qué no se interpretó + recuperación) y US6.1 el modelo *genérico por-servicio* de fallos de ejecución, con una referencia cruzada, para que no haya dos AC compitiendo por el mismo fallo. No es un problema de corrección, solo de claridad de propiedad entre historias.

## Positions

- AGREE: Persona único P1 es fiel y suficiente; no modelar al cliente receptor de la URL es correcto.
- AGREE: Desglose fino por journey, mapeo 1:1 a FR, modelo de error tipado por-servicio y criterio todo-o-nada (US7.1) son los correctos desde UX.
- AGREE: US8.1 (spotlight) cubre bien visibilidad, no-interferencia y limpieza en error; mis adiciones son de borde, no correcciones.
- OBJECT: US2.2 está incompleta desde UX — falta el camino de recuperación (preservar la entrada editable, reintento in-situ, especificidad accionable del mensaje). Es un flujo primario para el SE iterativo, no un borde.
- OBJECT: US5.1 AC5.1.3 ("legibles") no es observable; necesita AC de estructura escaneable, estado "sin hallazgos" visible, y manejo de lista larga.
- OBJECT: Falta cubrir el estado inicial/vacío del popup y un estado de resumen final por-servicio (pedido-vs-confirmado) en US6.x/US7.1; son superficies que el SE toca en cada corrida y hoy no tienen historia.
