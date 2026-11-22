# Reglas de negocio — u2-input-parsers

> Reglas de la entrada: elegir el camino por pestaña, validar el JSON con el
> esquema estricto del Anexo A, enviar el lenguaje natural al cerebro y validar
> su respuesta igual que un JSON, y normalizar ambos a la misma corrida. El
> bloque YAML es la fuente de verdad; la tabla final es un resumen derivado.
> Prosa en español; identificadores en inglés.

## Sources

- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/user-stories/stories.md` (US2.1, US2.2, US3.1). [stories]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/requirements-analysis/requirements.md` (FR1.1-FR1.3, FR8, NFR1, NFR3; Anexo A). [requirements]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/domain-design/components.md` y `decisions.md` (ADR-005, ADR-006). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/contract-design/contract-summary.md` (interfaz `normalize`). [stage]
- `aidlc/spaces/default/knowledge/calculator-catalog/README.md` (por qué la interpretación no es determinística en general). [knowledge]
- `functional-design-questions.md` de esta unidad: Q1 (IA interpreta, bot ejecuta), Q1b (revisión Well-Architected en ambos momentos y para toda corrida), Q1c (obligatoria desde U4), Q2 (us-east-1 por defecto), Q3 (pestañas), Q4 (esquema estricto). [Q1-Q4]
- Reglas afirmadas en `aidlc/spaces/default/memory/project.md` (nunca reportar éxito en fallo; ninguna credencial en el cliente; sin código dinámico ni HTML sin sanitizar). [team-practices]

## Reglas (fuente de verdad)

