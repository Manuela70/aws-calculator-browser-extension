# Reglas de negocio — u1-walking-skeleton

> Reglas que gobiernan el walking skeleton: entrada JSON → handshake →
> mapeo determinístico → RPA sobre `calculator.aws` → guardar (banner verde) →
> renombrar → compartir → URL. El bloque YAML es la fuente de verdad; la tabla
> final es un resumen derivado. Prosa en español; identificadores en inglés.

## Sources

- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/user-stories/stories.md` (US1.0: AC1.0.1-AC1.0.4; US1.1: AC1.1.1-AC1.1.3; convención transversal de errores). [stories]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/requirements-analysis/requirements.md` (FR1.2, FR2.1, FR2.2, FR3, FR5.1, FR5.3, FR9.1-FR9.3, FR10, NFR3, NFR5, NFR8.1, C2, C4, C6; Anexo A). [requirements]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/units-generation/unit-of-work.md` y `unit-of-work-story-map.md` (alcance de U1). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/domain-design/components.md` (ResultAggregator todo-o-nada, DeterministicMapper). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/contract-design/contract-summary.md` (interfaces internas `mapDeterministic`, `aggregate`). [stage]
- `functional-design-questions.md` de esta unidad, Q1-Q10. [Q1-Q10]
- Reglas afirmadas en `aidlc/spaces/default/memory/project.md` (éxito solo por banner verde; nunca reportar éxito en fallo; mínimo privilegio; sin código dinámico). [team-practices]

## Reglas (fuente de verdad)

```yaml
rules:
  # --- Grupo 1: entrada -------------------------------------------------
  - id: BR1.1
    statement: El texto de entrada debe ser JSON sintácticamente válido.
    category: validation
    applies_to: RunInput
    trigger: El SE pulsa "Generar Estimado".
    logic: SI el texto no se puede parsear como JSON ENTONCES rechazar la entrada.
    violation: El panel muestra "❌ JSON inválido.", el texto sigue editable y no se inicia ni el handshake ni el RPA.
    source: [FR1.2, NFR3]
  - id: BR1.2
    statement: La entrada debe traer al menos un servicio, y cada servicio debe tener nombre.
    category: validation
    applies_to: [RunInput, RawService]
    trigger: Tras parsear el JSON.
    logic: >
      SI services falta, no es una lista o está vacía, O algún servicio no tiene
      name de texto no vacío, O search_term viene y no es texto no vacío, O fields
      no es un objeto, O algún valor de fields es objeto, lista o null, O project
      viene y no es texto de 1 a 200 caracteres ENTONCES rechazar la entrada
      nombrando el servicio o campo problemático. Valores de fields numéricos o
      booleanos se aceptan (ver BR1.4).
    violation: Error visible en el panel en español; no se inicia el RPA.
    source: [FR1.2, NFR3]
  - id: BR1.3
    statement: La región de la corrida se toma de la raíz del JSON y debe ser un código conocido.
    category: validation
    applies_to: [RunInput, ServiceRequest, RegionMap]
    trigger: Al normalizar la entrada.
    logic: >
      SI region falta ENTONCES usar us-east-1. SI region no existe en RegionMap
      ENTONCES rechazar la entrada. Cada ServiceRequest hereda la región de la raíz
      (corrige el v6, que la leía desde el servicio).
    violation: Error visible "no reconozco la región <código>"; no se inicia el RPA.
    source: [FR1.2, FR5.1]
  - id: BR1.4
    statement: Cada servicio se normaliza a ServiceRequest separando valores y toggles.
    category: calculation
    applies_to: ServiceRequest
    trigger: Al normalizar la entrada válida.
    logic: >
      searchTerm = search_term SI viene, SI NO name. Cada clave de fields que
      empieza por __switch__: pasa a toggles (on/true = encendido, off/false =
      apagado); el resto pasa a fields como RequestedValue en el orden del JSON.
      Un valor numérico se convierte a su forma textual decimal (1 → "1"); un
      booleano a "true"/"false". Un toggle con un valor distinto de
      on/off/true/false se rechaza nombrando el toggle.
    violation: No aplica (transformación total sobre entrada ya validada).
    source: [FR1.2]

  # --- Grupo 2: conexión con calculator.aws (handshake) -------------------
  - id: BR2.1
    statement: Si ya hay una pestaña de calculator.aws, se reutiliza.
    category: policy
    applies_to: TabConnection
    trigger: Entrada válida y corrida aceptada.
    logic: SI existe una pestaña https://calculator.aws/* ENTONCES activarla y usarla (origin = reused).
    violation: No aplica.
    source: [FR2.1]
  - id: BR2.2
    statement: Si no hay pestaña de calculator.aws, se abre una y se espera a que cargue.
    category: policy
    applies_to: TabConnection
    trigger: No existe pestaña de calculator.aws.
    logic: SI no existe ENTONCES abrir https://calculator.aws/#/estimate, esperar a que termine de cargar y luego hacer el handshake (origin = opened).
    violation: Si la pestaña no termina de cargar, se trata como BR2.4.
    source: [FR2.1]
  - id: BR2.3
    statement: Antes de enviar la orden de ejecución se confirma el handshake PING, inyectando el content script si no responde.
    category: policy
    applies_to: TabConnection
    trigger: Hay pestaña lista.
    logic: >
      Enviar un PING inicial (cuenta como intento 1). La respuesta es
      { ok, ready }: ready = true solo cuando el módulo lib/content-main.js
      terminó de cargarse y registró sus manejadores (BR2.5). SI el PING inicial
      no tiene respuesta ENTONCES inyectar el content script y enviar hasta 3 PING
      más con 1 s entre intentos (máximo 4 en total). SI hay respuesta pero
      ready = false ENTONCES esperar 1 s y volver a preguntar, dentro de los
      mismos intentos. SOLO con ready = true se envía RUN_RPA.
    violation: Ver BR2.4.
    source: [FR2.2, NFR8.1]
  - id: BR2.4
    statement: Si el handshake se agota, la corrida termina con error visible y no se inicia el RPA.
    category: constraint
    applies_to: [TabConnection, RunResult]
    trigger: Se agotan los 4 PING sin ready = true, el PING responde ok = false (el módulo no cargó), o falla la inyección o la apertura de la pestaña.
    logic: SI status = unreachable ENTONCES RunResult.status = ERROR con failureStep = connection, sin enviar RUN_RPA.
    violation: El panel muestra "No pude conectar con calculator.aws." y ofrece volver a intentar.
    source: [FR2.2, NFR3, NFR8.1]

  - id: BR2.5
    statement: El content script se carga una sola vez por pestaña y responde PING desde el primer momento.
    category: constraint
    applies_to: TabConnection
    trigger: Carga declarada en el manifest o inyección programática de content.js.
    logic: >
      El manifest mantiene content.js en content_scripts para
      https://calculator.aws/*; la inyección de BR2.3 solo cubre pestañas abiertas
      antes de recargar la extensión. content.js comprueba una marca de carga en
      la página: SI ya existe ENTONCES no hace nada (no duplica listeners). SI no
      ENTONCES pone la marca, registra un único listener que responde PING con
      { ok: true, ready: false } mientras importa lib/content-main.js, y pasa a
      ready = true cuando el import termina; SI el import falla ENTONCES responde
      { ok: false, ready: false } y lo registra en la consola. RUN_RPA recibido con
      ready = false se rechaza con reason not_ready.
    violation: Un import fallido termina en BR2.4 (unreachable).
    source: [FR2.2, NFR7]

  # --- Grupo 3: mapeo determinístico --------------------------------------
  - id: BR3.1
    statement: Un valor pedido se mapea a un campo solo si su etiqueta coincide de forma única con un campo escaneado.
    category: calculation
    applies_to: [MappingAction, DomField, RequestedValue]
    trigger: Después de escanear el formulario del servicio.
    logic: >
      Normalizar etiquetas (recortar, minúsculas, espacios colapsados). SI la
      etiqueta pedida coincide con exactamente UN DomField, ya sea con su label
      completo "Sección > Campo" o con la parte "Campo", ENTONCES producir una
      MappingAction con source = deterministic. SI coincide con cero o con más de
      uno ENTONCES el valor va a unresolved. Un RequestedValue produce
      exactamente una MappingAction. La tabla de instancias de EC2 es un solo
      DomField instance_radio (ver entities.md), así que "Instance type" coincide
      de forma única.
    violation: Ver BR3.3.
    source: [FR3, FR5]
  - id: BR3.2
    statement: El tipo de acción se deriva del tipo del campo escaneado.
    category: calculation
    applies_to: MappingAction
    trigger: Al producir una MappingAction.
    logic: >
      text/number/search → fill; select → select; dropdown → dropdown;
      radio/radiogroup → radio; checkbox → checkbox; toggle → toggle_on/toggle_off;
      instance_radio → instance_radio (acción compuesta, BR4.7). La regla
      search → fill aplica a cajas de búsqueda sueltas, nunca a la de la tabla
      de instancias, que no se emite como DomField. slider no se mapea en el
      skeleton y va a unresolved.
    violation: No aplica.
    source: [FR5]
  - id: BR3.3
    statement: En el skeleton, cualquier valor sin coincidencia hace fallar el servicio antes de guardar.
    category: constraint
    applies_to: [MappingOutcome, ServiceResult]
    trigger: MappingOutcome.unresolved no está vacío.
    logic: >
      SI hay al menos un valor en unresolved ENTONCES ServiceResult.status = failed,
      reason = field_not_recognized, detail = las etiquetas no reconocidas; NO se
      aplican acciones, NO se guarda el servicio (no hay cerebro en el skeleton).
    violation: El panel muestra "No reconocí el campo <etiqueta> en <servicio>." y la corrida no devuelve URL.
    source: [FR9.3, NFR3]
  - id: BR3.4
    statement: En campos con opciones, el valor pedido debe coincidir con una opción disponible.
    category: validation
    applies_to: [MappingAction, DomField]
    trigger: Al aplicar una acción select, dropdown o radio.
    logic: >
      Normalizar valor y opciones (recortar, minúsculas, espacios colapsados).
      SI el valor coincide exactamente con una opción ENTONCES se elige esa. SI
      coincide con ninguna, o el valor es prefijo de más de una, ENTONCES
      field_not_applied con detail = "<campo>: <valor>". No se elige por
      aproximación. Para instance_radio la comparación es contra el tipo de
      instancia de cada fila.
    violation: Mensaje "No encontré la opción <valor> en <campo>."
    source: [FR5, NFR3]

  # --- Grupo 4: ejecución y guardado por servicio -------------------------
  - id: BR4.1
    statement: La región se fija una sola vez, en el primer servicio de la corrida.
    category: policy
    applies_to: ServiceRequest
    trigger: Configuración del primer servicio.
    logic: SI es el primer servicio Y la región visible difiere de RegionMap[region] ENTONCES seleccionarla en el formulario.
    violation: Si no se puede fijar, el servicio falla con reason = field_not_applied, detail = "región".
    source: [FR5.1]
  - id: BR4.2
    statement: Si el servicio no aparece en la búsqueda de servicios, falla sin tomar otro.
    category: constraint
    applies_to: ServiceResult
    trigger: Búsqueda de servicios por searchTerm.
    logic: >
      SI ninguna tarjeta de resultado coincide con searchTerm (exacta o que lo
      contenga) ENTONCES el servicio falla con reason = service_not_found. Queda
      prohibido el fallback del v6 de configurar el primer resultado cualquiera.
    violation: El panel muestra "No encontré el servicio <nombre> en la calculadora."
    source: [FR5, NFR3]
  - id: BR4.3
    statement: Si una acción no se puede aplicar, el servicio falla y no se guarda.
    category: constraint
    applies_to: [MappingAction, ServiceResult]
    trigger: Al aplicar cada MappingAction.
    logic: >
      Tras cada acción se relee el campo: fill → el valor visible del input es
      el pedido; select/dropdown → el texto seleccionado es la opción elegida;
      radio/checkbox/toggle → el estado marcado es el pedido; instance_radio →
      la fila marcada tiene el tipo pedido. SI el campo no se resuelve o la
      relectura no coincide ENTONCES ServiceResult.status = failed,
      reason = field_not_applied, detail = etiqueta; se detiene el servicio.
    violation: Mensaje de dominio con el campo afectado; sin URL.
    source: [FR9.3, NFR3]
  - id: BR4.4
    statement: Un guardado se confirma únicamente por el banner verde de éxito.
    category: validation
    applies_to: ServiceResult
    trigger: Tras pulsar el botón de guardar.
    logic: >
      Esperar hasta 10 s el banner "Successfully added <Service> estimate.". SI
      aparece ENTONCES status = confirmed. La URL de la página o la presencia del
      botón "Add service" NO cuentan como confirmación.
    violation: Ver BR4.5 y BR4.6.
    source: [FR5.3, FR9.1]
  - id: BR4.5
    statement: Si aparece una validación obligatoria, el servicio falla sin más reintentos.
    category: validation
    applies_to: ServiceResult
    trigger: Tras pulsar guardar.
    logic: SI aparece un mensaje que contiene "is required" ENTONCES status = failed, reason = validation_required, detail = el campo señalado; no se reintenta.
    violation: Mensaje "Falta un dato obligatorio en <servicio>: <campo>."
    source: [FR9.2]
  - id: BR4.6
    statement: El guardado se reintenta hasta 3 veces; agotado, el servicio falla.
    category: constraint
    applies_to: ServiceResult
    trigger: El banner verde no apareció en 10 s y no hubo validación obligatoria.
    logic: Reintentar el clic de guardar hasta 3 intentos en total. SI ninguno confirma ENTONCES status = failed, reason = save_not_confirmed.
    violation: Mensaje "No pude confirmar que <servicio> se guardó."
    source: [FR9.1, NFR8.1]
  - id: BR4.7
    statement: En EC2, el tipo de instancia se busca y se elige en la tabla de instancias por su fila.
    category: policy
    applies_to: [MappingAction, DomField]
    trigger: Un RequestedValue mapea a un campo de búsqueda de instancia.
    logic: >
      Una MappingAction instance_radio (un solo RequestedValue) se ejecuta en
      dos pasos dentro del DomResolver: (1) escribir el tipo de instancia
      (p. ej. t3.micro) en la búsqueda propia de la tabla; (2) seleccionar el
      radio de la fila cuyo tipo coincide exactamente (detección instance_radio
      por contexto de fila, FIX-5; nombre del radiogroup desde su heading,
      FIX-6). SI no hay fila exacta ENTONCES field_not_applied. La relectura de
      BR4.3 verifica la fila marcada.
    violation: Mensaje "No encontré la instancia <tipo> en EC2."
    source: [FR3.1, FR6.5, FR6.6]
  - id: BR4.8
    statement: Un error inesperado en un servicio se convierte en resultado tipado, nunca se traga.
    category: constraint
    applies_to: ServiceResult
    trigger: Cualquier excepción no prevista durante el servicio.
    logic: SI ocurre ENTONCES status = failed, reason = unexpected_error; se registra en la consola de la pestaña y la corrida continúa hacia la agregación.
    violation: Mensaje "Algo falló al configurar <servicio>."
    source: [NFR3]
  - id: BR4.9
    statement: Si un toggle pedido no se puede aplicar, el servicio falla; la expansión de secciones es de mejor esfuerzo.
    category: constraint
    applies_to: [ToggleRequest, ServiceResult]
    trigger: Paso de toggles y expansión antes del escaneo (W4 paso 5).
    logic: >
      SI un toggle pedido no se encuentra o su estado no queda como se pidió
      ENTONCES status = failed, reason = toggle_not_applied, detail = etiqueta
      del toggle. SI una sección no se puede expandir ENTONCES se registra en la
      consola y se sigue: un campo que quede oculto lo reporta BR3.3 como no
      reconocido, de forma visible.
    violation: Mensaje "No pude activar la opción <toggle> en <servicio>."
    source: [FR5.2, NFR3]
  - id: BR4.10
    statement: Toda espera de página tiene un tiempo máximo.
    category: constraint
    applies_to: ServiceResult
    trigger: Esperas de carga (pestaña, My Estimate, búsqueda de servicios, formulario tras Configure, vuelta a My Estimate, modal de Share).
    logic: >
      Cada espera termina como máximo a los 20 s. SI se agota dentro de un
      servicio ENTONCES status = failed, reason = page_timeout, detail = el paso.
      SI se agota fuera de un servicio (carga inicial, renombrar, Share)
      ENTONCES RunResult ERROR con el failureStep de ese paso.
    violation: Mensaje "calculator.aws tardó demasiado en <paso>."
    source: [NFR8.1, NFR8.3]

  # --- Grupo 5: agregación y finalización ---------------------------------
  - id: BR5.1
    statement: La corrida tiene éxito si y solo si todos los servicios pedidos quedaron confirmados.
    category: calculation
    applies_to: [RunResult, ServiceResult]
    trigger: Terminaron todos los servicios.
    logic: >
      SI {servicios confirmados} ⊇ {servicios pedidos} ENTONCES continuar a la
      verificación del estimado (BR5.6). SI falta al menos uno ENTONCES
      RunResult.status = ERROR, failureStep = services, sin estimateUrl, con la
      lista por servicio. La función es aggregate(requested, serviceResults): el
      conjunto confirmado del contrato compartido se deriva de los
      serviceResults con status = confirmed; se pasan los resultados completos
      para conservar el motivo de cada fallo.
    violation: El panel lista cada servicio con su estado y motivo y NO muestra URL.
    source: [FR9.3, NFR3]
  - id: BR5.2
    statement: Con todos los servicios confirmados, el estimado se renombra al nombre del proyecto; si falla, la corrida falla.
    category: constraint
    applies_to: RunResult
    trigger: BR5.6 se cumplió y RunInput.project está presente.
    logic: >
      SI project viene ENTONCES renombrar el estimado a project y verificar que el
      nombre visible coincide. SI no se puede ENTONCES status = ERROR,
      failureStep = rename, sin estimateUrl. SI project no viene ENTONCES se omite
      el renombrado.
    violation: Mensaje "Los servicios se guardaron, pero no pude renombrar el estimado; no comparto un enlace incompleto."
    source: [FR10]
  - id: BR5.3
    statement: La URL devuelta debe ser el enlace público obtenido del flujo Share.
    category: validation
    applies_to: RunResult
    trigger: Tras BR5.2.
    logic: >
      Pulsar Share, aceptar el modal de enlace público y leer el enlace del campo
      del modal. SI no se obtiene un enlace https://calculator.aws/ ENTONCES
      status = ERROR, failureStep = share. Queda prohibido el fallback del v6 de
      devolver la URL de la página actual.
    violation: Mensaje "No pude obtener el enlace público del estimado."
    source: [FR10, FR9.3]
  - id: BR5.4
    statement: El panel nunca muestra una URL si la corrida no terminó en DONE.
    category: constraint
    applies_to: RunResult
    trigger: Al presentar el resultado.
    logic: Mostrar estimateUrl SOLO SI status = DONE; SI status = ERROR mostrar el paso fallido y la lista por servicio.
    violation: No aplica (invariante de presentación).
    source: [FR9.3, NFR3]
  - id: BR5.5
    statement: La corrida empieza solo sobre un estimado vacío.
    category: constraint
    applies_to: RunResult
    trigger: Al llegar a My Estimate, antes del primer servicio (W3 paso 2).
    logic: >
      Contar los servicios que ya lista My Estimate. SI hay al menos uno
      ENTONCES RunResult ERROR con failureStep = preconditions, sin tocar ese
      estimado: la extensión no borra ni modifica un estimado existente. El SE
      lo vacía o abre uno nuevo y vuelve a correr.
    violation: Mensaje "El estimado abierto ya tiene servicios. Vacíalo o abre uno nuevo en calculator.aws y vuelve a intentar."
    source: [FR9.3, NFR3]
  - id: BR5.6
    statement: Antes de renombrar y compartir, el contenido de My Estimate debe ser exactamente lo pedido.
    category: validation
    applies_to: RunResult
    trigger: BR5.1 se cumplió.
    logic: >
      Leer la lista de servicios de My Estimate. SI el número de servicios es
      igual al de servicios pedidos Y cada servicio pedido aparece por su nombre
      ENTONCES continuar a BR5.2. SI hay servicios de más o falta alguno
      ENTONCES RunResult ERROR con failureStep = estimate_check, sin URL.
    violation: Mensaje "El estimado no coincide con lo pedido; no comparto un enlace incorrecto."
    source: [FR9.3, NFR3]

  # --- Grupo 6: panel lateral, progreso y persistencia --------------------
  - id: BR6.1
    statement: Solo puede haber una corrida en curso a la vez.
    category: constraint
    applies_to: RunRequest
    trigger: El SE pulsa "Generar Estimado".
    logic: >
      SI hay una corrida en curso ENTONCES el botón queda deshabilitado y no se
      acepta otra. SI el content script responde RUN_RPA con accepted = false
      (busy o not_ready) ENTONCES el panel termina la corrida como ERROR
      (failureStep = connection) con mensaje y vuelve a habilitar el botón.
    violation: Mensaje "Ya hay una corrida en curso en calculator.aws." o "calculator.aws aún no está listo; vuelve a intentar."
    source: [FR7]
  - id: BR6.2
    statement: El progreso de la corrida se muestra en el panel lateral.
    category: policy
    applies_to: ProgressEvent
    trigger: Cada paso de la corrida (conexión, servicio i de n, cada acción aplicada, cada intento de guardado, verificación del estimado, renombrado, compartir).
    logic: El content script emite PROGRESS con runId, pct y texto en español; el panel lo muestra si el runId coincide con la corrida en curso. Se eliminan PROGRESS_TEXT y DOM_FIELDS del contrato de mensajes.
    violation: No aplica.
    source: [FR7.3, NFR8.2]
  - id: BR6.3
    statement: El último resultado de la corrida se guarda en el navegador y se muestra al reabrir el panel.
    category: policy
    applies_to: StoredRunRecord
    trigger: La corrida termina (DONE o ERROR).
    logic: >
      El content script guarda el RunResult en chrome.storage.local bajo
      lastRunResult, borra activeRun y luego notifica al panel. Al abrir el panel, SI existe ese
      registro ENTONCES se muestra como "Última corrida". Una corrida nueva lo
      reemplaza al terminar. No se guarda nada más (ni historial ni credenciales).
    violation: Si guardar falla, el resultado igual se envía al panel y se registra el fallo en consola.
    source: [FR7, NFR5]
  - id: BR6.4
    statement: Todo mensaje visible al SE está en español y en lenguaje de dominio.
    category: policy
    applies_to: [ServiceResult, RunResult, ProgressEvent]
    trigger: Al presentar cualquier mensaje.
    logic: >
      Los mensajes nombran servicio, campo o región; nunca códigos de reason,
      selectores, clases awsui_* ni trazas técnicas. El panel traduce cada reason
      a un texto en español.
    violation: No aplica (invariante de presentación).
    source: [NFR3, C4]
  - id: BR6.5
    statement: El panel no inserta HTML con datos de la página ni del JSON.
    category: constraint
    applies_to: [RunResult, ProgressEvent]
    trigger: Al presentar textos y la URL.
    logic: Los textos se insertan como texto plano; la URL se muestra como enlace solo si empieza por https://calculator.aws/.
    violation: No aplica (invariante de seguridad).
    source: [C6]
  - id: BR6.6
    statement: El panel nunca queda bloqueado en una corrida que ya no avanza, y al reabrirse recupera la corrida en curso.
    category: policy
    applies_to: [ActiveRunRecord, StoredRunRecord, RunResult]
    trigger: Corrida en curso; apertura del panel; cierre de la pestaña.
    logic: >
      Al aceptar RUN_RPA, el content script guarda activeRun y lo actualiza con
      cada ProgressEvent (latido). El panel escucha los cambios de
      chrome.storage.local: al aparecer lastRunResult con su runId lo presenta,
      venga o no el mensaje RUN_RESULT. Al abrirse, SI existe activeRun con
      latido de menos de 60 s ENTONCES muestra la corrida en curso y su último
      progreso. SI el latido supera 60 s, O la pestaña de la corrida se cierra,
      ENTONCES el panel cierra la corrida como RunResult ERROR con
      failureStep = lost, lo guarda en lastRunResult, borra activeRun y habilita
      el botón. Como toda espera está acotada a 20 s (BR4.10) y el guardado a
      3 × 10 s, una corrida viva nunca pasa 60 s sin progreso.
    violation: Mensaje "La corrida dejó de responder (se cerró o recargó la pestaña). Puedes volver a intentar."
    source: [NFR8.1, NFR8.2, NFR8.3]
