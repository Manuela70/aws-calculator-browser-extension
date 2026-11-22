# Project-Level Rules

> Project-specific specialisation and corrections. Loaded after `org.md` and
> `team.md` as strict-additive guidance; contradictions with broader policy
> are rejected. Populated by practices-discovery and the self-learning loop.
>
> Use sparingly: most teams don't need a project layer. Reach for it
> only when this specific project needs stable, durable guidance beyond the
> team practice (for example, package-specific release checks or an additional
> regression suite for a legacy component).

## Way of Working

<!-- Project-specific specialisation. Example: -->
<!-- This monorepo requires package-scoped branch names and a package owner -->
<!-- review in addition to the team's normal merge policy. -->

## Walking Skeleton

<!-- Project-specific specialisation. Example: -->
<!-- The walking skeleton must exercise the legacy service adapter as well -->
<!-- as the new service boundary. -->

## Testing Posture

<!-- Project-specific specialisation. -->

## Change Control

<!-- Project-specific. Mode: strict or relaxed. Strict here holds for every intent and cannot be changed from chat. -->

## Deployment

<!-- Project-specific specialisation. -->

## Code Style

<!-- Project-specific specialisation. -->

## Tech Stack

<!-- Technology choices locked for this project. -->

## Decided

<!-- Decisions made in earlier stages that should not be re-asked. -->
<!-- Format: DECIDED: [decision] (Stage [slug], [date]) -->

## Scope Overrides

<!-- Custom scope rules for this project. -->

## Forbidden

<!-- Populated by practices-discovery affirmation gate. -->
<!-- Format: NEVER [behavior] (affirmed [date]) -->
<!-- Example: NEVER throw exceptions across service layer boundaries (affirmed 2026-05-17) -->

- **NEVER** introducir un paso de build (transpilación/bundling, `package.json` (affirmed 2026-11-20)

como requisito de ejecución) sin justificación explícita y aprobación del (affirmed 2026-11-20)

mantenedor. Evidencia: restricción declarada "mantener MV3, sin build step". (affirmed 2026-11-20)

- **NEVER** hacer que un fallo de la extensión reporte éxito al usuario. El (affirmed 2026-11-20)

éxito se define como **todos** los servicios solicitados confirmados presentes (affirmed 2026-11-20)

en el estimado final (contraste pedido-vs-guardado), no como "se produjo una (affirmed 2026-11-20)

URL". Evidencia (quality + developer, P3): hoy 7 de 8 rutas de fallo son (affirmed 2026-11-20)

invisibles y degradan en silencio (`callN8N` → `[]`, acciones omitidas, (affirmed 2026-11-20)

`saveService` sin confirmar); cada fallo parcial debe propagar un resultado (affirmed 2026-11-20)

tipado por servicio al popup (éxito / éxito-parcial / fallo con motivo). Debe (affirmed 2026-11-20)

corregirse el contrato de mensajes roto (`PROGRESS_TEXT` emitido sin handler; (affirmed 2026-11-20)

`DOM_FIELDS` handler muerto), que es parte del mismo síntoma de visibilidad. (affirmed 2026-11-20)

- **NEVER** colocar una credencial de larga vida (clave de API de Claude, (affirmed 2026-11-20)

Bedrock u otra) en **ningún** artefacto legible del cliente: el bundle, (affirmed 2026-11-20)

`chrome.storage`, variables del service worker, ni git. Evidencia (devsecops): (affirmed 2026-11-20)

un bundle MV3 unpacked no tiene almacén seguro. Si el rediseño mueve la IA al (affirmed 2026-11-20)

cliente, la credencial debe ser server-side (proxy / n8n) o de corta vida (affirmed 2026-11-20)

federada; nunca una clave estática embebida. (affirmed 2026-11-20)

- **NEVER** introducir ejecución de código remoto ni dinámico: `eval`, (affirmed 2026-11-20)

`new Function()`, `<script src>` remoto, o inyección de HTML sin sanitizar (affirmed 2026-11-20)

(`innerHTML` con datos de red). Evidencia (devsecops): la CSP de MV3 ya lo (affirmed 2026-11-20)

prohíbe; declararlo como regla protege contra una regresión al rediseñar el (affirmed 2026-11-20)

camino de red/IA y contra XSS vía respuestas del "cerebro". (affirmed 2026-11-20)

## Mandated

<!-- Populated by practices-discovery affirmation gate. -->
<!-- Format: ALWAYS [behavior] (affirmed [date]) -->
<!-- Example: ALWAYS use Result<T,E> for fallible operations in service layer (affirmed 2026-05-17) -->

