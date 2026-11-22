# Pipeline de CI/CD — u7-packaging

> Verificación del bundle en el pipeline común de u1 y entrega manual de la
> extensión (unpacked hoy, `.zip` a futuro). Sin despliegue automático ni
> secretos. Prosa en español; identificadores en inglés.

## Sources

- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u1-walking-skeleton/infrastructure-design/cicd-pipeline.md` (workflow `ci.yml`). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u7-packaging/nfr-design/security-design.md` (`check:bundle`, `bundle-policy.json`, `.zip`, pruebas del cliente). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u7-packaging/nfr-requirements/tech-stack-decisions.md` (NFR6.1, NFR7.3). [stage]
- `aidlc/spaces/default/memory/team.md` (`## Deployment`, `## Testing Posture`). [team-practices]

## 1. Qué agrega U7 al pipeline común

| Cambio | Archivo | Efecto |
|---|---|---|
| Módulos del service worker en la cobertura | `vitest.config.js` → `coverage.include` agrega `sw/router.js`, `sw/session.js`, `sw/auth-flow.js`, `sw/brain-client.js`, `sw/call-registry.js`, `sw/keepalive.js`, `sw/messages.js` | Se miden en el paso de cobertura |
| Umbral propio de U7 | `coverage.thresholds["aws-calculator-extension/sw/**"] = { lines: 80, branches: 80 }` (Vitest los evalúa solo contra este umbral) | NFR6.1 |
| Pruebas de U7 | `tests/u7/**/*.test.js` con `fetch`, `chrome.runtime`, `chrome.identity`, `chrome.storage.session` y el reloj simulados | Sin red ni navegador |
| `check:bundle` con política | `scripts/check-bundle.js` lee `scripts/bundle-policy.json` y compara conjuntos exactos de `permissions`, `host_permissions` (fijos + derivados de `sw/config.js`), recursos accesibles, CSP y `minimum_chrome_version`; verifica que el host del cerebro aparezca solo en `sw/config.js` y en `host_permissions`; aplica los patrones de secreto. Incluye las reglas de u5 sobre `lib/**` | NFR4.1-NFR4.4, NFR5.1, NFR1.1, NFR7.3 |
| Lint del service worker | `eslint.config.js` → bloque para `background.js` y `sw/**`: `fetch` permitido solo en `sw/brain-client.js` y `sw/auth-flow.js`; sin `chrome.storage.local`/`sync` directo (el registro técnico se escribe vía `lib/log/run-logger.js`). Como en flat config un bloque posterior reemplaza las opciones de la regla, el bloque **extiende** las listas base de `securityRules` (prohibiciones de HTML incluidas) en vez de redefinirlas; una prueba con `ESLint.calculateConfigForFile` lo comprueba | NFR5.2, NFR5.3 |
| Script de `.zip` | `package.json` → `"package": "node scripts/package-zip.js"`; con sus pruebas sobre una copia temporal | NFR7.2 |

## 2. Etapas y compuertas

| # | Paso | Comando | Compuerta para U7 |
|---|---|---|---|
| 1 | Instalar | `npm ci` | Falla la instalación |
| 2 | Auditoría | `npm audit --audit-level=high` | Vulnerabilidad alta |
| 3 | Formato | `npm run format:check` | Archivo sin formatear |
| 4 | Lint | `npm run lint` | Reglas del bloque del service worker |
| 5 | Tests y cobertura | `npm run coverage` | Un test de U7 falla o `sw/**` < 80 % en líneas o ramas |
| 6 | Bundle | `npm run check:bundle` | Desviación del manifest o de la política, URL del cerebro fuera de sus dos lugares, secreto |
| 7 | Informe | Artefacto `coverage/` | — |

## 3. Entrega

1. CI verde en el commit.
2. Si u4 cambió sus salidas, correr `node scripts/sync-brain-config.js` con `infra/cdk-outputs.json` (archivo versionado: solo contiene URL públicas e identificadores, sin secretos) y hacer commit de ambos (el CI vuelve a verificar la coherencia con `check:bundle`).
3. "Reload" de la extensión unpacked y smoke de `SMOKE.md`, que para U7 incluye: login completo, cancelar el login, llamada con token vencido (`unauthorized`) y llamada con el cerebro caído (`brain_unavailable`).
4. **A futuro (`.zip`)**: subir el `version` del manifest, `npm run package`, y distribuir el `.zip` por el canal interno que decida el mantenedor. No hay publicación automática.

## 4. Rollback

`git revert` del commit y recarga de la extensión (o redistribuir el `.zip` anterior: cada `.zip` se adjunta como asset a un release de GitHub del repo privado, etiquetado con la versión del manifest). Si un cambio de u4 invalida la configuración, se revierte `sw/config.js` junto con el despliegue de u4.

## 5. Secretos

Ninguno en el pipeline ni en el bundle. El `clientId` de Cognito es público. La clave privada que define la clave `key` del manifest queda fuera del repo, en el gestor de contraseñas del mantenedor, y solo se necesita para empaquetar en la tienda de Chrome si algún día se publica.
