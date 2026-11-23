# Resumen de código — u7-packaging

Los 17 pasos del plan aprobado están implementados y marcados en `code-generation-plan.md`, en orden test-after: cada capa se implementó y después se escribieron y corrieron sus pruebas. No se contactó AWS ni Cognito, no se generó la clave `key` del manifest y no se creó ningún `.zip` real. Prosa en español; identificadores en inglés.

## Archivos creados y modificados

**Service worker (`aws-calculator-extension/`)**
- Nuevos en `sw/`: `config.js` (valores en `null`, alcances `openid email`, rutas de las tres operaciones), `messages.js` (tipos del borde, códigos y textos en español), `keepalive.js`, `session.js`, `call-registry.js`, `router.js`, `auth-flow.js`, `brain-client.js`, `dispatch.js`.
- Modificado: `background.js` (conserva `setPanelBehavior`; `setAccessLevel TRUSTED_CONTEXTS` en `onInstalled` y `onStartup`; único `onMessage` del borde que descarta remitentes ajenos e ignora mensajes que no son del borde).
- Modificado: `manifest.json` (`identity`, CSP `extension_pages` explícita, `minimum_chrome_version: "130"`; `host_permissions` sigue solo con calculator.aws mientras `sw/config.js` esté en `null`).

**Página (`lib/`)**
- Nuevo: `lib/connection/brain-port.js` (`createBrainPort`, `fromChromeRuntime`, `BrainCallError`).
- Modificado: `lib/content-main.js`, solo para recibir `mapResidue` y pasarlo al orquestador; `init()` lo arma con `createBrainPort`.

**Scripts y configuración de desarrollo**
- `scripts/check-bundle.js` reorganizado en funciones puras exportadas (`loadPolicy`, `configuredOrigins`, `expectedHosts`, `checkManifest`, `scanSecrets`, `scanForeignUrls`, `checkBrainHostPlacement`, `checkDependencies`, `checkForbiddenEntries`, `runChecks`, `readBundle`, `loadBrainConfig`) y un `main`.
- Nuevos: `scripts/bundle-policy.json` (`"key": null`), `scripts/sync-brain-config.js` (`parseOutputs`, `renderConfig`, `updateManifestHosts`), `scripts/package-zip.js` (`selectFiles`, `verifyEntries`, `archiveCommand`, `listCommand`).
- `eslint.config.js`: bloque para `background.js` y `sw/**` que extiende `no-restricted-syntax` base (prohíbe `chrome.storage.local/sync`); `fetch` permitido solo en `sw/brain-client.js` y `sw/auth-flow.js`; bloque para `brain-port.js` sin `fetch`, `XMLHttpRequest` ni `chrome.storage`.
- `vitest.config.js`: `sw/**` y `brain-port.js` en `coverage.include` con umbral propio `{ lines: 80, branches: 80 }`. El umbral global no cambió.
- `package.json`: `test:u7` y `package`. `.gitignore`: `*.zip`.
- `SMOKE.md`: sección nueva "U7 — Empaquetado y cliente del cerebro" (S8-S15) al final; el resto del archivo no cambió.

**Pruebas**
- `tests/u7/`: `fakes.js` y 12 archivos de prueba (session, call-registry, keepalive, router, auth-flow, brain-client, dispatch, brain-port con la prueba de `content-main`, check-bundle, sync-brain-config, package-zip, eslint-sw).
- `tests/u1/manifest.test.js` actualizado al manifest nuevo (decisión 10).

## Decisiones del plan aplicadas (1-10)

1. **Cuerpo de error.** `translateResponse` lee `body.code` (cuerpo plano de `brain/core/error-catalog.js`) y acepta `body.error.code`; un código fuera del conjunto del cerebro es `internal_error`.
2. **`model_unavailable`** es código válido en el service worker y en `brain-port`.
3. **Sin `X-Request-Id` saliente.** El CORS de u4 solo admite `authorization, content-type`. La correlación usa la cabecera `x-request-id` de la respuesta o `body.requestId`; el reintento por `rate_limited` devuelve ambos en `requestIds`.
4. **Registro técnico.** El service worker no escribe almacenamiento persistente: devuelve `requestId`, `code` y `attempts` al llamador y solo hace `console.warn` con `operation`, `code`, `requestIds` y `attempts` (nunca el token ni los cuerpos; hay prueba).
5. **Configuración sin desplegar.** `sw/config.js` en `null`; `BRAIN_CALL` y `BRAIN_LOGIN` responden `brain_unavailable` sin `fetch`; `check:bundle` deriva los hosts esperados de `sw/config.js`.
6. **Clave `key`.** No se generó. `bundle-policy.json` lleva `"key": null` y `check:bundle` exige que el manifest no tenga `key` hasta que el mantenedor la agregue en ambos lugares.
7. **Adaptador `brain-port`.** Sin URL, sin `fetch`, sin `chrome.storage`. Error → `BrainCallError { code, requestId?, retryAfterSeconds? }`; canal perdido → `brain_unavailable`; `AbortSignal` → `BRAIN_CANCEL` con el mismo `callId`.
8. **`REVIVAL_PLAN.md`.** Contiene la URL de un webhook n8n personal. `package-zip.js` excluye todo `*.md` y `check:bundle` lo exceptúa explícitamente (`url_scan_exempt_files`, junto con `SMOKE.md`). **No se borró: queda para que el mantenedor decida.**
9. **Dos topes de 30 s** (U3 y service worker) se conservan; ambos terminan en `timeout`.
10. **`tests/u1/manifest.test.js`** actualizado, no borrado.