- **ALWAYS** mantener la extensión en **Manifest V3** (`manifest_version: 3`). (affirmed 2026-11-20)

Evidencia: `manifest.json` declara MV3 y es una restricción explícita del (affirmed 2026-11-20)

proyecto; migrar a otra plataforma está fuera de alcance. (affirmed 2026-11-20)

- **ALWAYS** mantener la extensión cargable como **unpacked sin build step** (affirmed 2026-11-20)

(vanilla JS, sin transpilación ni bundling), salvo que un cambio se justifique (affirmed 2026-11-20)

explícitamente y lo apruebe el mantenedor. Evidencia: no existe `package.json` (affirmed 2026-11-20)

de runtime, `tsconfig.json` ni paso de build. Las dev-dependencies (Vitest, (affirmed 2026-11-20)

ESLint, Prettier) quedan fuera del bundle unpacked y no violan esta regla. (affirmed 2026-11-20)

- **ALWAYS** escribir el **copy de la UI orientado al usuario en español**. (affirmed 2026-11-20)

Evidencia: `popup.html` y los mensajes de estado de `popup.js` están en (affirmed 2026-11-20)

español (herramienta interna para los SE de Applying). (affirmed 2026-11-20)

- **ALWAYS** (convención de idioma, developer) usar **inglés** para (affirmed 2026-11-20)

identificadores, nombres de función y claves de datos, y **español** para (affirmed 2026-11-20)

comentarios inline y copy de UI orientado al usuario. Evidencia: estado actual (affirmed 2026-11-20)

consistente (`scanForm`, `resolveElementByLabel` en inglés; comentarios y UI (affirmed 2026-11-20)

en español); formalizarlo previene deriva y encaja con la regla de idioma de (affirmed 2026-11-20)

conversación del espacio. (affirmed 2026-11-20)

- **ALWAYS** declarar en `host_permissions` **únicamente** los hosts a los que (affirmed 2026-11-20)

el código hace `fetch`, y eliminar los no usados (mínimo privilegio). (affirmed 2026-11-20)

Evidencia: falta el host n8n (raíz técnica de P1 CORS) y sobra el host muerto (affirmed 2026-11-20)

`https://dnd5zrqcec4or.cloudfront.net/*` (P4), no referenciado por ningún (affirmed 2026-11-20)

código; todo permiso declarado y no usado es superficie de ataque gratis — (affirmed 2026-11-20)

el CloudFront muerto debe eliminarse. (affirmed 2026-11-20)

- **ALWAYS** confirmar un guardado solo por **señal positiva de éxito** — el (affirmed 2026-11-20)

banner verde `Successfully added <Service> estimate.` — y detectar los (affirmed 2026-11-20)

mensajes de validación obligatoria (`is required`) antes de asumir guardado. (affirmed 2026-11-20)

Evidencia (developer + quality): hoy `saveService()` confirma por URL (affirmed 2026-11-20)

`/estimate` o por el botón `Add service`, lo que puede reportar como guardado (affirmed 2026-11-20)

un servicio rechazado por validación; URL/botón por sí solos son (affirmed 2026-11-20)

insuficientes. Ancla la compuerta de calidad de P3. (affirmed 2026-11-20)

- **ALWAYS** mantener la **capa de mapeo / "cerebro" extraíble a su propio (affirmed 2026-11-20)

módulo ES**, acoplada solo por message passing o `import`. Evidencia (affirmed 2026-11-20)

(developer): MV3 soporta módulos ES nativos (`"type": "module"`), así que (affirmed 2026-11-20)

separar archivos **no introduce build step** y mantiene reversible la decisión (affirmed 2026-11-20)

diferida de dónde vive el mapeo (n8n / service worker / local). (affirmed 2026-11-20)

- **ALWAYS** mantener **cero dependencias de runtime empaquetadas** salvo (affirmed 2026-11-20)

revisión y aprobación explícita del mantenedor. Evidencia (devsecops): hoy no (affirmed 2026-11-20)

hay librerías de terceros ni `node_modules/` en el bundle; preservarlo mantiene (affirmed 2026-11-20)

la superficie de cadena de suministro en cero. Las dev-dependencies (Vitest, (affirmed 2026-11-20)

ESLint, Prettier) están exentas porque no entran al bundle cargado. (affirmed 2026-11-20)

## Corrections

<!-- Project-specific corrections from human feedback. -->
<!-- Format: NEVER/ALWAYS [behavior] (learned [date]) -->
