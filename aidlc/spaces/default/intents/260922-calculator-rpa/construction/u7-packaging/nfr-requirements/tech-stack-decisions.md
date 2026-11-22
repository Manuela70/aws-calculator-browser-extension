# Decisiones de stack — u7-packaging

> Tecnología del empaquetado y del cliente del cerebro en el service worker.
> Prosa en español; identificadores en inglés.

## Sources

- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/requirements-analysis/requirements.md` (NFR4, NFR6, NFR7). [requirements]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/contract-design/contract-summary.md` ("Cambios de NFR Requirements"). [stage]
- `aidlc/spaces/default/codekb/extension/technology-stack.md` (MV3, vanilla JS, sin build). [brownfield]
- Reglas afirmadas en `aidlc/spaces/default/memory/project.md` y `team.md` (sin build step, cero dependencias de runtime, Vitest/ESLint/Prettier solo de desarrollo). [team-practices]

## 1. Decisiones

| Área | Decisión | Alternativas descartadas | Motivo |
|---|---|---|---|
| Login | `chrome.identity.launchWebAuthFlow` con el flujo de código y PKCE del proveedor de identidad. | `getAuthToken` (solo cuentas de Google). | Funciona con Cognito y con federación corporativa. |
| Cliente HTTP | `fetch` nativo en el service worker, con `AbortController` por `callId`. | Librerías HTTP. | Cero dependencias de runtime. |
| Chequeo del bundle | `scripts/check-bundle.js` (dev, Node) amplía su chequeo actual con la lista permitida de permisos, hosts, CSP y `web_accessible_resources`, y un escaneo simple de secretos. | Herramientas externas de escaneo. | Ya existe desde u1; sin dependencias nuevas. |
| Empaquetado futuro | Script Node de desarrollo que comprime `aws-calculator-extension/` con la utilidad del sistema. | Bundler. | Sin build step. |

## 2. Requisitos

| ID | Requisito | Criterio de verificación |
|---|---|---|
| NFR6.1 | El cliente del cerebro del service worker (enrutador con lista permitida, gestor de sesión y login, armado del pedido, traducción de códigos de error, tope de 30 s, cancelación, borrado del token ante 401) tiene pruebas unitarias con al menos 80 % de cobertura, con `fetch` y `chrome.*` simulados. | `npx vitest run --coverage` con `coverage.thresholds`. |
| NFR7.3 | `check:bundle` corre en CI y falla ante cualquier desviación de NFR4.1-NFR4.4 o NFR5.1 de `security-requirements.md`. | Ejecución en CI. |
