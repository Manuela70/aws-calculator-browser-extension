# Reglas de negocio — u5-rpa-dom

> Reglas del RPA: flujo de una corrida de varios servicios, flujo por servicio
> con plantilla y pasadas de mapeo, resolución en cascada y FIX del v6,
> guardado, agregación todo-o-nada, progreso y spotlight. Generaliza las reglas
> de U1 (BR4.x, BR5.x) sin cambiar su sentido. El bloque YAML es la fuente de
> verdad; la tabla final es un resumen derivado. Prosa en español;
> identificadores en inglés.

## Sources

- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/user-stories/stories.md` (US4.1-US4.4, US6.1, US6.2, US7.1, US8.1). [stories]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/requirements-analysis/requirements.md` (FR3-FR7, FR9-FR11, NFR2, NFR3, NFR8). [requirements]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/contract-design/contract-summary.md` (`aggregate`, DomField, MappingAction). [stage]
- `aidlc/spaces/default/knowledge/calculator-catalog/README.md`. [knowledge]
- Decisiones de u1 (todo-o-nada, banner verde, 3 min por servicio, estimado vacío), u3 (toggles antes de escanear, pasadas, residuo). [stage]
- `functional-design-questions.md` de esta unidad: Q1 (seguir y no dar URL), Q2 (plantilla elegible), Q3 (salir sin guardar), Q4 (spotlight). [Q1-Q4]
- Reglas afirmadas en `aidlc/spaces/default/memory/project.md` (banner verde, `is required`, nunca éxito en fallo, sin HTML con datos). [team-practices]

## Reglas (fuente de verdad)

```yaml
rules:
  # --- Grupo 1: corrida -------------------------------------------------------
  - id: BR1.1
    statement: Todos los servicios pedidos se procesan en orden aunque alguno falle.
    category: policy
    applies_to: RunResult
    trigger: Un servicio termina con status failed.
    logic: >
      Se registra su ServiceResult y se continúa con el siguiente. Única
      excepción: si la salida sin guardar no se confirma (BR2.5), la corrida se
      detiene; los servicios restantes quedan failed con not_attempted, de modo
      que results sigue teniendo uno por servicio pedido. También se detiene por
      cancelación del SE o por perder la pestaña (U1). Con cero servicios no hay
      corrida (u2 lo rechaza antes).
    violation: No aplica.
    source: [FR9, Q1]
  - id: BR1.2
    statement: La corrida termina en DONE con URL si y solo si todos los servicios pedidos quedaron confirmados y el estimado contiene exactamente lo pedido.
    category: constraint
    applies_to: RunResult
    trigger: Fin del procesamiento de servicios.
    logic: >
      SI algún servicio quedó failed ENTONCES status = ERROR, missing lista sus
      nombres, failureStep = services, sin URL y sin renombrar ni compartir. SI
      todos confirmados ENTONCES verificar el contenido del estimado (U1 regla 5.6),
      renombrar si hay project (U1 regla 5.2), compartir y devolver la URL pública
      (U1 regla 5.3); cualquier fallo en esos pasos → ERROR con su failureStep.
    violation: Nunca hay URL con ERROR.
    source: [FR9, FR10, AC7.1.1, AC7.1.2]
  - id: BR1.3
    statement: La región se fija una sola vez, en el primer servicio.
    category: policy
    applies_to: ServiceRequest
    trigger: Primer servicio de la corrida.
    logic: Fijar la región en el primer servicio cuyo formulario se abre (si el primero falla con service_not_found, la fija el siguiente), antes de elegir la plantilla (BR2.1), para que el cambio de región no reinicie una plantilla ya elegida; una vez fijada, en los siguientes no se toca.
    violation: Si no se puede fijar, ese servicio falla con field_not_applied y detalle "Region", y los demás siguen (BR1.1).
    source: [FR5.1, AC4.1.2]

  # --- Grupo 2: flujo por servicio -------------------------------------------
  - id: BR2.1
    statement: Si el servicio pide una plantilla, se abre esa; si no, la que la calculadora abre por defecto.
    category: policy
    applies_to: ServiceRequest
    trigger: Tras localizar el servicio y pulsar Configure.
    logic: >
      SI template viene ENTONCES, tras fijar la región, elegir el control de
      plantilla (pestaña o radio) cuya etiqueta visible coincide exacta y
      normalizada con template, y esperar a que el formulario cambie, antes de
      aplicar toggles y escanear; SI no hay coincidencia única ENTONCES fallo
      template_not_found. La plantilla llega como campo template del servicio
      (cambio de contrato de u2, §7).
    violation: ServiceResult failed con template_not_found y el nombre pedido.
    source: [Q2]
  - id: BR2.2
    statement: Los toggles se aplican antes del primer escaneo.
    category: policy
    applies_to: ToggleRequest
    trigger: Formulario abierto.
    logic: Aplicar cada toggle por su etiqueta (cascada, BR3.1; FIX-9 aria-labelledby); luego escanear.
    violation: Toggle no aplicado → toggle_not_applied (U1 regla 4.9).
    source: [FR5.2, AC4.1.3]
  - id: BR2.3
    statement: El mapeo se ejecuta en pasadas, aplicando las acciones de cada una antes de reescanear.
    category: policy
    applies_to: ServiceRequest
    trigger: Tras el primer escaneo.
    logic: >
      Pasada: escanear, llamar a mapDeterministic (u3) con los pendientes, aplicar
      las acciones nuevas. Repetir mientras haya acciones nuevas y pendientes,
      hasta 3 pasadas, y escanear una última vez tras la tercera. Luego
      resolveResidue (u3); aplicar las acciones aceptadas y, por cada una con
      substituted = true, registrar {key, requestedValue, appliedValue} en
      brainSubstitutions.
    violation: Residuo final → field_not_recognized con el detalle "clave: motivo" (u3 BR3.4).
    source: [FR3, u3 BR3.1-BR3.4]
  - id: BR2.4
    statement: Cada acción se relee tras aplicarse; si el valor visible no es el pedido, el servicio falla.
    category: validation
    applies_to: MappingAction
    trigger: Tras aplicar una acción.
    logic: Comparar el valor visible del control con el valor de la acción (normalizado).
    violation: field_not_applied con la etiqueta.
    source: [FR3, U1 regla 4.3]
  - id: BR2.5
    statement: Un servicio que falla con el formulario abierto sale sin guardar, con su propio tiempo, y se informa dónde se detuvo.
    category: policy
    applies_to: ServiceResult
    trigger: Fallo del servicio después de pulsar Configure, incluido el corte de 3 minutos.
    logic: >
      La salida corre con una señal propia, no con la del servicio (que puede
      estar ya abortada), y con un presupuesto de 20 s fuera de los 180 s del
      servicio. Pulsar Cancel (o volver a My Estimate) sin guardar y confirmar
      que se ve My Estimate. Registrar stoppedAtLabel con el último campo
      intentado. Fallos antes de Configure (service_not_found) no tienen
      formulario abierto y no pasan por la salida. Si el fallo ocurrió durante
      el guardado (save_not_confirmed o corte en Saving), tras salir se revisa My
      Estimate: si el servicio aparece igual, el detalle lo indica y la
      verificación final del estimado (BR1.2) impide la URL. Si la salida no se
      confirma en 20 s, la corrida se detiene (BR1.1) con failureStep services.
    violation: No aplica.
    source: [Q3, NFR8]
  - id: BR2.6
    statement: El guardado se confirma solo por el banner verde nuevo con el nombre del servicio; is required es fallo inmediato; hasta 3 intentos.
    category: constraint
    applies_to: ServiceResult
    trigger: Pulsar Save and add service.
    logic: Igual que U1 regla 4.4-regla 4.6, con el contador de reintentos puro (BR4.1).
    violation: validation_required o save_not_confirmed.
    source: [FR5.3, FR9.1, FR9.2, AC4.1.4]
  - id: BR2.7
    statement: Cada servicio tiene un corte duro de 3 minutos.
    category: constraint
    applies_to: ServiceResult
    trigger: Inicio del servicio.
    logic: >
      Una señal de servicio se aborta a los 180 s desde que empieza la búsqueda
      del servicio (NFR8.6 de u1, implementado en lib/rpa/service-timer.js).
      Todas las esperas, acciones, la consulta al cerebro (resolveResidue) y el
      guardado reciben esa señal. Al cortar, BR2.5 con su señal propia y luego
      el siguiente servicio (BR1.1).
    violation: service_timeout.
    source: [NFR8]
  - id: BR2.8
    statement: En selectores cuyas opciones solo se ven al abrirlos, la opción se elige por coincidencia exacta y única; nunca por aproximación.
    category: validation
    applies_to: MappingAction
    trigger: Aplicar una acción select, dropdown o radio sobre un campo sin options escaneadas (u3 BR2.4).
    logic: >
      Abrir el control, leer sus opciones y aplicar matchOption (u3,
      lib/mapping/option-match.js). Una coincidencia → elegirla. Ninguna →
      option_no_match; varias → option_ambiguous; en ambos casos no se elige
      nada. Nunca "contiene" ni "primera opción".
    violation: option_no_match u option_ambiguous con el valor pedido.
    source: [FR3, u3 BR2.4]

  # --- Grupo 3: resolución y FIX ---------------------------------------------
  - id: BR3.1
    statement: Un elemento se resuelve por etiqueta con una cascada fija y exige coincidencia única.
    category: validation
    applies_to: ResolvedElement
    trigger: Ubicar un campo, toggle o botón.
    logic: >
      La elección es una función pura, selectByCascade(candidatesByStrategy,
      requestedSection), en lib/dom/cascade.js (Zona A). Zona B solo junta, para
      cada estrategia en orden (aria_label tras cleanAriaLabel, aria_labelledby,
      label_for, section_heading), los candidatos cuya etiqueta coincide exacta y
      normalizada, cada uno con su sección (heading de su grupo, o heading
      precedente si no hay grupo, FIX-3). Para cada estrategia en orden: 1
      candidato → se elige; más de 1 → se filtran por sección igual a
      requestedSection (la parte "Sección" de la clave; si la clave no trae
      sección no hay filtro y la estrategia no elige); si queda 1 → se elige;
      si quedan 0 o varios, o la estrategia dio 0 → siguiente estrategia. Sin
      elección tras la última → field_not_resolved con los conteos de cada
      intento. aria_labelledby se calcula uniendo con un espacio el texto de
      cada id referenciado, en orden, y pasando el resultado por cleanAriaLabel
      (FIX-8, FIX-9).
    violation: field_not_resolved visible (FR4.3).
    source: [FR4.1, FR4.3, FR6.3, FR6.7, AC4.2.1, AC4.2.2]
  - id: BR3.2
    statement: cleanAriaLabel quita placeholders embebidos y es una función pura.
    category: calculation
    applies_to: ResolvedElement
    trigger: Leer un aria-label.
    logic: Tabla de casos del v6 (CloudWatch, KMS, SageMaker, ELB, WAF); salida determinística.
    violation: No aplica.
    source: [FR6.1, AC4.3.1]
  - id: BR3.3
    statement: parseUnitButtonLabel extrae el significado de los botones Unit y es una función pura.
    category: calculation
    applies_to: ResolvedElement
    trigger: Resolver botones Unit (ELB, WAF).
    logic: Tabla de casos del v6; el botón se ubica por aria-labelledby reconstruido (FIX-8) con la cascada BR3.1.
    violation: field_not_resolved.
    source: [FR6.2, FR6.7, AC4.3.2, AC4.4.3]
  - id: BR3.4
    statement: La tabla de instancias de EC2 se trata como un solo campo instance_radio por contexto de fila, con el nombre de su heading.
    category: policy
    applies_to: ResolvedElement
    trigger: Escaneo de EC2.
    logic: FIX-5 y FIX-6, como en U1 regla 4.7.
    violation: field_not_resolved.
    source: [FR6.5, FR6.6, AC4.4.2]
  - id: BR3.5
    statement: Los selectores frágiles viven en un solo módulo.
    category: constraint
    applies_to: ResolvedElement
    trigger: Organización del código.
    logic: Clases awsui_*, textos de botones en inglés y el texto del banner están solo en lib/dom/selectors.js.
    violation: No aplica.
    source: [FR4.2, NFR2]

  # --- Grupo 4: reintentos, progreso y resultado ------------------------------
  - id: BR4.1
    statement: El contador de reintentos es una función pura que decide si queda un intento.
    category: calculation
    applies_to: RetryCounter
    trigger: Cada intento de una operación acotada.
    logic: next(counter) incrementa attempt; exhausted = attempt >= maxAttempts. Topes - save 3, search_service 2, dropdown_open 2, page_wait 1 por espera de 20 s.
    violation: exhausted → resultado tipado de error (AC6.2.2).
    source: [NFR8, AC6.2.2]
  - id: BR4.2
    statement: El progreso se emite por servicio y por paso.
    category: policy
    applies_to: ProgressEvent
    trigger: Inicio de cada paso y fin de cada servicio.
    logic: Un ProgressEvent con serviceIndex, serviceCount, step y, al terminar el servicio, serviceStatus.
    violation: No aplica.
    source: [FR7, AC6.2.1]
  - id: BR4.3
    statement: El resultado lista cada servicio con su estado y motivo en lenguaje de dominio.
    category: policy
    applies_to: RunResult
    trigger: Fin de la corrida.
    logic: results contiene un ServiceResult por servicio pedido, en orden; cada motivo tiene su mensaje en español (U1 regla 6.4 ampliado con template_not_found y field_not_resolved); si hubo brainSubstitutions, el mensaje avisa cada una como "Pediste <requestedValue>; se usó <appliedValue>".
    violation: No aplica.
    source: [FR7, AC6.1, AC6.2.3]

  # --- Grupo 5: spotlight -----------------------------------------------------
  - id: BR5.1
    statement: El spotlight resalta el campo que se va a llenar sin interferir con el RPA.
    category: constraint
    applies_to: SpotlightState
    trigger: Antes de aplicar una acción.
    logic: >
      Traer el elemento a la vista; dibujar un contorno y atenuar el resto con
      pointer-events none y z-index muy alto; tooltip opcional con la etiqueta
      como texto plano; sin transición si prefers-reduced-motion.
    violation: No aplica.
    source: [FR11, AC8.1.1, AC8.1.2, AC8.1.4, AC8.1.6]
  - id: BR5.2
    statement: El spotlight se limpia siempre y nunca entra en el escaneo.
    category: constraint
    applies_to: SpotlightState
    trigger: Fin de cada acción, error o corte.
    logic: Quitar los nodos del overlay en un finally; los nodos llevan una marca que scanForm excluye.
    violation: No aplica.
    source: [FR11.1, AC8.1.3, AC8.1.5]