```

## Resumen de reglas

| ID | Regla | Categoría | Origen |
|---|---|---|---|
| BR1.1 | JSON sintácticamente válido o "❌ JSON inválido." | validation | FR1.2 |
| BR1.2 | ≥1 servicio, cada uno con `name`; `fields` objeto | validation | FR1.2 |
| BR1.3 | Región de la raíz, por defecto us-east-1, código conocido | validation | FR1.2, FR5.1 |
| BR1.4 | Normalizar a ServiceRequest (valores vs. toggles) | calculation | FR1.2 |
| BR2.1 | Reutilizar la pestaña existente | policy | FR2.1 |
| BR2.2 | Abrir la pestaña si no existe y esperar carga | policy | FR2.1 |
| BR2.3 | PING inicial + hasta 3 tras inyectar (1 s); solo `ready = true` conecta | policy | FR2.2, NFR8.1 |
| BR2.4 | Handshake agotado → ERROR visible, sin RPA | constraint | FR2.2, NFR3 |
| BR2.5 | Content script cargado una sola vez; `ready` tras el `import()` | constraint | FR2.2, NFR7 |
| BR3.1 | Mapeo solo con coincidencia única de etiqueta; 1 valor → 1 acción | calculation | FR3, FR5 |
| BR3.2 | Tipo de acción derivado del tipo de campo | calculation | FR5 |
| BR3.3 | Valor sin coincidencia → servicio falla, sin guardar | constraint | FR9.3 |
| BR3.4 | Valor contra opciones: coincidencia exacta normalizada | validation | FR5, NFR3 |
| BR4.1 | Región fijada una vez en el primer servicio | policy | FR5.1 |
| BR4.2 | Servicio no encontrado → falla (sin "primer resultado") | constraint | FR5 |
| BR4.3 | Relectura tras cada acción; no coincide → servicio falla | constraint | FR9.3 |
| BR4.4 | Confirmación solo por banner verde (10 s) | validation | FR9.1 |
| BR4.5 | "is required" → falla sin reintento | validation | FR9.2 |
| BR4.6 | Guardado hasta 3 intentos, luego falla | constraint | NFR8.1 |
| BR4.7 | EC2: acción compuesta, buscar instancia y elegir su fila | policy | FR6.5, FR6.6 |
| BR4.8 | Excepción → resultado tipado, nunca silencio | constraint | NFR3 |
| BR4.9 | Toggle no aplicado → falla; expansión de mejor esfuerzo | constraint | FR5.2, NFR3 |
| BR4.10 | Toda espera de página ≤ 20 s → `page_timeout` | constraint | NFR8.1 |
| BR5.1 | Todo-o-nada por inclusión de conjuntos | calculation | FR9.3 |
| BR5.2 | Renombrar al proyecto; fallo → corrida falla | constraint | FR10 |
| BR5.3 | URL solo del modal Share (sin fallback) | validation | FR10 |
| BR5.4 | Nunca mostrar URL fuera de DONE | constraint | FR9.3 |
| BR5.5 | Solo se corre sobre un estimado vacío | constraint | FR9.3 |
| BR5.6 | My Estimate = exactamente lo pedido antes de compartir | validation | FR9.3 |
| BR6.1 | Una corrida a la vez; `accepted = false` → ERROR | constraint | FR7 |
| BR6.2 | Progreso visible en el panel lateral | policy | FR7.3 |
| BR6.3 | Último resultado en `chrome.storage.local` | policy | FR7, NFR5 |
| BR6.4 | Mensajes en español y en lenguaje de dominio | policy | NFR3, C4 |
| BR6.5 | Sin inyección de HTML; URL validada | constraint | C6 |
| BR6.6 | Latido de 60 s y recuperación al reabrir el panel | policy | NFR8 |
