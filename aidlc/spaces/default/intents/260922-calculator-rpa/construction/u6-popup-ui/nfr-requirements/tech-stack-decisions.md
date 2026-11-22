# Decisiones de stack — u6-popup-ui

> Tecnología del panel lateral. U6 hereda el stack del walking skeleton (u1) y
> no añade dependencias de runtime. Prosa en español; identificadores en inglés.

## Sources

- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/requirements-analysis/requirements.md` (NFR6, NFR7). [requirements]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u6-popup-ui/functional-design/functional-spec.md` (reductor, componentes, verificación). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/refined-mockups/design-system-mapping.md` (tokens y componentes CSS). [stage]
- Reglas afirmadas en `aidlc/spaces/default/memory/project.md` y `team.md` (sin build step, cero dependencias de runtime, UI en español, Zona A con Vitest y 80 %). [team-practices]

## 1. Decisiones

| Área | Decisión | Alternativas descartadas | Motivo |
|---|---|---|---|
| UI | HTML y CSS propios con funciones de render en vanilla JS que escriben solo `textContent`. | React, Lit, Preact. | Sin build step ni dependencias de runtime. |
| Estado | Reductor puro (`lib/panel/panel-state.js`) con la máquina de estados del diseño. | Librerías de estado. | Testeable en Zona A. |
| Accesibilidad | Roles ARIA nativos, `aria-live`, foco gestionado; objetivo WCAG 2.1 AA (BR5.2). | — | Requisito del diseño. |

## 2. Requisitos

| ID | Requisito | Criterio de verificación |
|---|---|---|
| NFR6.1 | `lib/panel/**` (reductor, tabla de textos, validador de URL, armado de filas) alcanza al menos 80 % de cobertura de líneas y ramas, con `coverage.include` y `coverage.thresholds` configurados. | `npx vitest run --coverage`. |
| NFR6.2 | La revisión de accesibilidad del smoke cubre: navegación solo con teclado por pestañas y botones, anuncio de estados por lector de pantalla y contraste de los colores de estado. | Lista de verificación en `SMOKE.md`. |