```

## Resumen

| ID | Regla | Categoría |
|---|---|---|
| BR1.1 | Se procesan todos los servicios aunque alguno falle | policy |
| BR1.2 | DONE con URL solo con todo confirmado y estimado exacto | constraint |
| BR1.3 | Región en el primer servicio | policy |
| BR2.1 | Plantilla elegible; si no existe, fallo | policy |
| BR2.2 | Toggles antes del primer escaneo | policy |
| BR2.3 | Mapeo por pasadas + residuo | policy |
| BR2.4 | Releer cada acción | validation |
| BR2.5 | Fallo → salir sin guardar e informar dónde se detuvo | policy |
| BR2.6 | Guardado por banner verde; `is required`; 3 intentos | constraint |
| BR2.7 | 3 minutos por servicio, señal a todas las esperas y al cerebro | constraint |
| BR2.8 | Opciones abiertas al ejecutar: coincidencia exacta y única | validation |
| BR3.1 | Cascada de resolución como función pura (Zona A) con filtro por sección | validation |
| BR3.2 | `cleanAriaLabel` puro | calculation |
| BR3.3 | `parseUnitButtonLabel` puro + FIX-8 | calculation |
| BR3.4 | Tabla de instancias EC2 (FIX-5, FIX-6) | policy |
| BR3.5 | Selectores frágiles en un solo módulo | constraint |
| BR4.1 | Contador de reintentos puro | calculation |
| BR4.2 | Progreso por servicio y paso | policy |
| BR4.3 | Resultado por servicio en español | policy |
| BR5.1 | Spotlight sin interferir | constraint |
| BR5.2 | Spotlight siempre limpio y fuera del escaneo | constraint |
