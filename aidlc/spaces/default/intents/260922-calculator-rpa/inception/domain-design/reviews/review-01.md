## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-21T03:11:46Z
**Iteration:** 1
**Verdict Dictated:** no

Pase asesor único (decision support para el gate). Revisé `components.md` (bloque YAML + vista humana), `decisions.md` (ADR-001..005) y `traceability.json` contra `requirements.md`, `stories.md` y los artefactos brownfield (`architecture.md`, `component-inventory.md`), más las reglas afirmadas en `project.md`.

El catálogo es sólido en lo estructural: 9 componentes con nombres únicos, sin auto-dependencia, grafo acíclico, cada entidad con dueño único e identificador, toda `references.entity` resuelve a su componente dueño, e infraestructura/terceros (FM, DOM CloudScape) modelados como `external_dependencies` y no como componentes. La trazabilidad cubre las 15 historias (US1.0–US8.1) con status `OK` y todos los targets apuntan a componentes existentes: sin `GAP`, sin `ORPHAN`, sin target inválido. Los 5 ADR llevan las cuatro secciones exigidas (Context/Decision/Consequences/Alternatives Rejected) y honran las decisiones del humano (cerebro híbrido, FM sobre datos y no screenshots, credencial server-side, Playwright descartado en MV3) y las reglas duras afirmadas (sin secreto de larga vida en el cliente; capa de mapeo extraíble a módulo ES; sin build step). Ninguno de los hallazgos abiertos es bloqueante; la partición Zona A/Zona B (RpaOrchestrator vs DomResolver) y el split DeterministicMapper/MappingBrain son coherentes.

El único hallazgo con peso es una incoherencia de dirección/simetría alrededor de la frontera de entrada que arrastraría a Functional Design si no se resuelve ahora; lo marco Major y no Critical porque no introduce ciclo, huérfano ni fallo de ejecución.

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/260922-calculator-rpa/inception/domain-design/components.md > componentes NaturalLanguageParser, JsonParser e InputNormalizer (campos depends_on / dependents) | La relación entre los dos parsers e InputNormalizer rompe la simetría exigida y se contradice consigo misma. NaturalLanguageParser y JsonParser declaran `dependents: [InputNormalizer]` (lo que afirma que InputNormalizer los LLAMA), pero `InputNormalizer.depends_on` está vacío, así que el `depends_on` recíproco no existe. Además esa dirección choca con el texto de interacción ("entrega los servicios parseados para normalizar") y con el diagrama mermaid (`NaturalLanguageParser -->\| servicios parseados \| InputNormalizer`), que describen el parser entregando datos A InputNormalizer, es decir el parser llamando a InputNormalizer. Como está, no se puede saber quién llama a quién en el borde de entrada, y Functional Design heredaría esa ambigüedad. | Fijar una sola dirección de llamada en el borde de entrada y hacer `depends_on`/`dependents` simétricos en consecuencia: si los parsers invocan a InputNormalizer, mover la arista a `depends_on` de cada parser (con InputNormalizer listándolos en `dependents`); si es InputNormalizer quien invoca a los parsers, poblar `InputNormalizer.depends_on` con ambos. Alinear el texto de interacción, el diagrama y la tabla resumen con la dirección elegida. | New |
| R-02 | Minor | aidlc/spaces/default/intents/260922-calculator-rpa/inception/domain-design/components.md > componente NaturalLanguageParser (depends_on MappingBrain) y decisions.md > ADR-001/ADR-002 | El borde opcional NaturalLanguageParser -> MappingBrain abre un camino al FM que no pasa primero por el DeterministicMapper. Eso tensiona el invariante "determinístico primero, FM solo sobre el residuo" que es el corazón de la eficiencia de tokens de ADR-001/ADR-002: en el camino NL, la interpretación de expresiones libres podría llamar al FM antes de cualquier mapeo determinístico. El artefacto lo difiere correctamente ("frontera que se afina en Functional Design"), pero la tensión con el invariante de tokens no está nombrada en ningún ADR. | Dejar registrada la tensión (una línea en ADR-001 o un ADR nuevo) para que Functional Design la resuelva explícitamente: acotar cuándo el camino NL puede invocar al FM y cómo se preserva la eficiencia de tokens, o declarar que el WAF/residuo y la interpretación NL son dos presupuestos de tokens distintos y aceptados. | New |
| R-03 | Minor | aidlc/spaces/default/intents/260922-calculator-rpa/inception/domain-design/components.md > entidad RunResult (PopupController) y ResultAggregator | Hay una ligera ambigüedad de ownership del resultado de la corrida: RunResult (dueño PopupController) agrega ServiceResult (dueño ResultAggregator), pero el comportamiento de ResultAggregator dice "Construir el RunResult y la lista por servicio", es decir ResultAggregator construye una entidad de la que no es dueño. No es un huérfano (RunResult tiene exactamente un dueño), pero el dueño de datos y el constructor divergen. | Confirmar la intención: si ResultAggregator produce el RunResult, considerar moverle el ownership (y dejar a PopupController como consumidor), o ajustar el comportamiento de ResultAggregator para que devuelva solo la decisión/lista por servicio y PopupController ensamble el RunResult. Resolver antes de que Functional Design fije el esquema. | New |

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| sensor-traceability (--check) | No ejecutado | El CLI exige `--output-path` y solo valida al (re)escribir con `--write-upstream`, lo que regeneraría el artefacto de etapa; no corrí esa ruta para no sobrescribir la salida bajo revisión. Verifiqué la trazabilidad a mano: 15 historias, todas `OK`, todos los targets son componentes declarados, sin GAP/ORPHAN. |

### Summary

El modelo de dominio es implementable y respeta las decisiones del humano y las reglas duras afirmadas; el único asunto de peso es la dirección/simetría contradictoria del borde de entrada (parsers ↔ InputNormalizer), que conviene fijar antes de Functional Design. Los otros dos puntos (camino NL al FM frente al invariante de tokens; constructor vs dueño de RunResult) son menores y pueden resolverse en diseño funcional.
