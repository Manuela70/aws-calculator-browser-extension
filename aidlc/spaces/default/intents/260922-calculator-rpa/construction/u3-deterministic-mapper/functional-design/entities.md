# Entidades — u3-deterministic-mapper

> Datos del mapeo campo ↔ valor: los campos escaneados que entrega U5, los
> valores pedidos que entrega U2, las acciones resueltas y el residuo. U3
> completa en sitio las entidades provisionales de U1 (`MappingAction`,
> `MappingOutcome`). El bloque YAML es la fuente de verdad. Prosa en español;
> nombres de entidad y atributos en inglés.

## Sources

- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/units-generation/unit-of-work.md` (U3: match de label, valores directos, marca de residuo). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/units-generation/unit-of-work-story-map.md` (US4.1 → U3; U5). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/user-stories/stories.md` (AC4.1.1-AC4.1.5). [stories]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/requirements-analysis/requirements.md` (FR3, FR5.2, NFR7). [requirements]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/domain-design/components.md` (DeterministicMapper, MappingAction) y `decisions.md` (ADR-001, ADR-002). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/contract-design/contract-summary.md` (C1 `/map-residue`: DomField, RequestedValue, MappingAction; `mapDeterministic`). [stage]
- `aidlc/spaces/default/knowledge/calculator-catalog/README.md` (campos valor + unidad, etiquetas repetidas). [knowledge]
- `functional-design-questions.md` de esta unidad, Q1-Q3. [Q1-Q3]

## Modelo (fuente de verdad)

```yaml
entities:
  - name: DomField
    owner_unit: u5-rpa-dom   # lo produce scanForm; U3 lo consume
    description: Campo escaneado del formulario de un servicio (shape de C1 DomField).
    attributes:
      - { name: label, type: string, required: true, description: 'Formato "Sección > Campo".' }
      - { name: section, type: string, required: false }
      - { name: type, type: enum, required: true,
          allowed: [text, number, search, select, dropdown, radio, radiogroup, checkbox, toggle, instance_radio, slider] }
      - { name: options, type: list<string>, required: false,
          description: "Opciones visibles al escanear; ausente si el control las carga al abrirse." }
    constraints:
      - "Un selector de unidad o de periodo se escanea como su propio DomField de tipo dropdown o select, con etiqueta \"<Sección> > <Campo> unit\" (Q1, integración con U5)."

  - name: RequestedValue
    owner_unit: u2-input-parsers
    description: Valor pedido por la configuración (de ServiceRequest.fields).
    attributes:
      - { name: key, type: string, required: true, description: '"Campo" o "Sección > Campo".' }
      - { name: value, type: string, required: true }

  - name: ServiceRequest
    owner_unit: u2-input-parsers   # definido en u2 entities.md; U3 lee serviceName y fields
    description: Servicio normalizado; U3 usa serviceName (para C1) y fields. Sus toggles los aplica U5 (BR2.6).
    attributes:
      - { name: serviceName, type: string, required: true }
      - { name: fields, type: list<RequestedValue>, required: true }

  - name: BrainMappingAction
    owner_unit: u4-mapping-brain   # forma de la respuesta de C1 que U3 consume
    description: >
      Acción devuelta por /map-residue. Requiere requestKey además de los campos
      de C1 MappingAction; ya registrado en C1 2.0.0 (contract-summary).
    attributes:
      - { name: requestKey, type: string, required: true }
      - { name: fieldLabel, type: string, required: true }
      - { name: actionType, type: enum, required: true,
          allowed: [fill, select, dropdown, radio, checkbox, toggle_on, toggle_off, instance_search, instance_radio] }
      - { name: value, type: string, required: true }

  - name: MappingAction
    owner_unit: u3-deterministic-mapper
    description: Acción resuelta para aplicar un valor a un campo escaneado.
    attributes:
      - { name: actionId, type: string, required: true, unique: true, description: "act-1, act-2, … en orden de ejecución." }
      - { name: fieldLabel, type: string, required: true, description: "Label exacto del DomField objetivo." }
      - { name: actionType, type: enum, required: true,
          allowed: [fill, select, dropdown, radio, checkbox, toggle_on, toggle_off, instance_search, instance_radio],
          description: "Paridad con C1." }
      - { name: value, type: string, required: true }
      - { name: source, type: enum, required: true, allowed: [deterministic, brain] }
      - { name: requestKey, type: string, required: true, description: "Clave pedida que originó la acción (trazabilidad)." }
      - { name: substituted, type: boolean, required: true, description: "true solo si source = brain y la opción elegida difiere del valor pedido (BR3.3); U5 y U6 lo muestran como aviso." }
      - { name: requestedValue, type: string, required: false, description: "Valor pedido original; presente cuando substituted = true." }

  - name: UnresolvedValue
    owner_unit: u3-deterministic-mapper
    description: Valor pedido que el mapeo no resolvió.
    attributes:
      - { name: key, type: string, required: true }
      - { name: value, type: string, required: true }
      - { name: reason, type: enum, required: true,
          allowed: [no_match, ambiguous_label, duplicate_target, unsupported_type, invalid_number, invalid_value, option_no_match, option_ambiguous] }
      - { name: sendable, type: boolean, required: true,
          description: "true solo para no_match y option_no_match: lo que puede ir al cerebro (BR3.2)." }

  - name: MappingOutcome
    owner_unit: u3-deterministic-mapper
    description: Resultado acumulado del mapeo de un servicio a lo largo de las pasadas.
    attributes:
      - { name: actions, type: list<MappingAction>, required: true,
          description: "En el orden de la configuración por pasada; las del cerebro al final (BR3.3). Vacía si el servicio falla (BR3.4)." }
      - { name: pending, type: list<RequestedValue>, required: true,
          description: "Valores con no_match que esperan otra pasada (BR3.1)." }
      - { name: newActionsInLastPass, type: integer, required: true }
      - { name: pass, type: integer, required: true, min: 1, max: 3 }
      - { name: unresolved, type: list<UnresolvedValue>, required: true }
      - { name: residueStatus, type: enum, required: true,
          allowed: [pending_passes, none, resolved_by_brain, brain_unavailable, still_unresolved] }
    constraints:
      - "residueStatus = none si y solo si al terminar las pasadas unresolved está vacío."
```

## Resumen

- **DomField** lo produce U5 al escanear. U3 fija una condición de integración: los selectores de unidad o periodo deben aparecer como campos propios con etiqueta `"<Sección> > <Campo> unit"`, porque la unidad llega como una clave aparte (Q1).
- **ServiceRequest / RequestedValue / ToggleRequest** vienen de U2 sin cambios; los toggles no pasan por U3 (los aplica U5 antes de escanear).
- **MappingAction** gana `requestKey` y el origen `brain` (residuo resuelto por el cerebro).
- **BrainMappingAction** es la acción que devuelve `/map-residue`; exige `requestKey`, un agregado al contrato C1.
- **UnresolvedValue** reemplaza al `RequestedValue` crudo del residuo de U1: añade el motivo y si puede ir al cerebro.
- **MappingOutcome** acumula las pasadas sobre campos condicionales y termina indicando si hubo residuo y cómo se cerró.
