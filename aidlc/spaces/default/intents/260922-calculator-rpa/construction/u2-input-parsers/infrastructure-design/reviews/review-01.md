## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-21
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/260922-calculator-rpa/construction/u2-input-parsers/infrastructure-design/cicd-pipeline.md > §3 grupo "Estructura"; traceability.json > NFR7.1 | La única verificación de que los módulos de U2 no importan fuera de `lib/input/**` y `lib/messages*.js` es una "revisión del grafo de imports", sin mecanismo automático. `scripts/check-bundle.js` solo rechaza especificadores que no son relativos (paquetes, `node_modules`, `<script src>` remoto); un `import "../mapping/..."` o un import de U4 pasa sin falla. Aun así NFR7.1 figura como `OK` y ningún paso del workflow lo hace cumplir. | Definir un test concreto en `tests/u2/` (por ejemplo, leer los `import` de cada archivo de `lib/input/` y exigir que resuelvan solo a `lib/input/**` o `lib/messages*.js`), o ampliar `check-bundle.js` con esa regla, y nombrarlo en §2 o §3 como el mecanismo de NFR7.1. | New |
| R-02 | Minor | aidlc/spaces/default/intents/260922-calculator-rpa/construction/u2-input-parsers/infrastructure-design/traceability.json > NFR3.6 | El target de NFR3.6 dice "registro técnico de u1 en chrome.storage.local (toLogEntry)". Pero NFR3.6 (`nfr-requirements/security-requirements.md`) exige que U2 no produzca HTML, con verificación "`lib/input/**` no genera marcado". El target describe otro requisito y esa verificación no aparece en el pipeline. | Corregir el target de NFR3.6. La regla de lint contra `innerHTML` ya cubre parte; añadir al test de estructura que `lib/input/**` no contenga `innerHTML`/marcado, o dejar la verificación por revisión con dueño explícito. | New |
| R-03 | Minor | aidlc/spaces/default/intents/260922-calculator-rpa/construction/u2-input-parsers/infrastructure-design/traceability.json > NFR1.1; cicd-pipeline.md > §3 | NFR1.1 queda como `N/A`. Su verificación (`tech-stack-decisions.md`) es un test que pasa con dos dobles distintos del puerto y sin imports de U4 en `lib/input/**`. Ninguno de los dos aparece en la tabla de pruebas de §3. | Agregar ambos casos a §3 y apuntar NFR1.1 a ellos (estado `OK`, no `N/A`). | New |
| R-04 | Minor | aidlc/spaces/default/intents/260922-calculator-rpa/construction/u2-input-parsers/infrastructure-design/cicd-pipeline.md > §1 fila "Umbral propio de U2" | El comportamiento de Vitest con umbrales por glob no está dicho. Con una clave de glob, los archivos que coinciden salen del agregado global `lines: 80` y se evalúan solo contra su propio umbral. `json-parser.js` e `input-normalizer.js` ya están en `coverage.include` y salen del agregado de u1. Además, `nfr-design/logical-components.md` dice "`coverage.include` limitado a `lib/input/**`", lo que contradice añadir a la lista común. | Aclarar en §1 que los archivos de U2 salen del agregado global y que la lista `include` es la común. Alinear la frase de `logical-components.md`. Confirmar que `vitest.config.js` cambiado conserva `lines: 80` global. | New |
| R-05 | Minor | aidlc/spaces/default/intents/260922-calculator-rpa/construction/u2-input-parsers/infrastructure-design/cicd-pipeline.md > §1 fila "Pruebas de U2"; package.json | Los módulos `json-parser.js` e `input-normalizer.js` ya existen con tests en `tests/u1/`. El diseño no dice si esas pruebas migran a `tests/u2/` o conviven. Tampoco da dueño ni frecuencia a la brecha de ramas de `lib/input/**` (línea base actual de `json-parser.js`: 90 % ramas; ver informe `coverage/`). | Indicar que `tests/u1/*parser*` y `*normalizer*` siguen contando para el umbral de U2, o moverlos. Nombrar al mantenedor como dueño que revisa el informe `coverage/` en cada push. | New |

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| `npx vitest run --coverage` (árbol actual) | PASS: 17 archivos, 116 tests; agregado líneas 93,74 %, ramas 82,9 %; `json-parser.js` 91,66 % líneas, 90 % ramas | La base de u1 está verde. El umbral `branches` por carpeta de U2 es alcanzable para los dos módulos existentes. Los tres módulos nuevos (`input-schema.js`, `nl-interpreter.js`, `input-errors.js`) aún no existen y no están medidos. |
| `.github/workflows/ci.yml` vs. §2 | Coincide: 7 pasos en el mismo orden, `contents: read`, sin secretos | U2 no necesita workflow nuevo. |
| `package.json` scripts | `test:u2` aún no existe; `lint` y `format:check` ya cubren `tests/` | El diseño lo declara como cambio pendiente de Code Generation. Consistente. |

### Summary

U2 es una biblioteca sin infraestructura: el diseño correcto es reutilizar el pipeline de u1 con un umbral por carpeta, y así lo hace, con cambios coherentes con `ci.yml`, `vitest.config.js` y `package.json`. La brecha principal es que las restricciones de importación (NFR7.1, y por extensión NFR1.1 y NFR3.6) no tienen verificación automática en el pipeline aunque se marcan como cubiertas; el resto son ajustes de trazabilidad.
