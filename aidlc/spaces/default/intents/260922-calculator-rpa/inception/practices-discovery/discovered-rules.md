# Reglas descubiertas — AWS Calculator RPA Extension

> Versión final tras la entrevista humana y la integración de tres
> contribuciones de soporte (quality, developer, devsecops). Solo se registran
> restricciones duras con evidencia en el repo/CodeKB, declaradas en el alcance
> del proyecto, o resueltas como disputas de conocimiento por los especialistas.
> No se inventan restricciones. Los marcadores `ALWAYS ...` / `NEVER ...` son
> tokens fijos en inglés; la descripción que los sigue va en español. El detalle
> de cada decisión y la partición Zona A/Zona B viven en `team-practices.md`.

## Sources

- `aidlc/spaces/default/codekb/extension/`: `technology-stack.md`,
  `architecture.md`, `code-structure.md`, `code-quality-assessment.md`,
  `business-overview.md`, `dependencies.md`.
- Repo: `aws-calculator-extension/manifest.json`, `popup.html`, `popup.js`,
  `content.js`.
- Entrevista humana (Q1–Q5) y tres contribuciones de soporte en
  `contributions/` (quality, developer, devsecops).
- Alcance del proyecto declarado por el humano (eliminar la dependencia del
  "cerebro" n8n; entrada por lenguaje natural o importación de JSON; la decisión
  de dónde vive el mapeo queda diferida a las etapas de diseño).

## Mandated

- **ALWAYS** mantener la extensión en **Manifest V3** (`manifest_version: 3`).
  Evidencia: `manifest.json` declara MV3 y es una restricción explícita del
  proyecto; migrar a otra plataforma está fuera de alcance.
- **ALWAYS** mantener la extensión cargable como **unpacked sin build step**
  (vanilla JS, sin transpilación ni bundling), salvo que un cambio se justifique
  explícitamente y lo apruebe el mantenedor. Evidencia: no existe `package.json`
  de runtime, `tsconfig.json` ni paso de build. Las dev-dependencies (Vitest,
  ESLint, Prettier) quedan fuera del bundle unpacked y no violan esta regla.
- **ALWAYS** escribir el **copy de la UI orientado al usuario en español**.
  Evidencia: `popup.html` y los mensajes de estado de `popup.js` están en
  español (herramienta interna para los SE de Applying).
- **ALWAYS** (convención de idioma, developer) usar **inglés** para
  identificadores, nombres de función y claves de datos, y **español** para
  comentarios inline y copy de UI orientado al usuario. Evidencia: estado actual
  consistente (`scanForm`, `resolveElementByLabel` en inglés; comentarios y UI
  en español); formalizarlo previene deriva y encaja con la regla de idioma de
  conversación del espacio.
- **ALWAYS** declarar en `host_permissions` **únicamente** los hosts a los que
  el código hace `fetch`, y eliminar los no usados (mínimo privilegio).
  Evidencia: falta el host n8n (raíz técnica de P1 CORS) y sobra el host muerto
  `https://dnd5zrqcec4or.cloudfront.net/*` (P4), no referenciado por ningún
  código; todo permiso declarado y no usado es superficie de ataque gratis —
  el CloudFront muerto debe eliminarse.
- **ALWAYS** confirmar un guardado solo por **señal positiva de éxito** — el
  banner verde `Successfully added <Service> estimate.` — y detectar los
  mensajes de validación obligatoria (`is required`) antes de asumir guardado.
  Evidencia (developer + quality): hoy `saveService()` confirma por URL
  `/estimate` o por el botón `Add service`, lo que puede reportar como guardado
  un servicio rechazado por validación; URL/botón por sí solos son
  insuficientes. Ancla la compuerta de calidad de P3.
- **ALWAYS** mantener la **capa de mapeo / "cerebro" extraíble a su propio
  módulo ES**, acoplada solo por message passing o `import`. Evidencia
  (developer): MV3 soporta módulos ES nativos (`"type": "module"`), así que
  separar archivos **no introduce build step** y mantiene reversible la decisión
  diferida de dónde vive el mapeo (n8n / service worker / local).
- **ALWAYS** mantener **cero dependencias de runtime empaquetadas** salvo
  revisión y aprobación explícita del mantenedor. Evidencia (devsecops): hoy no
  hay librerías de terceros ni `node_modules/` en el bundle; preservarlo mantiene
  la superficie de cadena de suministro en cero. Las dev-dependencies (Vitest,
  ESLint, Prettier) están exentas porque no entran al bundle cargado.

## Forbidden

- **NEVER** introducir un paso de build (transpilación/bundling, `package.json`
  como requisito de ejecución) sin justificación explícita y aprobación del
  mantenedor. Evidencia: restricción declarada "mantener MV3, sin build step".
- **NEVER** hacer que un fallo de la extensión reporte éxito al usuario. El
  éxito se define como **todos** los servicios solicitados confirmados presentes
  en el estimado final (contraste pedido-vs-guardado), no como "se produjo una
  URL". Evidencia (quality + developer, P3): hoy 7 de 8 rutas de fallo son
  invisibles y degradan en silencio (`callN8N` → `[]`, acciones omitidas,
  `saveService` sin confirmar); cada fallo parcial debe propagar un resultado
  tipado por servicio al popup (éxito / éxito-parcial / fallo con motivo). Debe
  corregirse el contrato de mensajes roto (`PROGRESS_TEXT` emitido sin handler;
  `DOM_FIELDS` handler muerto), que es parte del mismo síntoma de visibilidad.
- **NEVER** colocar una credencial de larga vida (clave de API de Claude,
  Bedrock u otra) en **ningún** artefacto legible del cliente: el bundle,
  `chrome.storage`, variables del service worker, ni git. Evidencia (devsecops):
  un bundle MV3 unpacked no tiene almacén seguro. Si el rediseño mueve la IA al
  cliente, la credencial debe ser server-side (proxy / n8n) o de corta vida
  federada; nunca una clave estática embebida.
- **NEVER** introducir ejecución de código remoto ni dinámico: `eval`,
  `new Function()`, `<script src>` remoto, o inyección de HTML sin sanitizar
  (`innerHTML` con datos de red). Evidencia (devsecops): la CSP de MV3 ya lo
  prohíbe; declararlo como regla protege contra una regresión al rediseñar el
  camino de red/IA y contra XSS vía respuestas del "cerebro".
