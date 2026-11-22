# Decisiones de stack — u4-mapping-brain

> Tecnología del cerebro. El hogar concreto (recrear n8n desde el backup o un
> proxy propio delante de Bedrock) y los servicios AWS se cierran en
> Infrastructure Design; aquí se fijan las decisiones que no dependen de eso.
> Prosa en español; identificadores en inglés.

## Sources

- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/requirements-analysis/requirements.md` (NFR1, NFR5, NFR6, NFR7). [requirements]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u4-mapping-brain/functional-design/functional-spec.md` (§2 decisiones: Claude en Bedrock, inventario versionado). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/contract-design/contract-summary.md` (C1-C3; hogar agnóstico en el contrato). [stage]
- `aidlc/spaces/default/knowledge/calculator-catalog/README.md` (fuente pública del inventario y herramienta `build-inventory.mjs`). [stage]
- `nfr-requirements-questions.md` de esta unidad: Q1 (login con token en sesión). [Q1]
- Reglas afirmadas en `aidlc/spaces/default/memory/project.md` (credencial server-side, mínimo privilegio). [team-practices]

## 1. Decisiones

| Área | Decisión | Alternativas descartadas | Motivo |
|---|---|---|---|
| Modelo | Claude en Amazon Bedrock, con el identificador de modelo como configuración del servicio (no en código). | API directa de Anthropic; otros modelos. | Decisión del mantenedor (u4 Q4); credencial IAM sin clave estática. |
| Identidad | Amazon Cognito (user pool, federado al directorio corporativo si existe), login por `chrome.identity.launchWebAuthFlow`, token de acceso de 1 hora. | Clave compartida; Identity Center para la extensión. | Q1; token de corta vida por SE y validación estándar de JWT. |
| Contrato | HTTPS + JSON según C1-C3, con `requestId` en cada respuesta. | — | Ya contratado. |
| Inventario | Archivo JSON versionado generado por `build-inventory.mjs` desde las definiciones públicas de la calculadora. | Raspar el DOM. | Fuente pública y completa (442 servicios). |
| Lenguaje del servicio (si es proxy propio) | Node.js LTS con JavaScript sin transpilar, para reutilizar el estilo y las herramientas del repo (Vitest, ESLint). | Python. | Un solo lenguaje para el mantenedor. |

## 2. Requisitos

| ID | Requisito | Criterio de verificación |
|---|---|---|
| NFR1.10 | La lógica de prompts, validación de salidas y selección de candidatos vive en módulos puros, independientes de si el hogar es n8n o un proxy, para poder moverla sin reescribir. | Revisión del árbol: la validación no importa SDK de transporte. |
| NFR6.1 | La validación de pedidos y salidas, la selección de candidatos y la agregación de tokens tienen pruebas unitarias con al menos 80 % de cobertura, con el modelo reemplazado por un doble. | `npx vitest run --coverage`. |
| NFR7.1 | Los prompts y el identificador de modelo son configuración versionada, no literales dispersos en el código. | Revisión de código. |
