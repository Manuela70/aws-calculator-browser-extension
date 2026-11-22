**Collaborator:** aidlc-devsecops-agent

## Contribution

Lente de seguridad / DevSecOps sobre el borrador. Inspeccioné de forma
independiente `manifest.json`, `content.js` (líneas 20 y 85) y la CodeKB
(`technology-stack.md`, `dependencies.md`, `architecture.md`,
`code-quality-assessment.md`). Las conclusiones de seguridad del lead son
correctas en lo que afirman; mis aportes añaden rigor de higiene de permisos,
manejo de secretos en el rediseño, y dos reglas duras que faltan (CSP / no
remote code, y cero dependencias de runtime). Para un proyecto vanilla-JS MV3
de un solo mantenedor **sin build step**, el criterio rector es: tooling
mínimo, controles de superficie de ataque obligatorios.

### 1. Lint / static analysis (vale la pena, en forma mínima)

Sí vale la pena, pero debe ser **opcional y compatible con "sin build step"**,
no una regla dura. Recomendación concreta, de menor a mayor fricción:

- **ESLint flat-config standalone** (`eslint.config.js`) ejecutable con `npx`
  sin empaquetar la extensión, con `eslint-plugin-no-unsanitized` (detecta
  `innerHTML`/`insertAdjacentHTML` inseguros — relevante porque `content.js`
  construye DOM) y las reglas base recomendadas. No introduce runtime deps: es
  tooling de desarrollo, no se incluye en el bundle unpacked.
- Alternativa aún más ligera: **Semgrep** con un ruleset pequeño para
  patrones MV3 inseguros (`eval`, `Function(`, `chrome.runtime` sin validación
  de `sender`). Útil justo porque no requiere `package.json`.
- **Gitleaks / git-secrets como pre-commit hook** — este sí lo recomiendo con
  fuerza (ver §2): barato, sin runtime deps, y es la red de seguridad que hace
  cumplible la regla "NEVER hardcode secrets" cuando el rediseño introduzca una
  credencial.

Decisión de *introducir* o no cualquiera de estos es del mantenedor (pregunta
abierta, bien planteada en `evidence.md`). No propongo piso de cobertura ni gate
de CI: no hay CI y el núcleo RPA depende de un DOM de terceros (coincido con la
Testing Posture del lead).

### 2. Manejo de secretos (precisar la regla al rediseño)

Confirmado en el código: `N8N_MAPPER_URL` (línea 20) es una URL de webhook, **no
un secreto**, y `callN8N` (línea 85) **no** envía `Authorization` ni
`x-api-key` — la clave de Claude vive server-side en n8n, fuera del repo. La
afirmación del lead "no secrets hardcoded se respeta hoy" es exacta.

El riesgo aparece **si el mapeo IA se mueve al service worker (alt. B/C'
llamando a Claude/Bedrock directo)**. Ahí una credencial de Claude/Bedrock
tendría que vivir en algún sitio, y **un bundle MV3 unpacked no tiene ningún
almacén seguro**: `chrome.storage`, variables en el service worker y cualquier
archivo del paquete son **legibles por cualquiera que abra la extensión** (y
git versiona el repo). Por tanto:

- Una clave de API de LLM **no puede** vivir en la extensión de forma segura,
  punto. Esto **refuerza el tradeoff**: recrear n8n (o cualquier proxy
  server-side) mantiene la clave fuera del cliente y es la opción segura por
  defecto para credenciales. Mover la IA al cliente solo es seguro si **no hay
  clave de larga vida en el cliente** (p. ej. Bedrock vía credenciales
  federadas de corta vida / un proxy que firme, nunca una clave estática
  embebida).
- Propongo **endurecer** la regla del lead para que nombre explícitamente
  `chrome.storage` y el service worker como lugares NO seguros, no solo "el
  repo/bundle".

### 3. Higiene de permisos del manifest (P4 — subir a regla dura)

Verificado contra `manifest.json`: `host_permissions` declara el host muerto
`https://dnd5zrqcec4or.cloudfront.net/*` (no referenciado por ningún código) y
**omite** el host n8n al que `content.js` hace `fetch`. El lead ya tiene la
regla ALWAYS de declarar todo host de `fetch`; falta su **complemento de mínimo
privilegio**: declarar **solo** los hosts efectivamente usados y eliminar los
muertos. Hoy la eliminación del CloudFront aparece como recomendación en la
CodeKB, pero como **regla de prácticas** debería ser dura: todo permiso
declarado y no usado es superficie de ataque gratis.

