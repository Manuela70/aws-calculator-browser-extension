# Decisiones de stack — u5-rpa-dom

> Tecnología del RPA. U5 hereda el stack del walking skeleton (u1) y no añade
> dependencias de runtime. Prosa en español; identificadores en inglés.

## Sources

- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/requirements-analysis/requirements.md` (NFR6, NFR7). [requirements]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u5-rpa-dom/functional-design/functional-spec.md` (partición Zona A / Zona B, verificación). [stage]
- `aidlc/spaces/default/codekb/extension/technology-stack.md` (content script MV3, vanilla JS, sin build). [brownfield]
- Reglas afirmadas en `aidlc/spaces/default/memory/team.md` y `project.md` (Zona A con Vitest y 80 %, Zona B con smoke manual versionado, sin build step, cero dependencias de runtime). [team-practices]

## 1. Decisiones

| Área | Decisión | Alternativas descartadas | Motivo |
|---|---|---|---|
| Lenguaje | JavaScript ES2022 en módulos ES cargados por `import()` dinámico desde `content.js` (`web_accessible_resources`). | Bundler. | Sin build step. |
| Automatización del DOM | Eventos nativos del DOM (`input`, `change`, clics) sobre los elementos de CloudScape. | Playwright o Puppeteer dentro de la extensión. | No se pueden empaquetar en MV3 y añadirían dependencias. |
| Pruebas Zona A | Vitest sobre `cascade.js`, `aria-label.js`, el contador de reintentos y el armado del resultado. | — | Lógica pura, cobertura medible. |
| Pruebas Zona B | Smoke manual versionado en `aws-calculator-extension/SMOKE.md`. | e2e automatizado contra calculator.aws. | Decisión del equipo: el riesgo vive en el DOM real; un e2e contra una SPA de terceros no compensa para un mantenedor solo. |

## 2. Requisitos

| ID | Requisito | Criterio de verificación |
|---|---|---|
| NFR6.1 | Los módulos de Zona A de U5 (`lib/dom/cascade.js`, `lib/dom/aria-label.js`, `lib/rpa/orchestrator.js` con el DOM reemplazado por dobles, `lib/rpa/result-aggregator.js`, el contador de reintentos y el armado de `ServiceResult`) alcanzan al menos 80 % de cobertura de líneas y ramas. | `npx vitest run --coverage` con `coverage.include` y `coverage.thresholds` (80 % líneas y ramas) configurados para esos archivos, de modo que el comando falle por debajo del piso. |
| NFR6.2 | `SMOKE.md` cubre como mínimo: servicio simple, multi-servicio con toggle condicional, servicio inexistente, campo obligatorio vacío, fallo a mitad de corrida, cancelación y sustitución del cerebro; cada caso indica el resultado esperado en el panel. | Revisión de `SMOKE.md` antes de cerrar Code Generation. |
| NFR7.1 | La lógica de Zona A no importa nada de Zona B ni del DOM; la Zona B usa la Zona A por `import`. | Revisión del grafo de imports. |
| NFR7.2 | `check:bundle` sigue confirmando cero dependencias de runtime. | `npm run check:bundle`. |
