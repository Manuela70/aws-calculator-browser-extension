# Decisiones de stack técnico — u1-walking-skeleton

> Stack del walking skeleton. Casi todo viene fijado por restricciones
> afirmadas del proyecto (MV3, sin build step, vanilla JS, cero dependencias de
> runtime); esta etapa añade lo que el skeleton estrena: panel lateral, módulos
> ES por `import()` dinámico, persistencia local sin límite y el tooling de
> desarrollo. Prosa en español; identificadores en inglés.

## Sources

- `aidlc/spaces/default/codekb/extension/technology-stack.md` (stack actual del v6: JS ES2018+, MV3, sin build, sin librerías, sin tests ni linter). [brownfield]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/requirements-analysis/requirements.md` (C1, C7, NFR6, NFR7). [requirements]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u1-walking-skeleton/functional-design/functional-spec.md` (estructura de módulos, manifest, carga por `import()`). [stage]
- `aidlc/spaces/default/memory/team.md` y `project.md` (Vitest, ESLint, Prettier como dev-dependencies; sin build step; sin TypeScript ni JSDoc). [team-practices]
- `nfr-requirements-questions.md` de esta unidad: Q1, Q4, Q5, Q7. [Q1, Q4, Q5, Q7]

## Decisiones

| Área | Decisión | Justificación | Requisito |
|---|---|---|---|
| Lenguaje | JavaScript ES2020+ vanilla (módulos ES, `async/await`, optional chaining), sin TypeScript ni JSDoc | Restricción afirmada; Chrome moderno lo soporta sin transpilar | NFR7.1 |
| Plataforma | Chrome Extension Manifest V3 | Restricción afirmada | NFR7.1 |
| UI | Chrome Side Panel API (`chrome.sidePanel`), HTML + CSS propios, sin framework | Decisión de Functional Design (panel lateral); evita dependencias | NFR7.2 |
| Fondo | Service worker `background.js` como módulo, solo para abrir el panel al pulsar el icono | Mínimo necesario para el panel lateral | NFR4.5 |
| Content script | `content.js` clásico y delgado + `lib/**` como módulos ES cargados con `import(chrome.runtime.getURL(...))` | Los content scripts del manifest no pueden ser módulos; permite módulos testeables sin build | NFR7.1 |
| Persistencia | `chrome.storage.local` con `unlimitedStorage`; claves `activeRun`, `lastRunResult`, `runLog:<runId>` y el índice `runLogIndex` | Registro completo sin límite (Q5/Q7); sin backend en el skeleton | NFR3.6, NFR4.4 |
| Tests | Vitest con cobertura (proveedor `v8`), umbral de líneas 80 % sobre los módulos puros; solo dev-dependency | Práctica afirmada; Q4 | NFR6.1 |
| Lint/formato | ESLint (flat config) con `no-empty`, `no-eval`, `no-implied-eval`, `no-new-func`; Prettier; solo dev-dependencies | Práctica afirmada; ataca `catch` vacíos (P3) y código dinámico (C6) | NFR3.2, NFR5.4 |
| Dependencias de runtime | Ninguna | Regla afirmada (cero dependencias empaquetadas) | NFR5.8 |
| Build | Ninguno: Chrome carga `aws-calculator-extension/` tal cual; `package.json` solo existe para las dev-dependencies y no participa en la carga | Regla afirmada | NFR7.1 |

## Requisitos

| ID | Requisito | Criterio de verificación |
|---|---|---|
| NFR7.1 | La extensión se carga unpacked sin paso de build; la capa de mapeo (`lib/mapping/deterministic-mapper.js`) es un módulo ES propio, acoplado solo por `import`, que U3 reemplaza en sitio. | Cargar la carpeta en `chrome://extensions` sin compilar nada; revisión de imports. |
| NFR7.2 | El panel lateral (`sidepanel.html`/`sidepanel.js`) es la única UI; `popup.html`/`popup.js` se retiran del bundle. U6 completa los estados del panel sobre estos mismos archivos. | Revisión del manifest y del árbol. |
| NFR7.3 | Versión mínima de Chrome declarada en el manifest (`minimum_chrome_version: "116"`), porque la Side Panel API con `setPanelBehavior` la requiere. | Revisión del manifest. |

## Ajustes que estos requisitos introducen sobre el Diseño Funcional

El Diseño Funcional de la unidad está aprobado y no se reescribe; estas son las diferencias que las decisiones de NFR (Q1-Q7) introducen. Donde chocan, **manda esta lista**, y Code Generation implementa el diseño con estos ajustes aplicados:

| # | Diseño Funcional dice | Ahora | Origen |
|---|---|---|---|
| 1 | BR6.3: en `chrome.storage.local` se guarda `lastRunResult` y "no se guarda nada más (ni historial ni credenciales)" | Además se guardan el registro técnico completo por corrida (`runLog:<runId>`) y su índice (`runLogIndex`), sin límite de retención. Sigue sin guardarse ninguna credencial. | Q3, Q5 → NFR3.5-NFR3.7, NFR3.11 |
| 2 | `functional-spec.md` §2: el manifest añade `sidePanel` y `storage`; "la limpieza completa de mínimo privilegio (host CloudFront muerto) sigue siendo de U7" | El skeleton hace ya la limpieza: quita el host CloudFront, `activeTab` y `clipboardWrite`, y añade también `unlimitedStorage`. U7 queda solo con añadir el host del cerebro y el empaquetado `.zip`. Esto también corrige la asignación de `unit-of-work.md` para U7. | Q1, Q7 → NFR4.1-NFR4.4 |
| 3 | Entidades: `ServiceResult.reason` sin motivo de tiempo total por servicio | Nuevo valor `service_timeout`, con corte duro y cancelación (NFR8.6). | Q2, Q6 |
| 4 | BR2.4: mensaje "No pude conectar con calculator.aws." | Si el fallo fue el `import()` del módulo, el mensaje pide recargar la pestaña de calculator.aws (la guardia de carga única impide reinyectar). | NFR8.13; hallazgo menor de la revisión del Diseño Funcional |
| 5 | Registro: sin eventos de inicio y fin de corrida | El registro abre con `run_start` y cierra con `run_end`, de donde sale la duración del smoke. | NFR3.5, NFR8.7 |
| 6 | Manifest sin versión mínima de Chrome | `minimum_chrome_version: "116"`. | NFR7.3 |

## Alternativas descartadas

- **Popup**: se cierra al hacer clic fuera y pierde el progreso; reemplazado por el panel lateral (decisión del SE).
- **Bundler (esbuild/Rollup) para combinar módulos en el content script**: introduciría un build step, prohibido por las reglas.
- **`chrome.storage.session`**: se borra al cerrar el navegador; incompatible con un registro que debe persistir entre sesiones.
- **IndexedDB para el registro**: más capacidad y consultas, pero más complejidad; `chrome.storage.local` con `unlimitedStorage` basta para el skeleton.
