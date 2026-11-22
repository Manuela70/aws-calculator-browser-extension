# Pipeline de CI/CD — u5-rpa-dom

> U5 es código del content script dentro del bundle unpacked: no tiene
> infraestructura ni monitoreo propios. Su lugar en el pipeline común de u1 tiene
> dos partes: la Zona A (lógica pura) pasa por Vitest con piso de cobertura, y la
> Zona B (DOM real de calculator.aws) por el smoke manual versionado. Esta
> unidad no abrió preguntas: Q1 de u1 y las prácticas del equipo fijan el
> pipeline. Prosa en español; identificadores en inglés.

## Sources

- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u1-walking-skeleton/infrastructure-design/cicd-pipeline.md` (workflow `ci.yml`, scripts, entrega manual, rollback). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u5-rpa-dom/nfr-design/security-design.md` y `logical-components.md` (módulos por zona, reglas de lint, tabla de códigos). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u5-rpa-dom/nfr-requirements/tech-stack-decisions.md` (NFR6.1, NFR6.2, NFR7.1, NFR7.2). [stage]
- `aidlc/spaces/default/memory/team.md` (`## Testing Posture`: Zona A con Vitest y 80 %, Zona B con smoke manual; `## Code Style`; `## Deployment`). [team-practices]

## 1. Qué agrega U5 al pipeline común

U5 no crea un workflow nuevo: entra en `.github/workflows/ci.yml` de u1 (push y `pull_request` a `main`, `contents: read`, sin secretos).

| Cambio | Archivo | Efecto |
|---|---|---|
| Módulos de Zona A en la cobertura | `vitest.config.js` → `coverage.include` agrega `lib/dom/aria-label.js` y `lib/dom/cascade.js` (ya están `orchestrator.js`, `result-aggregator.js`, `retry.js`, `service-timer.js`) | Se miden en el paso de cobertura |
| Umbral propio de U5 | `coverage.thresholds["aws-calculator-extension/lib/{rpa/orchestrator,rpa/result-aggregator,rpa/retry,rpa/service-timer,dom/aria-label,dom/cascade}.js"] = { lines: 80, branches: 80 }` | El CI falla si la Zona A de U5 baja de 80 % de líneas o de ramas (NFR6.1). El glob nombra solo esos archivos: `rpa/wait.js` y el resto de `lib/rpa/**` de u1 siguen en el agregado global. Vitest saca los archivos del glob del agregado y los evalúa solo con su umbral |
| Zona B fuera de la cobertura | `dom-utils.js`, `dom-resolver.js`, `form-scanner.js`, `selectors.js`, `spotlight.js`, `content.js` quedan fuera de `coverage.include` | Se verifican con el smoke (§4), como fija la práctica del equipo |
| Pruebas de U5 | `tests/u5/**/*.test.js`, entorno `node`, DOM reemplazado por el resolvedor falso del orquestador; las pruebas de u1 de `orchestrator.js`, `result-aggregator.js` y `retry-wait-timer.test.js` se amplían en su lugar | Corren dentro de `npm run coverage` |
| Script local | `package.json` → `"test:u5": "vitest run tests/u5"` | El mantenedor prueba U5 por separado |
| Bloque de lint del content script | `eslint.config.js` → un bloque con alcance `content.js`, `lib/dom/**`, `lib/rpa/**` y `lib/mapping/**` (U3 agrega su carpeta). En flat config, un bloque posterior **reemplaza** las opciones de una regla, no las mezcla; por eso el bloque se arma **extendiendo** las listas de `securityRules` que ya existen (constantes compartidas en `eslint.config.js`: se copian sus entradas y se agregan las nuevas), nunca redefiniéndolas desde cero. Una prueba de `tests/u5/eslint-config.test.js` usa `ESLint.calculateConfigForFile` para comprobar que un archivo de `lib/dom/` conserva las prohibiciones base (`innerHTML`, `fetch`) y suma las nuevas | Ver §2 |
| `check:bundle` ampliado | `scripts/check-bundle.js`, además de dependencias de runtime: (a) busca en `lib/**`, en código y comentarios, todo texto `https?://…` y falla si su origen no es exactamente `https://calculator.aws` (se admiten rutas y comodines detrás, como `https://calculator.aws/*` o `/#/estimate`); (b) falla con los patrones de secreto de u7 NFR5.1 (`AKIA[0-9A-Z]{16}`, `-----BEGIN`, `sk-ant-`, JWT `eyJ[\w-]+\.eyJ[\w-]+`, `client_secret`); (c) comprueba que `SMOKE.md` existe y contiene los nueve encabezados de casos de §4. Tiene sus propias pruebas en `tests/u5/check-bundle.test.js` con archivos de ejemplo válidos e inválidos (u5 NFR4.2, coordinado con u7) | Paso existente del workflow |

