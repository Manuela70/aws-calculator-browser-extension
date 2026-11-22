# Componentes lógicos — u5-rpa-dom

> Módulos del RPA, la zona de cada uno y los NFR que alojan. U5 no tiene
> infraestructura propia: corre dentro de la extensión unpacked. Prosa en
> español; identificadores en inglés.

## Sources

- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u5-rpa-dom/functional-design/functional-spec.md` (§3 módulos, §10 verificación). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u5-rpa-dom/nfr-requirements/tech-stack-decisions.md` (NFR6.1, NFR6.2, NFR7.1, NFR7.2). [stage]

## 1. Componentes

| Módulo | Zona | Responsabilidad | NFR que aloja |
|---|---|---|---|
| `lib/rpa/orchestrator.js` | A | Flujos R1/R2 sobre un resolvedor inyectado; señales por servicio | NFR3.5, NFR8.4 |
| `lib/rpa/result-aggregator.js` | A | `aggregate`, `finalizeRunResult`, `buildServiceResult`, `buildProgressEvent`, `clip`, `validateShareUrl` | NFR3.2, NFR3.4, NFR5.4, NFR5.5, NFR8.6 |
| `lib/rpa/retry.js` | A | `RetryCounter` | NFR8.5 |
| `lib/rpa/service-timer.js` | A | Corte de 3 minutos por servicio con reloj inyectable, encadenado a la señal de la corrida | NFR8.4 |
| `lib/dom/aria-label.js` | A | `cleanAriaLabel`, `parseUnitButtonLabel` | NFR2.2 |
| `lib/dom/cascade.js` | A | `selectByCascade` (exactamente un candidato) | NFR2.2 |
| `lib/mapping/option-match.js` (de U3) | A | `matchOption` exacta y única | NFR2.3 |
| `lib/dom/dom-utils.js` | B | `waitFor`, `readBack`, `confirmSave`, `exitWithoutSave`, `verifyEstimate` | NFR2.2, NFR3.1, NFR3.3, NFR3.5 |
| `lib/dom/dom-resolver.js`, `form-scanner.js` | B | Candidatos por estrategia, FIX, plantilla, opciones al abrir; exclusión del overlay | NFR2.2, NFR2.3, NFR5.3 |
| `lib/dom/selectors.js` | B | Único punto de selectores frágiles | NFR2.1 |
| `lib/dom/spotlight.js` | B | Overlay en shadow root cerrado, solo `textContent` | NFR5.2, NFR5.3 |
| `content.js` | B | Punto de entrada; `import()` de `lib/**`; puerto con el service worker | NFR4.1, NFR5.1 |

## 2. Fronteras y dependencias

- **Zona A no importa nada de Zona B ni usa `document` o `chrome`** (NFR7.1). Una regla ESLint (`no-restricted-imports` y `no-restricted-globals` en `lib/rpa/**`, `cascade.js`, `aria-label.js`) lo impone.
- **Zona B usa Zona A por `import`**; el orquestador recibe el resolvedor de Zona B por inyección para poder probarse con dobles.
- **Hacia afuera**, U5 solo habla por el puerto del service worker (`BRAIN_CALL`, `BRAIN_CANCEL`, progreso y resultado). No tiene red, almacenamiento ni secretos.

## 3. Reglas de lint que sostienen el diseño

| Regla | Alcance | NFR |
|---|---|---|
| `no-restricted-syntax` (prefijo `awsui_` y textos de botón) | todo salvo `selectors.js` | NFR2.1 |
| `no-restricted-globals` (`fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`) y `no-restricted-properties` (`window.fetch`, `globalThis.fetch`, `self.fetch`) | todo el código del content script: `content.js`, `lib/dom/**`, `lib/rpa/**`, `lib/mapping/**` | NFR4.1 |
| `no-restricted-properties` (`chrome.storage`) | `content.js`, `lib/dom/**`, `lib/rpa/**`, `lib/mapping/**` | NFR5.1 |
| `no-restricted-properties` (`innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`) | todo el bundle | NFR5.2 |
| `no-restricted-imports` / `no-restricted-globals` en Zona A | módulos de Zona A | NFR7.1 |

## 4. Verificación

| Requisito | Cómo |
|---|---|
| NFR6.1 | `npx vitest run --coverage` con `coverage.include` sobre los módulos de Zona A de §1 y `coverage.thresholds` de 80 % en líneas y ramas; el orquestador se prueba con un resolvedor falso (multi-servicio con fallos intermedios, plantilla inexistente, corte de 3 min, salida no confirmada). |
| NFR6.2 | `aws-calculator-extension/SMOKE.md` con los siete casos mínimos (servicio simple, multi-servicio con toggle condicional, servicio inexistente, campo obligatorio vacío, fallo a mitad de corrida, cancelación, sustitución del cerebro) y el resultado esperado en el panel de cada uno; se revisa antes de cerrar Code Generation. |
| NFR7.1 | Reglas de lint de §3 más revisión del grafo de imports. |
| NFR7.2 | `npm run check:bundle` confirma cero dependencias de runtime y, con la ampliación de NFR4.2, ninguna URL ni secreto en `lib/**`. |
