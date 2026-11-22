**Collaborator:** aidlc-quality-agent

## Contribution

Revisión de soporte, lente de calidad, sobre la **Testing Posture** y las compuertas de calidad del borrador del lead (`team-practices.md`). Inspeccioné de forma independiente la evidencia (`evidence.md`), el CodeKB (`code-quality-assessment.md`, `technology-stack.md`, `architecture.md`) y las reglas propuestas (`discovered-rules.md`). El borrador es sólido y apropiadamente pragmático; abajo hay adiciones concretas que el lead puede integrar sin contradecir nada ya escrito. Todo lo propuesto es aditivo respecto a `org.md` (test-after por defecto, el eje de volumen gobernado por el Test Strategy).

### 1. `test-after` + Minimal-ish es la llamada correcta — con una partición explícita "testeable vs. no testeable"

Confirmo `Methodology: test-after` y `Ordering` tal como están: la evidencia no muestra ninguna señal de TDD/BDD/ATDD (0 archivos de test, 0 `.feature`, sin framework, sin `package.json`), y test-after es coherente con el flujo observado y con el default de `org.md`. No endurecer sin que el mantenedor lo pida.

Sugerencia de redacción para el lead: hacer explícita en la sección la **partición del sistema en dos zonas de verificación**, porque gobierna todo lo demás:

- **Zona A — lógica pura, aislable del DOM (SÍ se debe unit-testear).** Hay lógica real, determinista y con alto riesgo de regresión que hoy vive enterrada en `content.js`/`popup.js` y que puede y debe probarse en aislamiento. Inventario concreto a partir del CodeKB:
  - `parseUnitButtonLabel()` (FIX-2) — parsing semántico de botones Unit (ELB, WAF); función pura sobre strings, candidata ideal a tabla de casos.
  - `cleanAriaLabel()` (FIX-1) — quita placeholders embebidos (CloudWatch, KMS, SageMaker, ELB, WAF); pura, lista de casos conocidos ya documentada.
  - Validación/parseo del **JSON de entrada** en `popup.js` (`JSON.parse` + validar `services`): happy path, JSON inválido (ya hay copy `❌ JSON inválido.`), y forma válida pero sin `services`/vacía.
  - **Parseo de lenguaje natural** (capacidad nueva del alcance): es lógica nueva, sin dependencia del DOM; debe nacer con tests por requisito desde el primer Bolt.
  - **Capa de mapeo** una vez relocalizada (la decisión A/B/C está diferida, pero la opción C internaliza el mapeo y la opción B lo mueve al service worker): en ambas, la función de mapeo campo↔valor queda fuera del contexto de página y pasa a ser unit-testeable. Recomendación de calidad: **diseñar el mapeo como función pura `(entrada normalizada) → acciones`**, independientemente de dónde se aloje, para que sea testeable sin cargar la extensión. Esto es una restricción de testabilidad que conviene anotar ahora aunque la ubicación se decida después.
  - **Normalización de entrada** (natural-language/JSON → estructura interna de servicios): frontera pura, candidata a property-based ligero ("normalizar es idempotente", "toda entrada válida produce ≥1 servicio").

  Para la Zona A **sí** aplica un modelo dirigido por requisito (Minimal, Nyquist): 1 test por requisito + piso de happy-path, unit-only, sin pirámide. Es exactamente lo que el borrador llama "Minimal-ish" — propongo nombrarlo así de forma explícita.

- **Zona B — núcleo RPA dependiente del DOM CloudScape (NO se automatiza como e2e).** `scanForm`, `fillByLabel`, `resolveElementByLabel`, `selectAwsDropdown`, `saveService`, `addService`, `executeActions` dependen de un DOM de terceros no determinista y posiblemente stale (P2, ~14 meses sin mantenimiento, selectores `awsui_*` por substring + textos de botón en inglés). Confirmo la postura del lead: **no imponer piso de cobertura e2e aquí**.

### 2. Verificación del núcleo RPA: smoke manual estructurado, no e2e automatizado

