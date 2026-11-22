# Entidades — u2-input-parsers

> Modelo de datos de la entrada: el texto que el SE escribe en la pestaña JSON o
> en la de lenguaje natural, la configuración que el cerebro devuelve al
> interpretar lenguaje natural, y la corrida normalizada que consumen el mapeo y
> el RPA. U2 completa en sitio las entidades provisionales de U1 (`RunInput`,
> `RawService`, `ServiceRequest`). El bloque YAML es la fuente de verdad. Prosa
> en español; nombres de entidad y atributos en inglés.

## Sources

- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/units-generation/unit-of-work.md` (U2: NaturalLanguageParser, JsonParser, InputNormalizer; reemplazo en sitio de los módulos de U1). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/units-generation/unit-of-work-story-map.md` (US2.1, US2.2, US3.1 → U2). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/user-stories/stories.md` (AC2.1.1-AC2.1.2, AC2.2.1-AC2.2.3, AC3.1.1-AC3.1.4). [stories]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/requirements-analysis/requirements.md` (FR1.1-FR1.3, FR8, NFR1, NFR3; Anexo A). [requirements]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/domain-design/components.md` (ServiceRequest de InputNormalizer). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/contract-design/contract-summary.md` (interfaz `normalize(rawInput, format) → ServiceRequest[] | TypedError`). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/domain-design/decisions.md` (ADR-006: dos presupuestos del FM). [stage]
- `aidlc/spaces/default/knowledge/calculator-catalog/README.md` (inventario de 442 servicios y 3 985 campos). [knowledge]
- `functional-design-questions.md` de esta unidad, Q1-Q4, Q1b, Q1c. [Q1-Q4]

## Modelo (fuente de verdad)

```yaml
entities:
  - name: RawInput
    owner_unit: u2-input-parsers
    description: Lo que el SE escribió y la pestaña en la que lo escribió (Q3).
    attributes:
      - { name: format, type: enum, required: true, allowed: [json, natural_language],
          description: "Lo fija la pestaña activa; no hay detección automática." }
      - { name: text, type: string, required: true, min_length: 1,
          constraints: "Para natural_language, como máximo 2000 caracteres (BR3.1)." }

  - name: RunInput
    owner_unit: u2-input-parsers
    description: >
      Configuración conforme al Anexo A. Llega del JSON pegado o del cerebro tras
      interpretar lenguaje natural; en ambos casos se valida igual (BR3.3).
    attributes:
      - { name: project, type: string, required: false, min_length: 1, max_length: 200 }
      - { name: region, type: string, required: false, default: "us-east-1",
          constraints: "Código de región conocido (BR4.2)." }
      - { name: services, type: list<RawService>, required: true, min_items: 1 }
    constraints:
      - "Solo admite las claves project, region y services; cualquier otra es error de esquema (BR2.5)."
    relationships:
      - { entity: RawService, cardinality: "1..*", direction: "RunInput contiene RawService" }

  - name: RawService
    owner_unit: u2-input-parsers
    description: Un servicio tal como viene en la configuración, antes de normalizar.
    attributes:
      - { name: name, type: string, required: true, min_length: 1 }
      - { name: search_term, type: string, required: false, default: "valor de name" }
      - { name: template, type: string, required: false, min_length: 1,
          description: "Plantilla del formulario a abrir (pedido de u5); ausente = la de por defecto." }
      - { name: fields, type: "map<string,string|number|boolean>", required: false, default: "{}",
          constraints: "Etiqueta → valor; las claves con prefijo __switch__: son toggles (el Anexo A se interpreta así: los toggles viven dentro de fields)." }
    constraints:
      - "Solo admite las claves name, search_term, template y fields (BR2.5)."

  - name: NlInterpretationRequest
    owner_unit: u2-input-parsers
    description: >
      Lo que la extensión envía al cerebro (U4) para interpretar lenguaje natural.
      Solo texto y parámetros; nunca capturas de pantalla (ADR-005) ni credenciales.
    attributes:
      - { name: text, type: string, required: true, max_length: 2000 }
      - { name: locale, type: string, required: true, default: "es" }
      - { name: schemaVersion, type: integer, required: true, default: 1,
          description: "Versión del esquema de RunInput que la extensión acepta como respuesta." }

  - name: NlInterpretationResponse
    owner_unit: u4-mapping-brain   # forma fijada aquí como contrato que U2 consume
    description: Respuesta del cerebro a una NlInterpretationRequest.
    attributes:
      - { name: status, type: enum, required: true, allowed: [interpreted, unresolved] }
      - { name: runInput, type: RunInput, required: false,
          constraints: "Presente si y solo si status = interpreted." }
      - { name: unresolved, type: list<UnresolvedFragment>, required: false,
          constraints: "Al menos un elemento si status = unresolved." }

  - name: UnresolvedFragment
    owner_unit: u2-input-parsers
    description: Parte de la expresión que el cerebro no pudo convertir en configuración.
    attributes:
      - { name: fragment, type: string, required: true, description: "Texto tal como lo escribió el SE." }
      - { name: service, type: string, required: false, description: "Servicio al que se refería, si se sabe." }
      - { name: reason, type: enum, required: true,
          allowed: [unknown_service, ambiguous_service, unknown_field, ambiguous_field, missing_value, unsupported_component, region_unavailable] }

  - name: ServiceRequest
    owner_unit: u2-input-parsers
    description: Servicio normalizado, independiente del formato de entrada (sin cambios de forma respecto a U1).
    attributes:
      - { name: requestId, type: string, required: true, unique: true, description: "svc-1, svc-2, … por posición." }
      - { name: serviceName, type: string, required: true }
      - { name: searchTerm, type: string, required: true }
      - { name: region, type: string, required: true }
      - { name: fields, type: list<RequestedValue>, required: true, min_items: 0 }
      - { name: toggles, type: list<ToggleRequest>, required: true, min_items: 0 }

  - name: RequestedValue
    owner_unit: u2-input-parsers
    attributes:
      - { name: key, type: string, required: true, description: "Etiqueta del campo tal como la pidió la configuración." }
      - { name: value, type: string, required: true, description: "Números y booleanos convertidos a texto (BR4.3)." }

  - name: ToggleRequest
    owner_unit: u2-input-parsers
    attributes:
      - { name: label, type: string, required: true }
      - { name: wantOn, type: boolean, required: true }

  - name: NormalizedRun
    owner_unit: u2-input-parsers
    description: Resultado de normalize; lo único que el resto del flujo ve de la entrada.
    attributes:
      - { name: source, type: enum, required: true, allowed: [json, natural_language] }
      - { name: project, type: string, required: false }
      - { name: region, type: string, required: true }
      - { name: regionDefaulted, type: boolean, required: true,
          description: "true si la región no venía y se usó us-east-1 (Q2); el panel lo muestra antes de correr." }
      - { name: services, type: list<ServiceRequest>, required: true, min_items: 1 }
      - { name: wafReview, type: enum, required: true, allowed: [required, not_available],
          description: "required cuando el cerebro está integrado; not_available mientras no exista (Q1c)." }
    relationships:
      - { entity: ServiceRequest, cardinality: "1..*", direction: "NormalizedRun contiene ServiceRequest en el orden de la entrada" }

  - name: InputError
    owner_unit: u2-input-parsers
    description: Error tipado de la entrada; nunca va acompañado de servicios normalizados.
    attributes:
      - { name: code, type: enum, required: true,
          allowed: [empty_input, input_too_long, invalid_json, not_object, unknown_key, missing_services,
                    empty_services, invalid_service, missing_service_name, invalid_search_term,
                    invalid_fields, invalid_field_value, invalid_toggle, invalid_project, invalid_region,
                    unknown_region, input_limit_exceeded, nl_unresolved, nl_invalid_response,
                    brain_unavailable, cancelled, unauthorized, login_cancelled, rate_limited,
                    daily_quota_exceeded, inventory_unavailable, timeout, unexpected_error] }
      - { name: message, type: string, required: true, description: "En español, en lenguaje de dominio." }
      - { name: service, type: string, required: false }
      - { name: key, type: string, required: false }
      - { name: fragments, type: list<UnresolvedFragment>, required: false }
```

## Resumen

- **RawInput** es lo que el SE escribió y en qué pestaña. La pestaña decide el camino: JSON se valida localmente; lenguaje natural se envía al cerebro.
- **RunInput / RawService** son el esquema estricto del Anexo A. La misma validación aplica al JSON pegado y a la configuración que devuelve el cerebro, así ninguna de las dos fuentes puede colar claves desconocidas.
- **NlInterpretationRequest / NlInterpretationResponse / UnresolvedFragment** son el contrato con el cerebro para el lenguaje natural. El cerebro devuelve una configuración completa o la lista de fragmentos que no entendió; nunca una configuración parcial.
- **NormalizedRun / ServiceRequest / RequestedValue / ToggleRequest** son la salida común de ambos formatos (FR1.3). `regionDefaulted` y `wafReview` llevan al panel lo que tiene que mostrar antes de correr.
- **InputError** es el único resultado posible cuando algo falla; no hay resultados mixtos.
