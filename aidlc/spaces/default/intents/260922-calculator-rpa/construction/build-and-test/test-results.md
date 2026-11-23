# Resultados de build y pruebas — calculator-rpa

> Ejecutado el 2026-11-22 sobre `main` (`9d76f46`, Bolt u6-popup-ui) en Windows 11, Node LTS. Todas las pruebas corren en **Node con Vitest**: ninguna corrió en un navegador real ni en un DOM emulado. La matriz final de objetivos está en `build-and-test-summary.md` § Target Verification Matrix.

## 1. Build

| Comando | Exit | Resultado |
|---|---|---|
| `npm ci` (raíz), `npm ci --prefix brain`, `npm ci --prefix infra` | 0 | Dependencias de desarrollo y de U4 instaladas desde sus lockfiles |
| `npm run lint` | 0 | Sin errores |
| `npm run check:selectors` | 0 | Sin selectores frágiles fuera de `lib/dom/selectors.js` (script agregado en esta etapa) |
| `npm run format:check` (1.ª corrida) | 1 | 161 archivos marcados: copia de trabajo en CRLF por `core.autocrlf=true`; sin diferencias de contenido |
| `npm run format:check` (tras la corrección en la etapa) | 0 | Todos los archivos con estilo Prettier |
| `npm run check:bundle` | 0 | `check:bundle OK — 61 archivos revisados contra la política.` |
| `npm audit --audit-level=high` | 0 | 0 vulnerabilidades |
| `cd infra && npx cdk synth … --no-lookups -q` (sin credenciales de AWS en el entorno) | 0 | `Successfully synthesized` de `BrainBootstrapStack` y `BrainStack` |

**Corrección dentro de la etapa (escalón 1):** se agregó `.gitattributes` (`* text=auto eol=lf`) y se corrió `npm run format` (solo fin de línea; `git diff --ignore-cr-at-eol` no muestra cambios de código). `format:check` pasó en la segunda corrida.

## 2. Pruebas unitarias por unidad (un comando por unidad, sin repetir)

| Comando | Exit | Archivos | Pruebas |
|---|---|---|---|
| `npx vitest run tests/u1` | 0 | 11 | 83 pasan |
| `npx vitest run tests/u2` | 0 | 6 | 79 pasan |
| `npx vitest run tests/u3` | 0 | 6 | 48 pasan |
| `npx vitest run tests/u4` | 0 | 11 | 133 pasan |
| `npx vitest run tests/u5` | 0 | 10 | 90 pasan |
| `npx vitest run tests/u5 tests/u1/orchestrator.test.js tests/u1/result-aggregator.test.js tests/u1/retry-wait-timer.test.js` | 0 | 13 | 120 pasan |
| `npx vitest run tests/u6` | 0 | 14 | 101 pasan |
| `npx vitest run tests/u7` | 0 | 12 | 92 pasan |

Sin fallos, sin pruebas omitidas. La suite completa tiene 70 archivos y 626 pruebas (el comando de U5 que incluye pruebas de U1 no suma nuevas).

## 3. Cobertura

### Suite completa (piso del proyecto: 80 % de líneas, `vitest.config.js`)

`npx vitest run --coverage` → exit 0, 70 archivos, 626 pruebas pasan.

| Métrica | Valor |
|---|---|
| Sentencias | 96,75 % (3247/3356) |
| Ramas | 91,82 % (2593/2824) |
| Líneas | 98,63 % (2744/2782) |

Ningún umbral global ni por ruta incumplido (exit 0).

### Por unidad (comandos de `unit-test-instructions.md`, piso propio de 80 % en líneas y ramas)

| Unidad | Alcance | Líneas | Ramas | Exit |
|---|---|---|---|---|
| U2 | `lib/input/**` | 99,64 % | 94,46 % | 0 |
| U3 | `lib/mapping/{deterministic-mapper,option-match,residue-resolver}.js` | 99,55 % | 92,88 % | 0 |
| U4 | `brain/core/**` | 98,58 % | 91,85 % | 0 |
| U5 | seis módulos de Zona A | 100 % | 96,27 % | 0 |
| U6 | siete módulos de Zona A | 98,10 % | 88,37 % | 0 |
| U7 | `sw/**` y `lib/connection/brain-port.js` | 96,84 % | 94,58 % | 0 |