Aval con precisión del tradeoff. Un journey contra `calculator.aws` a través de un DOM emulado (jsdom/Happy DOM) **no sería un e2e** (lo dice `testing-guide.md`): sería como mucho un test de integración y, peor, probaría contra un DOM que **nosotros** fabricamos, no contra el CloudScape real — justo donde vive el riesgo P2. Un e2e de verdad exigiría Chromium real (Playwright) contra una SPA de terceros que cambia sin aviso: alto costo, altísima fragilidad, flakiness garantizada, y además la extensión necesita un estimado real guardado (efectos de lado en `calculator.aws`). El retorno no justifica el costo para un mantenedor solo.

Recomendación concreta para que el "smoke manual" no sea una caja negra: convertirlo en un **checklist de smoke reproducible** versionado en el repo (p. ej. `aws-calculator-extension/SMOKE.md`, sin build, sin tooling), derivado del data-flow de `architecture.md`. Mínimo:
1. Recargar la extensión unpacked; abrir `calculator.aws`.
2. Ejecutar un caso canónico de 1 servicio simple (el mismo que proponga el walking skeleton) y **1 caso multi-servicio** que incluya al menos un servicio con toggles condicionales (Bedrock/SageMaker — FIX-7).
3. Verificar que la URL devuelta abre un estimado **completo** (todos los servicios pedidos presentes), no solo que llegó una URL.
4. Confirmar que un fallo provocado (p. ej. cerebro caído / `[]`) **no** produce `DONE` con URL (ver §3).

Esto cuesta minutos, es reversible y ataca directamente el gap de robustez de `saveService()` (hoy confirma por URL `/estimate` o botón `Add service`, sin detectar el banner verde `Successfully added <Service> estimate.` ni los mensajes `"is required"`).

### 3. Compuerta de calidad para P3 (fallos silenciosos) — crítica, y debe anclar los acceptance criteria

Esta es mi observación de mayor peso. El borrador ya recoge la regla `NEVER` de `discovered-rules.md` ("un fallo no debe reportar éxito"), pero como **práctica de calidad** falta la compuerta verificable que la haga cumplir. Hoy, por `code-quality-assessment.md`, **7 de 8** rutas de fallo son invisibles y solo el error global de `runRPA` llega al popup; `callN8N` devuelve `[]` en silencio, `executeActions`/`resolveElementByLabel`/`selectAwsDropdown`/`saveService`/`addService` degradan con `log()` y continúan.

Propongo que el lead añada a la Testing Posture una **compuerta de calidad explícita, independiente del volumen de tests**, que pueda escribirse como acceptance criterion en las etapas posteriores:

> **Quality gate — "no success on failure" (P3).** Ningún camino de ejecución puede devolver `DONE`/URL al usuario si cualquier servicio solicitado no se guardó y confirmó. El éxito se define como *todos* los servicios pedidos presentes en el estimado final (contraste pedido-vs-guardado), no como "se produjo una URL". Todo fallo parcial (cerebro devuelve `[]`, acción no resuelta, dropdown no hallado, `saveService` sin confirmar, validación `"is required"`) debe propagarse al popup como estado de error o de éxito-parcial visible.

Esto es testeable sin DOM real en la medida en que la lógica de agregación de resultados (contar pedido vs. confirmado y decidir `DONE` vs `ERROR`/`PARTIAL`) se extraiga como función pura — otra razón para empujar lógica fuera del contexto de página (§1). La parte dependiente del DOM (detección del banner verde / `"is required"`) se cubre en el smoke manual (§2 punto 4). Además conviene cerrar el desajuste `PROGRESS_TEXT` (emitido sin handler → avisos de "Claude preparando/configurando" descartados en silencio), que es parte del mismo síntoma de visibilidad.

### 4. Test runner sin build step — sí vale la pena para la Zona A; opciones concretas

El borrador deja "qué runner, o si introducir alguno" como pregunta abierta. Desde la lente de calidad: **introducir un runner liviano SÍ aporta valor** en cuanto exista lógica de Zona A extraída, porque convierte la verificación de parsers/validación/mapeo en algo repetible y barato (hoy toda verificación es manual). El costo es real pero acotado, y debe respetar la restricción dura `NEVER introducir build step` de `discovered-rules.md`.

