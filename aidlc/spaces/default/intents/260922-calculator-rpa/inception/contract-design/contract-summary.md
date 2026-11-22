# Resumen de contratos — Revivida de la extensión RPA AWS Pricing Calculator

> Contratos formales del sistema. Los dos contratos de red son los endpoints del
> `MappingBrain` (U4) server-side que la extensión consume; los bordes entre
> unidades embebidas son interfaces de módulo ES internas (no contratos de red).
> Specs en OpenAPI inline. Prosa en español; identificadores/campos en inglés.

## Sources

- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/units-generation/unit-of-work.md` y `unit-of-work-dependency.md` (unidades y DAG). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/domain-design/components.md` (entidades: MappingAction, WafRecommendation, ServiceRequest). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/requirements-analysis/requirements.md` (FR8 WAF, NFR3/NFR8 errores/tiempo). [requirements]
- Decisiones de la entrevista Q1-Q4. [decidido]

## Tabla de contratos

| # | Provider Unit | Consumer | Mechanism | Owner |
|---|---|---|---|---|
| C1 | u4-mapping-brain | External: extensión (u5-rpa-dom) | HTTP(S) REST síncrono (`POST /map-residue`) | u4-mapping-brain |
| C2 | u4-mapping-brain | External: extensión (u6-popup-ui) | HTTP(S) REST síncrono (`POST /waf-evaluate`) | u4-mapping-brain |
| C3 | u4-mapping-brain | External: extensión (u2-input-parsers) | HTTP(S) REST síncrono (`POST /interpret`) | u4-mapping-brain |

> Los cambios a C1, C2 y C3 que fijó Functional Design (2026-11-21) están en
> la sección "Cambios de Functional Design" al final; prevalecen sobre los
> esquemas originales de este documento.

> El alojamiento del proveedor (recrear n8n desde backup vs. proxy Bedrock) es
> **agnóstico en este contrato** y se decide en Infrastructure Design. El
> contrato fija solo el shape HTTP; la URL base (`{brainBaseUrl}`) se resuelve
> allí y se declara en `host_permissions` por la unidad u7-packaging.

## Interfaces internas (no contratos de red)

Los bordes entre unidades embebidas en el bundle MV3 son `import`/message-passing de módulos ES, no contratos de red. Se nombran para trazabilidad, pero no llevan spec OpenAPI:

| Borde | Forma |
|---|---|
| u6-popup-ui → u2-input-parsers | `normalize({ format, text }, { interpretNaturalLanguage, signal }) → Promise<{ ok: true, value: NormalizedRun } \| { ok: false, error: InputError }>` Puerto: `interpretNaturalLanguage(request, { signal })`; tras abortar resuelve `cancelled`. Topes de entrada iguales a C2 (20 servicios, 30 claves, 100 caracteres → `input_limit_exceeded`). |
| u5-rpa-dom → u3-deterministic-mapper | `mapDeterministic(domFields, requestedValues, previousOutcome?) → MappingOutcome` y `resolveResidue(outcome, context, { mapResidue, signal }) → Promise<MappingOutcome>` |
| u5-rpa-dom → ResultAggregator | `aggregate(requested, serviceResults) → RunResult (DONE\|ERROR)`; todo-o-nada, sin `PARTIAL` |
| u6-popup-ui ← u5-rpa-dom | `RunResult` / `ServiceResult[]` para el render |

Estas interfaces las fija Functional Design por unidad; aquí solo se listan para que Delivery Planning/Code Generation conozcan los puntos de integración.

## C1 — Mapeo del residuo ambiguo (`POST /map-residue`)

El cliente (content script, u5) envía el formulario escaneado + los valores que el `DeterministicMapper` (u3) no resolvió. El cerebro razona con el FM **solo sobre ese residuo** y devuelve las acciones. **Nunca se envían screenshots** (ADR-005): solo datos estructurados.

```yaml
openapi: 3.0.3
info:
  title: MappingBrain — Residue Mapping
  version: "1.0.0"
  description: >
    Resuelve con el FM el residuo ambiguo de mapeo campo-valor que el mapeo
    determinístico local no pudo resolver. Recibe datos escaneados del DOM,
    nunca imágenes.