## 2. Reglas de lint que el pipeline aplica a U5

| Regla | Alcance | NFR |
|---|---|---|
| `no-restricted-syntax` (literales con el prefijo `awsui_` y con los textos de botón que exporta `selectors.js` en `BUTTON_TEXTS`) | todo el bundle salvo `lib/dom/selectors.js`. Es la **única** compuerta de NFR2.1: no hay script aparte | NFR2.1 |
| `no-restricted-globals` (`fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`) y `no-restricted-properties` (`window.fetch`, `globalThis.fetch`, `self.fetch`) | bloque del content script | NFR4.1 |
| `no-restricted-properties` (`chrome.storage`) | bloque del content script | NFR5.1 |
| `no-restricted-properties` (`innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`) | todo el bundle | NFR5.2 |
| `no-restricted-imports` y `no-restricted-globals` (`document`, `chrome`) | módulos de Zona A de U5. `lib/mapping/option-match.js` lo gobierna U3 con su propia prueba estructural; U5 solo lo consume | NFR7.1 |

## 3. Etapas y compuertas (orden del workflow)

| # | Paso | Comando | Compuerta para U5 |
|---|---|---|---|
| 1 | Instalar | `npm ci` | Falla la instalación |
| 2 | Auditoría | `npm audit --audit-level=high` | Vulnerabilidad alta |
| 3 | Formato | `npm run format:check` | Archivo sin formatear |
| 4 | Lint | `npm run lint` | Cualquier regla de §2 |
| 5 | Tests y cobertura | `npm run coverage` | Un test falla, o la Zona A de U5 < 80 % en líneas o ramas (NFR6.1) |
| 6 | Bundle | `npm run check:bundle` | Dependencia de runtime, URL ajena o secreto en `lib/**`, o `SMOKE.md` incompleto (NFR7.2, NFR4.2, NFR6.2) |
| 7 | Informe | Artefacto `coverage/` (14 días) | — |

**Brecha de ramas.** Si al sumar el umbral de ramas algún módulo existente de la Zona A de U5 queda bajo 80 %, el responsable de Code Generation de U5 agrega los casos en esa misma etapa; el umbral no se rebaja.

## 4. Pruebas que el pipeline exige de U5

| Grupo | Casos mínimos (Zona A, automáticos) |
|---|---|
| Cascada | Cada estrategia con 0, 1 y varios candidatos, con y sin sección; 0 o varios pasan a la siguiente estrategia; falla solo tras la última |
| Orquestador | Multi-servicio con fallos intermedios, plantilla inexistente, corte de 3 minutos con temporizadores falsos (`service-timer.js` con reloj inyectado), salida no confirmada → `RunStopped` y restantes `not_attempted` |
| Agregador | `DONE` solo con todos confirmados y estimado exacto; `estimate_check` y `share` como `failureStep` |
| Resultado | `brainSubstitutions` completo, `brainErrorCode` copiado, recorte a 200 caracteres, `validateShareUrl` con enlaces válidos, de otro host, `javascript:` y vacíos |
| Reintentos | `RetryCounter` con los topes de BR4.1 |
| Etiquetas | `cleanAriaLabel` y `parseUnitButtonLabel` con sus tablas de casos |
| Códigos | Cada código de `DomError` se traduce al enum de `entities.md` (tabla §3 del diseño de seguridad) |

**Zona B (smoke manual).** `aws-calculator-extension/SMOKE.md` cubre los siete casos de NFR6.2: servicio simple, multi-servicio con toggle condicional, servicio inexistente, campo obligatorio vacío, fallo a mitad de corrida, cancelación y sustitución del cerebro. Agrega dos casos derivados del NFR Design: dos servicios homónimos (el banner del primero no confirma el segundo) y que el overlay Spotlight no quede en la página tras cancelar. Cada caso dice el resultado esperado en el panel. Se corre antes de cerrar Code Generation y en cada entrega.

## 5. Entrega

Igual que u1: CI verde, "Reload" de la extensión unpacked y smoke de `SMOKE.md` con el resultado y la duración anotados. No hay promoción entre entornos.

## 6. Rollback

`git revert` del commit de U5 y recarga de la extensión. U5 no persiste datos propios. Como U5 importa `option-match.js` de U3, y U3 usa `cleanAriaLabel` de `aria-label.js` (tech-stack-decisions de U3), revertir una de las dos unidades exige comprobar con `npm test` que la otra sigue compilando y pasando.

## 7. Secretos

Ninguno. U5 no ve el token ni la URL del cerebro; el pipeline sigue sin credenciales.
