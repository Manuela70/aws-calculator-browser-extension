# Reglas de negocio — u4-mapping-brain

> Reglas del cerebro server-side: límites comunes de sus operaciones,
> interpretación de lenguaje natural contra el inventario, resolución del
> residuo, evaluación Well-Architected antes y después de llenar, mantenimiento
> del inventario y registro de invocaciones. El bloque YAML es la fuente de
> verdad; la tabla final es un resumen derivado. Prosa en español;
> identificadores en inglés.

## Sources

- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/user-stories/stories.md` (US5.1: AC5.1.1-AC5.1.4). [stories]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/requirements-analysis/requirements.md` (FR8.1-FR8.5, NFR1, NFR3, NFR5). [requirements]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/domain-design/decisions.md` (ADR-001, ADR-005 sin capturas, ADR-006 dos presupuestos). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/contract-design/contract-summary.md` (C1, C2, ownership, resiliencia). [stage]
- `aidlc/spaces/default/knowledge/calculator-catalog/README.md`. [knowledge]
- Decisiones de u2 (Q1 la IA interpreta; Q1b/Q1c revisión obligatoria) y u3 (Q1 unidad como clave propia; Q3 sección en etiquetas repetidas). [stage]
- `functional-design-questions.md` de esta unidad: Q1 (aviso con confirmación), Q2 (agente aparte), Q3 (inventario versionado), Q4 (Claude en Bedrock). [Q1-Q4]
- Reglas afirmadas en `aidlc/spaces/default/memory/project.md` (credencial solo server-side; nunca éxito en fallo). [team-practices]

## Reglas (fuente de verdad)

