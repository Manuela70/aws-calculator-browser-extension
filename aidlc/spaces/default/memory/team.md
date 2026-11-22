# Team-Level Rules

> This team's affirmed practices and corrections. Loaded after `org.md` as
> strict-additive guidance; contradictions with broader policy are rejected.
> Populated by the practices-discovery affirmation gate. Edit at the gate,
> not directly.

## Way of Working

Mantenedor solo sobre un repo con git ya inicializado (rama `main`, un único
commit `45f888e`). Decisión afirmada (Q1 = A): **trabajar directo sobre `main`
con commits pequeños y descriptivos**, sin ramas de PR. No hay revisor que
requiera una rama, y es el flujo más simple para una revivida de un solo
mantenedor.

- Base y target: `main` (única rama).
- Flujo por defecto: **commit directo a `main`**, pequeño y descriptivo.
- Convención de merge, solo **si alguna vez se usa una rama** (p. ej. para un
  cambio arriesgado o exploratorio): **squash-merge** a `main` para mantener la
  historia lineal (consistente con `org.md`). El default no es ese: es
  directo-a-`main`.

Nota de organización del código (developer): la **capa de mapeo / "cerebro"
debe ser extraíble a su propio módulo ES**. MV3 soporta módulos ES nativos
(`"type": "module"`), así que separar archivos **no introduce build step** y
mantiene reversible la decisión diferida de dónde vive el mapeo (recrear n8n,
service worker, o mapeo local). Regla dura asociada en `discovered-rules.md`.

## Walking Skeleton

Decisión afirmada (Q2 = A): **sí, correr un walking skeleton primero**. Para
este proyecto el stance de `skeleton:` del scope es efectivamente **ON**.

Es una revivida de código roto (~14 meses sin mantenimiento; la dependencia del
"cerebro" n8n ya no existe y P1 CORS bloquea el camino de red actual). La
primera rebanada es una versión mínima que corre el camino completo con **un
solo servicio simple**: **entrada (lenguaje natural o JSON) → mapeo → RPA sobre
el DOM de `calculator.aws` → guardar → devolver la URL del estimado**, antes de
invertir en los nueve servicios y sus FIX.

El esqueleto debe ser **agnóstico respecto a dónde vive el cerebro**: debe poder
validarse con cualquiera de las opciones de ubicación diferidas (recrear n8n,
mover el mapeo a un service worker, o un enfoque local sin LLM), de modo que la
decisión de diseño siga abierta. Reduce el riesgo de reconstruir sobre supuestos
no verificados (selectores CloudScape stale P2, salud del webhook no verificada).

## Testing Posture

Hoy **no hay tests, ni framework de test, ni config de cobertura, ni CI**
(`code-quality-assessment.md`, `technology-stack.md`); la única verificación es
manual. Baseline brownfield explícito: **suite vacía, 0 tests, 0% cobertura,
verificación solo manual** — el primer test escrito es, por definición, mejora
neta y no regresión. Decisión afirmada (Q3 = C): `test-after` más estricto que
el borrador, con runner y piso de cobertura sobre la lógica pura.

- **Methodology**: test-after
- **Methodology evidence**: No existe ninguna señal de TDD/BDD/ATDD en el repo
  (0 archivos de test, 0 `.feature`, sin framework, sin `package.json`). El
  flujo observado es escribir código y verificarlo después; `test-after` es la
  postura elegida, coherente con esa evidencia y con el default de `org.md`.
- **Ordering**: Implementar cada capa testeable del cambio y, a continuación,
  escribir y ejecutar los tests de esa capa (primero la lógica pura extraíble de
  la Zona A, luego verificación manual del RPA de la Zona B contra la UI viva).

### Runner y restricción de "sin build step"

- **Runner: Vitest**, introducido **solo como dev-dependency**. Esto introduce
  `package.json` + `node_modules` **exclusivamente como dependencia de
  desarrollo**. El bundle unpacked que carga Chrome **sigue siendo vanilla JS
  sin paso de build** (sin transpilación ni bundling): Vitest no participa de la
  carga unpacked. La restricción dura "sin build step" (`discovered-rules.md`)
  se preserva.

### Partición Zona A / Zona B (gobierna todo lo demás)

- **Zona A — lógica pura, aislable del DOM (SÍ se unit-testea).** Inventario de
  funciones testeables:
  - parseo/validación del JSON de entrada (`JSON.parse` + validar `services`:
    happy path, JSON inválido, forma válida sin `services`/vacía),
  - parseo de lenguaje natural (capacidad nueva del alcance; nace con tests por
    requisito),
  - normalización de entrada (natural-language/JSON → estructura interna),
  - la **capa de mapeo relocalizada** (campo↔valor como función pura
    `(entrada normalizada) → acciones`, testeable sin cargar la extensión,
    independientemente de dónde se aloje),
  - `parseUnitButtonLabel` (FIX-2),
  - `cleanAriaLabel` (FIX-1),
  - agregación de resultados (contar pedido-vs-confirmado y decidir
    `DONE`/`ERROR`/`PARTIAL`; función pura que ancla la compuerta P3).
