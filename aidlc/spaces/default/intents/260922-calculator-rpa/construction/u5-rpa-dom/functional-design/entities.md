# Entidades — u5-rpa-dom

> Datos del RPA sobre calculator.aws: la corrida de varios servicios, el
> resultado por servicio, la resolución de elementos en cascada, el contador de
> reintentos, el progreso y el spotlight. U5 completa en sitio las entidades
> provisionales de U1 (`ServiceResult`, `RunResult`, `ProgressEvent`). El bloque
> YAML es la fuente de verdad. Prosa en español; nombres en inglés.

## Sources

- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/units-generation/unit-of-work.md` (U5: RpaOrchestrator, DomResolver, ResultAggregator, FIX-1..FIX-9, spotlight). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/units-generation/unit-of-work-story-map.md` (US4.1-US4.4, US6.1, US6.2, US7.1, US8.1 → U5). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/user-stories/stories.md`. [stories]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/requirements-analysis/requirements.md` (FR3-FR7, FR9-FR11, NFR2, NFR3, NFR8). [requirements]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/domain-design/components.md`. [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/contract-design/contract-summary.md` (DomField, MappingAction, `aggregate`). [stage]
- `aidlc/spaces/default/knowledge/calculator-catalog/README.md`. [knowledge]
- `functional-design-questions.md` de esta unidad, Q1-Q4. [Q1-Q4]

## Modelo (fuente de verdad)

```yaml
entities:
  - name: ServiceRequest
    owner_unit: u2-input-parsers   # U5 pide a u2 el campo template (Q2); cambio de contrato registrado en functional-spec §7
    description: >
      La plantilla llega como clave "template" a nivel de servicio en el JSON del
      Anexo A (junto a name, search_term y fields), nunca dentro de fields.
    attributes:
      - { name: requestId, type: string, required: true }
      - { name: serviceName, type: string, required: true }
      - { name: searchTerm, type: string, required: true }
      - { name: template, type: string, required: false,
          description: "Plantilla del formulario a abrir (p. ej. Advanced estimate); ausente = la que abre por defecto (Q2)." }
      - { name: region, type: string, required: true }
      - { name: fields, type: list<RequestedValue>, required: true }
      - { name: toggles, type: list<ToggleRequest>, required: true }

  - name: ResolutionAttempt
    owner_unit: u5-rpa-dom
    description: Un intento de ubicar un elemento por etiqueta, en orden de cascada (FR4.1).
    attributes:
      - { name: strategy, type: enum, required: true,
          allowed: [aria_label, aria_labelledby, label_for, section_heading] }
      - { name: matched, type: integer, required: true, description: "Cantidad de elementos que coincidieron." }

  - name: ResolvedElement
    owner_unit: u5-rpa-dom
    attributes:
      - { name: label, type: string, required: true }
      - { name: strategy, type: enum, required: true, allowed: [aria_label, aria_labelledby, label_for, section_heading] }
      - { name: attempts, type: list<ResolutionAttempt>, required: true }

  - name: RetryCounter
    owner_unit: u5-rpa-dom
    description: Contador puro de reintentos de una operación acotada (AC6.2.2).
    attributes:
      - { name: operation, type: enum, required: true, allowed: [save, page_wait, dropdown_open, search_service] }
      - { name: attempt, type: integer, required: true, min: 0 }
      - { name: maxAttempts, type: integer, required: true }
      - { name: exhausted, type: boolean, required: true }

  - name: ServiceResult
    owner_unit: u5-rpa-dom
    attributes:
      - { name: requestId, type: string, required: true }
      - { name: serviceName, type: string, required: true }
      - { name: status, type: enum, required: true, allowed: [confirmed, failed] }
      - { name: reason, type: enum, required: false,
          allowed: [service_not_found, template_not_found, field_not_recognized, field_not_resolved, field_not_applied,
                    option_no_match, option_ambiguous, toggle_not_applied, validation_required, save_not_confirmed,
                    page_timeout, service_timeout, not_attempted, unexpected_error],
          description: "Requerido si status = failed. Superset de U1: conserva field_not_applied (incluye región no fijada, detalle \"Region\"); not_attempted marca los servicios que no se procesaron porque la corrida se detuvo (BR2.5)." }
      - { name: detail, type: string, required: false, description: "Clave(s) y motivo(s), o la etiqueta donde se detuvo." }
      - { name: stoppedAtLabel, type: string, required: false, description: "Último campo que se intentó llenar (Q3)." }
      - { name: brainSubstitutions, type: "list<{key, requestedValue, appliedValue}>", required: false,
          description: "Solo las acciones aplicadas con substituted = true (u3, C1 2.0.0): el valor pedido y la opción realmente aplicada. Una acción del cerebro con la opción exacta pedida no entra." }
      - { name: durationMs, type: integer, required: true }

  - name: RunResult
    owner_unit: u5-rpa-dom
    attributes:
      - { name: runId, type: string, required: true }
      - { name: status, type: enum, required: true, allowed: [DONE, ERROR],
          description: "Todo-o-nada: no existe PARTIAL; se pide quitarlo de contract-summary (functional-spec §7)." }
      - { name: results, type: list<ServiceResult>, required: true, description: "Uno por servicio pedido, en orden (Q1)." }
      - { name: missing, type: list<string>, required: true, description: "Servicios pedidos no confirmados, por nombre." }
      - { name: estimateUrl, type: string, required: false, description: "Solo si status = DONE." }
      - { name: failureStep, type: enum, required: false,
          allowed: [preconditions, connection, services, estimate_check, rename, share, lost],
          description: "Superset de U1 (preconditions = estimado no vacío; connection = handshake; lost = corrida sin latido)." }

  - name: ProgressEvent
    owner_unit: u5-rpa-dom
    attributes:
      - { name: runId, type: string, required: true }
      - { name: requestId, type: string, required: false }
      - { name: serviceIndex, type: integer, required: false }
      - { name: serviceCount, type: integer, required: true }
      - { name: step, type: enum, required: true,
          allowed: [adding_service, applying_toggles, mapping_pass, asking_brain, applying_action, saving, cancelling, checking_estimate, renaming, sharing] }
      - { name: label, type: string, required: false }
      - { name: serviceStatus, type: enum, required: false, allowed: [in_progress, confirmed, failed] }

  - name: SpotlightState
    owner_unit: u5-rpa-dom
    attributes:
      - { name: targetLabel, type: string, required: false }
      - { name: visible, type: boolean, required: true }
      - { name: reducedMotion, type: boolean, required: true }
```

## Resumen

- **ServiceRequest** suma `template` para abrir un modo concreto del formulario (Q2).
- **ResolutionAttempt / ResolvedElement** registran la cascada de resolución, para que un fallo diga qué se intentó (FR4.3).
- **RetryCounter** es la pieza pura que decide cuándo una operación agotó sus intentos (AC6.2.2).
- **ServiceResult** amplía los motivos de U1 y agrega dónde se detuvo y qué resolvió el cerebro.
- **RunResult** lista cada servicio y los faltantes; URL solo con DONE.
- **ProgressEvent / SpotlightState** alimentan el panel y el resalte del campo.
