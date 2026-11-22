# Entidades — u4-mapping-brain

> Datos del cerebro server-side: el inventario versionado de calculator.aws, los
> pedidos y respuestas de sus tres operaciones (interpretar lenguaje natural,
> resolver el residuo de mapeo y evaluar con criterio Well-Architected) y el
> registro de cada invocación del modelo. El bloque YAML es la fuente de verdad.
> Prosa en español; nombres de entidad y atributos en inglés.

## Sources

- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/units-generation/unit-of-work.md` (U4: servicio server-side, credencial del FM). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/units-generation/unit-of-work-story-map.md` (US5.1 → U4; U6). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/user-stories/stories.md` (AC5.1.1-AC5.1.4). [stories]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/requirements-analysis/requirements.md` (FR8, NFR1, NFR3, NFR5). [requirements]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/domain-design/components.md` y `decisions.md` (ADR-001, ADR-005, ADR-006). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/contract-design/contract-summary.md` (C1, C2, BrainError, reglas de ownership). [stage]
- `aidlc/spaces/default/knowledge/calculator-catalog/README.md` (fuente y forma del inventario). [knowledge]
- Decisiones de u2 (Q1, Q1b, Q1c) y u3 (Q1-Q3) que fijan lo que U4 debe producir; `functional-design-questions.md` de esta unidad, Q1-Q4. [Q1-Q4]

## Modelo (fuente de verdad)