- **Coverage floor: 80%** sobre la lógica pura de la Zona A. Cada función pura
  extraída nace con al menos su test de happy-path más sus casos de error
  conocidos.
- **Zona B — núcleo RPA dependiente del DOM CloudScape (NO se automatiza como
  e2e).** `scanForm`, `fillByLabel`, `resolveElementByLabel`,
  `selectAwsDropdown`, `saveService`, `addService`, `executeActions` dependen de
  un DOM de terceros no determinista y posiblemente stale (P2). Verificación:
  **solo smoke manual**; **sin piso de cobertura** ni e2e automatizado sobre ese
  DOM. Un journey contra un DOM emulado probaría un DOM fabricado por nosotros,
  no el CloudScape real donde vive el riesgo P2; un e2e real (Playwright contra
  una SPA de terceros, con efectos de lado en `calculator.aws`) no justifica el
  costo para un mantenedor solo.

### Smoke manual versionado (Zona B)

Checklist de smoke reproducible, versionado en `aws-calculator-extension/SMOKE.md`
(sin build, sin tooling), derivado del data-flow de `architecture.md`. Mínimo:

1. Recargar la extensión unpacked; abrir `calculator.aws`.
2. Caso canónico de 1 servicio simple (el mismo del walking skeleton) **y** un
   caso **multi-servicio con al menos un toggle condicional**
   (Bedrock/SageMaker — FIX-7).
3. Verificar que la URL devuelta abre un estimado **completo** (todos los
   servicios pedidos presentes), no solo que llegó una URL.
4. **Caso de fallo provocado** (cerebro caído / `[]`): confirmar que **no**
   produce `DONE` con URL (ver la compuerta P3 en `discovered-rules.md`).

## Change Control

<!-- Affirmed by the team. Mode: strict or relaxed. Strict here holds for every intent and cannot be changed from chat. -->

## Deployment

Para una extensión **Manifest V3 unpacked** no existe pipeline de deploy: no hay
servidor, artefacto de servidor, ni promoción entre entornos. Decisión afirmada
(Q5 = B):

- **Hoy (desarrollo diario)**: cargar / recargar la extensión **unpacked en
  Chrome** (`chrome://extensions` → modo desarrollador → "Load unpacked" sobre
  `aws-calculator-extension/`, "Reload" tras cada cambio). Es la única operación
  de release del día a día y es completamente reversible.
- **A futuro**: empaquetar un **`.zip`** del directorio para distribución
  interna / Chrome Web Store. Sería un **paso manual** (o un script de
  empaquetado **sin build step**) cuando se decida publicar; hoy no es necesario
  y no hay pipeline que lo automatice.

Los defaults de `org.md` ("deploy on merge a staging", gates de producción, CD /
CodePipeline) **no aplican** (N/A) a este proyecto: no hay entornos ni CD. Se
declara explícitamente para que las etapas posteriores no asuman un pipeline
inexistente.

## Code Style

Convenciones efectivamente visibles en el código (vanilla JS, ES2018+) y
decisiones afirmadas en la entrevista:

- **Nomenclatura**: `camelCase` para funciones y variables (`scanForm`,
  `resolveElementByLabel`, `setToggle`, `targetTab`), `UPPER_SNAKE_CASE` para
  constantes (`DELAY`, `N8N_MAPPER_URL`, `EXAMPLE_JSON`). Idiomático de JS.
- **Convención de idioma (regla mandada, developer)**: **ALWAYS** identificadores,
  nombres de función y claves de datos **en inglés**; **ALWAYS** comentarios
  inline y copy de UI orientado al usuario **en español**. Formaliza el estado
  actual consistente y previene deriva; encaja con la regla de idioma de
  conversación del espacio. Ver `discovered-rules.md`.
- **Linter / Formatter (decisión Q4 = A)**: **sí** introducir **ESLint (flat
  config, standalone)** y **Prettier** como **dev-dependencies**, **sin build
  step**; el bundle unpacked sigue siendo vanilla JS. ESLint `no-empty` caza los
  `catch(e) {}` vacíos que causan P3 y su detección de código muerto ataca el
  código inventariado (`DELAY.TYPING`, handler muerto `DOM_FIELDS`) — ambos
  directamente sobre P3 y la deuda ya documentada.
- **Sin anotaciones de tipo** (ni TypeScript ni JSDoc).
- **Módulos ES**: hoy `content.js` es un archivo plano de ~1264 líneas; la
  práctica adoptada (ver Way of Working) es separar la capa de mapeo a su propio
  módulo ES, lo que **no** introduce build step.
- **Sin build step**: restricción dura a honrar — MV3 y vanilla JS cargable
  directamente, salvo justificación explícita del mantenedor
  (`discovered-rules.md`).
## Forbidden

<!-- Team-specific forbidden patterns -->

## Mandated

<!-- Team-specific mandates -->

## Corrections

<!-- Self-learning loop appends here. -->
