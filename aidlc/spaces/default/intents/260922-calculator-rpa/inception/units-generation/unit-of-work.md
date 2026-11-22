# Unidades de trabajo — Revivida de la extensión RPA AWS Pricing Calculator

> Agrupación de los 9 componentes de domain-design en 7 unidades de trabajo.
> Describe QUÉ es cada unidad y qué posee; la TOPOLOGÍA de dependencias va en
> `unit-of-work-dependency.md`; el orden económico de Bolts lo decide Delivery
> Planning (2.9), no esta etapa. Prosa en español; nombres de unidad/componente
> en inglés.

## Sources

- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/domain-design/components.md` (9 componentes). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/domain-design/decisions.md` (ADR-001..006). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/requirements-analysis/requirements.md`. [requirements]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/user-stories/stories.md`. [stories]
- Decisiones de la entrevista Q1 (fina ≈7), Q2 (cerebro service), Q3 (packaging propio). [decidido]

## Modelo de despliegue

La extensión es un **único bundle MV3 unpacked** (no microservicios). Las unidades son particiones de **entrega/implementación**, no artefactos desplegables de forma independiente — salvo `u4-mapping-brain`, que es un **servicio server-side** real fuera del bundle. El resto (u1-u3, u5-u7) se carga como el mismo bundle unpacked.

## Tabla de unidades

| Unit ID | Directory | Kind | Complejidad | Modelo de despliegue |
|---|---|---|---|---|
| U1 | u1-walking-skeleton | service | M | embedded (bundle MV3) |
| U2 | u2-input-parsers | library | M | embedded (bundle MV3) |
| U3 | u3-deterministic-mapper | library | S | embedded (bundle MV3) |
| U4 | u4-mapping-brain | service | L | standalone (server-side, fuera del bundle) |
| U5 | u5-rpa-dom | library | XL | embedded (bundle MV3) |
| U6 | u6-popup-ui | ui | M | embedded (bundle MV3) |
| U7 | u7-packaging | packaging | S | shared (manifest + bundle) |

## Definición de cada unidad

### U1 — u1-walking-skeleton · service · M
- **Responsabilidad**: el slice mínimo end-to-end que prueba el camino completo con **un servicio simple** (p. ej. S3): entrada (JSON) → mapeo determinístico → RPA sobre `calculator.aws` → guardar → devolver la URL. Es el **primer Unit** y el walking skeleton afirmado.
- **Posee/entrega**: el handshake de inyección (US1.0), el flujo end-to-end de un servicio (US1.1), y el cableado mínimo entre entrada, mapeo determinístico, RPA y agregación todo-o-nada. Usa versiones mínimas de la lógica que U2/U3/U5 generalizan después.
- **Agnóstico del cerebro**: corre con el mapeo determinístico local; NO depende de `u4-mapping-brain`. Esto permite validar la espina antes de construir el servicio del FM.
- **Notas**: no es un documento aislado — es código ejecutable que recarga la extensión y produce una URL real para un caso canónico.
- **Solapamiento con U2/U3/U5 (nota de integración, para Delivery Planning / Functional Design)**: U1 introduce versiones **provisionales y mínimas** de la lógica que U2 (entrada), U3 (mapeo determinístico) y U5 (RPA/agregación) generalizan después. Como U1 es `depends_on: []` y se construye en su propio worktree, esos archivos provisionales deben quedar marcados como tales. Estrategia de integración: **U2/U3/U5 EXTIENDEN/REEMPLAZAN los módulos provisionales de U1 por las versiones completas**, no crean archivos paralelos. Concretamente, el skeleton debe ubicar su lógica mínima en los mismos módulos ES que esas unidades poseerán (p. ej. el parser de JSON mínimo del skeleton vive en el módulo que U2 completará), para que la generalización sea un reemplazo en sitio y no un conflicto de merge silencioso. Functional Design fija los nombres de módulo compartidos; Delivery Planning secuencia U1 antes que U2/U3/U5 para que el reemplazo ocurra sobre una base ya probada end-to-end.