```yaml
rules:
  # --- Grupo 1: elección del camino ----------------------------------------
  - id: BR1.1
    statement: El formato de la entrada lo fija la pestaña activa (JSON o lenguaje natural); no se detecta a partir del texto.
    category: policy
    applies_to: RawInput
    trigger: El SE pulsa "Generar Estimado".
    logic: SI la pestaña activa es JSON ENTONCES el texto sigue el Grupo 2; SI es lenguaje natural ENTONCES sigue el Grupo 3.
    violation: No aplica (la pestaña siempre está definida).
    source: [FR1, Q3]
  - id: BR1.2
    statement: Un texto vacío o solo con espacios no inicia nada.
    category: validation
    applies_to: RawInput
    trigger: El SE pulsa "Generar Estimado".
    logic: SI el texto sin espacios está vacío ENTONCES rechazar con empty_input.
    violation: Error visible "❌ Escribe la configuración antes de generar el estimado."; no se llama al cerebro ni se inicia el RPA.
    source: [NFR3]

  # --- Grupo 2: JSON (Anexo A, estricto) -------------------------------------
  - id: BR2.1
    statement: El texto de la pestaña JSON debe ser JSON sintácticamente válido.
    category: validation
    applies_to: RunInput
    trigger: Tras BR1.1 con formato json.
    logic: SI el texto no se puede parsear como JSON ENTONCES rechazar con invalid_json.
    violation: El panel muestra exactamente "❌ JSON inválido." y no inicia el RPA.
    source: [FR1.2, NFR3]
  - id: BR2.2
    statement: La raíz del JSON debe ser un objeto.
    category: validation
    applies_to: RunInput
    trigger: Tras BR2.1.
    logic: SI la raíz es una lista, texto, número, booleano o null ENTONCES rechazar con not_object.
    violation: Error visible que pide un objeto con "services".
    source: [FR1.2]
  - id: BR2.3
    statement: La configuración debe traer una lista services con al menos un servicio.
    category: validation
    applies_to: RunInput
    trigger: Tras BR2.2.
    logic: SI services falta o no es una lista ENTONCES missing_services; SI es una lista vacía ENTONCES empty_services.
    violation: Error visible ("❌ Falta la lista \"services\"." / "❌ Sin servicios definidos."); no inicia el RPA.
    source: [FR1.2, NFR3]
  - id: BR2.4
    statement: Cada servicio debe ser un objeto con name de texto no vacío; search_term, si viene, texto no vacío; fields, si viene, un objeto cuyos valores son texto, número o booleano; project, si viene, texto de 1 a 200 caracteres; region, si viene, texto no vacío.
    category: validation
    applies_to: [RunInput, RawService]
    trigger: Tras BR2.3, servicio por servicio en orden.
    logic: SI algún valor incumple su tipo ENTONCES rechazar con el código correspondiente nombrando el servicio (por name o por posición) y el campo.
    violation: Error de esquema visible que nombra el servicio y el campo; no inicia el RPA.
    source: [FR1.2, NFR3]
  - id: BR2.5
    statement: El esquema es cerrado; una clave que no pertenece al Anexo A es un error, no se ignora.
    category: validation
    applies_to: [RunInput, RawService]
    trigger: Tras BR2.2 (raíz) y en cada servicio.
    logic: >
      SI la raíz trae una clave distinta de project, region o services, O un
      servicio trae una clave distinta de name, search_term, template o fields
      (template: texto no vacío, plantilla del formulario, pedido de u5) ENTONCES
      rechazar con unknown_key nombrando la clave y, si aplica, el servicio.
    violation: "Error visible, p. ej. \"❌ El servicio \\\"Amazon S3\\\" tiene una clave desconocida: \\\"feilds\\\".\"; no inicia el RPA."
    source: [FR1.2, NFR3, Q4]
  - id: BR2.6
    statement: Los servicios se procesan en el orden en que aparecen en la configuración.
    category: policy
    applies_to: NormalizedRun
    trigger: Al normalizar.
    logic: El servicio en la posición i de services se convierte en svc-(i+1) y conserva esa posición.
    violation: No aplica.
    source: [FR1.2]
  - id: BR2.7
    statement: La configuración respeta los mismos topes que la revisión Well-Architected previa (C2), venga del JSON o del cerebro.
    category: constraint
    applies_to: [RunInput, RawService]
    trigger: Tras BR2.5, antes de normalizar.
    logic: SI hay más de 20 servicios, O un servicio trae más de 30 claves en fields, O una clave o un valor de fields supera 100 caracteres (tras pasar números y booleanos a texto) ENTONCES rechazar con input_limit_exceeded nombrando el límite, el servicio y la clave.
    violation: Error visible "❌ La configuración supera el límite de <límite> (servicio <n>, clave <clave>)."; no inicia la revisión ni el RPA. Si la configuración vino del cerebro se informa como nl_invalid_response (BR3.6).
    source: [FR1.2, FR8.1, NFR3]

  # --- Grupo 3: lenguaje natural ---------------------------------------------
  - id: BR3.1
    statement: La expresión en lenguaje natural tiene como máximo 2000 caracteres.
    category: constraint
    applies_to: RawInput
    trigger: Tras BR1.1 con formato natural_language.
    logic: SI el texto supera 2000 caracteres ENTONCES rechazar con input_too_long sin llamar al cerebro.
    violation: Error visible que indica el máximo; el texto queda editable.
    source: [NFR3]
  - id: BR3.2
    statement: La extensión no interpreta lenguaje natural por su cuenta; lo envía al cerebro y el bot solo ejecuta la configuración que vuelve.
    category: policy
    applies_to: NlInterpretationRequest
    trigger: Tras BR3.1.
    logic: >
      Construir una NlInterpretationRequest con el texto, locale es y la versión
      de esquema, y enviarla al cerebro por el puerto de interpretación. Solo
      viajan texto y parámetros: nunca capturas, credenciales ni datos de la
      pestaña.
    violation: No aplica.
    source: [FR1.1, NFR1, Q1]
  - id: BR3.3
    statement: La configuración que devuelve el cerebro pasa exactamente las mismas validaciones que un JSON pegado.
    category: validation
    applies_to: [NlInterpretationResponse, RunInput]
    trigger: El cerebro responde con status interpreted.
    logic: >
      Aplicar BR2.2 a BR2.5 a runInput. SI la respuesta no tiene la forma de
      NlInterpretationResponse, O status es interpreted sin runInput, O runInput
      no pasa las validaciones ENTONCES rechazar con nl_invalid_response.
    violation: Error visible "❌ No pude interpretar la descripción de forma confiable. Intenta de nuevo o usa la pestaña JSON."; no inicia el RPA.
    source: [FR1.1, FR1.3, NFR3]
  - id: BR3.4
    statement: Si el cerebro no pudo interpretar parte de la expresión, no se llena nada y se nombra lo que faltó.
    category: validation
    applies_to: [NlInterpretationResponse, UnresolvedFragment]
    trigger: El cerebro responde con status unresolved.
    logic: >
      Rechazar con nl_unresolved y copiar los fragmentos al error. El mensaje
      nombra cada fragmento en lenguaje de dominio según su motivo y servicio (p.
      ej. "no reconocí el servicio \"almacenamiento frío\"", "no sé a qué campo
      de S3 Standard corresponden \"100 GB\"").
    violation: La corrida normalizada queda vacía; el panel muestra el error con los fragmentos; no inicia el RPA.
    source: [FR1.1, NFR3]
  - id: BR3.5
    statement: Si el cerebro no está disponible o no responde a tiempo, la interpretación falla de forma visible.
    category: constraint
    applies_to: NlInterpretationRequest
    trigger: El puerto de interpretación no existe todavía, falla o no responde en 30 s.
    logic: Rechazar con brain_unavailable. No se reintenta en silencio ni se recurre a un parser local.
    violation: Error visible "❌ No pude conectar con el servicio que interpreta la descripción. Usa la pestaña JSON o intenta más tarde."; el texto queda editable.
    source: [NFR1, NFR3, Q1]

  - id: BR3.6
    statement: La respuesta del cerebro se valida entera como dato no confiable, con forma estricta y topes.
    category: validation
    applies_to: [NlInterpretationResponse, UnresolvedFragment]
    trigger: Respuesta del puerto de interpretación.
    logic: >
      Forma: status interpreted ⇒ runInput presente con 1 a 20 servicios, que
      además cumplen los topes de BR2.7, y sin unresolved; status unresolved ⇒ 1 a 20 fragmentos y sin runInput; reason
      dentro del enum (incluido region_unavailable, pedido por u4); fragment y
      service de hasta 200 caracteres. Cualquier violación → nl_invalid_response.
      Un error de normalización (BR4.2, BR4.4) sobre una configuración que vino
      del cerebro también se informa como nl_invalid_response. Todo texto del
      cerebro (fragmentos, mensajes) se muestra solo como texto plano
      (obligación para u6, BR5.1 de u6). El puerto recibe el AbortSignal de
      la corrida (interpretNaturalLanguage(request, { signal })); una respuesta
      que llega tras abortar se descarta y normalize resuelve con cancelled, que
      no se muestra como error. No hay requestId en esta interfaz. La revisión
      obligatoria se deriva de que exista el puerto (BR5.4).
    violation: InputError nl_invalid_response; no se llena nada.
    source: [FR1.1, NFR3, NFR5]

  # --- Grupo 4: normalización --------------------------------------------------
  - id: BR4.1
    statement: Si la configuración no trae región, se usa us-east-1 y se marca como región por defecto.
    category: policy
    applies_to: NormalizedRun
    trigger: Al normalizar una configuración sin region (JSON o respuesta del cerebro).
    logic: SI region falta ENTONCES region = us-east-1 y regionDefaulted = true; SI viene ENTONCES regionDefaulted = false.
    violation: No aplica; el panel muestra la región usada antes de correr.
    source: [FR1.3, Q2]
  - id: BR4.2
    statement: La región debe ser un código conocido de la calculadora.
    category: validation
    applies_to: NormalizedRun
    trigger: Tras BR4.1.
    logic: SI el código no está en la tabla de regiones ENTONCES rechazar con unknown_region nombrando el código.
    violation: Error visible "❌ No reconozco la región <código>."; no inicia el RPA.
    source: [FR1.3, NFR3]
  - id: BR4.3
    statement: Los valores de campo se normalizan a texto.
    category: calculation
    applies_to: RequestedValue
    trigger: Al normalizar cada fields.
    logic: Texto queda igual; número pasa a su forma decimal; booleano pasa a "true" o "false".
    violation: No aplica (los tipos inválidos ya los rechaza BR2.4).
    source: [FR1.3]
  - id: BR4.4
    statement: Las claves __switch__:<toggle> se convierten en toggles con valor on, off, true o false.
    category: validation
    applies_to: ToggleRequest
    trigger: Al normalizar fields.
    logic: SI el nombre del toggle está vacío O el valor no es on, off, true ni false (sin distinguir mayúsculas) ENTONCES rechazar con invalid_toggle.
    violation: Error visible que nombra el toggle y el servicio.
    source: [FR1.2, FR5.2]
  - id: BR4.5
    statement: Si un servicio no trae search_term, se busca por su name.
    category: policy
    applies_to: ServiceRequest
    trigger: Al normalizar cada servicio.
    logic: searchTerm = search_term recortado, o name recortado si falta.
    violation: No aplica.
    source: [FR1.2, Q4]
  - id: BR4.6
    statement: JSON y lenguaje natural convergen en la misma corrida normalizada.
    category: policy
    applies_to: NormalizedRun
    trigger: Al terminar la normalización.
    logic: >
      Dos entradas que describen la misma configuración producen NormalizedRun
      iguales salvo en source. La normalización es una sola, compartida; no hay
      una variante por formato.
    violation: No aplica.
    source: [FR1.3]

  # --- Grupo 5: recuperación y revisión Well-Architected -----------------------
  - id: BR5.1
    statement: Un error de entrada nunca borra ni altera el texto que escribió el SE.
    category: policy
    applies_to: RawInput
    trigger: Cualquier InputError.
    logic: El texto y la pestaña quedan como estaban para que el SE lo corrija.
    violation: No aplica.
    source: [NFR3]
  - id: BR5.2
    statement: Cada "Generar Estimado" normaliza desde cero; nada de una corrida fallida pasa a la siguiente.
    category: policy
    applies_to: NormalizedRun
    trigger: El SE vuelve a pulsar "Generar Estimado".
    logic: Se descarta cualquier NormalizedRun, respuesta del cerebro o error anterior y se vuelve a empezar por BR1.1.
    violation: No aplica.
    source: [NFR3]
  - id: BR5.3
    statement: La normalización produce un único resultado tipado, o una corrida completa o un error; nunca ambos.
    category: constraint
    applies_to: [NormalizedRun, InputError]
    trigger: Fin de normalize.
    logic: SI hubo cualquier error ENTONCES devolver solo InputError (sin servicios); SI no ENTONCES devolver NormalizedRun completo.
    violation: No aplica.
    source: [NFR3]
  - id: BR5.4
    statement: Toda corrida pasa por la revisión Well-Architected antes de llenar cuando el cerebro está integrado; mientras no lo esté, el camino JSON corre sin revisión y se avisa.
    category: policy
    applies_to: NormalizedRun
    trigger: Fin de una normalización exitosa.
    logic: >
      SI el cerebro está integrado ENTONCES wafReview = required y la corrida no
      empieza sin esa revisión (la ejecuta U4 y la muestra U6). SI no lo está
      ENTONCES wafReview = not_available y el panel avisa que la corrida no tuvo
      revisión Well-Architected. El lenguaje natural siempre requiere el cerebro
      (BR3.5).
    violation: Con wafReview = required y el cerebro sin responder, la corrida no inicia y el panel lo explica.
    source: [FR8, Q1b, Q1c]
```