U1 no tiene umbral propio: su piso es el de la suite completa.

## 4. Pruebas de integración

Comando de `integration-test-instructions.md` (12 archivos de borde entre unidades) → exit 0, 133 pruebas pasan. Evidencia de integración en Node, no de comportamiento en el navegador.

## 5. Cobertura entre unidades

`aidlc engine sensor-traceability --stage build-and-test` → `pass: true`, sin elementos sin cubrir (ver `cross-unit-traceability.md`). En la primera corrida falló por dos defectos de registro, corregidos en la etapa:
- `u2-input-parsers/code-generation/traceability.json`: las rutas traían descripción pegada; se separaron en `target` y `note`.
- `u4-mapping-brain/code-generation/traceability.json`: faltaba NFR5.3; se agregó como `N/A`, entregado por U7 (`sw/session.js`).

## 6. Verificaciones que no corrieron aquí

- **Navegador real (Chrome 130 o posterior y calculator.aws):** los casos S1-S15, R1-R11 y P1-P8 de `SMOKE.md` son manuales; aquí no se puede cargar una extensión unpacked. Sus objetivos quedan `Unverified` y se dicen en la aprobación.
- **Cerebro desplegado en AWS:** latencias reales, disponibilidad por sonda, alarmas disparadas, cuotas calibradas, memoria del inventario, registro de invocaciones de Bedrock. Etapa dueña: Deployment Execution (en el plan). Quedan `Unverified`.
- **CI:** el plan no ejecuta CI Pipeline; las obligaciones de "ejecutar en CI antes de merge" son `N/A`.

## 7. Fallos y diagnóstico

Build and Test **no pasa** con la evidencia de esta corrida:

1. **TC-3 `Not Met` (5 a 8 pruebas por componente).** `lib/panel/heartbeat.js` (U1) tiene 3 pruebas (`tests/u1/heartbeat.test.js`) y ningún otro archivo lo ejerce. Los demás componentes con archivos pequeños suman lo necesario entre archivos (`aria-label` 3 + 3; `session-rule` 3 más las de `panel-state.login.test.js`).
   - Causa raíz: pruebas generadas en Code Generation de U1.
   - Arreglo candidato: agregar 2 a 5 pruebas a `tests/u1/heartbeat.test.js` (latido vencido a 60 s, reinicio, parada, valores límite).
   - Impacto estimado: esfuerzo bajo (unos 30 minutos de trabajo); costo económico nulo; riesgo bajo. Como Construction corre por etapas, el retorno reabre Code Generation de las siete unidades: pide aprobar de nuevo los planes y una revisión nueva por unidad, aunque solo cambie U1.
2. **11 objetivos `Unverified` que exigen el cerebro desplegado** (u4-NFR8.5, 8.6, 8.7, 1.4, 3.3, 3.5, 3.8, 3.9, 3.11, D4 y D10).
   - Causa raíz: el cerebro todavía no está desplegado. No es un defecto del código ni de un enfoque elegido en Code Generation.
   - No hay un arreglo en una dimensión intercambiable dentro de esta etapa.
   - Su dueña es Deployment Execution, más adelante en el plan.

**Decisión del mantenedor (2026-11-22): Accept failure.** Se acepta el fallo y se pasa a la aprobación de Build and Test, con estos pendientes conocidos:
- Ampliar `tests/u1/heartbeat.test.js` a 5 pruebas o más.
- Verificar los 11 objetivos del cerebro en Deployment Execution.

No se usó ningún retorno a Code Generation (0/3).

Los 27 objetivos de navegador (`Unverified` solo porque ningún navegador real los corrió) no cuentan como fallo: se dicen en la aprobación.
