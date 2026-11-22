# Entidades — u1-walking-skeleton

> Modelo de datos del walking skeleton. El bloque YAML es la fuente de verdad;
> el resumen y el diagrama de `functional-spec.md` se derivan de él. Varias
> entidades son **versiones provisionales y mínimas** de entidades que poseen
> otras unidades (U2, U3, U5): el skeleton las define en el mismo módulo que esas
> unidades completarán, para que la generalización sea un reemplazo en sitio.
> Prosa en español; nombres de entidad y atributos en inglés.

## Sources

- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/units-generation/unit-of-work.md` (U1: slice mínimo, módulos provisionales compartidos con U2/U3/U5). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/units-generation/unit-of-work-story-map.md` (US1.0, US1.1 → U1). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/user-stories/stories.md` (AC1.0.1-AC1.0.4, AC1.1.1-AC1.1.3). [stories]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/requirements-analysis/requirements.md` (FR1.2, FR2, FR3, FR5, FR9, FR10, NFR3, NFR8; Anexo A). [requirements]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/domain-design/components.md` (ServiceRequest, MappingAction, ServiceResult, RunResult y sus dueños). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/contract-design/contract-summary.md` (DomField, MappingAction y enums de C1; interfaces internas). [stage]
- `functional-design-questions.md` de esta unidad, Q1-Q10 y la confirmación del resumen. [Q1-Q10]

## Modelo (fuente de verdad)