## Desviaciones del plan y motivos

- **`check:bundle` más estricto que el plan.** Además de lo planeado, rechaza `optional_permissions`, `optional_host_permissions` y `externally_connectable` y compara `background` con la política. Motivo: son vías para ampliar permisos o mensajería sin pasar por los conjuntos exactos de NFR4.1-NFR4.2.
- **ESLint en `sw/brain-client.js` y `sw/auth-flow.js`.** En flat config una regla con solo severidad conserva las opciones del bloque anterior, así que `["error"]` sin lista seguía prohibiendo `fetch`. Como la lista base sin `fetch` queda vacía, `no-restricted-globals` se apaga solo en esos dos archivos (si la lista base crece, el bloque la conserva). Las prohibiciones de HTML, `eval` y `new Function` siguen activas; hay prueba.
- **Cancelación en `brain-port`.** Al abortar, la promesa rechaza con `signal.reason` (o un `AbortError`), no con un `BrainCallError`, porque `cancelled` no es un código del contrato; U3 ya trata la cancelación por su cuenta.
- **Operación desconocida en `callBrain`** devuelve `bad_request` (el enrutador ya la rechaza antes; es una defensa adicional).
- **Paso 1** pedía `brain-port.js` vacío con sus exports; se escribió completo en el paso 11, sin efecto en el resultado.
- **`sync-brain-config.js`** escribe el manifest con `JSON.stringify`; después hay que correr `npm run format` (el script lo indica al terminar).
- **Fin de línea.** Como pide el brief, se corrió `npm run format` en la copia: Prettier pasó a LF archivos que no tocamos (incluidos `lib/dom/**`, `lib/rpa/**` y `content.js` de u5). Con `core.autocrlf=true`, git no registra cambios de contenido en ellos.

## Cobertura y resultados de las verificaciones

| Comando | Resultado |
|---|---|
| `npx vitest run tests/u7` | 12 archivos, 92/92 en verde |
| `npx vitest run tests/u1` | En verde (incluye `manifest.test.js` actualizado) |
| Cobertura con el comando de la unidad (`--coverage.include` de `sw/**` y `brain-port.js`) | Total: líneas 96,84 %, ramas 94,58 %. `sw/`: líneas 96,89 %, ramas 95,22 %. `brain-port.js`: líneas 96,55 %, ramas 90,47 % (umbral 80 % en líneas y ramas) |
| `npx vitest run` (suite completa) | 379/379 pruebas en verde; 5 archivos de `tests/u4` no cargan por paquetes de `brain/` e `infra/` no instalados en esta copia (`jose`, `@aws-sdk/*`, `aws-cdk-lib`). Ya fallaban en la línea base, antes de cualquier cambio de U7 |
| `npm run lint` | Sin errores |
| `npm run format:check` | Todo con estilo Prettier |
| `npm run check:bundle` | OK, 46 archivos revisados contra la política |

No se bajó ningún umbral ni se desactivó ninguna regla de seguridad.

## Pruebas definidas pero no ejecutadas en esta etapa

- Smoke manual S8-S15 de `SMOKE.md` (carga en Chrome 130, módulos con URL dinámica, login completo y cancelado, token vencido, cerebro caído y `.zip`). S11-S14 requieren u4 desplegado y `sync-brain-config.js` corrido.
- `npm run package` real: no se generó ningún `.zip` (las pruebas cubren la selección y la verificación de entradas con listas en memoria).

## Pendientes para el mantenedor

- Generar la clave `key` del manifest (la privada fuera del repo) y agregarla en `manifest.json` y `bundle-policy.json` en el mismo commit.
- Decidir qué hacer con `REVIVAL_PLAN.md`, que contiene la URL de un webhook n8n personal.
- Después del despliegue de u4: `node scripts/sync-brain-config.js`, `npm run format`, `npm run check:bundle` y commit de `sw/config.js`, `manifest.json` e `infra/cdk-outputs.json`.
- U6 debe agregar el botón "Iniciar sesión" del panel usando `createBrainPort(...).login()` y `session()`.
