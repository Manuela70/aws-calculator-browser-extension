# User Stories — Plan y preguntas

> Las decisiones mayores ya se tomaron en Requirements Analysis (entrada NL/JSON,
> WAF on-demand, spotlight, servicios, éxito todo-o-nada). Estas preguntas solo
> afinan personas y granularidad de las historias. Responde cada `[Answer]:`.

## Plan

- **Enfoque de personas**: un persona primario (SE/arquitecto de preventa de Applying que arma estimados AWS para clientes). Posible persona secundario a confirmar (ver Q1).
- **Formato de historias**: estándar "Como [persona], quiero [acción], para [beneficio]"; criterios de aceptación en Given/When/Then; IDs estables `US{grupo}.{seq}` y `AC{grupo}.{seq}.{n}`; prioridad MoSCoW.
- **Enfoque de desglose**: por **flujo/journey** (entrada NL, entrada JSON, ejecución RPA por servicio, visibilidad de errores, finalización/compartir, recomendación WAF, spotlight), que mapea directo a los FR.
- **MVP**: el walking skeleton (un servicio simple end-to-end) como primera historia Must Have; el resto prioriza alrededor.

## Q1 — Personas

El código y el business-overview apuntan a un único persona: el SE/arquitecto de preventa de Applying. ¿Modelamos solo ese, o hay un segundo persona relevante?

A. Solo el persona primario (SE/arquitecto de preventa de Applying).
B. Primario + un persona secundario (dime cuál, p. ej. un revisor/manager que consume el estimado compartido).
X. Other (please specify)

[Answer]: A

## Q2 — Granularidad de las historias

¿Qué nivel de desglose prefieres para las historias?

A. Una historia por journey principal (≈7-9 historias gruesas, cada una con varios AC) — más fácil de leer, mapea 1:1 con los FR.
B. Historias finas (dividir cada journey en pasos: p. ej. entrada NL separada de su validación de error) — más historias, más granular para entrega incremental.
X. Other (please specify)

[Answer]: B

## Q3 — Alcance de las historias en esta revivida

Dado que afirmamos walking-skeleton-primero y conjunto completo de servicios como requisito, ¿las historias cubren todo el alcance o solo el skeleton?

A. Historias para TODO el alcance de la revivida (entrada NL/JSON, RPA por servicio, errores, finalizar/compartir, WAF, spotlight), con el walking skeleton marcado como la primera Must Have.
B. Solo historias del walking skeleton por ahora; el resto se elabora después.
X. Other (please specify)

[Answer]: A

## Consolidated Summary Confirmation

- Q1 (personas): solo el persona primario — SE/arquitecto de preventa de Applying.
- Q2 (granularidad): historias finas por paso (dividir cada journey en pasos para entrega incremental).
- Q3 (alcance): historias para todo el alcance de la revivida (entrada NL/JSON, RPA por servicio, errores visibles, finalizar/compartir, WAF, spotlight), con el walking skeleton de un servicio simple como primera Must Have.
- Desglose por journey mapeado a los FR; prioridad MoSCoW; IDs US{grupo}.{seq} y AC{grupo}.{seq}.{n}; acceptance criteria Given/When/Then con happy path + sad path.

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
