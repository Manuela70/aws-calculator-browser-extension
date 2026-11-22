# Diseño de fiabilidad — u1-walking-skeleton

> Patrones para que el skeleton nunca reporte éxito en un fallo, degrade de
> forma visible ante cambios de la UI de terceros y siempre termine. No hay
> servicios remotos propios, así que no hay circuit breakers ni failover; la
> resiliencia es local. Prosa en español; identificadores en inglés.

## Sources

- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u1-walking-skeleton/nfr-requirements/reliability-requirements.md` (NFR1.1, NFR2.1-NFR2.2, NFR3.1-NFR3.2, NFR6.1-NFR6.2, NFR8.12-NFR8.13). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u1-walking-skeleton/nfr-requirements/performance-requirements.md` (NFR8.6 corte con cancelación). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u1-walking-skeleton/functional-design/functional-spec.md` (W1-W4, máquinas de estado, BR5.1-BR5.6). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/contract-design/contract-summary.md` (resiliencia del borde con el cerebro: no aplica al skeleton). [stage]

## 1. Sin dependencias remotas (NFR1.1)

El skeleton no hace `fetch`. El mapeo es local (`deterministic-mapper`); ningún fallo de red propio puede tumbar una corrida. Los patrones de borde con el cerebro (timeout, 1-2 reintentos con backoff, `BrainError` → resultado tipado) se diseñan en U4/U5.

## 2. Punto único de ajuste de la UI (NFR2.1, NFR2.2)

- `lib/dom/selectors.js` es la única tabla con selectores CSS, textos de botón en inglés ("Add service", "Configure", "Save and add service", "Share", "Agree and continue") y patrones de clase `awsui_*`. `dom-resolver.js` solo usa nombres de esa tabla.
- Cada búsqueda que falla devuelve un resultado tipado con el nombre de la entrada de la tabla (p. ej. `selector: "estimate.shareButton"`), que va al registro técnico; al SE le llega el mensaje en español del `reason`.
- Prohibido el "primer resultado" por defecto (BR4.2) y los `catch` vacíos (ESLint `no-empty`).

## 3. Veredicto correcto (NFR3.1, NFR3.2)

- `result-aggregator.aggregate(requested, serviceResults)` es una función pura y la única que puede producir `DONE`; el resto del flujo solo la llama.
- Las condiciones de DONE se encadenan en orden y cualquier `false` corta: todos confirmados (BR5.1) → contenido exacto (BR5.6) → renombrado si hay `project` (BR5.2) → enlace válido (BR5.3).
- Un `try/catch` por servicio en el orquestador convierte cualquier excepción en `unexpected_error` y la registra como `error`; un `try/catch` en `content-main.js` alrededor de toda la corrida convierte un fallo fuera de servicio en `RunResult` ERROR con el paso en curso.

## 4. Terminación garantizada (NFR8.12, NFR8.13)

| Mecanismo | Dónde | Garantía |
|---|---|---|
| `waitFor` con tope de 20 s y `signal` | Todas las esperas | Ninguna espera es infinita |
| Corte de 180 s con `AbortController` | `service-timer` | Ningún servicio pasa de 3 min |
| Latido de `activeRun` (cada `PROGRESS`) y vigilancia del panel (vencido a 60 s, o `chrome.tabs.onRemoved` de la pestaña) | Panel | El panel siempre sale de `Running` |
| Marca de corrida cerrada (`closedRunIds`) en `content-main` | Pestaña | Ninguna escritura ni `PROGRESS` tardío de una corrida cerrada |
| `import()` fallido → `PING {ok:false}` → mensaje de recargar la pestaña | `content.js` | El SE sabe cómo salir del estado |

## 5. Testabilidad (NFR6.1, NFR6.2)

- **Zona A (Vitest, umbral agregado 80 % de líneas):** `json-parser`, `input-normalizer`, `deterministic-mapper`, `region-map`, `retry`, `service-timer` (reloj falso de Vitest), `result-aggregator`, `handshake` (API de Chrome simulada), `validation`, `log-format`, `log-index`, el troceado del registro y la comprobación del latido (función pura `isHeartbeatStale(updatedAt, now)`). Cada uno con caso feliz y al menos dos de error.
- **Configuración:** `vitest.config.js` con `coverage.provider: "v8"`, `coverage.include` = esos archivos, `coverage.thresholds.lines: 80`.
- **Zona B (smoke `SMOKE.md`):** canónico EC2 sobre estimado vacío (≤ 3 min), fallo provocado por etiqueta inexistente, estimado con servicios previos, cierre y reapertura del panel a mitad de corrida, cierre de la pestaña a mitad de corrida (registro completo hasta el corte, gracias a la escritura inmediata).