```yaml
entities:
  - name: RunInput
    owner_unit: u2-input-parsers   # provisional en U1, lo completa U2
    description: >
      JSON que el SE pega en el panel lateral, conforme al Anexo A. El skeleton
      solo acepta JSON (la entrada en lenguaje natural es de U2).
    attributes:
      - { name: project, type: string, required: false, min_length: 1, max_length: 200,
          description: "Nombre del proyecto; si viene, el estimado se renombra a este valor (Q2). Un valor no texto o de más de 200 caracteres se rechaza (BR1.2)." }
      - { name: region, type: string, required: false, default: "us-east-1",
          constraints: "Debe ser un código de región presente en RegionMap." }
      - { name: services, type: list<RawService>, required: true, min_items: 1 }
    relationships:
      - { entity: RawService, cardinality: "1..*", direction: "RunInput contiene RawService" }

  - name: RawService
    owner_unit: u2-input-parsers
    description: Un servicio tal como viene en el JSON, antes de normalizar.
    attributes:
      - { name: name, type: string, required: true, min_length: 1 }
      - { name: search_term, type: string, required: false,
          default: "valor de name" }
      - { name: fields, type: "map<string,string|number|boolean>", required: false, default: "{}",
          constraints: "Objeto plano etiqueta→valor; las claves que empiezan por __switch__: son toggles. Números y booleanos se convierten a texto al normalizar; objetos, listas y null se rechazan (BR1.2)." }

  - name: ServiceRequest
    owner_unit: u2-input-parsers   # dueño de dominio: InputNormalizer
    description: >
      Servicio normalizado, independiente del formato de entrada. Es lo único que
      el resto del flujo ve del input.
    attributes:
      - { name: requestId, type: string, required: true, unique: true,
          description: "Posición en la corrida (svc-1, svc-2, ...); estable durante la corrida." }
      - { name: serviceName, type: string, required: true }
      - { name: searchTerm, type: string, required: true }
      - { name: region, type: string, required: true,
          description: "Código de región heredado de RunInput.region (el v6 lo leía mal desde el servicio)." }
      - { name: fields, type: list<RequestedValue>, required: true, min_items: 0 }
      - { name: toggles, type: list<ToggleRequest>, required: true, min_items: 0 }
    relationships:
      - { entity: RequestedValue, cardinality: "0..*", direction: "ServiceRequest pide RequestedValue" }
      - { entity: ToggleRequest, cardinality: "0..*", direction: "ServiceRequest pide ToggleRequest" }

  - name: RequestedValue
    owner_unit: u2-input-parsers
    description: Un par etiqueta→valor pedido por el usuario (shape de C1 RequestedValue).
    attributes:
      - { name: key, type: string, required: true, min_length: 1,
          description: "Etiqueta tal como la escribió el usuario." }
      - { name: value, type: string, required: true }

  - name: ToggleRequest
    owner_unit: u2-input-parsers
    description: Toggle condicional pedido con la clave __switch__:<toggle>.
    attributes:
      - { name: label, type: string, required: true }
      - { name: wantOn, type: boolean, required: true,
          description: "true para on/true; false para off/false." }

  - name: RunRequest
    owner_unit: u1-walking-skeleton
    description: Orden de ejecución que el panel lateral envía al content script.
    attributes:
      - { name: runId, type: string, required: true, unique: true,
          description: "Identificador único de la corrida, generado al pulsar Generar Estimado." }
      - { name: project, type: string, required: false }
      - { name: services, type: list<ServiceRequest>, required: true, min_items: 1 }
    relationships:
      - { entity: ServiceRequest, cardinality: "1..*", direction: "RunRequest ejecuta ServiceRequest en orden" }

  - name: TabConnection
    owner_unit: u1-walking-skeleton
    description: Resultado del handshake con la pestaña de calculator.aws (US1.0).
    attributes:
      - { name: tabId, type: integer, required: true }
      - { name: origin, type: enum, required: true, allowed: [reused, opened] }
      - { name: injected, type: boolean, required: true, default: false,
          description: "true si hubo que inyectar el content script." }
      - { name: pingAttempts, type: integer, required: true, min: 1, max: 4,
          description: "Total de PING enviados: 1 inicial + hasta 3 tras inyectar (Q4)." }
      - { name: status, type: enum, required: true, allowed: [connected, unreachable],
          description: "connected solo si un PING respondió ready = true (módulo cargado, BR2.3)." }

  - name: RegionMap
    owner_unit: u5-rpa-dom
    description: >
      Tabla de referencia código de región → nombre visible en calculator.aws
      (p. ej. us-east-1 → "US East (N. Virginia)"). Dato estático, sin identidad.
    attributes:
      - { name: code, type: string, required: true, unique: true }
      - { name: displayName, type: string, required: true }

  - name: DomField
    owner_unit: u5-rpa-dom   # producido por scanForm (DomResolver)
    description: >
      Campo escaneado del formulario (shape de C1 DomField). La tabla de
      instancias de EC2 se escanea como UN solo DomField de tipo instance_radio,
      cuyo label sale del heading del radiogroup (FIX-6, p. ej. "Instance type");
      su caja de búsqueda interna NO se emite como DomField aparte, para que la
      etiqueta coincida de forma única (BR3.1).
    attributes:
      - { name: label, type: string, required: true,
          description: 'Formato "Sección > Campo".' }
      - { name: section, type: string, required: false }
      - { name: type, type: enum, required: true,
          allowed: [text, number, search, select, dropdown, radio, radiogroup, checkbox, toggle, instance_radio, slider] }
      - { name: options, type: list<string>, required: false }

  - name: MappingAction
    owner_unit: u3-deterministic-mapper   # dueño de dominio: DeterministicMapper
    description: Acción resuelta para aplicar un RequestedValue a un DomField.
    attributes:
      - { name: actionId, type: string, required: true, unique: true }
      - { name: fieldLabel, type: string, required: true,
          description: "Label del DomField objetivo." }
      - { name: actionType, type: enum, required: true,
          allowed: [fill, select, dropdown, radio, checkbox, toggle_on, toggle_off, instance_search, instance_radio],
          description: "Enum en paridad con C1. En el skeleton una acción instance_radio es compuesta: el DomResolver busca el tipo en la tabla y elige su fila (BR4.7); instance_search no se emite." }
      - { name: value, type: string, required: true }
      - { name: source, type: enum, required: true, allowed: [deterministic],
          description: "En el skeleton solo existe el origen determinístico; brain llega con U4." }
    relationships:
      - { entity: DomField, cardinality: "1..1", direction: "MappingAction apunta a un DomField" }
      - { entity: RequestedValue, cardinality: "1..1", direction: "MappingAction resuelve un RequestedValue" }

  - name: MappingOutcome
    owner_unit: u3-deterministic-mapper
    description: Salida del mapeo determinístico de un servicio.
    attributes:
      - { name: actions, type: list<MappingAction>, required: true }
      - { name: unresolved, type: list<RequestedValue>, required: true,
          description: "Valores sin coincidencia única. En el skeleton, cualquier elemento aquí hace fallar el servicio (Q1)." }

  - name: ServiceResult
    owner_unit: u5-rpa-dom   # dueño de dominio: ResultAggregator
    description: Resultado tipado de un servicio solicitado.
    attributes:
      - { name: requestId, type: string, required: true,
          references: ServiceRequest.requestId }
      - { name: serviceName, type: string, required: true }
      - { name: status, type: enum, required: true, allowed: [confirmed, failed] }
      - { name: reason, type: enum, required: false,
          allowed: [service_not_found, page_timeout, toggle_not_applied, field_not_recognized, field_not_applied, validation_required, save_not_confirmed, unexpected_error],
          constraints: "Requerido si status=failed; ausente si status=confirmed." }
      - { name: detail, type: string, required: false,
          description: "Dato de dominio para el mensaje (p. ej. la etiqueta no reconocida). Nunca selectores ni clases awsui_*." }

  - name: RunResult
    owner_unit: u5-rpa-dom   # dueño de dominio: ResultAggregator
    description: Veredicto todo-o-nada de la corrida.
    attributes:
      - { name: runId, type: string, required: true, references: RunRequest.runId }
      - name: status
        type: enum
        required: true
        allowed: [DONE, ERROR]
        description: >
          El contrato compartido prevé DONE|PARTIAL|ERROR. Bajo todo-o-nada el
          skeleton reporta un fallo parcial (algunos confirmados, no todos) como
          ERROR con failureStep = services y la lista por servicio, que ya
          distingue confirmados de fallidos; no emite PARTIAL. Si U5 introduce
          PARTIAL, solo como subtipo de no-DONE: nunca con estimateUrl.
      - name: failureStep
        type: enum
        required: false
        allowed: [connection, preconditions, services, estimate_check, rename, share, lost]
        constraints: >
          Requerido si status=ERROR. Los errores de entrada (BR1.x) no producen
          RunResult: se muestran en el panel sin corrida. lost lo produce el
          panel cuando la corrida deja de responder (BR6.6).
      - { name: estimateUrl, type: string, required: false,
          constraints: "Presente si y solo si status=DONE; debe ser una URL https://calculator.aws/." }
      - { name: perServiceResults, type: list<ServiceResult>, required: true }
      - { name: finishedAt, type: timestamp, required: true }
    constraints:
      - "status=DONE implica que todos los perServiceResults tienen status=confirmed y que estimateUrl está presente."
      - "status=ERROR implica que estimateUrl está ausente."
    relationships:
      - { entity: ServiceResult, cardinality: "0..*", direction: "RunResult agrega ServiceResult" }

  - name: StoredRunRecord
    owner_unit: u1-walking-skeleton
    description: >
      Último RunResult guardado en chrome.storage.local para que sobreviva al
      cierre del panel lateral (Q8/Q9). Un único registro; cada corrida nueva lo
      reemplaza.
    attributes:
      - { name: key, type: string, required: true, allowed: [lastRunResult] }
      - { name: value, type: RunResult, required: true }
      - { name: schemaVersion, type: integer, required: true, default: 1 }

  - name: ActiveRunRecord
    owner_unit: u1-walking-skeleton
    description: >
      Corrida en curso guardada en chrome.storage.local bajo la clave activeRun,
      para que un panel reabierto a mitad de corrida recupere su estado (BR6.6).
      Se borra al guardar el RunResult final.
    attributes:
      - { name: runId, type: string, required: true }
      - { name: tabId, type: integer, required: true }
      - { name: lastProgress, type: ProgressEvent, required: false }
      - { name: updatedAt, type: timestamp, required: true,
          description: "Latido: se actualiza con cada ProgressEvent." }

  - name: ProgressEvent
    owner_unit: u1-walking-skeleton
    description: Aviso de progreso del content script al panel lateral.
    attributes:
      - { name: runId, type: string, required: true }
      - { name: pct, type: integer, required: true, min: 0, max: 100 }
      - { name: text, type: string, required: true,
          description: "Texto en español, en lenguaje de dominio." }
```

