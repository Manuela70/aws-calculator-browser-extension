# Componentes de interfaz — u6-popup-ui

> Jerarquía de componentes del panel lateral, su estado y sus eventos. Vanilla JS
> sin framework ni build; cada componente es una función que recibe un contenedor
> y el estado y escribe solo texto plano (`textContent`). Alineado con la máquina
> de estados de `functional-spec.md` §2 y el contrato del reductor de §3. Prosa
> en español; identificadores en inglés.

## Sources

- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/refined-mockups/interaction-spec.md` (C1-C6). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/refined-mockups/design-system-mapping.md` (tokens, componentes CSS). [stage]
- `functional-spec.md` y `rules.md` de esta unidad. [stage]

## Jerarquía

```
SidePanel (sidepanel.html + sidepanel.js)
├─ InputTabs            tablist JSON / Lenguaje natural                    (C1, BR1.2)
│   └─ InputArea        textarea por pestaña
├─ PrimaryAction        "Generar Estimado" / Cancelar                       (C2, BR1.3)
├─ NoReviewNotice       aviso sin revisión Well-Architected                 (BR2.3)
├─ StatusRegion         aria-live con el estado actual                      (BR5.2)
├─ InputErrorView       mensaje y fragmentos no interpretados               (BR1.2)
├─ PreviewView          servicios, plantilla, región por defecto            (BR2.1) — visible en Preview, Reviewing y Connecting
├─ ReviewFindingsView   hallazgos previos + Llenar igual / Corregir         (BR2.2)
├─ ReviewErrorView      error de la revisión + Reintentar / Volver          (BR2.2)
├─ ConnectionErrorView  error de conexión (M8) + Reintentar / Volver        (u1)
├─ CancelConfirm        confirmar cancelación de la corrida                 (§3)
├─ ServiceList          filas en cola / en curso / ✓ / ✗ + motivo           (C3, BR3.1, BR3.2)
├─ ResultBlock          veredicto, URL copiable o faltantes; Reintentar
│                       solo sin servicios guardados                        (C4, BR3.2)
├─ WafPanel             cargando / resultado por servicio, pilar,
│                       severidad / error con reintento                     (C5, BR4.1)
├─ LastRun              "Última corrida", plegada                           (BR1.1)
└─ RunHistory           sección plegable, exportar / borrar                 (BR5.3)
```

## Estado

`lib/panel/panel-state.js` (Zona A) guarda:

```
{ state, activeTab, texts: { json, natural_language },
  requestId?, runId?, normalizedRun?, reviewFindings?, progress?,
  runResult?, waf?, error?, canRetry }
```

`state` toma los valores de `functional-spec.md` §2. `requestId` y `runId` filtran los eventos tardíos o ajenos (BR3.3). `canRetry` es verdadero solo cuando el fallo no dejó servicios guardados y `normalizedRun` está en memoria.

## Eventos

| Evento | Origen | Desde → hacia |
|---|---|---|
| `tab-change` | InputTabs | Cualquier estado editable; cambia `activeTab` |
| `generate` | PrimaryAction | Idle → Validating / Interpreting |
| `normalized` (con requestId) | normalize | Validating / Interpreting → Preview / InputError |
| `cancel` | PrimaryAction | Interpreting / Reviewing → Idle; Running → CancelConfirm |
| `cancel-confirmed` | CancelConfirm | Running → Idle al llegar el RunResult de esa corrida o a los 20 s |
| `review-result` (con requestId) | cerebro | Reviewing → Connecting / ReviewFindings / ReviewError |
| `fill-anyway` / `correct` | ReviewFindingsView | ReviewFindings → Connecting / Idle |
| `retry` / `back` | ReviewErrorView, ConnectionErrorView, ResultBlock | → Reviewing / Connecting / Idle |
| `connected` / `connection-failed` | handshake | Connecting → Running / ConnectionError |
| `progress` (con runId) | content script | Running → Running |
| `run-result` (con runId) | content script | Running → Done / Failed |
| `waf-result` / `waf-failed` | cerebro | WafLoading → WafResult / WafError |
| `retry-waf` | WafPanel | WafError → WafLoading |
| `new-run` | ResultBlock, WafPanel | Done / WafResult / WafError → Idle |
| `copy-url` | ResultBlock | Sin cambio de estado |
| `export` / `delete` / `delete-all` | RunHistory | Sin cambio de estado (deshabilitados durante una corrida) |

## Validación y accesibilidad

- Validación al enviar (no por tecla); errores junto a la causa con `role="alert"` y foco.
- Roles `tablist`/`tab`/`tabpanel`, flechas entre pestañas, foco visible, `aria-live="polite"` en StatusRegion, `aria-busy` durante Interpreting, Reviewing, Connecting y Running, Escape para cancelar.
- `data-testid` en cada elemento interactivo: `input-tab-json`, `input-tab-nl`, `input-area`, `generate-button`, `cancel-button`, `cancel-confirm-button`, `fill-anyway-button`, `correct-button`, `review-retry-button`, `connection-retry-button`, `back-button`, `retry-button`, `copy-url-button`, `retry-waf-button`, `new-run-button`, `last-run-toggle`, `history-toggle`, `history-export-button`, `history-delete-button`, `history-delete-all-button`.