```yaml
entities:
  - name: InventorySnapshot
    owner_unit: u4-mapping-brain
    description: Copia versionada del inventario de calculator.aws que usa el cerebro (Q3).
    attributes:
      - { name: version, type: string, required: true, unique: true, description: "Fecha de corte AAAA-MM-DD más un sufijo si hay varias el mismo día." }
      - { name: generatedAt, type: datetime, required: true }
      - { name: serviceCount, type: integer, required: true }
      - { name: fieldCount, type: integer, required: true }
      - { name: status, type: enum, required: true, allowed: [active, superseded, rejected] }
    relationships:
      - { entity: InventoryService, cardinality: "1..*", direction: "InventorySnapshot contiene InventoryService" }

  - name: InventoryService
    owner_unit: u4-mapping-brain
    attributes:
      - { name: serviceCode, type: string, required: true, unique: true, description: "Identidad interna del servicio." }
      - { name: name, type: string, required: true, description: "Nombre visible; puede repetirse entre entradas del catálogo." }
      - { name: canonical, type: boolean, required: true,
          description: "Entre entradas con el mismo name, exactamente una es canónica (lista de preferencias versionada junto al script); es la única que el cerebro puede elegir." }
      - { name: searchKeywords, type: list<string>, required: true }
      - { name: synonymsEs, type: list<string>, required: true, description: "Sinónimos en español, mantenidos en un archivo versionado junto al script; vacía si no hay." }
      - { name: regions, type: list<string>, required: true }
      - { name: templates, type: list<string>, required: true }
    relationships:
      - { entity: InventoryField, cardinality: "0..*", direction: "InventoryService contiene InventoryField" }

  - name: InventoryField
    owner_unit: u4-mapping-brain
    attributes:
      - { name: label, type: string, required: true, description: '"Sección > Campo" cuando la etiqueta se repite en el servicio; si no, "Campo".' }
      - { name: template, type: string, required: false, description: "Plantilla a la que pertenece (p. ej. Quick estimate); ausente si el servicio tiene una sola." }
      - { name: kind, type: enum, required: true, allowed: [quantity, unit, choice, checkbox, toggle, complex] }
      - { name: options, type: list<string>, required: false }
      - { name: conditional, type: boolean, required: true }

  - name: InterpretRequest
    owner_unit: u4-mapping-brain   # = NlInterpretationRequest de u2
    attributes:
      - { name: text, type: string, required: true, max_length: 2000 }
      - { name: locale, type: string, required: true, default: "es" }
      - { name: schemaVersion, type: integer, required: true }

  - name: InterpretResponse
    owner_unit: u4-mapping-brain   # = NlInterpretationResponse de u2
    attributes:
      - { name: status, type: enum, required: true, allowed: [interpreted, unresolved] }
      - { name: runInput, type: RunInput, required: false, description: "Esquema estricto del Anexo A (u2)." }
      - { name: unresolved, type: "list<UnresolvedFragment>", required: false }
      - { name: inventoryVersion, type: string, required: true }

  - name: MapResidueRequest
    owner_unit: u4-mapping-brain   # C1
    attributes:
      - { name: service, type: string, required: true }
      - { name: domFields, type: list<DomField>, required: true, max_items: 500 }
      - { name: requestedValues, type: list<RequestedValue>, required: true }
      - { name: unresolved, type: list<RequestedValue>, required: true, min_items: 1 }

  - name: MapResidueResponse
    owner_unit: u4-mapping-brain   # C1 con requestKey (u3)
    attributes:
      - { name: actions, type: "list<BrainMappingAction>", required: true }
      - { name: inventoryVersion, type: string, required: true }

  - name: WafRequest
    owner_unit: u4-mapping-brain   # C2 con phase
    attributes:
      - { name: phase, type: enum, required: true, allowed: [pre_fill, post_fill], default: "post_fill" }
      - { name: services, type: list<WafService>, required: true, min_items: 1, max_items: 20 }

  - name: WafService
    owner_unit: u4-mapping-brain
    attributes:
      - { name: name, type: string, required: true }
      - { name: config, type: "map<string,string>", required: false, constraints: "Hasta 30 claves; cada clave y valor de hasta 100 caracteres." }

  - name: WafResponse
    owner_unit: u4-mapping-brain   # C2, envoltorio
    attributes:
      - { name: perService, type: list<WafServiceResult>, required: true, description: "Un elemento por servicio pedido, en el mismo orden." }
      - { name: inventoryVersion, type: string, required: true }

  - name: WafServiceResult
    owner_unit: u4-mapping-brain   # C2
    attributes:
      - { name: serviceIndex, type: integer, required: true, description: "Posición del servicio en el pedido (0..n-1); distingue servicios con el mismo nombre." }
      - { name: service, type: string, required: true }
      - { name: noFindings, type: boolean, required: true }
      - { name: recommendations, type: list<WafRecommendation>, required: false, max_items: 5 }

  - name: WafRecommendation
    owner_unit: u4-mapping-brain   # C2 + severity
    attributes:
      - { name: pillar, type: enum, required: true,
          allowed: [OperationalExcellence, Security, Reliability, PerformanceEfficiency, CostOptimization, Sustainability] }
      - { name: severity, type: enum, required: true, allowed: [high, medium, low] }
      - { name: text, type: string, required: true, max_length: 300, description: "Español, texto plano, accionable (BR4.2)." }

  - name: BrainError
    owner_unit: u4-mapping-brain
    attributes:
      - { name: code, type: enum, required: true,
          allowed: [bad_request, model_unavailable, timeout, empty_result, internal_error] }
      - { name: message, type: string, required: true }

  - name: ModelInvocation
    owner_unit: u4-mapping-brain
    description: Registro de cada llamada al modelo; sin el texto del SE ni la configuración.
    attributes:
      - { name: invocationId, type: string, required: true, unique: true }
      - { name: operation, type: enum, required: true, allowed: [interpret, map_residue, waf_pre_fill, waf_post_fill] }
      - { name: inventoryVersion, type: string, required: true, description: "Versión activa al momento de la llamada, también en residuo y Well-Architected." }
      - { name: inputTokens, type: integer, required: true }
      - { name: outputTokens, type: integer, required: true }
      - { name: latencyMs, type: integer, required: true }
      - { name: attempts, type: integer, required: true, max: 2 }
      - { name: outcome, type: enum, required: true, allowed: [ok, invalid_output, timeout, model_error] }
```

## Resumen

- **InventorySnapshot / InventoryService / InventoryField** son la copia versionada del inventario (Q3). El cerebro trabaja siempre contra una versión `active` y la informa en cada respuesta.
- **InterpretRequest / InterpretResponse** son el contrato nuevo para el lenguaje natural (u2); la respuesta trae una configuración completa o los fragmentos no interpretados.
- **MapResidueRequest / MapResidueResponse** son C1 con `requestKey` (u3).
- **WafRequest / WafServiceResult / WafRecommendation** son C2 con `phase` (revisión antes de llenar o evaluación al terminar) y `severity`, ambos agregados.
- **ModelInvocation** registra costo y resultado de cada llamada sin guardar texto ni configuración del cliente.