servers:
  - url: "{brainBaseUrl}"
    description: Alojamiento agnóstico (n8n o proxy Bedrock); fijado en Infrastructure Design.
    variables:
      brainBaseUrl:
        default: "https://brain.example/api"
paths:
  /map-residue:
    post:
      summary: Mapear el residuo ambiguo de un servicio
      operationId: mapResidue
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/MapResidueRequest"
      responses:
        "200":
          description: Acciones de mapeo para el residuo
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/MapResidueResponse"
        "4XX":
          description: Request inválido (shape incorrecto, servicio desconocido)
          content:
            application/json:
              schema: { $ref: "#/components/schemas/BrainError" }
        "5XX":
          description: Fallo del cerebro o del FM subyacente
          content:
            application/json:
              schema: { $ref: "#/components/schemas/BrainError" }
components:
  schemas:
    MapResidueRequest:
      type: object
      required: [service, domFields, requestedValues, unresolved]
      properties:
        service:
          type: string
          description: Nombre del servicio AWS en configuración (p. ej. "Amazon EC2").
        domFields:
          type: array
          description: Campos escaneados del DOM (analyzeDOM); contexto completo, sin screenshots.
          items: { $ref: "#/components/schemas/DomField" }
        requestedValues:
          type: array
          description: Valores que el usuario pidió para este servicio.
          items: { $ref: "#/components/schemas/RequestedValue" }
        unresolved:
          type: array
          description: Los requestedValues que el DeterministicMapper NO pudo mapear (el residuo).
          items: { $ref: "#/components/schemas/RequestedValue" }
    DomField:
      type: object
      required: [label, type]
      properties:
        label: { type: string, description: 'Etiqueta legible, formato "Sección > Campo".' }
        section: { type: string }
        type:
          type: string
          enum: [text, number, search, select, dropdown, radio, radiogroup, checkbox, toggle, instance_radio, slider]
        options:
          type: array
          items: { type: string }
          description: Opciones disponibles (dropdowns/radios), si aplica.
    RequestedValue:
      type: object
      required: [key, value]
      properties:
        key: { type: string, description: Nombre lógico del campo pedido por el usuario. }
        value: { type: string }
    MapResidueResponse:
      type: object
      required: [actions]
      properties:
        actions:
          type: array
          items: { $ref: "#/components/schemas/MappingAction" }
    MappingAction:
      type: object
      required: [fieldLabel, actionType, value]
      properties:
        fieldLabel: { type: string, description: El label del DomField objetivo (formato "Sección > Campo"). }
        actionType:
          type: string
          enum: [fill, select, dropdown, radio, checkbox, toggle_on, toggle_off, instance_search, instance_radio]
        value: { type: string }
    BrainError:
      type: object
      required: [code, message]
      properties:
        code:
          type: string
          enum: [bad_request, unknown_service, model_unavailable, timeout, empty_result, internal_error]
        message: { type: string, description: Mensaje para log; el popup muestra texto de dominio en español, no este literal. }
```

## C2 — Evaluación Well-Architected (`POST /waf-evaluate`)

El cliente (popup, u6) envía el estimado construido; el cerebro devuelve recomendaciones clasificadas por pilar (FR8.4). Un servicio sin hallazgos se reporta explícitamente.

```yaml
openapi: 3.0.3
info:
  title: MappingBrain — Well-Architected Evaluation
  version: "1.0.0"
  description: >
    Evalúa un estimado AWS construido y devuelve recomendaciones Well-Architected
    clasificadas por pilar. Razona sobre datos del estimado, nunca screenshots.
servers:
  - url: "{brainBaseUrl}"
    variables:
      brainBaseUrl:
        default: "https://brain.example/api"
