# Evidencia — Practices Discovery (final)

> Qué se inspeccionó, qué aportó cada especialista de soporte, qué decidió el
> humano en la entrevista, y qué queda sin resolver. Las decisiones afirmadas
> cierran las preguntas abiertas del borrador; la incertidumbre restante es
> técnica (no de práctica) y se difiere al diseño/Construction.

## Sources

### CodeKB (reverse-engineering), en `aidlc/spaces/default/codekb/extension/`
- `code-structure.md` — paquete plano, sin build; `content.js` ~1264 líneas;
  inventario de archivos al commit `45f888e`.
- `technology-stack.md` — vanilla JS ES2018+, MV3 (`version: 2.0.0`), sin build
  system, sin librerías de terceros; **sin tests, sin linting, sin CI/CD**.
- `dependencies.md` — dependencia externa crítica n8n (estado no verificado),
  DOM CloudScape (selectores posiblemente stale, P2), sin dependencias de
  build/test.
- `code-quality-assessment.md` — cobertura de tests: ninguna; linting: ninguno;
  CI/CD: ninguno; deuda técnica (P1 CORS, P2 selectores, P3 fallos silenciosos,
  P4 higiene de permisos); FIX-1..FIX-9 documentados.
- `architecture.md` — MV3 sin service worker; tres alternativas para el "cerebro"
  (A n8n actual, B service worker, C mapeo local) con tradeoffs; elección
  diferida al diseño.
- `business-overview.md` — herramienta interna de preventa (SE de Applying);
  transacción principal "Generar estimado desde JSON".

### Repo real (`aws-calculator-extension/`)
- `manifest.json` — MV3, `permissions`, `host_permissions` (incluye host muerto
  CloudFront; falta host n8n), content script sobre `calculator.aws`, sin clave
  `background`.
- `popup.js` — controlador vanilla JS; `camelCase`; copy en español; maneja
  `DOM_FIELDS` (sin emisor) y no maneja `PROGRESS_TEXT`.
- `popup.html`, `content.js`, `REVIVAL_PLAN.md` — revisados; estilo y
  convenciones confirmados.

### Estado git y configuración
- `git log`: un único commit `45f888e` ("Setup inicial AI-DLC v2") en `main`.
  Mantenedor solo.
- Búsqueda de `package.json`: **0 resultados** → confirmada la ausencia de
  tooling de build/test/lint.
- **Ausencia confirmada** de `.github/workflows` (CI), `.eslintrc`/`.prettierrc`
  (linter/formatter), frameworks/directorios de test, y paso de build.

### Memoria del espacio
- `aidlc/spaces/default/memory/org.md` — defaults de framework (trunk-based,
  squash-merge, test-after por defecto, deploy-on-merge). Tratados como
  sugerencia, no como práctica establecida para este proyecto solo.
- `team.md` y `project.md` — secciones de prácticas vacías (plantilla).

## Contribuciones de soporte (disputas de conocimiento, integradas)

Las tres contribuciones son aditivas; sus OBJECT eran disputas de conocimiento
técnico (no juicios para el humano) y se integraron en los artefactos finales.

### aidlc-quality-agent — inspeccionó `evidence.md`, CodeKB
(`code-quality-assessment.md`, `technology-stack.md`, `architecture.md`) y
`discovered-rules.md`. Aportó:
- La **partición explícita Zona A (lógica pura, SÍ unit-test) vs. Zona B
  (RPA/DOM, solo smoke)** con inventario de funciones testeables de la Zona A.
- La **compuerta de calidad P3** ("no success on failure": éxito = todos los
  servicios pedidos confirmados, no "hubo URL"), anclable como acceptance
  criterion; detectar banner verde `Successfully added <Service> estimate.` y
  mensajes `is required`.
- El **checklist de smoke reproducible versionado** (`SMOKE.md`) con caso
  multi-servicio + toggle condicional (FIX-7) y caso de fallo provocado.
- Baseline brownfield explícito (suite vacía, 0 tests, 0% cobertura).
- Infirió que un runner liviano aporta valor en cuanto exista lógica de Zona A
  extraída (recomendó `node:test`; el humano eligió Vitest en Q3 — ver abajo).

### aidlc-developer-agent — inspeccionó `content.js` de primera mano, `popup.js`,
`manifest.json` y el CodeKB. Verificó y aportó:
- P3 es **sistémico** (7+ rutas de degradación silenciosa); `saveService()`
  confirma por URL/botón, nunca por banner de éxito. Propuso el **modelo de error
  explícito end-to-end** (resultado tipado por servicio al popup) y arreglar el
  contrato de mensajes (`PROGRESS_TEXT` sin handler, `DOM_FIELDS` muerto).
- La **capa de mapeo extraíble a módulo ES** (MV3 `"type": "module"`), sin build
  step, para mantener reversible la decisión diferida del cerebro.
- La **convención de idioma** como regla (inglés código / español comentarios y
  UI) y linter/formatter standalone opt-in (ESLint `no-empty` y detección de
  código muerto contra P3).

### aidlc-devsecops-agent — inspeccionó `manifest.json`, `content.js` (líneas 20
y 85) y el CodeKB. Verificó y aportó:
- **Higiene de permisos / mínimo privilegio** como regla dura: eliminar el host
  muerto CloudFront (P4), declarar solo los hosts usados.
- **Secretos** endurecidos nombrando los almacenes del cliente (`chrome.storage`,
  service worker, bundle, git) como no seguros; credencial de LLM nunca de larga
  vida en el cliente.
- **Cero dependencias de runtime empaquetadas** sin aprobación (dev-deps
  exentas).
- **No remote/dynamic code** (CSP MV3): sin `eval`, `new Function()`, script
  remoto ni `innerHTML` sin sanitizar.

## Decisiones de la entrevista humana (autoritativas)

- **Q1 Way of Working = A** — directo sobre `main` con commits pequeños y
  descriptivos; squash-merge solo como convención si alguna vez se usa una rama.
- **Q2 Walking Skeleton = A** — sí, rebanada fina end-to-end primero (un servicio
  simple), brain-agnostic; `skeleton:` efectivamente ON para el proyecto.
- **Q3 Testing Posture = C** — `test-after` más estricto: **Vitest** como
  dev-dependency (bundle sigue vanilla JS sin build step) + **piso de cobertura
  80%** sobre la lógica pura de Zona A; smoke manual versionado para la Zona B
  RPA/DOM, sin piso e2e. (Supera la recomendación `node:test` de quality: la
  elección del humano es Vitest.)
- **Q4 Linter/Formatter = A** — ESLint (flat config, standalone) + Prettier como
  dev-dependencies, sin build step; ESLint `no-empty` / código muerto contra P3.
- **Q5 Distribución = B** — hoy unpacked (cargar/recargar en Chrome); a futuro
  empaquetar un `.zip` (paso manual o script sin build step) para distribución
  interna / Chrome Web Store.
- **Summary Confirmation**: "Looks correct".

## Incertidumbre restante (técnica, diferida — no de práctica)

- **P2 — staleness de selectores CloudScape**: no verificado contra el
  `calculator.aws` vivo; se resolverá en el smoke manual y en Construction.
- **Salud del webhook n8n**: estado no verificado (puede ya no existir). Diferido.
- **Ubicación del "cerebro" de mapeo** (n8n / service worker / local, alt. A/B/C
  de `architecture.md`): decisión de **diseño**, deliberadamente diferida; el
  walking skeleton se diseña brain-agnostic para no prejuzgarla.
