# Decisiones de arquitectura (ADR) — Domain Design

> Registro de decisiones significativas de esta etapa. Prosa en español; nombres
> técnicos en inglés. Cada ADR: Context, Decision, Consequences, Alternatives Rejected.

## Índice

| ADR | Título | Estado | Fecha |
|---|---|---|---|
| ADR-001 | Hogar del cerebro: híbrido determinístico + FM server-side | Accepted | 2026-09-22 |
| ADR-002 | Separar DeterministicMapper del MappingBrain (eficiencia de tokens) | Accepted | 2026-09-22 |
| ADR-003 | Dos parsers de entrada + InputNormalizer común | Accepted | 2026-09-22 |
| ADR-004 | Separar RpaOrchestrator (Zona A) de DomResolver (Zona B) | Accepted | 2026-09-22 |
| ADR-005 | Razonamiento del FM sobre datos escaneados, nunca screenshots | Accepted | 2026-09-22 |
| ADR-006 | Tensión del camino NL→FM frente al invariante determinístico-primero | Accepted | 2026-09-22 |

---

## ADR-001: Hogar del cerebro — híbrido determinístico local + FM server-side

**Status:** Accepted · **Date:** 2026-09-22

### Context
El "cerebro" de mapeo vivía en un webhook n8n que ya no existe (P1); su `fetch` desde el contexto de página fallaba por CORS y era punto único de fallo. La revivida debe decidir dónde vive el mapeo campo↔valor y el razonamiento Well-Architected (FR8). Restricciones: el WAF necesita un LLM; una credencial de larga vida no puede vivir en el cliente MV3 (regla dura); objetivo explícito del mantenedor de eficiencia de tokens (evitar el anti-patrón "computer use" de screenshots).

### Decision
Adoptar un modelo **híbrido**: (1) `scanForm` escanea el DOM determinísticamente; (2) un `DeterministicMapper` local (Zona A) resuelve los mapeos inequívocos sin LLM; (3) un `MappingBrain` server-side invoca al FM **solo** sobre el residuo ambiguo y sobre el WAF, recibiendo datos estructurados; (4) la credencial del FM vive server-side. El `MappingBrain` se modela con interfaz estable, independiente de su alojamiento concreto.

### Consequences
**Positivas:** ataca P1 de raíz (el llenado obvio no depende de red); minimiza llamadas al FM (tokens); el mapeo determinístico es unit-testeable (Zona A, piso 80%); la credencial queda segura server-side; el walking skeleton puede validarse con el camino determinístico.
**Negativas:** hay dos caminos de mapeo (local + FM) cuya frontera hay que afinar con uso real; el WAF y el residuo ambiguo siguen dependiendo de un endpoint server-side vivo.
**Neutras:** el alojamiento del endpoint (recrear n8n desde backup vs. agente Bedrock) se decide en Contract/Infrastructure Design.

### Alternatives Rejected
- **Recrear n8n como único cerebro (todo el mapeo vía FM):** rechazado como enfoque por defecto — mantiene el llenado dependiente de red y quema tokens en mapeos triviales; sigue siendo el candidato de alojamiento del endpoint server-side (se decide después).
- **Cerebro 100% local sin FM:** rechazado — el WAF (FR8) requiere razonamiento de un LLM que la lógica determinística no puede dar.
- **Agente "computer use" con screenshots:** rechazado explícitamente — ineficiente en tokens; el escaneo determinístico del DOM da la misma data sin pixeles.

---

## ADR-002: Separar DeterministicMapper del MappingBrain

**Status:** Accepted · **Date:** 2026-09-22

### Context
Dentro del híbrido de ADR-001, el mapeo tiene dos naturalezas: lo inequívoco (determinístico) y lo ambiguo (requiere razonamiento). Mezclarlos en un solo componente ataría la lógica barata y testeable a la cara y no-determinística del FM.

### Decision
Dos componentes: `DeterministicMapper` (función pura, Zona A, resuelve lo obvio y marca el residuo) y `MappingBrain` (FM server-side, resuelve solo el residuo). El `RpaOrchestrator` llama primero al determinístico y envía al FM solo lo no resuelto.

### Consequences
**Positivas:** la mayor parte del mapeo es unit-testeable sin red; las llamadas al FM se minimizan (eficiencia de tokens); la frontera determinístico/FM es ajustable sin tocar el DOM ni la UI.
**Negativas:** dos componentes que coordinar; la definición de "ambiguo" hay que refinarla con datos reales.
**Neutras:** la heurística exacta de qué es "obvio" se detalla en Functional Design.

### Alternatives Rejected
- **Un único componente de mapeo (todo vía FM):** rechazado — quema tokens y no es unit-testeable.
- **Todo determinístico:** rechazado — no cubre expresiones ambiguas ni el WAF.

---

## ADR-003: Dos parsers de entrada + InputNormalizer común

**Status:** Accepted · **Date:** 2026-09-22

### Context
La entrada acepta lenguaje natural o JSON (FR1). El NL es capacidad nueva con razonamiento propio (y posible apoyo del FM); el JSON es validación determinística del esquema del Anexo A.

### Decision
`NaturalLanguageParser` y `JsonParser` separados, ambos alimentando un `InputNormalizer` que produce la estructura interna común (`ServiceRequest`).