## Resumen del modelo

| Entidad | Dueño final | Rol en el skeleton |
|---|---|---|
| RunInput / RawService | U2 | JSON del Anexo A tal como llega del panel lateral |
| ServiceRequest / RequestedValue / ToggleRequest | U2 (InputNormalizer) | Estructura normalizada; región tomada de la raíz del JSON |
| RunRequest | U1 | Orden `RUN_RPA` con su `runId` |
| TabConnection | U1 | Resultado del handshake (reusada/abierta, intentos de `PING`) |
| RegionMap | U5 | Código de región → nombre visible |
| DomField | U5 (DomResolver) | Campo escaneado (`"Sección > Campo"`, tipo) |
| MappingAction / MappingOutcome | U3 (DeterministicMapper) | Acciones resueltas + residuo sin coincidencia |
| ServiceResult / RunResult | U5 (ResultAggregator) | Resultado tipado por servicio y veredicto todo-o-nada |
| StoredRunRecord | U1 | Último `RunResult` en `chrome.storage.local` |
| ActiveRunRecord | U1 | Corrida en curso + latido, para reabrir el panel a mitad de corrida |
| ProgressEvent | U1 | Progreso visible en el panel lateral |

Los enums `DomField.type` y `MappingAction.actionType` se mantienen en paridad
exacta con el contrato C1 (`contract-summary.md`). El skeleton solo produce y usa
los tipos que necesita el caso EC2 (`text`, `number`, `dropdown`, `radio`,
`instance_radio`); el resto los ejercita U5. `instance_search` queda en el enum
por paridad con C1, pero el skeleton no lo emite: la búsqueda de instancia es
parte de la acción compuesta `instance_radio` (BR4.7).