### U2 — u2-input-parsers · library · M
- **Responsabilidad**: interpretar la entrada y normalizarla. Agrupa los componentes `NaturalLanguageParser`, `JsonParser` e `InputNormalizer`.
- **Posee/entrega**: parseo NL (US2.1, US2.2) con error tipado; validación del JSON del Anexo A (US3.1) con sus 4 casos; normalización a la estructura interna `ServiceRequest`. Zona A, unit-testeable con Vitest.
- **Notas**: el `NaturalLanguageParser` puede consumir `u4-mapping-brain` para expresiones libres (ADR-006), pero su camino determinístico base no lo requiere.

### U3 — u3-deterministic-mapper · library · S
- **Responsabilidad**: resolver los mapeos campo↔valor inequívocos sin FM y separar el residuo ambiguo. Componente `DeterministicMapper`.
- **Posee/entrega**: la función pura de mapeo obvio (match de label, valores directos del JSON) y la marca de "residuo" que irá al FM. Zona A, unit-testeable. Corazón de la eficiencia de tokens (ADR-002).

### U4 — u4-mapping-brain · service · L
- **Responsabilidad**: el servicio server-side que invoca al FM para el residuo ambiguo de mapeo y para el Well-Architected. Componente `MappingBrain`.
- **Posee/entrega**: el endpoint que recibe DATA escaneada (nunca screenshots, ADR-005) y devuelve acciones de mapeo del residuo; y el endpoint WAF (FR8) que devuelve recomendaciones por pilar. Custodia la credencial del FM server-side (regla dura).
- **Alojamiento**: recrear n8n desde el backup vs. agente Bedrock — se decide en Contract/Infrastructure Design. Esta unidad es trabajo real del alcance (decisión Q2), pero NO bloquea el walking skeleton.

### U5 — u5-rpa-dom · library · XL
- **Responsabilidad**: el núcleo RPA sobre el DOM CloudScape y la orquestación por servicio. Agrupa `RpaOrchestrator` (Zona A), `DomResolver` (Zona B) y `ResultAggregator` (Zona A).
- **Posee/entrega**: scanForm/resolveElementByLabel/selectAwsDropdown/executeActions + FIX-1..FIX-9 (US4.1-US4.4); confirmación por banner verde y detección de `is required`; reintentos acotados (NFR8); agregación todo-o-nada (US7.1); el overlay spotlight (US8.1). La parte Zona A (orquestación, agregación) es unit-testeable; la Zona B (DOM) es smoke manual.
- **Notas**: es la unidad más grande; concentra el riesgo P2 (selectores stale).

### U6 — u6-popup-ui · ui · M
- **Responsabilidad**: el controlador y la UI del popup. Componente `PopupController`.
- **Posee/entrega**: los estados del popup (M1-M8), las pestañas NL/JSON, el render de progreso y resumen por servicio, la vista Well-Architected, accesibilidad WCAG 2.1 AA. Copy en español.

### U7 — u7-packaging · packaging · S
- **Responsabilidad**: higiene del manifest y empaquetado. Aísla P4.
- **Posee/entrega**: `manifest.json` con mínimo privilegio (quitar el host muerto CloudFront; declarar solo los hosts usados, incluido el host del cerebro), estructura del bundle, y el futuro script de empaquetado `.zip` sin build step.
- **Notas**: depende de `u4-mapping-brain` porque el host a declarar en `host_permissions` se fija con el alojamiento del cerebro.

## Restricciones por unidad

- Todas las unidades embedded honran: MV3, sin build step, vanilla JS en el bundle, UI en español / código en inglés, cero dependencias de runtime empaquetadas.
- Las dev-dependencies (Vitest, ESLint, Prettier) aplican a las unidades `library`/`service`-embebidas para sus tests de Zona A, sin entrar al bundle.
- `u4-mapping-brain` es la única unidad con credencial y red server-side; nunca una credencial de larga vida en el cliente.