Opciones que encajan con "vanilla MV3, sin transpilación ni bundling", de menor a mayor tooling (el mantenedor elige; esto no decide por él):
- **`node:test` + `node:assert`** (runner nativo de Node, sin dependencias). Más alineado con "sin build / sin `node_modules`": basta Node instalado para correr `node --test`. Requiere que la lógica de Zona A sea importable como módulo ES plano (lo que de todos modos recomendamos para testabilidad). Es la opción de menor huella.
- **Runner en el navegador sin bundler** (un `tests.html` que importe los módulos con `<script type="module">` y afirme en consola), si se quiere cero dependencia de Node. Encaja perfecto con el modelo unpacked, a costa de ergonomía.
- Runners con `node_modules` (Vitest/Jest/uvu) quedan en segundo plano: añaden dependencias y, en el caso de Jest, suele arrastrar transpilación — tensión con la restricción. No recomendados como primer paso para un mantenedor solo.

Recomendación: empezar por **`node:test`** sobre los módulos de Zona A; no tocar el camino RPA. Mantener cualquier runner como herramienta de desarrollo, no como requisito de ejecución de la extensión (el `NEVER build step` se preserva porque el runner no participa de la carga unpacked).

### 5. Piso de cobertura: sin piso numérico ahora — correcto, con una condición de reevaluación

Aval total a "sin piso de cobertura en este borrador". `test-strategy-patterns.md` fija 80% como baseline *cuando hay suite y CI*; aquí no hay ni suite ni CI, y la mayor parte del riesgo (Zona B) es precisamente lo que no se debe medir por cobertura. Un piso numérico global sería engañoso: empujaría a escribir asserts débiles contra el DOM o a inflar cobertura en código trivial.

Matiz de calidad para que el lead lo integre: en lugar de un piso de *líneas*, declarar un **piso dirigido por requisito sobre la Zona A** — "toda función pura extraída (parser, validación, normalización, agregación de resultados, mapeo relocalizado) nace con al menos su test de happy-path + sus casos de error conocidos". Es medible, honesto y consistente con la postura Minimal. Reevaluar un piso numérico **solo si** se introduce CI y la Zona A crece (p. ej. si la opción C internaliza mucho mapeo). Hoy: **explícitamente ninguno** a nivel global, piso-por-requisito en Zona A.

### 6. Baseline de test brownfield (nota de proceso)

`brownfield.md` pide un Test Baseline antes de Code Generation. Aquí el baseline es trivialmente conocido — **suite vacía, 0 tests, 0% cobertura, verificación solo manual** — pero conviene que el lead lo anote como línea base explícita para que las etapas de Construction no asuman una suite preexistente y para que el primer test escrito sea, por definición, mejora neta y no regresión.

## Positions

- AGREE: `Methodology: test-after` + volumen Minimal-ish — coincide con la evidencia (0 señales de TDD/BDD/ATDD) y con el default de `org.md`; no endurecer sin petición del mantenedor.
- AGREE: no automatizar e2e contra el DOM CloudScape ni imponer piso de cobertura e2e — el DOM de terceros no determinista y stale (P2) hace el e2e caro y frágil; el smoke manual es el tradeoff correcto.
- AGREE: sin piso de cobertura numérico global en este borrador — no hay suite ni CI y la mayor parte del riesgo está en código que no debe medirse por cobertura.
- OBJECT: falta una **compuerta de calidad verificable para P3** ("no success on failure": éxito = todos los servicios pedidos confirmados, no "hubo URL") — sin ella la regla `NEVER reportar éxito en fallo` queda como intención, no como criterio de aceptación comprobable; es el hueco de mayor riesgo.
- OBJECT: la Testing Posture no hace explícita la **partición Zona A (lógica pura, SÍ unit-test) vs. Zona B (RPA/DOM, solo smoke)** ni nombra el inventario concreto de funciones testeables (`parseUnitButtonLabel`, `cleanAriaLabel`, validación JSON, parseo NL, normalización, mapeo relocalizado) — nombrarlo convierte "Minimal-ish" en algo accionable y anclable a los requisitos.
- OBJECT: la pregunta abierta del runner debería traer una **recomendación con default** (`node:test`, sin `node_modules`, respetando `NEVER build step`) en lugar de quedar totalmente abierta — reduce la carga de decisión del mantenedor sin cerrarle la opción.
