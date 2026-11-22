# Reglas de negocio — u3-deterministic-mapper

> Reglas del mapeo campo ↔ valor: coincidencia de etiquetas, tipo de acción,
> validación de valores y opciones, mapeo por pasadas para campos condicionales,
> y tratamiento del residuo. El bloque YAML es la fuente de verdad; la tabla
> final es un resumen derivado. Prosa en español; identificadores en inglés.

## Sources

- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/user-stories/stories.md` (US4.1: AC4.1.1-AC4.1.5). [stories]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/requirements-analysis/requirements.md` (FR3, FR5.2, NFR3, NFR7). [requirements]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/domain-design/components.md` y `decisions.md` (ADR-001 híbrido, ADR-002 determinístico primero). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/contract-design/contract-summary.md` (C1 `/map-residue`, paridad de enums, resiliencia del borde). [stage]
- `aidlc/spaces/default/knowledge/calculator-catalog/README.md` (31 % de campos condicionales; 1 226 campos valor + unidad). [knowledge]
- `functional-design-questions.md` de esta unidad: Q1 (dos claves explícitas), Q2 (una consulta al cerebro y falla), Q3 (clave con sección). [Q1-Q3]
- Reglas afirmadas en `aidlc/spaces/default/memory/project.md` (capa de mapeo en su propio módulo ES; nunca reportar éxito en fallo). [team-practices]

## Reglas (fuente de verdad)

