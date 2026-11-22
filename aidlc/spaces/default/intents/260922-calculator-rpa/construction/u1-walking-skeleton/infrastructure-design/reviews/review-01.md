## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-21T20:55:07Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/260922-calculator-rpa/construction/u1-walking-skeleton/infrastructure-design/monitoring-design.md > Metrics & KPIs, SLIs / SLOs | Ninguna de las 7 métricas ni de los 4 SLOs tiene dueño, frecuencia de revisión ni mecanismo de seguimiento (WBR). La tabla solo trae fuente y umbral. Frases como "Cualquier ERROR o lost se revisa" no dicen quién revisa, cuándo ni dónde queda registrado. Sin eso, los umbrales no generan ninguna decisión. | Agregar a cada métrica y SLO una columna de dueño (el mantenedor), frecuencia (por ejemplo, en cada corrida del smoke y en cada push) y mecanismo (checklist de `SMOKE.md`, notificación de GitHub, revisión semanal del índice de corridas). Si una métrica no tendrá revisión, quitarla. | New |
| R-02 | Minor | aidlc/spaces/default/intents/260922-calculator-rpa/construction/u1-walking-skeleton/infrastructure-design/monitoring-design.md > Alerts, fila "CI en rojo" | La alerta se declara "Bloqueante para integrar", pero el equipo hace commit directo a `main` (`team.md` Way of Working) y el workflow corre después del push. El commit ya está integrado cuando el CI falla, así que no bloquea nada. El SLO "CI verde en main: 100 % de los pushes" es inalcanzable por construcción. | Reformular la severidad como "aviso post-push; se corrige con un commit siguiente o `git revert`" y el SLO como tiempo máximo hasta volver a verde. La entrega de `cicd-pipeline.md` §4 ("CI verde en el commit") ya cubre el control real. | New |
| R-03 | Minor | aidlc/spaces/default/intents/260922-calculator-rpa/construction/u1-walking-skeleton/infrastructure-design/traceability.json > coverage NFR1.1 y NFR5.1 | Ambos se marcan OK con "sin fetch / sin red propia", pero ningún control automático lo hace cumplir. El test del manifest solo verifica `permissions` y `host_permissions`, y las reglas de ESLint de `cicd-pipeline.md` paso 3 no prohíben `fetch`, `XMLHttpRequest`, `WebSocket` ni `sendBeacon`. Una regresión que agregue `fetch` pasaría el CI sin avisar, y la regla del proyecto exige que `host_permissions` refleje solo los hosts a los que se hace `fetch`. | Agregar al ESLint `no-restricted-globals` y `no-restricted-properties` para `fetch`, `XMLHttpRequest`, `WebSocket` y `navigator.sendBeacon` en el skeleton, o rebajar esos NFR a "verificado en el smoke" con la justificación. | New |
| R-04 | Minor | aidlc/spaces/default/intents/260922-calculator-rpa/construction/u1-walking-skeleton/infrastructure-design/cicd-pipeline.md > §2 Entorno y acciones de terceros | El diseño omite la cadena de suministro de las dev-dependencies. No dice que `package-lock.json` esté versionado (condición para que `npm ci` funcione y sea reproducible), no incluye `npm audit` ni Dependabot, y las acciones se fijan solo por versión mayor. El riesgo es acotado (no entran al bundle, token `contents: read`, sin secretos), pero el paso 1 depende de ese lockfile y queda sin declarar. | Declarar `package-lock.json` como archivo versionado obligatorio. Evaluar un paso `npm audit --omit=dev` o Dependabot. Opcionalmente fijar las acciones por SHA. | New |

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| (ninguna declarada por la etapa) | N/A | Se verificó a mano la coherencia entre `cicd-pipeline.md`, `infrastructure-specification.md`, `monitoring-design.md`, `traceability.json` y el diseño NFR (manifest en `security-design.md` §1, umbral y Zona A en `reliability-design.md` §5, registro en `observability-design.md`). La referencia a `schemaVersion` resuelve en `functional-design/entities.md`. |

### Summary

La decisión Q1 (GitHub Actions en cada push a `main`, requisito previo de publicar el repo, scripts manuales mientras tanto) se implementa fielmente. El skeleton sin nube, la entrega unpacked, la configuración fuera de `aws-calculator-extension/` y el umbral de 80 % son coherentes con las reglas del equipo y del proyecto. El único hallazgo Major es que ninguna métrica o SLO de monitoreo cierra con dueño, frecuencia y mecanismo. Es corregible sin rediseño, y los hallazgos Minor refuerzan la alerta de CI, la prohibición de red y la cadena de suministro de las dev-dependencies.
