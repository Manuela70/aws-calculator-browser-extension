# Pipeline de CI/CD — u6-popup-ui

> El panel entra al pipeline común de u1. Sin despliegue automático ni secretos.
> Prosa en español; identificadores en inglés.

## Sources

- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u1-walking-skeleton/infrastructure-design/cicd-pipeline.md`. [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u6-popup-ui/nfr-design/logical-components.md` (módulos de Zona A, NFR6.1, NFR6.2). [stage]

## 1. Qué agrega U6

| Cambio | Archivo | Efecto |
|---|---|---|
| Zona A en la cobertura | `vitest.config.js` → `coverage.include` agrega `lib/panel/url-check.js`, `history-model.js`, `timers.js` (ya están `panel-state.js` y `messages-es.js`) | Se miden en el paso de cobertura |
| Umbral propio | `coverage.thresholds` con una clave por archivo de Zona A (`lib/panel/panel-state.js`, `url-check.js`, `history-model.js`, `timers.js` y `lib/messages-es.js`), cada una con `{ lines: 80, branches: 80 }`, para que ninguno se esconda tras el promedio de los demás | NFR6.1 |
| Pruebas | `tests/u6/**/*.test.js` en `node`, con reloj inyectado | Estados de espera, `runId`, URL, login, textos, historial de 500 |
| Lint | Bloque para `sidepanel.js` y `lib/panel/**` que **extiende** las listas base de `securityRules` (no las redefine, porque en flat config un bloque posterior reemplaza las opciones): sin `fetch`; sin `innerHTML`, `outerHTML`, `insertAdjacentHTML` ni `document.write`; sin asignar `.style` ni propiedades `on*`; `setAttribute` solo con literal; sin `chrome.storage.local`/`sync`; `chrome.storage.session` solo en `tab-store.js`. Bloque aparte para la Zona A (`panel-state.js`, `url-check.js`, `history-model.js`, `timers.js`, `messages-es.js`): `no-restricted-globals` para `document` y `chrome`. Una prueba con `ESLint.calculateConfigForFile` comprueba que cada archivo conserva las prohibiciones base y suma las nuevas | NFR5.1, NFR5.4, NFR5.5 |

## 2. Etapas

Las del workflow común: instalar, auditoría (`npm audit --audit-level=high`, ya presente en `ci.yml`), formato, lint, tests y cobertura (falla si la Zona A de U6 baja de 80 % en líneas o ramas), `check:bundle`, informe.

## 3. Entrega y rollback

CI verde, "Reload" de la extensión y smoke de `SMOKE.md` con la revisión de accesibilidad de NFR6.2 (teclado, lector de pantalla, contraste), el aviso de datos del cliente junto al área de lenguaje natural (NFR5.3) y la comprobación de que `sidepanel.html` carga sin errores de CSP (dependencia de entrega con u7, que agrega la CSP explícita al manifest). Rollback: `git revert` y recarga. Sin secretos.