```yaml
rules:
  # --- Grupo 1: coincidencia de etiquetas -----------------------------------
  - id: BR1.1
    statement: Las etiquetas se comparan exactas tras normalizar espacios y mayúsculas; nunca por "contiene", prefijo ni similitud.
    category: validation
    applies_to: [RequestedValue, DomField]
    trigger: Al mapear cada valor pedido.
    logic: Normalizar ambos lados (recortar, colapsar espacios, minúsculas) y comparar por igualdad.
    violation: Sin coincidencia → no_match (ver BR3.1 para cuándo es definitivo).
    source: [FR3, NFR3]
  - id: BR1.2
    statement: Una clave coincide con un campo si es igual a su etiqueta completa "Sección > Campo" o a su parte "Campo"; debe coincidir con exactamente un campo.
    category: validation
    applies_to: RequestedValue
    trigger: Tras BR1.1.
    logic: SI hay una sola coincidencia ENTONCES ese es el campo objetivo.
    violation: Cero coincidencias → no_match; más de una → BR1.3.
    source: [FR3]
  - id: BR1.3
    statement: Si la etiqueta se repite en el formulario, la clave debe traer la sección; una clave ambigua nunca la resuelve el cerebro.
    category: validation
    applies_to: RequestedValue
    trigger: La clave "Campo" coincide con más de un DomField.
    logic: No se elige ninguno; el valor queda en el residuo con ambiguous_label, que no se envía al cerebro (BR3.2) y hace fallar el servicio (BR3.4).
    violation: Fallo con motivo ambiguous_label, que pide escribir "Sección > Campo".
    source: [FR3, Q3]
  - id: BR1.4
    statement: Cada campo recibe a lo sumo un valor por servicio.
    category: constraint
    applies_to: MappingAction
    trigger: Dos claves distintas resuelven al mismo DomField, en la misma pasada o en pasadas distintas.
    logic: La primera en el orden de la configuración se mapea; las siguientes quedan con duplicate_target.
    violation: Residuo duplicate_target.
    source: [FR3]

  # --- Grupo 2: acciones y valores ------------------------------------------
  - id: BR2.1
    statement: El tipo de acción se deriva del tipo del campo con una tabla fija, en paridad con el enum de C1.
    category: calculation
    applies_to: MappingAction
    trigger: Campo objetivo encontrado.
    logic: >
      text, search, number → fill; select → select; dropdown → dropdown; radio,
      radiogroup → radio; checkbox → checkbox; instance_radio → instance_radio
      (acción compuesta de U1: buscar el tipo y elegir su fila; instance_search
      no se emite); toggle → toggle_on si el valor normalizado es "on" o "true",
      toggle_off si es "off" o "false". slider no tiene acción.
    violation: slider → unsupported_type; toggle con otro valor → invalid_value.
    source: [FR3, C1]
  - id: BR2.2
    statement: Un campo numérico solo acepta un número decimal simple; la unidad nunca viaja dentro del valor.
    category: validation
    applies_to: RequestedValue
    trigger: El campo objetivo es de tipo number.
    logic: >
      El valor recortado debe cumplir el patrón: signo opcional, dígitos, y
      opcionalmente un punto seguido de dígitos (p. ej. "100", "0.5", "-3"). No
      se aceptan unidades, separadores de miles, comas decimales, exponentes ni
      espacios internos ("100 GB", "1,000", "1e3" son inválidos).
    violation: Residuo invalid_number.
    source: [FR3, Q1]
  - id: BR2.3
    statement: La unidad o el periodo de un campo con unidad se pide con su propia clave, "<Campo> unit", y se mapea como cualquier selector.
    category: policy
    applies_to: RequestedValue
    trigger: La configuración trae una clave "<Campo> unit".
    logic: >
      Se trata como un valor más; coincide con el DomField de etiqueta "<Sección>
      > <Campo> unit" que escanea U5. Si la clave no viene, el selector conserva
      el valor por defecto del formulario.
    violation: Sin selector de unidad escaneado → no_match.
    source: [FR3, Q1]
  - id: BR2.4
    statement: En selectores y radios, el valor debe coincidir exactamente con una opción, cuando las opciones se conocen al escanear.
    category: validation
    applies_to: [RequestedValue, DomField]
    trigger: El campo objetivo es select, dropdown, radio o radiogroup y trae options.
    logic: >
      Comparación normalizada contra cada opción. Una coincidencia → acción con
      la opción tal como aparece en el formulario. Ninguna → option_no_match;
      varias → option_ambiguous. Si el campo no trae options (se cargan al
      abrir), se emite la acción con el valor pedido y U5 aplica la misma
      comparación al ejecutar.
    violation: Residuo option_no_match u option_ambiguous.
    source: [FR3, NFR3]
  - id: BR2.5
    statement: Un checkbox acepta solo true o false y la acción lleva el valor normalizado.
    category: validation
    applies_to: RequestedValue
    trigger: Campo objetivo de tipo checkbox.
    logic: SI el valor normalizado es "true" o "false" ENTONCES acción checkbox con ese valor en minúsculas; SI no, residuo.
    violation: Residuo invalid_value.
    source: [FR3]
  - id: BR2.6
    statement: Los toggles del servicio (__switch__) no los mapea U3; los aplica U5 antes de escanear.
    category: policy
    applies_to: ToggleRequest
    trigger: El servicio trae toggles.
    logic: >
      mapDeterministic recibe solo los valores de fields. Los ToggleRequest los
      aplica U5 en la preparación del formulario, antes del primer escaneo, como
      ya hace U1 (prepareForm). Así ninguno se ejecuta dos veces.
    violation: No aplica.
    source: [FR5.2]

  # --- Grupo 3: pasadas y residuo -------------------------------------------
  - id: BR3.1
    statement: El mapeo se hace por pasadas para que los campos condicionales aparezcan antes de declararlos sin coincidencia.
    category: policy
    applies_to: MappingOutcome
    trigger: Tras cada escaneo del formulario de un servicio.
    logic: >
      Pasada n: mapear los valores pendientes contra el escaneo actual; U5 aplica
      las acciones nuevas y vuelve a escanear. Un valor con no_match queda
      pendiente mientras la pasada anterior haya producido al menos una acción
      nueva. El mapeo termina cuando una pasada no produce acciones nuevas o tras
      3 pasadas. Solo entonces los no_match pasan al residuo. Los demás motivos
      (invalid_number, option_*, ambiguous_label, duplicate_target,
      unsupported_type, invalid_value) son definitivos desde la primera pasada.
    violation: No aplica.
    source: [FR3, FR5.2]
  - id: BR3.2
    statement: Con el cerebro integrado, el residuo enviable de un servicio se consulta una sola vez, con el último escaneo.
    category: policy
    applies_to: MappingOutcome
    trigger: Terminaron las pasadas, hay residuo con motivo no_match u option_no_match, y hay puerto de residuo.
    logic: >
      Una llamada a /map-residue con el servicio, los DomField del último
      escaneo, los valores pedidos y el residuo enviable (no_match y
      option_no_match). ambiguous_label, invalid_number, duplicate_target,
      unsupported_type e invalid_value no se envían: son errores de la
      configuración. Tope total de 30 s, incluidos los reintentos que haga el
      puerto, y cancelación con la señal de la corrida.
    violation: Error, caída, tope o señal cancelada → residueStatus = brain_unavailable y se aplica BR3.4.
    source: [C1, Q2]
  - id: BR3.3
    statement: La respuesta del cerebro es no confiable; cada acción se valida como si fuera determinística y contra el valor pedido.
    category: validation
    applies_to: MappingAction
    trigger: Respuesta de /map-residue.
    logic: >
      Si la respuesta no es un objeto con una lista actions de a lo sumo tantos
      elementos como claves enviadas, se descarta entera. Cada acción se acepta
      solo si: trae requestKey igual a una clave enviada y es la única acción
      para esa clave; su fieldLabel es exactamente el label de un DomField del
      último escaneo; su actionType es el que BR2.1 da para ese campo; el campo
      no tiene ya una acción (BR1.4); y su valor pasa BR2.2, BR2.4 y BR2.5. Para
      fill, checkbox y toggle el valor debe ser igual (normalizado) al valor
      pedido. Para select, dropdown, radio e instance_radio debe ser una de las
      opciones que el último escaneo leyó para ese campo; si el campo no trae
      options, la acción se descarta (no hay ancla) y la clave queda como
      option_no_match. Cuando el valor elegido difiere del pedido (normalizado),
      la acción se acepta marcada substituted = true con requestedValue, y el
      resultado del servicio la informa como aviso visible al SE ("Pediste
      <pedido>; se eligió <opción>"); nunca se sustituye en silencio. Las aceptadas llevan source = brain, se agregan después de las
      determinísticas y se renumeran en orden. Las demás se descartan.
    violation: Las claves sin acción aceptada siguen en el residuo.
    source: [C1, Q2]
  - id: BR3.4
    statement: Un servicio con residuo sin resolver no se guarda y falla tipado, nombrando cada clave con su motivo.
    category: constraint
    applies_to: MappingOutcome
    trigger: Tras BR3.2/BR3.3, o sin cerebro integrado, o con residuo no enviable.
    logic: >
      SI unresolved no está vacío ENTONCES residueStatus = still_unresolved (o
      brain_unavailable), actions = [] y el resultado del servicio es un fallo
      con motivo field_not_recognized y el detalle "clave: motivo" de cada valor.
      Las acciones ya aplicadas en pasadas anteriores no se guardan: el servicio
      no llega a guardarse.
    violation: El resultado del servicio es un fallo con motivo; nunca un éxito parcial.
    source: [NFR3, Q2]

  # --- Grupo 4: forma del módulo --------------------------------------------
  - id: BR4.1
    statement: El paso determinístico es una función pura y la consulta al cerebro es un paso separado con el puerto inyectado.
    category: constraint
    applies_to: MappingOutcome
    trigger: Organización del módulo.
    logic: >
      mapDeterministic(domFields, requestedValues, previousOutcome) no toca DOM,
      red ni estado; resolveResidue(outcome, context, { mapResidue, signal }) es
      asíncrona y recibe el puerto y la señal. Ambas viven en lib/mapping/,
      acopladas solo por import.
    violation: No aplica.
    source: [NFR7, project.md]
```

## Resumen

| ID | Regla | Categoría |
|---|---|---|
| BR1.1 | Coincidencia exacta normalizada | validation |
| BR1.2 | "Sección > Campo" o "Campo", única | validation |
| BR1.3 | Etiqueta repetida exige sección; nunca va al cerebro | validation |
| BR1.4 | Un valor por campo | constraint |
| BR2.1 | Tipo de campo → tipo de acción (paridad C1) | calculation |
| BR2.2 | Número decimal simple, sin unidad | validation |
| BR2.3 | Unidad con clave propia "<Campo> unit" | policy |
| BR2.4 | Opción exacta única | validation |
| BR2.5 | Checkbox true/false | validation |
| BR2.6 | Toggles los aplica U5 antes de escanear | policy |
| BR3.1 | Mapeo por pasadas (máx. 3) para campos condicionales | policy |
| BR3.2 | Una consulta al cerebro, solo residuo enviable, 30 s, cancelable | policy |
| BR3.3 | Respuesta del cerebro validada contra campo, tipo y valor pedido | validation |
| BR3.4 | Residuo sin resolver → servicio falla sin guardar | constraint |
| BR4.1 | Función pura + puerto inyectado | constraint |