```yaml
rules:
  # --- Grupo 1: límites comunes ----------------------------------------------
  - id: BR1.1
    statement: Todo pedido se valida contra su esquema antes de invocar el modelo.
    category: validation
    applies_to: [InterpretRequest, MapResidueRequest, WafRequest]
    trigger: Llega un pedido.
    logic: >
      SI falta un campo requerido, un tipo no coincide, schemaVersion no es una
      versión soportada, o se supera un tope (2000 caracteres de texto; 20
      servicios, 30 claves de config y 100 caracteres por clave o valor en
      Well-Architected; 500 campos escaneados) ENTONCES responder bad_request sin
      invocar el modelo. Los campos desconocidos se ignoran (evolución aditiva
      de contract-summary).
    violation: BrainError bad_request.
    source: [NFR3, NFR5]
  - id: BR1.2
    statement: El cerebro solo acepta datos estructurados y texto; nunca imágenes ni capturas.
    category: constraint
    applies_to: [InterpretRequest, MapResidueRequest, WafRequest]
    trigger: Llega un pedido.
    logic: Cualquier contenido binario o de imagen es bad_request.
    violation: BrainError bad_request.
    source: [ADR-005]
  - id: BR1.3
    statement: La credencial del modelo vive solo en el servidor y nunca aparece en una respuesta, un error ni un registro.
    category: constraint
    applies_to: [ModelInvocation, BrainError]
    trigger: Siempre.
    logic: El acceso al modelo es por la identidad del servidor (Claude en Amazon Bedrock con permisos IAM, Q4); ningún mensaje de error copia encabezados, rutas ni detalles del proveedor.
    violation: No aplica.
    source: [NFR5, Q4]
  - id: BR1.4
    statement: La salida del modelo nunca se reenvía sin validar; si no cumple el contrato, se reintenta una vez y luego se responde con error.
    category: validation
    applies_to: [InterpretResponse, MapResidueResponse, WafServiceResult]
    trigger: El modelo responde.
    logic: >
      Validar la salida contra el esquema y las reglas de su operación (Grupos
      2-4). SI no cumple ENTONCES un segundo intento indicando qué falló; SI
      vuelve a fallar ENTONCES empty_result.
    violation: BrainError empty_result; nunca una respuesta parcial o vacía con 200.
    source: [FR8.5, NFR3]
  - id: BR1.5
    statement: Cada operación responde en 25 s o menos, dentro del tope de 30 s del cliente.
    category: constraint
    applies_to: [InterpretRequest, MapResidueRequest, WafRequest]
    trigger: Llega un pedido.
    logic: >
      Los dos intentos de BR1.4 comparten un presupuesto de 25 s; si se agota, se
      corta. En /waf-evaluate los servicios se reparten en lotes de hasta 5 que
      se evalúan en paralelo, cada uno con sus dos intentos dentro de los mismos
      25 s; si un lote falla, falla la respuesta entera (nunca parcial). La
      extensión usa 30 s como tope en las tres operaciones.
    violation: BrainError timeout. Un fallo del proveedor del modelo → model_unavailable.
    source: [FR8.5, NFR3]
  - id: BR1.6
    statement: Toda respuesta exitosa indica la versión del inventario usada.
    category: policy
    applies_to: [InterpretResponse, MapResidueResponse, WafServiceResult]
    trigger: Respuesta 200.
    logic: Incluir inventoryVersion.
    violation: No aplica.
    source: [Q3]

  # --- Grupo 2: interpretar lenguaje natural ----------------------------------
  - id: BR2.1
    statement: La configuración interpretada solo usa servicios, etiquetas y opciones que existen en el inventario activo.
    category: validation
    applies_to: InterpretResponse
    trigger: Validación de la salida del modelo (BR1.4).
    logic: >
      Cada servicio debe ser el name de un InventoryService canónico y
      search_term se completa con ese mismo name. Todas las claves de un servicio
      deben pertenecer a una sola plantilla. Si el servicio tiene más de una
      plantilla (InventoryService.templates con 2 o más), el servicio SIEMPRE
      lleva el campo template con su nombre visible (u5 Q2), sea o no la que
      abre la calculadora; si tiene una sola, template se omite. Así el código
      no necesita saber cuál es la plantilla por defecto. Las claves no llevan la
      plantilla como prefijo. Cada clave
      de fields
      debe ser una etiqueta de ese servicio, con sección si la etiqueta se repite,
      o "<Campo> unit" para un campo con unidad, o "__switch__:<Toggle>" para un
      toggle. Cada valor de un campo choice o unit debe ser una de sus opciones;
      de un quantity, un número decimal simple; de un checkbox, true o false; de
      un toggle, on u off. La forma debe ser coherente: interpreted ⇒ runInput
      con al menos un servicio y sin unresolved; unresolved ⇒ al menos un
      fragmento y sin runInput. project solo se incluye si la expresión nombra un
      proyecto.
    violation: Salida inválida → BR1.4.
    source: [FR1.1, Q3]
  - id: BR2.2
    statement: Lo que no se puede interpretar se devuelve como fragmentos no interpretados, nunca como configuración parcial.
    category: constraint
    applies_to: InterpretResponse
    trigger: Alguna parte de la expresión no tiene servicio, campo o valor válido en el inventario.
    logic: >
      status = unresolved, sin runInput, con cada fragmento, el servicio al que se
      refería si se sabe, y el motivo (unknown_service, ambiguous_service,
      unknown_field, ambiguous_field, missing_value, unsupported_component).
      Campos de tipo complex se reportan como unsupported_component. Un servicio
      no disponible en la región pedida se reporta con region_unavailable (valor
      nuevo del enum de u2, ver functional-spec §7); no es un error del cerebro.
    violation: No aplica.
    source: [FR1.1, NFR3]
  - id: BR2.3
    statement: El cerebro solo incluye lo que la expresión pide; no inventa valores.
    category: policy
    applies_to: InterpretResponse
    trigger: Armado de runInput.
    logic: >
      Solo los campos que la expresión menciona; los demás quedan fuera (el
      formulario conserva sus valores por defecto). Si falta la región, se omite
      region (u2 aplica us-east-1). La unidad va siempre en su propia clave.
    violation: No aplica.
    source: [FR1.1, u2 Q2, u3 Q1]

  # --- Grupo 3: residuo de mapeo (C1) -----------------------------------------
  - id: BR3.1
    statement: El cerebro solo propone acciones sobre los campos recibidos y para las claves del residuo.
    category: validation
    applies_to: MapResidueResponse
    trigger: Validación de la salida del modelo (BR1.4).
    logic: >
      Cada acción lleva un requestKey del residuo recibido (como máximo una por
      clave), un fieldLabel idéntico al label de un domField recibido, el
      actionType que corresponde a su tipo y, para fill, checkbox y toggle, el
      mismo valor pedido; para selectores, una de las opciones del campo.
    violation: Salida inválida → BR1.4.
    source: [C1, regla de validación del cerebro de u3]
  - id: BR3.2
    statement: Si el cerebro no encuentra campo para una clave, la omite.
    category: policy
    applies_to: MapResidueResponse
    trigger: Una clave del residuo sin campo plausible.
    logic: No se emite acción para esa clave; la extensión la deja como residuo y el servicio falla con motivo.
    violation: No aplica.
    source: [NFR3, u3 Q2]

  # --- Grupo 4: Well-Architected (C2) -----------------------------------------
  - id: BR4.1
    statement: La evaluación Well-Architected tiene dos momentos con el mismo contrato de respuesta.
    category: policy
    applies_to: WafRequest
    trigger: Pedido a /waf-evaluate.
    logic: >
      phase = pre_fill evalúa la configuración que se va a llenar; phase =
      post_fill evalúa el estimado construido. Ambos devuelven WafServiceResult
      por servicio (FR8.4).
    violation: No aplica.
    source: [FR8, u2 Q1b]
  - id: BR4.2
    statement: Cada servicio pedido aparece exactamente una vez, con recomendaciones o con "sin hallazgos" explícito.
    category: validation
    applies_to: WafServiceResult
    trigger: Validación de la salida del modelo (BR1.4).
    logic: >
      La lista perService tiene un elemento por cada servicio del pedido, en el
      mismo orden, con serviceIndex igual a su posición. noFindings = true sin
      recomendaciones, o noFindings = false con 1 a 5 recomendaciones. Cada
      recomendación tiene pilar del enum, severidad y texto no vacío de hasta 300
      caracteres que no contiene "<", ">", "http://" ni "https://" (oráculo
      verificable del texto plano). El español lo pide la instrucción al modelo
      y se mide en el conjunto de referencia de Build and Test, no en esta
      validación. Una violación invalida la salida (BR1.4); no se sanea.
    violation: Salida inválida → BR1.4.
    source: [FR8.4, AC5.1.1, AC5.1.4]
  - id: BR4.3
    statement: La revisión previa nunca bloquea por sí sola; el SE decide.
    category: policy
    applies_to: WafServiceResult
    trigger: Respuesta de phase = pre_fill con hallazgos.
    logic: >
      El cerebro solo informa hallazgos con su severidad. El panel (U6) los
      muestra y el SE elige "llenar igual" o "corregir" (Q1). Si la revisión
      previa falla (error, tope), la corrida no inicia y el panel lo explica (u2
      regla de revisión obligatoria).
    violation: No aplica.
    source: [Q1, u2 Q1b]

  # --- Grupo 5: inventario ------------------------------------------------------
  - id: BR5.1
    statement: El inventario se regenera periódicamente con el script del proyecto y se publica como una versión nueva.
    category: policy
    applies_to: InventorySnapshot
    trigger: Una vez por semana, o a pedido del mantenedor.
    logic: Ejecutar build-inventory (fetch + build) y publicar el resultado como InventorySnapshot con status active; la versión anterior pasa a superseded.
    violation: Si falla la generación, sigue activa la versión anterior (BR5.3).
    source: [Q3]
  - id: BR5.2
    statement: Una versión nueva solo se activa si no pierde más del 10 % de servicios o campos respecto de la activa.
    category: validation
    applies_to: InventorySnapshot
    trigger: Antes de activar una versión.
    logic: SI serviceCount o fieldCount cae más del 10 % ENTONCES status = rejected y se mantiene la activa.
    violation: La versión queda rejected y se avisa al mantenedor.
    source: [NFR2, Q3]
  - id: BR5.3
    statement: Una versión activa con más de 14 días se informa como desactualizada.
    category: policy
    applies_to: InventorySnapshot
    trigger: Chequeo de salud del cerebro.
    logic: SI la versión activa tiene más de 14 días ENTONCES el chequeo de salud lo marca; el cerebro sigue respondiendo con ella.
    violation: Aviso al mantenedor.
    source: [Q3]

  # --- Grupo 6: registro y costo ------------------------------------------------
  - id: BR6.1
    statement: Ningún registro, error ni log del servicio contiene datos del cliente.
    category: constraint
    applies_to: [ModelInvocation, BrainError]
    trigger: Cada pedido, aceptado o rechazado, y cada invocación del modelo.
    logic: >
      Registrar operación, versión de inventario, tokens, latencia, intentos y
      resultado. Nunca el texto, nombres de servicio pedidos, valores, campos ni
      proyecto, tampoco en pedidos rechazados ni en registros de acceso.
      BrainError.message sale de un catálogo fijo de mensajes y nunca copia el
      pedido. El registro de invocaciones del proveedor del modelo queda
      desactivado.
    violation: No aplica.
    source: [NFR5]
  - id: BR6.2
    statement: El consumo se mide por separado para interpretación, residuo y Well-Architected.
    category: policy
    applies_to: ModelInvocation
    trigger: Reporte de consumo.
    logic: Los tokens se agregan por operation, para seguir los presupuestos distintos de ADR-006.
    violation: No aplica.
    source: [ADR-006]

  # --- Grupo 7: candidatos, errores e inventario inicial -----------------------
  - id: BR7.1
    statement: Los servicios candidatos para interpretar los elige código, no el modelo, y el pedido al modelo está acotado.
    category: calculation
    applies_to: InterpretRequest
    trigger: Antes de invocar el modelo en /interpret.
    logic: >
      Normalizar la expresión (minúsculas, sin tildes) y buscar coincidencias de
      palabras contra name, searchKeywords y synonymsEs de los servicios
      canónicos; tomar hasta 8 candidatos por puntaje. Al modelo se le envían la
      lista compacta de nombres canónicos (sin campos) y los campos y opciones
      completos solo de los candidatos. Un servicio que el modelo elija fuera de
      los candidatos no se puede validar y se devuelve como unresolved con
      unknown_service; no cuenta como salida inválida. Sin candidatos, la
      respuesta es unresolved con unknown_service sin invocar el modelo.
    violation: No aplica.
    source: [FR1.1, Q3, ADR-006]
  - id: BR7.2
    statement: Cada código de error tiene un estado HTTP fijo.
    category: policy
    applies_to: BrainError
    trigger: Respuesta de error.
    logic: >
      bad_request 400; unauthorized 401; rate_limited 429 (con
      retryAfterSeconds); daily_quota_exceeded 429; empty_result 502;
      model_unavailable 503; inventory_unavailable 503; timeout 504;
      internal_error 500 (cualquier excepción no prevista). Los códigos
      unauthorized, rate_limited, daily_quota_exceeded e inventory_unavailable
      se agregaron en NFR Requirements (contract-summary, "Cambios de NFR
      Requirements"). /map-residue y /waf-evaluate no validan el nombre del
      servicio contra el inventario: trabajan con los campos y la configuración
      que reciben, así que no devuelven unknown_service (C2 no lo tiene en su
      enum). unknown_service solo aparece como motivo de un fragmento de
      /interpret (BR2.2), nunca como error HTTP.
    violation: No aplica.
    source: [C1, C2, NFR3]
  - id: BR7.3
    statement: El cerebro no responde sin un inventario activo; la primera versión se publica antes de habilitarlo.
    category: constraint
    applies_to: InventorySnapshot
    trigger: Arranque o pedido sin versión activa.
    logic: SI no hay InventorySnapshot active ENTONCES las tres operaciones responden inventory_unavailable (503) y el chequeo de salud lo marca. La primera versión es la generada en este proyecto el 2026-11-21.
    violation: BrainError inventory_unavailable.
    source: [Q3]
```

