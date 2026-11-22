# Pipeline de CI/CD — u2-input-parsers

> U2 es una biblioteca de módulos ES dentro del bundle unpacked: no tiene
> infraestructura ni monitoreo propios, solo su lugar en el pipeline común de
> verificación que definió u1. Esta unidad no abrió preguntas: Q1 de u1
> (GitHub Actions en cada push a `main`) y las prácticas del equipo fijan el
> pipeline. Prosa en español; identificadores en inglés.

## Sources

- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u1-walking-skeleton/infrastructure-design/cicd-pipeline.md` (workflow `ci.yml`, scripts, entrega manual, rollback). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u2-input-parsers/nfr-design/security-design.md` y `logical-components.md` (módulos `lib/input/**`, pasos de validación, plazo de 30 s, `toLogEntry`). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u2-input-parsers/nfr-requirements/tech-stack-decisions.md` (NFR6.1, NFR6.2, NFR7.1, NFR7.2). [stage]
- `aidlc/spaces/default/memory/team.md` (`## Testing Posture`, `## Code Style`, `## Deployment`). [team-practices]

## 1. Qué agrega U2 al pipeline común

U2 no crea un workflow nuevo: entra en `.github/workflows/ci.yml` de u1, que corre en cada `push` y `pull_request` a `main` con permisos `contents: read` y sin secretos.

| Cambio | Archivo | Efecto |
|---|---|---|
| Módulos de U2 en la cobertura | `vitest.config.js` → `coverage.include` agrega `lib/input/input-schema.js`, `json-parser.js`, `nl-interpreter.js`, `input-normalizer.js`, `input-errors.js` | Se miden en el paso de cobertura |
| Umbral propio de U2 | `vitest.config.js` → `coverage.thresholds["aws-calculator-extension/lib/input/**"] = { lines: 80, branches: 80 }` | El CI falla si `lib/input/**` baja de 80 % de líneas **o de ramas**. Con un umbral por glob, Vitest saca esos archivos del agregado global y los evalúa solo contra su umbral propio; el agregado global de 80 % de líneas sigue aplicando al resto. `json-parser.js` e `input-normalizer.js`, que hoy cuentan en el agregado, pasan a este umbral más estricto. |
| Pruebas de U2 | `tests/u2/**/*.test.js`, entorno `node`, sin `jsdom`. Las pruebas de `json-parser.js` e `input-normalizer.js` que ya existen en `tests/u1/` se mueven a `tests/u2/` en Code Generation, porque U2 pasa a ser dueño de esos módulos | Corren dentro de `npm run coverage` |
| Script local | `package.json` → `"test:u2": "vitest run tests/u2"` | El mantenedor prueba U2 por separado |
| Lint de U2 | `npm run lint` ya cubre `aws-calculator-extension/**`; U2 hereda `no-empty`, `no-eval`, `no-new-func` y la prohibición de `innerHTML` | Sin cambios de configuración |

## 2. Etapas y compuertas (orden del workflow)

| # | Paso | Comando | Compuerta para U2 |
|---|---|---|---|
| 1 | Instalar | `npm ci` | Falla la instalación |
| 2 | Auditoría | `npm audit --audit-level=high` | Vulnerabilidad alta en una dev-dependency |
| 3 | Formato | `npm run format:check` | Algún archivo de U2 sin formatear |
| 4 | Lint | `npm run lint` | Cualquier error en `lib/input/**` o `tests/u2/**` |
| 5 | Tests y cobertura | `npm run coverage` | Un test de U2 falla, o `lib/input/**` < 80 % en líneas o ramas (NFR6.1) |
| 6 | Bundle | `npm run check:bundle` | U2 importa un paquete o desde `node_modules` (NFR7.2) |
| 7 | Informe | Artefacto `coverage/` (14 días) | — |

## 3. Pruebas que el pipeline exige de U2

Se derivan del diseño NFR de U2 y corren sin red ni navegador (NFR6.2): el puerto del cerebro se reemplaza por un doble y los tiempos por temporizadores falsos de Vitest.

| Grupo | Casos mínimos |
|---|---|
| Topes de entrada | JSON y lenguaje natural en el límite y por encima (`input_too_long`, `input_limit_exceeded`) |
| Parseo JSON | Caso feliz, JSON inválido, forma válida sin `services` o vacía, claves fuera del esquema cerrado, `template` admitido |
| Forma de la respuesta del cerebro (paso 2b) | `interpreted` válido, `unresolved`, cuerpo con forma inválida |
| Errores del puerto | Cada código del borde (`unauthorized`, `login_cancelled`, `rate_limited`, `daily_quota_exceeded`, `inventory_unavailable`, `timeout`, `brain_unavailable`, `bad_request`, `empty_result`, `internal_error`) traducido a su `InputError` |
| Plazo y cancelación | Vence a los 30 s → `timeout`; Cancelar antes → `cancelled`; gana el primer evento |
| Registro | `toLogEntry` sin texto de lenguaje natural; `input_too_long` registra solo la longitud; JSON rechazado completo hasta 100 000 caracteres |
| Estructura (automática) | `tests/u2/imports.test.js` lee cada archivo de `lib/input/**`, extrae los especificadores de `import` con una expresión regular y falla si alguno sale de `lib/input/**` y `lib/messages*.js`, o apunta a módulos de U4 o de `lib/dom/**` (NFR7.1, NFR1.1). Sin dependencias nuevas: solo `fs` de Node en la prueba. |
| Independencia del cerebro | La misma suite de interpretación corre con dos dobles distintos del puerto (uno que responde `interpreted` y otro `unresolved`/errores) y pasa igual: U2 no depende de cómo esté implementado el cerebro (NFR1.1). |
| Sin marcado | Cada salida pública de U2 (normalizado, `InputError`, entradas de registro) se recorre y se comprueba que todos sus textos son cadenas sin `<` ni `>` generados por U2; ESLint ya prohíbe las APIs de HTML (NFR3.6). |

**Brecha de ramas.** Si al sumar el umbral de ramas algún módulo existente queda por debajo de 80 %, el responsable de Code Generation de U2 agrega los casos faltantes en esa misma etapa; el CI no se publica con el umbral rebajado.

## 4. Entrega

Igual que u1: CI verde en el commit, "Reload" de la extensión unpacked en `chrome://extensions` y smoke de `SMOKE.md`. Para U2, el smoke agrega dos casos de la pestaña de lenguaje natural: el aviso de datos del cliente es visible, y una descripción simple llega a la vista previa. No hay promoción entre entornos.

## 5. Rollback

`git revert` del commit de U2 y recarga de la extensión. U2 no persiste datos propios: solo escribe entradas en el registro técnico de u1, cuyo formato no cambia, así que no hay migración.

## 6. Secretos

Ninguno. U2 nunca ve el token del cerebro: sus llamadas pasan por el service worker (U7) con `BRAIN_CALL`. El pipeline sigue sin credenciales.