paths:
  /waf-evaluate:
    post:
      summary: Evaluar el estimado contra el Well-Architected Framework
      operationId: wafEvaluate
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/WafRequest"
      responses:
        "200":
          description: Recomendaciones por servicio
          content:
            application/json:
              schema: { $ref: "#/components/schemas/WafResponse" }
        "4XX":
          description: Request inválido
          content:
            application/json:
              schema: { $ref: "#/components/schemas/BrainError" }
        "5XX":
          description: Fallo del cerebro o del FM
          content:
            application/json:
              schema: { $ref: "#/components/schemas/BrainError" }
components:
  schemas:
    WafRequest:
      type: object
      required: [services]
      properties:
        services:
          type: array
          description: Servicios del estimado construido con su configuración.
          items:
            type: object
            required: [name]
            properties:
              name: { type: string }
              config:
                type: object
                additionalProperties: true
                description: Configuración aplicada (pares campo→valor).
    WafResponse:
      type: object
      required: [perService]
      properties:
        perService:
          type: array
          items: { $ref: "#/components/schemas/WafServiceResult" }
    WafServiceResult:
      type: object
      required: [service, noFindings]
      description: >
        Impone FR8.4: un servicio reporta hallazgos (recommendations con ≥1 ítem
        y noFindings:false) O declara explícitamente que no tiene (noFindings:true
        y recommendations ausente/vacío). Un recommendations vacío con
        noFindings:false es INVÁLIDO contra el contrato; el cliente lo trata como
        error tipado empty_result.
      properties:
        service: { type: string }
        noFindings:
          type: boolean
          description: true = sin hallazgos (estado explícito, FR8.4); false = hay recommendations.
        recommendations:
          type: array
          minItems: 1
          description: Requerido no vacío cuando noFindings=false; ausente u omitido cuando noFindings=true.
          items: { $ref: "#/components/schemas/WafRecommendation" }
      oneOf:
        - description: Con hallazgos
          required: [recommendations]
          properties:
            noFindings: { const: false }
        - description: Sin hallazgos
          properties:
            noFindings: { const: true }
    WafRecommendation:
      type: object
      required: [pillar, text]
      properties:
        pillar:
          type: string
          enum: [OperationalExcellence, Security, Reliability, PerformanceEfficiency, CostOptimization, Sustainability]
        text: { type: string, description: Recomendación accionable, en español, no vacía. }
    BrainError:
      type: object
      required: [code, message]
      properties:
        code:
          type: string
          enum: [bad_request, model_unavailable, timeout, empty_result, internal_error]
        message: { type: string }