## Resumen

| ID | Regla | Categoría |
|---|---|---|
| BR1.1 | Pedidos validados y acotados antes de invocar | validation |
| BR1.2 | Sin imágenes | constraint |
| BR1.3 | Credencial solo server-side (Bedrock vía IAM) | constraint |
| BR1.4 | Salida del modelo validada; 1 reintento; si no, empty_result | validation |
| BR1.5 | ≤ 25 s por operación | constraint |
| BR1.6 | Versión del inventario en cada respuesta | policy |
| BR2.1 | Interpretación solo con servicios, etiquetas y opciones del inventario | validation |
| BR2.2 | Lo no interpretable → fragmentos, nunca parcial | constraint |
| BR2.3 | Solo lo pedido; unidad aparte; sin región si no se dijo | policy |
| BR3.1 | Acciones del residuo solo sobre campos recibidos, con requestKey y valor pedido | validation |
| BR3.2 | Clave sin campo → se omite | policy |
| BR4.1 | Well-Architected antes y después de llenar, mismo contrato | policy |
| BR4.2 | Cada servicio una vez por índice; "sin hallazgos" explícito; ≤ 5 recomendaciones de ≤ 300 caracteres, texto plano verificable | validation |
| BR4.3 | La revisión previa informa; el SE decide | policy |
| BR5.1 | Inventario semanal versionado | policy |
| BR5.2 | No activar una versión que pierde > 10 % | validation |
| BR5.3 | Aviso si la versión activa tiene > 14 días | policy |
| BR6.1 | Ningún registro ni error con datos del cliente | constraint |
| BR6.2 | Consumo separado por operación (solo mide; los límites de tasa y consumo quedan como requisito de NFR Design) | policy |
| BR7.1 | Candidatos elegidos por código (hasta 8) | calculation |
| BR7.2 | Código de error → estado HTTP | policy |
| BR7.3 | Sin inventario activo no se responde | constraint |
