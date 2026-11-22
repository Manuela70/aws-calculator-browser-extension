# Especificación de infraestructura — u7-packaging

> U7 empaqueta la extensión MV3 y aloja el cliente del cerebro en el service
> worker. No despliega recursos en la nube: su "infraestructura" es el
> manifest, la estructura del bundle, la configuración que lo une al cerebro de
> u4 y la forma de distribuirlo. Esta unidad no abrió preguntas: la práctica del
> equipo (`## Deployment`: unpacked hoy, `.zip` manual a futuro) y las
> decisiones de u4 (Q1-Q4) fijan los criterios. Prosa en español;
> identificadores en inglés.

## Sources

- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u7-packaging/nfr-design/security-design.md` (estructura del bundle, manifest, `sw/config.js`, login, plazo de 30 s, `.zip`). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u7-packaging/nfr-requirements/security-requirements.md` y `tech-stack-decisions.md`. [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u4-mapping-brain/infrastructure-design/infrastructure-specification.md` §3 (salidas del stack: `BrainUrl`, `CognitoDomain`, `ExtensionClientId`). [stage]
- `aidlc/spaces/default/memory/team.md` (`## Deployment`). [team-practices]

## 1. Despliegue

| Faceta | Elección | Motivo |
|---|---|---|
| Cómputo | Ninguno propio: el código corre en el Chrome del SE (service worker, content script, panel lateral) | Extensión MV3 unpacked (práctica del equipo). |
| Red | El service worker hace `fetch` solo a `https://brain.<dominio>` (cerebro) y al dominio de Cognito (endpoint de token); el content script no tiene red | NFR4.1, NFR5.3. |
| Almacenamiento | `chrome.storage.session` para el token (solo contextos confiables) y el texto de las pestañas; `chrome.storage.local` para el registro técnico y el historial de u1 | NFR5.2. |
| Entornos | Uno: la extensión apunta al único entorno `prod` del cerebro (u4 Q3) | Sin staging. |
| Distribución | Hoy: "Load unpacked" de `aws-calculator-extension/`. A futuro: `.zip` generado por `scripts/package-zip.js` para distribución interna | NFR7.1, NFR7.2. |
| Identidad de la extensión | Clave pública `key` en el manifest, para un identificador estable en todos los equipos. Orden: (1) el mantenedor genera una vez el par de claves RSA con `openssl` y guarda la privada en su gestor de contraseñas; (2) pone la pública en `key` y obtiene el identificador cargando la extensión unpacked; (3) pasa ese identificador como parámetro del primer despliegue de u4 para registrar la URL de retorno. `bundle-policy.json` incluye el valor esperado de `key`, así que el CI detecta si falta o cambia | La URL de retorno de Cognito (`https://<id>.chromiumapp.org/`) depende de ese identificador (dependencia con u4). |
| Versión de Chrome | `minimum_chrome_version: "130"` (hoy 116) | `use_dynamic_url` y las APIs del diseño. |

## 2. Componentes y configuración

| Componente | Rol | Configuración | Notas |
|---|---|---|---|
| `manifest.json` | Permisos y superficie | `permissions` = `tabs`, `scripting`, `sidePanel`, `storage`, `unlimitedStorage`, `identity`; `host_permissions` = `https://calculator.aws/*`, el host del cerebro y el dominio de Cognito; `web_accessible_resources` = los patrones de `lib/` actuales (`lib/*`, `lib/*/*`; es la forma concreta de "`lib/**`" de NFR4.3 y la única que lleva la política) solo para `https://calculator.aws/*` con `use_dynamic_url: true`; CSP `script-src 'self'; object-src 'self'` explícita | NFR4.1-NFR4.4. Hoy faltan `identity`, los dos hosts nuevos y la CSP explícita. |
| `sw/config.js` | Configuración del cerebro | `BRAIN_BASE_URL`, `COGNITO_DOMAIN`, `CLIENT_ID` (público), alcances; fuera de `lib/**` y de los recursos accesibles | NFR1.1, NFR5.1. Valores tomados de las salidas del stack de u4. |
| `scripts/bundle-policy.json` | Política del bundle | Entradas fijas: `https://calculator.aws/*`, permisos, CSP, recursos accesibles, `minimum_chrome_version` | Los hosts del cerebro y de Cognito se derivan de `sw/config.js` (u7 NFR Design, NFR4.1). |
| `scripts/sync-brain-config.js` | Une la extensión con u4 | Lee `infra/cdk-outputs.json` (que genera `cdk deploy --outputs-file`) y reescribe `sw/config.js` y los dos hosts de `host_permissions`. Lo corre el mantenedor después de un despliegue de u4 que cambie esas salidas | Evita copiar URL a mano. |
| `scripts/package-zip.js` | `.zip` de distribución | Lista de archivos de `aws-calculator-extension/` sin pruebas, `SMOKE.md` ni ocultos; compresión con la utilidad del sistema; verificación de entradas | NFR7.2. |

## 3. Infraestructura compartida

| Recurso compartido | Unidad dueña | Unidades consumidoras | Frontera de acceso |
|---|---|---|---|
| Endpoint del cerebro y dominio de Cognito | u4 | u7 (`sw/config.js`, `host_permissions`) | Token de acceso de 1 hora; el content script nunca los ve |
| Identificador estable de la extensión (clave `key`) | u7 | u4 (URL de retorno del cliente `extension` de Cognito) | La clave privada que genera esa clave pública queda fuera del repo, en el gestor de contraseñas del mantenedor |
| `chrome.storage.session` | u7 (token) y u6 (texto, prefijo `panel:`) | — | Nivel de acceso `TRUSTED_CONTEXTS`; claves con prefijo por dueño |
