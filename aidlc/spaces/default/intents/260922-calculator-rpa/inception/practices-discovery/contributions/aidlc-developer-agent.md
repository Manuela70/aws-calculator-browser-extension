**Collaborator:** aidlc-developer-agent

## Contribution

Inspección independiente del borrador (`team-practices.md`, `discovered-rules.md`), de la
evidencia y del código real (`content.js` leído directamente, `popup.js`, `manifest.json`),
además del CodeKB (`code-structure.md`, `code-quality-assessment.md`, `architecture.md`).
Lente de salud de código sobre **Code Style** y **Way of Working**. Verificado de primera mano:

- El patrón **P3 de degradación silenciosa** es real y sistémico, no un caso aislado. En
  `content.js`: `callN8N` lanza pero `prepareForm`/`mapFields` capturan y devuelven `[]`;
  `executeActions` tiene un `try/catch` **por acción** que hace `log()` y continúa;
  `setToggle`/`selectNative`/`resolveElementByLabel` devuelven `false`/`null` y la acción se
  omite; `addService` captura por servicio, vuelve a `/estimate` y sigue. Solo el `.catch`
  global de `runRPA` llega al popup como `ERROR`. El único canal visible (`ERROR`) oculta todo
  fallo parcial.
- **`saveService` confirma guardado por URL `/estimate` o presencia del botón `Add service`**,
  nunca por el banner verde de éxito ni por validación obligatoria. Confirmado leyendo la
  función: un servicio rechazado por validación puede reportarse como guardado y devolver una
  URL de estimado incompleto. Es el corazón mecánico de P3.
- **Monolito confirmado**: `content.js` es un único archivo plano (~1264 líneas) sin módulos ES;
  mezcla constantes/utilidades, cliente de red (`callN8N`), ejecución de acciones, scanner de
  DOM, resolución de elementos y orquestación (`addService`/`runRPA`). `scanForm`, `fillByLabel`
  y `addService` son funciones largas.
- **Contrato de mensajes roto confirmado**: `popup.js` maneja `DOM_FIELDS` (que `content.js`
  nunca emite) y **no** maneja `PROGRESS_TEXT` (que `content.js` sí emite en `addService`). El
  handler muerto y el mensaje descartado en silencio son parte del mismo problema de visibilidad
  que P3.
- **Convención de idioma mixta confirmada**: identificadores y nombres de función en inglés
  (`scanForm`, `resolveElementByLabel`, `setToggle`); comentarios inline y copy de UI en español
  (`popup.html`, estados de `popup.js`). El estilo es consistente a mano, sin linter ni tipos.

### Adiciones concretas propuestas

**1. Modelo de error explícito como regla mandada (ataca P3 en la raíz).** El borrador tiene
`NEVER` reportar éxito en un fallo, pero no dice qué convención de manejo de errores adopta la
revivida. Propongo mandar, como práctica de código, un modelo de error explícito end-to-end:

- Cada paso que hoy "traga y sigue" (`callN8N` → `[]`, acción omitida, `saveService` sin
  confirmar, toggle no encontrado) debe **propagar un resultado tipado** (p. ej. un objeto
  `{ ok, value|error }` sobre vanilla JS, sin dependencias) hacia `runRPA`, que agrega el
  resultado por servicio.
- El popup debe recibir un **resultado por servicio** (éxito / éxito-parcial / fallo con motivo),
  no solo un `DONE`/`ERROR` global. Esto requiere arreglar primero el contrato de mensajes
  (`PROGRESS_TEXT` sin handler, `DOM_FIELDS` muerto).
- **ALWAYS** confirmar un guardado solo por **señal positiva de éxito** (banner verde
  `Successfully added <Service> estimate.`) y detectar los mensajes de validación obligatoria
  (`is required`) antes de asumir guardado. Confirmación por URL/botón sola es insuficiente.
- Mantener el patrón "catch en el boundary": el `boundary` aquí es el listener
  `chrome.runtime.onMessage` y `runRPA`; el interior no debe tragar en silencio.

