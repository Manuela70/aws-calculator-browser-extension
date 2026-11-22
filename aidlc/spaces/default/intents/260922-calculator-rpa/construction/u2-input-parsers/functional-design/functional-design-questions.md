# Preguntas de Diseño Funcional — u2-input-parsers

> U2 completa en sitio los módulos provisionales de U1 (`lib/input/json-parser.js`,
> `lib/input/input-normalizer.js`) y añade el parser de lenguaje natural. Cubre
> US2.1, US2.2 y US3.1. Las respuestas definen el alcance del lenguaje natural
> (OQ4 de requisitos) y la rigidez del esquema JSON.

## Contexto ya decidido (no se pregunta)

- El éxito es todo o nada y nunca se llena nada parcial en silencio (`project.md`, FR1.1, AC2.2.1).
- El JSON del Anexo A se valida en sus cuatro casos (AC3.1.1–AC3.1.4); el mensaje de JSON inválido es `❌ JSON inválido.` y el texto queda editable.
- Ambos formatos convergen en `ServiceRequest` (FR1.3); `normalize` es la interfaz que consume la UI (contract-summary).
- ADR-006: el lenguaje natural intenta primero un parseo local y solo recurre al cerebro (U4) para lo que exceda su capacidad; aquí se fija ese límite.

## Q1 — Alcance del lenguaje natural (OQ4)

¿Qué tan libre puede ser la expresión en lenguaje natural?

A. **Gramática local controlada + cerebro para el resto (Recomendado).** El parser local reconoce un catálogo cerrado de servicios (con sinónimos en español e inglés), códigos y nombres de región, cantidades con unidad (GB, TB, horas, instancias) y tipos de instancia. Lo que no reconoce lo envía al cerebro (U4); mientras U4 no exista, devuelve un error tipado que nombra el fragmento no interpretado.
B. **Solo gramática local.** Nunca llama al cerebro para interpretar lenguaje natural; lo que no reconoce es siempre un error tipado.
C. **Todo por el cerebro.** El lenguaje natural siempre se interpreta con el FM; sin parseo local.
X. Other (please specify)

[Answer]: X — "IA interpreta, bot ejecuta". Recorrido de la respuesta:
1. El mantenedor pidió primero analizar todo el catálogo: "Antes de responder esto te pediría que analices absolutamente todo el dom los servicios, las opciones de configruación para que podamos decidir que tan deterministica será esta parte, porque hay cosas que si pueden ser por catálogo pero otras que no, y siempre por el WAF se debe revisar". Alcance del análisis elegido: "Todo, por tandas". Resultado en `aidlc/spaces/default/knowledge/calculator-catalog/README.md` (442 servicios, 3 985 campos).
2. Con el inventario a la vista: "Lo que necesitamos es que interprete la configuraco´pn correcta, pero que la configuración la haga el BDA"; aclarado como "El bot digo, no sé ci confundí el término".
3. Confirmado: "IA interpreta, bot ejecuta". El cerebro (U4) interpreta el lenguaje natural con el inventario como contexto y devuelve una configuración con el esquema estricto del JSON; la extensión la valida como un JSON pegado y el bot (RPA) la ejecuta.

## Q1b — Revisión Well-Architected (agregada por la respuesta a Q1)

Significado de "siempre por el WAF se debe revisar": **Ambas** — revisión de la configuración interpretada antes de llenar y evaluación del estimado al terminar. Alcance: **Sí, a todas** (lenguaje natural y JSON); sin cerebro no se corre nada. Cambia FR8.1 (de opcional y posterior a obligatorio y en dos momentos).

[Answer]: Ambas; Sí, a todas

## Q1c — Contradicción con el walking skeleton (seguimiento)

La revisión obligatoria en todas las corridas contradice el skeleton aprobado (agnóstico del cerebro, `team.md` y NFR1.1 de u1).

[Answer]: Obligatoria desde U4 — mientras U4 no exista, el camino JSON corre sin revisión y el panel lo indica; al integrarse U4, la revisión es obligatoria y sin cerebro no se corre.

## Q2 — Región omitida en lenguaje natural

Si la expresión nombra un servicio pero no una región (p. ej. "un bucket S3 de 100 GB"):

A. **Error tipado que nombra el servicio (Recomendado).** "No reconocí la región para el bucket S3." Coincide con el ejemplo de AC2.2.2 y no asume nada.
B. **Usar `us-east-1` por defecto**, igual que el JSON sin `region`, y mostrarlo en el resumen antes de correr.
X. Other (please specify)

[Answer]: B

## Q3 — Cómo se distingue JSON de lenguaje natural

FR1 pide una entrada unificada, sin selector de modos.

A. **Detección automática en un solo cuadro de texto (Recomendado).** Si el texto, sin espacios iniciales, empieza con `{`, se trata como JSON (y un JSON roto da `❌ JSON inválido.`); si no, como lenguaje natural.
B. **Pestañas JSON / lenguaje natural** que el SE elige explícitamente.
X. Other (please specify)

[Answer]: B

## Q4 — Rigidez del esquema JSON (Anexo A)

A. **Estricto con claves desconocidas (Recomendado).** `name` obligatorio; `search_term` opcional (si falta, se usa `name`); cualquier clave que no sea del Anexo A (p. ej. `feilds` mal escrito) es un error de esquema que nombra el servicio y la clave, para que un error de tipeo no descarte campos en silencio.
B. **Tolerante.** Claves desconocidas se ignoran y se listan como aviso, pero la corrida sigue.
C. **Literal al Anexo A.** `name` y `search_term` ambos obligatorios; claves desconocidas se ignoran.
X. Other (please specify)

[Answer]: A
