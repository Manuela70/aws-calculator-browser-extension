# Reglas de interfaz — u6-popup-ui

> Reglas de comportamiento del panel lateral: estados, entrada, revisión
> Well-Architected, progreso, resultado y registro de corridas. Unidad de tipo
> `ui`: estas reglas existen para dar a la trazabilidad un ancla verificable; los
> flujos y pantallas son fuente de verdad en `functional-spec.md`. Prosa en
> español; identificadores en inglés.

## Sources

- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/user-stories/stories.md` (US5.1, US6.1, US6.2, US6.3). [stories]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/refined-mockups/mockups.md` e `interaction-spec.md` (M1-M9, C1-C6). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/refined-mockups/accessibility-checklist.md` (WCAG 2.1 AA). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/requirements-analysis/requirements.md` (FR1, FR7, FR8, NFR3). [requirements]
- Diseños de u1 (panel lateral, registro técnico), u2 (pestañas, `NormalizedRun`), u4 (revisión previa con severidad), u5 (`RunResult`, `ServiceResult`). [stage]
- `functional-design-questions.md` de esta unidad, Q1-Q2. [Q1-Q2]
- `aidlc/spaces/default/memory/project.md` (UI en español; nunca éxito en fallo; nunca HTML con datos). [team-practices]

## Reglas (fuente de verdad)