**2. Extraibilidad de la capa de mapeo sin build step (Way of Working / organización).** La
decisión de dónde vive el cerebro está diferida a diseño, pero la **salud estructural** no debería
estarlo. El monolito de 1264 líneas es una preocupación para la revivida: hoy no se puede
reemplazar el cerebro (n8n → service worker → local) sin editar el mismo archivo que contiene el
scanner de DOM y la orquestación. Propongo como práctica adoptada: **la capa de mapeo/cerebro debe
ser extraíble a su propio archivo** con el único acoplamiento siendo message passing o `import`
de módulo ES. MV3 soporta módulos ES nativos en content scripts y service workers
(`"type": "module"`), así que **separar en varios archivos `.js` no introduce build step**. Esto
mantiene la restricción "sin build" intacta y hace la decisión de diseño diferida genuinamente
reversible.

**3. Linter/formatter: recomendación matizada, no mandato.** Para un proyecto vanilla-JS MV3 de
un solo mantenedor, un formatter (**Prettier**) y un linter (**ESLint flat config**) corriendo
**standalone** (sin bundler, invocados como herramienta de desarrollo) **no violan "sin build
step"**: no transpilan ni empaquetan el código que Chrome carga. El trade-off real es que
introducen `package.json` + `node_modules` **solo como dev-dependency**, lo que el borrador trata
hoy como ausencia total de tooling. Recomiendo **sí, como opt-in del mantenedor**, con la regla de
que el artefacto cargado unpacked siga siendo el mismo vanilla JS sin paso de build. ESLint aporta
valor concreto aquí: detectaría el código muerto (`DELAY.TYPING`, handler `DOM_FIELDS`) y
`no-empty` cazaría exactamente los `catch(e) {}` vacíos que causan P3. No lo mandaría como regla
dura (es un solo mantenedor); lo dejaría como práctica recomendada en `Code Style`.

**4. Convención de idioma: vale la pena formalizarla.** El patrón ya es consistente y sano
(código/identificadores en inglés; comentarios y UI en español). Formalizarlo como regla barata
previene deriva y es exactamente lo que el proyecto ya hace. Encaja con la regla de idioma de
conversación del espacio. Recomiendo mandarlo en `Code Style`: **ALWAYS** identificadores, nombres
de función y claves de datos en inglés; **ALWAYS** comentarios y copy de UI orientado al usuario en
español.

## Positions

- AGREE: La postura `test-after` / Minimal-ish y el límite de automatización e2e sobre el DOM
  CloudScape — es la lectura correcta; la lógica aislable del DOM (`parseUnitButtonLabel`,
  `cleanAriaLabel`, validación de JSON, normalización de entrada) es lo testeable y el RPA vivo
  queda en smoke manual.
- AGREE: Tratar `NEVER` reportar éxito en fallo como protección del fix de P3 — correcto, pero el
  borrador no dice *cómo*; mi adición #1 (modelo de error explícito + confirmación por señal
  positiva en `saveService`) le da el mecanismo.
- OBJECT: El borrador deja el monolito de `content.js` como mera deuda observada y no lo eleva a
  práctica de la revivida — propongo adoptar "capa de mapeo extraíble a su propio módulo sin build
  step" como práctica de Way of Working/organización, porque la reversibilidad de la decisión de
  diseño diferida depende de ello (adición #2).
- OBJECT: El borrador deja linter/formatter como pregunta abierta neutra — propongo recomendarlo
  explícitamente (opt-in, standalone, sin build step) porque `no-empty` y detección de código
  muerto atacan directamente P3 y la deuda ya inventariada (adición #3); sigue siendo decisión del
  mantenedor, pero con recomendación, no neutral.
- OBJECT: El borrador deja la convención de idioma "a confirmar" — propongo mandarla ya en
  `Code Style` (inglés para código, español para comentarios/UI), porque es el estado actual
  consistente y sano y formalizarlo es barato y previene deriva (adición #4).