```

## Reglas de ownership de contratos

- **Dueño de C1 y C2**: `u4-mapping-brain`. Es el único que puede cambiar el shape de los endpoints.
- **Cambios aditivos** (seguros): añadir campos opcionales nuevos a request/response. Los consumidores (u5, u6) **ignoran campos desconocidos** — un campo nuevo en la respuesta no rompe al cliente.
- **Cambios de ruptura** (p. ej. renombrar/quitar un campo requerido, cambiar un enum): requieren acuerdo explícito del mantenedor y versión nueva (`info.version`); el cliente declara qué versión espera.
- **`BrainError` es un schema POR-CONTRATO, no un tipo compartido único**: C1 y C2 lo definen por separado y sus enums de `code` divergen legítimamente (C1 tiene `unknown_service`, C2 no, porque C2 no razona sobre servicios por label). El código de cliente trata `code` como **enum abierto**: un `code` desconocido se maneja como `internal_error` (coherente con "consumidores ignoran lo desconocido"). No unificar en un tipo global.
- **Paridad de enums `DomField.type` / `MappingAction.actionType` (C1)**: el contrato es el punto de verdad cruzado U4↔U5. Cuando U5 (`scanForm`/`executeActions`) descubra un tipo de campo o acción nuevo (p. ej. un control CloudScape no visto), es un **cambio aditivo al enum, propiedad de U4, acordado con U5**. La paridad se confirma al cerrar Functional Design de U5. U4 nunca debe asumir un tipo que U5 no produce.
- **Autenticación reservada a un header**: cuando NFR/Infrastructure Design defina la autenticación extensión↔cerebro, vivirá en un **header HTTP** (p. ej. `Authorization`), nunca en el request body. Así añadirla es un cambio **aditivo** (header nuevo) y no una ruptura del shape del body de C1/C2.
- **Resiliencia del borde** (Q4): el cliente fija un timeout, reintenta con backoff acotado (1-2 intentos), y ante caída/timeout/`empty_result` propaga un resultado tipado de error visible en el popup (NFR3/NFR8). Nunca silencio ni éxito falso.
- **Seguridad**: el cerebro custodia la credencial del FM server-side (regla dura); el cliente nunca la ve. El host del cerebro se declara en `host_permissions` (u7, mínimo privilegio) una vez fijado el alojamiento.

## Preguntas abiertas

| Contract | Question | Blocks |
|---|---|---|
| C1 / C2 | ¿Alojamiento final del cerebro: recrear n8n desde backup o proxy Bedrock? Define `{brainBaseUrl}` y el host de `host_permissions`. | u4-mapping-brain, u7-packaging (Infrastructure Design) |
| C1 | ¿Autenticación entre la extensión y el cerebro (token de la extensión, origen permitido)? | u4-mapping-brain (NFR Design / Infra) |
| C2 | ~~¿Límite de tamaño del estimado enviado al WAF?~~ Resuelto en Functional Design de u4: hasta 20 servicios, 30 claves de config y 100 caracteres por clave o valor. | — |

## Cambios de Functional Design (2026-11-21)

Fijados en el diseño funcional de u2-u6 y aprobados por el mantenedor en la compuerta de esa etapa. Prevalecen sobre los esquemas anteriores.

### C1 `/map-residue` — versión 2.0.0 (cambio de ruptura)

- Cada acción de `MapResidueResponse.actions` lleva `requestKey` (requerido), igual a `RequestedValue.key` de la clave del residuo que resuelve; como máximo una acción por clave. La extensión descarta acciones sin `requestKey`.
- `MapResidueResponse` agrega `inventoryVersion` (texto).
- Una acción de select, dropdown, radio o `instance_radio` solo se acepta si su valor es una de las opciones escaneadas del campo; si el campo no trae opciones se descarta. Si la opción difiere del valor pedido, U3 la marca `substituted = true` con `requestedValue` (campo interno de `MappingAction`, no viaja en C1) y U5/U6 lo muestran como aviso al SE.
- `BrainError.code` de C1 deja de usar `unknown_service`: el cerebro trabaja con los campos recibidos.
- Topes del pedido: hasta 500 `domFields`.

### C2 `/waf-evaluate` — versión 1.1.0 (aditiva)

- `WafRequest.phase`: `pre_fill` (revisión de la configuración antes de llenar) o `post_fill` (evaluación del estimado construido, valor por defecto).
- `WafRecommendation.severity`: `high`, `medium` o `low`.
- `WafServiceResult.serviceIndex`: posición del servicio en el pedido.
- La respuesta se envuelve en `{ perService, inventoryVersion }`.
- Topes: hasta 20 servicios, 30 claves de config, 5 recomendaciones de hasta 300 caracteres de texto plano por servicio.

### C3 `/interpret` — versión 1.0.0 (nuevo)

- Pedido: `{ text (≤ 2000), locale ("es"), schemaVersion (1) }`.
- Respuesta: `{ status: "interpreted", runInput, inventoryVersion }` o `{ status: "unresolved", unresolved: [{ fragment, service?, reason }], inventoryVersion }`; `reason` ∈ `unknown_service`, `ambiguous_service`, `unknown_field`, `ambiguous_field`, `missing_value`, `unsupported_component`, `region_unavailable`.
- `runInput` cumple el esquema estricto del Anexo A (con `template` por servicio); la extensión lo valida igual que un JSON pegado.
- Errores: `BrainError` con `bad_request` (400), `empty_result` (502), `model_unavailable` (503), `timeout` (504), `internal_error` (500). El servidor responde en 25 s o menos; la extensión espera hasta 30 s.

### Anexo A

- Cada servicio admite `template` (texto no vacío) junto a `name`, `search_term` y `fields`; las claves desconocidas son error.
- Los toggles `__switch__:<toggle>` viven dentro de `fields`.
- La unidad de un campo con unidad va en su propia clave `"<Campo> unit"`; el DomField del selector de unidad se escanea con esa etiqueta.

## Cambios de NFR Requirements (2026-11-21)

Fijados en NFR Requirements de u4. C1 2.0.0, C2 1.1.0 y C3 1.0.0 aún no están implementados, así que se amplían en la misma versión.

- `BrainError.code` de C1, C2 y C3 agrega: `unauthorized` (401, token ausente, inválido o vencido), `rate_limited` (429, con `retryAfterSeconds` entero), `daily_quota_exceeded` (429, tope diario de tokens del SE) e `inventory_unavailable` (503, sin inventario activo).
- Cada pedido lleva `Authorization: Bearer <token>` del proveedor de identidad (token de hasta 1 hora). Toda respuesta lleva `requestId` (cabecera `X-Request-Id` y campo del cuerpo en errores).
- El cliente (U2, U3 y U6 a través de U7) muestra cada código con su mensaje en español; reintenta `rate_limited` una sola vez tras `retryAfterSeconds` solo si queda presupuesto en su tope de 30 s; no reintenta `daily_quota_exceeded`, `unauthorized` ni `inventory_unavailable`.
- Quién hace la llamada HTTP: C1 lo consume lógicamente el content script (U3 dentro de U5), pero la petición HTTP la hace siempre el service worker (U7) con el token del SE; el content script le pasa el pedido por mensaje y nunca ve el token ni la URL del cerebro. Lo mismo vale para C2 y C3 desde el panel (U6).
- Borde con el service worker (u3/u5/u6 → u7): mensaje `BRAIN_CALL { callId, operation, body }` con respuesta `{ callId, ok, value | error }`; la cancelación viaja como `BRAIN_CANCEL { callId }`, porque un `AbortSignal` no cruza `chrome.runtime`. El service worker aborta su `fetch` al recibirlo y descarta respuestas de un `callId` cancelado.
- El borde con el service worker agrega el código local `login_cancelled` (el SE cerró o canceló el login) y aplica una lista permitida por contexto: el content script solo puede pedir `map-residue`; el panel, `interpret` y `waf-evaluate` (u7, NFR5.5 y NFR5.6).
- Mensajes de sesión del borde (NFR Design de u7): `BRAIN_LOGIN {}` → `{ ok: true, expiresAt } | { ok: false, error: { code: "login_cancelled" | "brain_unavailable" } }`, y `BRAIN_SESSION {}` → `{ authenticated, expiresAt }`. Solo los aceptan las páginas de la extensión (panel, u6), nunca un content script. Un `BRAIN_CALL` sin token válido responde `unauthorized` de inmediato, sin abrir el login.
- Canal de error de los puertos del cerebro (`interpretNaturalLanguage`, `mapResidue`, `wafEvaluate`): cada puerto resuelve con la respuesta válida de su operación o **rechaza** con `BrainCallError { code, retryAfterSeconds?, requestId? }`, donde `code` es uno de los códigos del contrato o de este borde (`unauthorized`, `login_cancelled`, `rate_limited`, `daily_quota_exceeded`, `inventory_unavailable`, `timeout`, `brain_unavailable`, `bad_request`, `empty_result`, `internal_error`). Es la traducción directa de la respuesta `{ ok: false, error }` de `BRAIN_CALL` (u7). Las unidades consumidoras (u2, u3, u6) mapean ese `code` según su diseño.