## Resumen

| ID | Regla | Categoría |
|---|---|---|
| BR1.1 | La pestaña activa fija el formato | policy |
| BR1.2 | Texto vacío no inicia nada | validation |
| BR2.1 | JSON inválido → "❌ JSON inválido." | validation |
| BR2.2 | La raíz debe ser un objeto | validation |
| BR2.3 | `services` presente y no vacío | validation |
| BR2.4 | Tipos de cada servicio y de la raíz | validation |
| BR2.5 | Esquema cerrado: clave desconocida = error | validation |
| BR2.6 | Orden de la configuración se respeta | policy |
| BR2.7 | Topes comunes con C2: 20 servicios, 30 claves, 100 caracteres | constraint |
| BR3.1 | Lenguaje natural ≤ 2000 caracteres | constraint |
| BR3.2 | El cerebro interpreta; el bot ejecuta | policy |
| BR3.3 | La respuesta del cerebro se valida como un JSON | validation |
| BR3.4 | Fragmentos no interpretados → error, nada se llena | validation |
| BR3.5 | Cerebro no disponible (30 s) → error visible | constraint |
| BR3.6 | Respuesta del cerebro: forma estricta, topes, texto plano, descarte tras abortar | validation |
| BR4.1 | Sin región → us-east-1 marcada como por defecto | policy |
| BR4.2 | Región debe ser conocida | validation |
| BR4.3 | Valores a texto | calculation |
| BR4.4 | Toggles on/off/true/false | validation |
| BR4.5 | `search_term` por defecto = `name` | policy |
| BR4.6 | Ambos formatos convergen | policy |
| BR5.1 | Un error nunca borra el texto | policy |
| BR5.2 | Cada corrida normaliza desde cero | policy |
| BR5.3 | Corrida completa o error, nunca ambos | constraint |
| BR5.4 | Revisión Well-Architected obligatoria desde U4 | policy |