### Consequences
**Positivas:** cada parser es unit-testeable de forma aislada; refleja concerns y tasas de cambio distintas; el resto del sistema depende solo de la estructura normalizada.
**Negativas:** una pieza más que si fuera un único normalizador.
**Neutras:** el apoyo del FM al NraturalLanguageParser para expresiones libres se afina en Functional Design.

### Alternatives Rejected
- **Un único `InputNormalizer` que maneja ambos formatos:** rechazado — mezcla el razonamiento NL con la validación determinística del JSON en una sola frontera.

---

## ADR-004: Separar RpaOrchestrator (Zona A) de DomResolver (Zona B)

**Status:** Accepted · **Date:** 2026-09-22

### Context
El núcleo RPA mezcla hoy orquestación por servicio (control de flujo puro) con resolución de DOM (dependiente del DOM CloudScape de terceros, posiblemente stale — P2). La postura de testing afirmada parte el sistema en Zona A (lógica pura, unit-testeable) y Zona B (DOM, smoke manual).

### Decision
`RpaOrchestrator` (flujo por servicio, reintentos acotados, coordinación; Zona A) separado de `DomResolver` (scanForm/resolveElementByLabel/executeActions + FIX-1..FIX-9; Zona B).

### Consequences
**Positivas:** la orquestación se testea sin DOM real; el riesgo P2 queda aislado en un solo componente; alinea las fronteras de componente con la partición Zona A/Zona B.
**Negativas:** la interfaz entre ambos debe ser explícita (acciones in, resultado por servicio out).
**Neutras:** el detalle de la interfaz se formaliza en Contract/Functional Design.

### Alternatives Rejected
- **Un solo componente RPA:** rechazado — mezcla Zona A testeable con Zona B dependiente del DOM, dificultando el piso de cobertura del 80% sobre la lógica pura.

---

## ADR-005: El FM razona sobre datos escaneados, nunca sobre screenshots

**Status:** Accepted · **Date:** 2026-09-22

### Context
Existe un anti-patrón común (agentes "computer use") de enviar screenshots al FM en cada paso, que consume tokens de forma excesiva. El `scanForm` ya produce una representación estructurada del DOM.

### Decision
El `MappingBrain` recibe **exclusivamente datos estructurados** (campos escaneados, labels, valores pedidos para el mapeo; el estimado construido para el WAF) y nunca imágenes. El razonamiento del FM opera sobre texto/datos.

### Consequences
**Positivas:** consumo de tokens acotado y predecible; la entrada al FM es inspeccionable y testeable; desacopla el razonamiento del render visual.
**Negativas:** depende de que el escaneo determinístico capture la data relevante (si un campo no se escanea, el FM no lo ve) — mitigado por el recorrido exhaustivo del DOM (expandir secciones colapsadas) del `DomResolver`.
**Neutras:** el formato exacto del payload al FM se define en Contract Design.

### Alternatives Rejected
- **Screenshots por paso al FM:** rechazado explícitamente por el mantenedor — ineficiente en tokens y frágil.

---

## ADR-006: Tensión del camino NL→FM frente al invariante determinístico-primero

**Status:** Accepted · **Date:** 2026-09-22

### Context
ADR-001/ADR-002 fijan el invariante de eficiencia de tokens: "determinístico primero, el FM solo sobre el residuo ambiguo". Pero el `NaturalLanguageParser` declara un borde opcional a `MappingBrain` para interpretar expresiones NL libres. Ese borde abre un camino al FM que NO pasa por el `DeterministicMapper` del mapeo de campos: la interpretación de lenguaje natural libre puede requerir al FM antes de que exista siquiera un DOM escaneado que mapear. Son dos usos del FM distintos (interpretar la intención del usuario vs. mapear el residuo de campos) y conviene no confundirlos.

### Decision
Reconocer explícitamente **dos presupuestos de tokens distintos y aceptados**: (a) **interpretación NL** — el FM traduce una expresión en lenguaje natural libre a servicios/valores solicitados, cuando el parseo local no alcanza; (b) **mapeo del residuo** — el FM resuelve campos ambiguos que el `DeterministicMapper` no pudo, tras el escaneo del DOM. El invariante "determinístico primero" gobierna (b) estrictamente (nunca llamar al FM por un campo que el determinístico resuelve). Para (a), el parseo local intenta primero la expresión y solo recurre al FM para lo que exceda su capacidad; el límite exacto de cuándo (a) invoca al FM se define en Functional Design.

### Consequences
**Positivas:** separa dos conceptos que se confundían; preserva el invariante de tokens del mapeo de campos; deja explícito que la interpretación NL libre tiene su propio costo aceptado.
**Negativas:** hay dos caminos al FM que monitorear en términos de tokens.
**Neutras:** el umbral de "cuándo el NL local se rinde y llama al FM" se afina en Functional Design con uso real.

### Alternatives Rejected
- **Prohibir que NaturalLanguageParser llame al FM:** rechazado — dejaría el lenguaje natural libre limitado a lo que el parseo local determinístico pueda, contra FR1.1.
- **Unificar ambos usos del FM en una sola llamada:** rechazado — mezcla interpretar la intención con mapear campos del DOM; distinto input (texto del usuario vs. DOM escaneado) y distinto momento.
