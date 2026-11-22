## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-21T05:00:00Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | contract-summary.md > C2 `WafResponse.perService` items (schema de `recommendations` / `noFindings`) | El schema no hace cumplir FR8.4. `recommendations` es `required` pero puede ser `[]`, y `noFindings` es opcional: una respuesta con `recommendations: []` y sin `noFindings` es válida contra el schema y sin embargo viola el pass/fail observable de FR8.4 ("nunca una respuesta vacía o sin pilar; usar el enunciado explícito de sin hallazgos"). La prosa de la descripción dice "Vacío NO está permitido implícitamente", pero el contrato no lo impone, así que el cliente no puede confiar en el shape para distinguir "sin hallazgos" de "respuesta vacía por fallo". | Hacer el invariante verificable en el contrato: o bien exigir `recommendations` no vacío salvo cuando `noFindings` es `true` (y marcar `noFindings` como `required` o acoplarlo con un `oneOf`/`minItems`), o documentar explícitamente que el cliente trata `recommendations: []` sin `noFindings:true` como `empty_result` tipado. Dejarlo decidido antes de Code Generation de U4/U6. | Resolved (reviewer) |
| R-02 | Minor | contract-summary.md > C1 y C2 (campo `BrainError.code` enum divergente) | El enum de `BrainError.code` difiere entre contratos: C1 incluye `unknown_service`, C2 no. Es correcto por dominio (C2 no tiene concepto de servicio desconocido por label), pero `BrainError` se define dos veces con el mismo nombre y forma distinta. Al implementarse como un módulo de error compartido en el cliente (NFR3/NFR8, un solo manejador de error tipado), esa divergencia de enum puede inducir un tipo unión implícito no documentado. | Documentar que `BrainError` es un schema por-contrato (no un tipo compartido único) y que el código de cliente debe tratar `code` como enum abierto — ignorar un `code` desconocido como `internal_error` —, consistente con la regla "consumidores ignoran campos desconocidos". Opcionalmente unificar el enum con `unknown_service` presente en ambos y marcado N/A para C2. | Resolved (reviewer) |
| R-03 | Minor | contract-summary.md > C1 `DomField` vs domain-design `DomResolver` (enum `type`) y `MappingAction` (enum `actionType`) | Los enums de `DomField.type` y `MappingAction.actionType` del contrato deben mantenerse en paridad con lo que `scanForm`/`executeActions` (U5, Zona B) producen/aplican realmente (FIX-1..FIX-9, tipos CloudScape: dropdown, radiogroup, instance_radio, slider, toggle). Hoy la lista parece cubrir el inventario, pero el contrato es el punto de verdad cruzado U4↔U5 y no hay una nota de quién la mantiene sincronizada cuando aparezca un tipo de campo nuevo. | Añadir una nota de ownership: cuando U5 descubra un tipo de campo/acción nuevo, es un cambio aditivo al enum del contrato propiedad de U4, acordado con U5. Confirmar la paridad del enum al cerrar Functional Design de U5. | Resolved (reviewer) |
| R-04 | Minor | contract-summary.md > "Preguntas abiertas" (autenticación C1/C2) | La pregunta abierta de autenticación extensión↔cerebro queda diferida a NFR/Infra Design. Correcto para no bloquear el skeleton (U1 es agnóstico del cerebro y no toca estos contratos), pero el contrato no declara dónde vivirá el token/el origen permitido en el shape HTTP (header vs. body), lo que podría forzar un cambio de contrato posterior si se mete en el body. | Reservar explícitamente la autenticación a un header (p. ej. `Authorization`/un header de token) en la nota del contrato, de modo que añadirla sea aditivo y no un cambio de ruptura del request body. No bloquea esta etapa. | Resolved (reviewer) |

> R-01 Reviewer note: `WafServiceResult` ahora exige FR8.4: `recommendations` lleva `minItems: 1` y un `oneOf` con dos ramas — con hallazgos (`required: [recommendations]`, `noFindings const false`) y sin hallazgos (`noFindings const true`). Un `recommendations` vacío falla el `minItems`; omitido con `noFindings:false` no casa ninguna rama → inválido. La regla empty-as-empty_result queda documentada en el `description` del schema. El `oneOf` es un schema OpenAPI 3.0.3 bien formado y todos los `$ref` resuelven.

> R-02 Reviewer note: Las reglas de ownership documentan `BrainError` como schema POR-CONTRATO (no tipo compartido), con enums de `code` que divergen legítimamente (C1 tiene `unknown_service`, C2 no) y manejo de enum abierto en el cliente (un `code` desconocido se trata como `internal_error`). Las dos definiciones del bloque confirman la divergencia.

> R-03 Reviewer note: Añadida la nota de paridad `DomField.type` / `MappingAction.actionType` (C1): el contrato es el punto de verdad cruzado U4↔U5, un tipo/acción nuevo es cambio aditivo al enum propiedad de U4 acordado con U5, confirmado al cerrar Functional Design de U5.

> R-04 Reviewer note: Las reglas reservan la autenticación a un header HTTP (p. ej. `Authorization`), nunca al request body, de modo que añadirla sea aditiva. Los request bodies de C1/C2 no llevan campo de auth.

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| OpenAPI parse (C1 `/map-residue`) | PASS (revisión manual) | OpenAPI 3.0.3 válido; `$ref` a `MapResidueRequest`, `MapResidueResponse`, `BrainError`, `DomField`, `RequestedValue`, `MappingAction` resuelven dentro de `components/schemas`. |
| OpenAPI parse (C2 `/waf-evaluate`) | PASS (revisión manual) | OpenAPI 3.0.3 válido; `$ref` a `WafRequest`, `WafResponse`, `WafServiceResult`, `WafRecommendation`, `BrainError` resuelven. `oneOf` + `const` admisibles en 3.0.3. |

### Summary

Las cuatro observaciones previas están corregidas sin regresión: ambos bloques OpenAPI siguen válidos y con `$ref` resueltos, ambos contratos de red (C1, C2) y las interfaces internas de módulo ES siguen distinguidos, y el alojamiento del cerebro sigue agnóstico (`{brainBaseUrl}`, diferido a Infrastructure Design — no bloquea U1). El `oneOf` de `WafServiceResult` ancla FR8.4 correctamente. Advisory: READY.
