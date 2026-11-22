# Pipeline de CI/CD — u3-deterministic-mapper

> U3 es una biblioteca de módulos ES puros (Zona A) dentro del bundle unpacked:
> no tiene infraestructura ni monitoreo propios, solo su lugar en el pipeline
> común de verificación que definió u1. Esta unidad no abrió preguntas: Q1 de
> u1 (GitHub Actions en cada push a `main`) y las prácticas del equipo fijan el
> pipeline. Prosa en español; identificadores en inglés.

## Sources

- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u1-walking-skeleton/infrastructure-design/cicd-pipeline.md` (workflow `ci.yml`, scripts, entrega manual, rollback). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u3-deterministic-mapper/nfr-design/logical-components.md` y `security-design.md` (tres módulos, U3 nunca reintenta, `brainErrorCode`). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u3-deterministic-mapper/nfr-requirements/tech-stack-decisions.md` (NFR1.1, NFR6.1, NFR6.2, NFR7.1, NFR7.2). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u5-rpa-dom/nfr-design/logical-components.md` (reglas de lint del content script, que incluyen `lib/mapping/**`). [stage]
- `aidlc/spaces/default/memory/team.md` (`## Testing Posture`, `## Code Style`, `## Deployment`). [team-practices]

## 1. Qué agrega U3 al pipeline común

U3 no crea un workflow nuevo: entra en `.github/workflows/ci.yml` de u1, que corre en cada `push` y `pull_request` a `main` con permisos `contents: read` y sin secretos.

| Cambio | Archivo | Efecto |
|---|---|---|
| Módulos de U3 en la cobertura | `vitest.config.js` → `coverage.include` agrega `lib/mapping/residue-resolver.js` (ya están `deterministic-mapper.js`, `option-match.js` y `region-map.js`) | Se miden en el paso de cobertura |
| Umbral propio de U3 | `vitest.config.js` → `coverage.thresholds["aws-calculator-extension/lib/mapping/{deterministic-mapper,option-match,residue-resolver}.js"] = { lines: 80, branches: 80 }` | El CI falla si los tres módulos de U3 bajan de 80 % de líneas **o de ramas**. El glob nombra solo esos tres archivos: `region-map.js` es de u1 y sigue en el agregado global, así que su cobertura no puede dejar en rojo el umbral de U3. Con un umbral por glob, Vitest saca esos archivos del agregado global y los evalúa solo contra su umbral; el agregado de 80 % de líneas sigue aplicando al resto |
| Pruebas de U3 | `tests/u3/**/*.test.js`, entorno `node`, sin `jsdom`. Las pruebas de `deterministic-mapper.js` y `option-match.js` que ya existen en `tests/u1/` se mueven a `tests/u3/` en Code Generation, porque U3 pasa a ser dueño de esos módulos; `region-map.js` sigue siendo de u1 y conserva sus pruebas | Corren dentro de `npm run coverage` |
| Script local | `package.json` → `"test:u3": "vitest run tests/u3"` | El mantenedor prueba U3 por separado |
| Lint de U3 | `lib/mapping/**` corre dentro del content script, así que hereda las reglas de u5: sin `fetch` (ni `window.fetch` / `globalThis.fetch`), sin `chrome.storage`, sin APIs de HTML, `no-empty` y sin `eval` | Se agrega `lib/mapping/**` al alcance de esas reglas en `eslint.config.js`. U5 crea en Code Generation el bloque por alcance del content script (sin `fetch`, `XMLHttpRequest`, `chrome.storage`, prefijo `awsui_`); U3 solo agrega su carpeta a ese bloque, sin duplicar reglas |

## 2. Etapas y compuertas (orden del workflow)

