# Resumen de código — u2-input-parsers

## Qué se construyó

La capa de entrada completa (Zona A, lógica pura) en `aws-calculator-extension/lib/input/`:

| Módulo | Estado | Responsabilidad |
|---|---|---|
| `input-schema.js` | Nuevo | Topes (100 000 caracteres de JSON, 2000 de lenguaje natural, 20 servicios, 30 claves, 100 caracteres por clave o valor, 20 fragmentos de 200 caracteres, 30 s), claves permitidas por nivel (con `template`), claves rechazadas (`__proto__`, `constructor`, `prototype`) y enums de formato, revisión y motivos. |
| `input-errors.js` | Nuevo | Los 28 códigos de `InputError`, mensajes en español en texto plano, `describeFragment` para los fragmentos no interpretados, `NL_PRIVACY_NOTICE` y `failInput`. |
| `json-parser.js` | Completado | `parseJsonText(text)` (tope antes de parsear, `JSON.parse`) y `parseRunInput(data)`, el validador común del esquema cerrado que también valida el `runInput` del cerebro (BR3.3). Devuelve copias nuevas con solo las claves del esquema. |
| `nl-interpreter.js` | Nuevo | `interpretText(text, deps)`: arma `NlInterpretationRequest`, carrera entre el puerto, la señal de la corrida y el tope de 30 s; valida la forma de la respuesta y traduce `BrainCallError.code` a `InputError`. |
| `input-normalizer.js` | Completado | `normalize({ format, text }, { interpretNaturalLanguage, signal })` asíncrono que produce `NormalizedRun` (`source`, `regionDefaulted`, `wafReview`) o un único `InputError`; `toLogEntry` para el registro técnico. |

El llamador `aws-calculator-extension/sidepanel.js` ahora hace `await normalize(...)` con un `AbortController` nuevo por "Generar Estimado" y puerto `null` hasta que U7 conecte el cerebro. Una cancelación no se pinta como error; los demás errores se pintan con `textContent`.

## Pruebas

- Nuevas en `tests/u2/`: `json-parser`, `nl-interpreter`, `input-normalizer`, `input-errors`, `normalize.integration` (dos dobles del puerto) e `imports` (imports acotados, sin red ni `chrome.*`, salidas sin marcado). Las pruebas de `json-parser` e `input-normalizer` de `tests/u1/` se movieron a `tests/u2/` y se adaptaron a la nueva interfaz.
- Línea base antes de editar: 17 archivos, 116 pruebas en verde. Tras U2: 21 archivos, 180 pruebas en verde.
- Cobertura de `lib/input/**`: 99,6 % de líneas y 94,5 % de ramas (umbral propio: 80 % y 80 %). Total del proyecto: 97,9 % de líneas.
- `aidlc engine swarm check u2-input-parsers` (lint, format:check, Vitest con cobertura y check:bundle): `"converged":true`, `"tampered":false`.

## Configuración

- `vitest.config.js`: los cinco módulos de `lib/input/` en `coverage.include` y umbral `"aws-calculator-extension/lib/input/**": { lines: 80, branches: 80 }`. El umbral global no cambió.
- `eslint.config.js`: bloque `inputRules` para `lib/input/**` que extiende `securityRules` y suma `XMLHttpRequest` y `chrome` a `no-restricted-globals` (`fetch` ya venía en la lista base).
- `package.json`: script `"test:u2": "vitest run tests/u2"`.

## Decisiones y desviaciones respecto del plan

1. **Tope propio de 30 s → `timeout`**, como fija el plan aprobado (Step 5), no `brain_unavailable` como decía `security-design.md` NFR8.4. Los requisitos de NFR8.4 en `security-requirements.md` siguen diciendo `brain_unavailable`; conviene alinearlos.
2. **`template` en `ServiceRequest`**: `normalize` copia `template` al `ServiceRequest` solo cuando la configuración lo trae, para que el pedido de u5 no se pierda en la normalización. La forma obligatoria de U1 no cambia y `isServiceRequest` lo acepta. `entities.md` no lista ese atributo; queda para que u5 lo confirme.
3. **`template` inválido** se informa como `invalid_service` con `key: "template"`, porque el enum de `InputError` no tiene `invalid_template` (observación R-03 del review de diseño funcional).
4. **Claves de nivel superior de la respuesta del cerebro**: se valida estrictamente `runInput` y los fragmentos; las claves extra de la respuesta (p. ej. `inventoryVersion`) se ignoran sin error.
5. **Finales de línea del worktree**: el worktree se extrajo con `core.autocrlf=true` (configuración de sistema de Git para Windows), así que todos los archivos quedaron en CRLF y `npm run format:check` fallaba en la línea base para 55 archivos que no son de U2. Se corrió el formateador del proyecto (`npm run format`); los archivos que no son de U2 quedaron byte a byte iguales al contenido de la base (el hash de `.aidlc/base-source-listing.tsv` coincide) y `git diff` no muestra cambios de contenido. Por eso no figuran en `source-manifest.json`.
6. El comando de la unidad (`npx vitest run tests/u2`) ya estaba registrado en `unit-test-instructions.md`; no hizo falta modificarlo.

## Pendiente para otras unidades

- U6: pestañas JSON / lenguaje natural, aviso `NL_PRIVACY_NOTICE`, aviso de región por defecto (`regionDefaulted`) y de corrida sin revisión Well-Architected (`wafReview = not_available`), y entrega de `toLogEntry` al registro de U1.
- U7: implementación real del puerto `interpretNaturalLanguage` vía `BRAIN_CALL`; hasta entonces el panel usa `null`.
- Smoke manual: el camino JSON del walking skeleton debe seguir funcionando igual tras recargar la extensión (`SMOKE.md`, caso canónico EC2).