### 4. Dependencias / cadena de suministro (preservar como práctica)

Confirmado: cero librerías de terceros, sin `node_modules/`, sin
`package.json`. Es un estado de seguridad **valioso** (superficie de suministro
= 0) y vale la pena preservarlo explícitamente como regla: no introducir
dependencias de **runtime** empaquetadas sin revisión y aprobación del
mantenedor. Tooling de **desarrollo** (linter, hooks) queda fuera de esta regla
porque no entra al bundle.

### 5. Reglas ALWAYS / NEVER que añadiría

Marcadores `ALWAYS` / `NEVER` en inglés; descripción en español.

**Mandated (añadir):**

- **ALWAYS** declarar en `host_permissions` **únicamente** los hosts a los que
  el código hace `fetch` y eliminar los no usados (mínimo privilegio).
  Evidencia: `https://dnd5zrqcec4or.cloudfront.net/*` es un host muerto no
  referenciado (P4); todo permiso sobrante es superficie de ataque.
- **ALWAYS** mantener **cero dependencias de runtime empaquetadas** salvo
  revisión y aprobación explícita del mantenedor. Evidencia: hoy no hay
  librerías de terceros ni `node_modules/`; preservarlo mantiene la superficie
  de cadena de suministro en cero.

**Forbidden (añadir / endurecer):**

- **NEVER** colocar una credencial de larga vida (clave de API de Claude,
  Bedrock, u otra) en **ningún** artefacto legible del cliente: código del
  bundle, `chrome.storage`, variables del service worker, ni git. Endurece la
  regla del lead nombrando los almacenes del cliente, no solo "el repo". Si el
  rediseño mueve la IA al cliente, la credencial debe ser server-side (proxy /
  n8n) o de corta vida federada; nunca estática embebida.
- **NEVER** introducir ejecución de código remoto ni dinámico en la extensión:
  `eval`, `new Function()`, `<script src>` remoto, o inyección de HTML sin
  sanitizar (`innerHTML` con datos de red). Evidencia: MV3 ya prohíbe remote
  code por política de CSP de extensión; declararlo como regla protege contra
  una regresión al rediseñar el camino de red/IA y contra XSS vía respuestas
  del "cerebro".

### 6. ¿El set del lead es el correcto?

Las dos reglas del lead ("ALWAYS declarar todo host de `fetch`" y "NEVER
hardcode secrets") son correctas y bien evidenciadas, pero **insuficientes**
para la lente de seguridad: faltan (a) el complemento de mínimo privilegio
(solo hosts usados / eliminar muertos), (b) nombrar los almacenes del cliente
como no seguros, (c) no-remote-code / CSP, y (d) cero runtime deps. Con esos
cuatro añadidos, el set queda completo para un MV3 unpacked.

## Positions

- AGREE: regla ALWAYS "declarar en `host_permissions` todo host de `fetch`" — verificada contra `manifest.json`/`content.js`; es la raíz de P1 y está bien capturada.
- AGREE: regla NEVER "no hardcodear secretos" y el análisis de que hoy la clave de Claude vive en n8n fuera del repo — confirmado en `content.js` (sin header de auth en `callN8N`).
- AGREE: Testing Posture sin piso de cobertura e2e automatizado — correcto dado el DOM de terceros no determinista (P2); el linter/hooks que propongo no contradice esto (es dev tooling, no cobertura).
- OBJECT: la eliminación del host muerto CloudFront queda solo como hallazgo de CodeKB y no como regla dura — debería ser Mandated (mínimo privilegio: solo hosts usados), porque P4 es un defecto de seguridad activo, no una observación.
- OBJECT: la regla de secretos nombra solo "el código/repo" como lugar inseguro — debe endurecerse para cubrir `chrome.storage` y el service worker, que también son legibles en un bundle unpacked; es exactamente el riesgo si la IA se mueve al cliente.
- OBJECT: falta una regla dura contra remote/dynamic code execution y a favor de CSP, y una regla de cero dependencias de runtime — ambas son prácticas de seguridad estándar de MV3 que el borrador no recoge.