```yaml
rules:
  - id: BR1.1
    statement: Al abrir, el panel reanuda una corrida activa, cierra una perdida, o muestra la entrada en reposo sin mensajes de una corrida anterior.
    category: policy
    applies_to: Panel
    trigger: Abrir el panel.
    logic: >
      Corrida activa con latido → Running; latido vencido → Failed con lost (u1);
      sin corrida → pestañas JSON / lenguaje natural, cuadro de texto, "Generar
      Estimado"; el último resultado solo dentro de "Última corrida", plegada.
    violation: No aplica.
    source: [US6.3, AC6.3.1]
  - id: BR1.2
    statement: Cada pestaña conserva su texto al alternar y tras cualquier error.
    category: policy
    applies_to: Panel
    trigger: Cambiar de pestaña o recibir un InputError.
    logic: El texto de cada pestaña vive en memoria del panel mientras está abierto y en la sesión del navegador; un error nunca lo borra.
    violation: No aplica.
    source: [AC2.2.3, AC3.1.2]
  - id: BR1.3
    statement: Mientras el cerebro interpreta, el panel muestra "Interpretando…", bloquea un segundo envío y ofrece Cancelar.
    category: policy
    applies_to: Panel
    trigger: normalize en curso para lenguaje natural.
    logic: El botón primario queda deshabilitado con indicador. El panel crea un AbortController por petición y pasa su signal a normalize (u2). Cancelar aborta esa señal y vuelve a la entrada con el texto intacto; el resultado cancelled que devuelve normalize se descarta sin mostrar error.
    violation: No aplica.
    source: [US2.1, u2 Q1]
  - id: BR2.1
    statement: Antes de correr, el panel muestra la configuración que se va a llenar y si la región es la de por defecto.
    category: policy
    applies_to: Panel
    trigger: normalize terminó bien.
    logic: Lista de servicios con plantilla si la hay; si regionDefaulted, la línea "Región: us-east-1 (por defecto)".
    violation: No aplica.
    source: [u2 Q2]
  - id: BR2.2
    statement: La revisión Well-Architected previa solo pide confirmación cuando hay hallazgos.
    category: policy
    applies_to: Panel
    trigger: Respuesta de /waf-evaluate con phase pre_fill.
    logic: >
      Sin hallazgos en ningún servicio → una línea "Revisión Well-Architected
      sin hallazgos" y la corrida arranca (Q1). Con hallazgos → se muestran por
      servicio con pilar y severidad, y dos acciones: "Llenar igual" (arranca)
      y "Corregir" (vuelve a la entrada con el texto intacto).
    violation: Error del cerebro en la revisión previa → mensaje visible y la corrida no arranca.
    source: [FR8, u4 Q1, Q1]
  - id: BR2.3
    statement: Mientras el cerebro no esté integrado, el panel avisa que la corrida no tiene revisión Well-Architected.
    category: policy
    applies_to: Panel
    trigger: wafReview = not_available.
    logic: Aviso fijo bajo la acción primaria; la corrida JSON sigue.
    violation: No aplica.
    source: [u2 Q1c]
  - id: BR3.1
    statement: Durante la corrida, el panel muestra el progreso "N de M" y el estado de cada servicio en vivo.
    category: policy
    applies_to: Panel
    trigger: Cada ProgressEvent.
    logic: Fila por servicio con estado en cola, en curso, confirmado o fallido; el paso actual como texto; botón Cancelar.
    violation: No aplica.
    source: [AC6.1.2, AC6.2.1]
  - id: BR3.2
    statement: El resultado final lista cada servicio con su estado y motivo en lenguaje de dominio; la URL solo aparece con DONE.
    category: constraint
    applies_to: Panel
    trigger: RunResult.
    logic: >
      Veredicto arriba; con DONE, URL copiable; con ERROR, sin URL y con los
      faltantes, el campo donde se detuvo cada fallido y los no intentados. En
      ambos casos, cada sustitución del cerebro (brainSubstitutions de u5) se
      muestra como texto plano "Pediste <requestedValue>; se usó <appliedValue>".
    violation: Nunca una URL con ERROR.
    source: [AC6.1.1, AC6.2.3, AC7.1.2]
  - id: BR3.3
    statement: Un evento asíncrono solo cambia el panel si pertenece a la petición o corrida vigente.
    category: constraint
    applies_to: Panel
    trigger: Respuesta de normalize, de la revisión, ProgressEvent o RunResult.
    logic: El estado guarda requestId y runId; un evento con otro id, o sin transición desde el estado actual, se ignora (functional-spec §3).
    violation: No aplica.
    source: [AC6.2.1, AC6.2.3]
  - id: BR3.4
    statement: Todo motivo, paso, pilar y severidad se muestra con su texto en español de la tabla del panel; DONE sin URL válida se muestra como fallo.
    category: policy
    applies_to: Panel
    trigger: Render de resultado, progreso o evaluación.
    logic: Tablas de functional-spec §6 en lib/messages-es.js.
    violation: Nunca un éxito sin URL válida.
    source: [AC6.1.1, AC6.2.3, AC5.1.3]
  - id: BR4.1
    statement: Tras una corrida DONE, el panel lanza sola la evaluación Well-Architected (si hay cerebro) y la muestra agrupada por servicio, con pilar y severidad, y "sin hallazgos" explícito.
    category: policy
    applies_to: Panel
    trigger: Entrar a Done con cerebro integrado.
    logic: WafLoading → WafResult o WafError (con "Reintentar evaluación"); encabezado por servicio; etiqueta de pilar y severidad; "Sin hallazgos" explícito; la URL sigue visible. Sin cerebro, Done ofrece "Nueva corrida".
    violation: Error del cerebro → mensaje visible con "Reintentar evaluación", nunca una lista vacía.
    source: [AC5.1.1, AC5.1.2, AC5.1.3, AC5.1.4]
  - id: BR5.1
    statement: Todo texto que viene de la página, del JSON o del cerebro se inserta como texto plano.
    category: constraint
    applies_to: Panel
    trigger: Cualquier render.
    logic: Solo textContent; nunca innerHTML ni insertAdjacentHTML; enlaces solo para la URL del estimado validada (host calculator.aws).
    violation: No aplica.
    source: [project.md, NFR5]
  - id: BR5.2
    statement: El panel cumple WCAG 2.1 AA.
    category: constraint
    applies_to: Panel
    trigger: Siempre.
    logic: Pestañas con roles tablist/tab/tabpanel y flechas; foco visible; cambios de estado anunciados en una región aria-live; contraste AA; sin depender solo del color.
    violation: No aplica.
    source: [accessibility-checklist]
  - id: BR5.3
    statement: La lista de corridas vive en una sección plegable al pie, cerrada por defecto.
    category: policy
    applies_to: Panel
    trigger: Abrir el panel.
    logic: Como en u1 (lista desde runLogIndex, exportar, borrar uno, borrar todos, deshabilitados durante una corrida).
    violation: No aplica.
    source: [Q2, u1]
```

## Resumen

| ID | Regla |
|---|---|
| BR1.1 | Reposo limpio con una acción primaria |
| BR1.2 | Texto por pestaña conservado |
| BR1.3 | "Interpretando…" sin doble envío, con Cancelar |
| BR2.1 | Vista previa con región por defecto marcada |
| BR2.2 | Revisión previa: confirmación solo con hallazgos |
| BR2.3 | Aviso "sin revisión" mientras no hay cerebro |
| BR3.1 | Progreso N de M por servicio |
| BR3.2 | Resultado por servicio; URL solo con DONE |
| BR3.3 | Eventos tardíos o ajenos se ignoran por id |
| BR3.4 | Textos en español por tabla; DONE sin URL válida = fallo |
| BR4.1 | Well-Architected por servicio, pilar y severidad |
| BR5.1 | Solo texto plano |
| BR5.2 | WCAG 2.1 AA |
| BR5.3 | Historial plegable |
