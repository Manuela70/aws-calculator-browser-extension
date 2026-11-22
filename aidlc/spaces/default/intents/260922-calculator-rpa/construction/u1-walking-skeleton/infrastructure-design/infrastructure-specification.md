# Especificación de infraestructura — u1-walking-skeleton

> El skeleton no usa infraestructura en la nube: es una extensión de Chrome MV3
> que corre entera en el navegador del SE y no hace llamadas de red propias.
> Esta especificación fija dónde corre cada pieza, qué recursos locales usa y
> cómo se entrega. Prosa en español; identificadores en inglés.

## Sources

- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u1-walking-skeleton/nfr-design/logical-components.md` (componentes, dominios de fallo, recursos compartidos). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u1-walking-skeleton/nfr-design/security-design.md` (manifest final, datos guardados). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u1-walking-skeleton/nfr-design/performance-design.md`, `scalability-design.md`, `reliability-design.md`, `observability-design.md`. [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/domain-design/components.md` (MappingBrain server-side, fuera del skeleton). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u1-walking-skeleton/functional-design/functional-spec.md` (módulos y contrato de mensajes). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/contract-design/contract-summary.md` (C1/C2 del cerebro: no los consume el skeleton). [stage]
- `aidlc/spaces/default/memory/team.md` `## Deployment` (cargar/recargar unpacked; `.zip` manual a futuro). [team-practices]
- `infrastructure-design-questions.md` de esta unidad: Q1 (GitHub Actions). [Q1]

## Deployment

| Facet | Choice | Rationale |
|---|---|---|
| Compute model | Navegador del SE: service worker `background.js`, página del panel lateral y content script en la pestaña de `calculator.aws` | Extensión MV3; no hay servidor que operar en el skeleton |
| Networking | Sin red propia: ningún `fetch`; `host_permissions` solo `https://calculator.aws/*` | El mapeo es local (agnóstico del cerebro); mínimo privilegio (NFR4.2) |
| Storage | `chrome.storage.local` con `unlimitedStorage`: `activeRun`, `lastRunResult`, `runLogIndex`, `runLog:<runId>:<n>` | Persistencia local del resultado y del registro sin límite (NFR3.6, NFR4.4) |
| Environments | Uno solo: la instalación unpacked en el Chrome del desarrollador/SE | Práctica afirmada del equipo; no hay staging ni producción |
| Distribución | Cargar/recargar unpacked desde `aws-calculator-extension/`; `.zip` manual a futuro (U7) | Práctica afirmada; completamente reversible |
| IaC | No aplica (no hay recursos en la nube). La "configuración de infraestructura" es `manifest.json`, versionado en git y verificado por un test | Sin cuenta AWS que aprovisionar |
| Resource sizing | Versión mínima de Chrome 116; sin límites de cómputo propios | La Side Panel API con `setPanelBehavior` lo requiere (NFR7.3) |
| CI | GitHub Actions (ver `cicd-pipeline.md`) | Decisión Q1; requiere publicar el repo en GitHub |

## Infrastructure Services

| Service | Role | Configuration | Notes |
|---|---|---|---|
| `chrome.storage.local` | database (clave-valor local) | Permiso `storage` + `unlimitedStorage`; claves de §Deployment; un escritor por clave por momento | Escritura inmediata por trozos de ≤ 200 entradas (NFR Design Q1) |
| Chrome Side Panel API | UI host | `side_panel.default_path = sidepanel.html`; `setPanelBehavior({ openPanelOnActionClick: true })` | Reemplaza el popup |
| `chrome.scripting` | inyección | Solo `content.js` en la pestaña de `calculator.aws`, cuando el `PING` inicial no responde | Guardia de carga única |
| `chrome.tabs` | descubrimiento de pestaña | `query`, `create`, `update`, `onUpdated`, `onRemoved` | Handshake y vigilancia de la pestaña |
| `calculator.aws` (terceros) | sistema objetivo del RPA | DOM CloudScape; sin API | No controlado por nosotros; riesgo P2 aislado en `lib/dom/selectors.js` |
| GitHub Actions | CI | Workflow en `.github/workflows/ci.yml` | Única pieza fuera del navegador; no tiene secretos |

No hay base de datos, caché, colas, CDN, DNS ni balanceadores en el skeleton. El `MappingBrain` server-side (U4) y el backend de memoria del agente (capacidad nueva) se especificarán en sus propias unidades.

## Shared Infrastructure

No aplica en el skeleton: U1 es la única unidad construida y `chrome.storage.local` es propio de la extensión. Cuando U2/U3/U5/U6 reemplacen en sitio los módulos provisionales, seguirán usando las mismas claves con los dueños definidos en `logical-components.md`.

## Costo

Cero costo de nube para el skeleton. GitHub Actions entra en la cuota gratuita de un repositorio con un solo mantenedor (una corrida de lint + tests por push, de pocos minutos); si el repositorio es privado, conviene vigilar los minutos usados en la configuración de facturación de GitHub.