| # | Paso | Comando | Compuerta para U3 |
|---|---|---|---|
| 1 | Instalar | `npm ci` | Falla la instalación |
| 2 | Auditoría | `npm audit --audit-level=high` | Vulnerabilidad alta en una dev-dependency |
| 3 | Formato | `npm run format:check` | Algún archivo de U3 sin formatear |
| 4 | Lint | `npm run lint` | Cualquier error en `lib/mapping/**` o `tests/u3/**` |
| 5 | Tests y cobertura | `npm run coverage` | Un test de U3 falla, o `lib/mapping/**` < 80 % en líneas o ramas (NFR6.1) |
| 6 | Bundle | `npm run check:bundle` | U3 importa un paquete o desde `node_modules` (NFR7.2) |
| 7 | Informe | Artefacto `coverage/` (14 días) | — |

**Brecha de ramas.** Si al sumar el umbral de ramas alguno de los tres módulos de U3 queda por debajo de 80 %, el responsable de Code Generation de U3 agrega los casos faltantes en esa misma etapa; el CI no se publica con el umbral rebajado.

## 3. Pruebas que el pipeline exige de U3

Corren sin red ni navegador (NFR6.2): los `DomField` son fixtures derivados del inventario, el puerto `mapResidue` es un doble y los tiempos son temporizadores falsos de Vitest.

| Grupo | Casos mínimos |
|---|---|
| Mapeo determinista | Etiqueta exacta, "Sección > Campo", etiqueta inexistente → residuo, etiqueta ambigua → residuo, cierre forzado tras 3 pasadas |
| Coincidencia de opciones | Exacta, normalizada, patrón numérico con unidades, sin coincidencia, ambigua |
| Residuo | Pedido armado solo con los campos residuales, respuesta válida aplicada, acción inválida descartada y su clave sigue en el residuo |
| Errores del puerto | Cada código del canal de error (`unauthorized`, `rate_limited`, `timeout`, `brain_unavailable`, `empty_result`, `internal_error`, entre otros) se refleja en `MappingOutcome.brainErrorCode`; U3 **no reintenta** en ningún caso (el puerto se llama una sola vez) |
| Tope y cancelación | La señal de la corrida aborta la consulta; el tope vence con temporizadores falsos |
| Independencia del cerebro | La misma suite de residuo pasa con dos dobles distintos del puerto (NFR1.1) |
| Estructura (automática) | `tests/u3/imports.test.js` lee cada archivo de `lib/mapping/**`, extrae los especificadores de `import` con una expresión regular y falla si alguno sale de `lib/mapping/**`, `lib/messages*.js` y `lib/dom/aria-label.js` (módulo puro de Zona A que U3 usa para `cleanAriaLabel`, según tech-stack-decisions), o apunta a U4, al resto de `lib/dom/**` o a `lib/panel/**`. Antes de analizar, quita comentarios; la expresión cubre `import ... from`, `export ... from` e `import()` dinámico, como `check-bundle.js`. También falla si encuentra `document.` o `chrome.` en el código sin comentarios (NFR7.1, NFR1.1). Sin dependencias nuevas: solo `fs` de Node en la prueba. |
| Registro | `toLogEntry` sin valores del cliente más allá de lo que fija el diseño |

## 4. Entrega

Igual que u1: CI verde en el commit, "Reload" de la extensión unpacked en `chrome://extensions` y smoke de `SMOKE.md`. Para U3, el smoke incluye la corrida multi-servicio con un campo que solo resuelve el cerebro (residuo) y el caso de sustitución del cerebro ("pediste X, se usó Y"). No hay promoción entre entornos.

## 5. Rollback

Al mover pruebas de `tests/u1/` a `tests/u3/`, `npm test` sigue corriendo todas; `test:u1` deja de incluir esos casos a propósito. Un `git revert` del commit de U3 devuelve también las pruebas a su lugar.

`git revert` del commit de U3 y recarga de la extensión. U3 no persiste datos: no hay migración.

## 6. Secretos

Ninguno. U3 no ve el token ni la URL del cerebro: el residuo viaja por el service worker (U7) con `BRAIN_CALL`. El pipeline sigue sin credenciales.
