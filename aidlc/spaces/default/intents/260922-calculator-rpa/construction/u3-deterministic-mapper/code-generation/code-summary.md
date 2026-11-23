# Resumen de código — u3-deterministic-mapper

Los 12 pasos del plan aprobado están implementados y marcados en `code-generation-plan.md`, en orden test-after (cada capa se implementa y luego se prueba). Prosa en español; identificadores en inglés.

## Archivos creados, modificados y eliminados

**Extensión (`aws-calculator-extension/lib/`)**
- Nuevo `dom/aria-label.js`: `cleanAriaLabel` (FIX-1) como módulo puro de Zona A. `dom/dom-utils.js` la reexporta, así `form-scanner.js` no cambia.
- Completado en sitio `mapping/option-match.js`: se conservan `normalizeText`, `matchOption` y `matchInstanceRow`; se agregan `isPlainNumber` (decimal simple sin unidad, BR2.2), `isUnitKey` / `isUnitFieldType` (clave "<Campo> unit" solo hacia un selector, BR2.3), `toggleState` y `validateFieldValue(fieldType, value, options)` con los motivos `invalid_number`, `option_no_match`, `option_ambiguous` e `invalid_value` (BR2.4, BR2.5).
- Completado en sitio `mapping/deterministic-mapper.js`: `mapDeterministic(domFields, requestedValues, previousOutcome?)` devuelve `MappingOutcome` (`actions`, `pending`, `pass` de 1 a 3, `newActionsInLastPass`, `unresolved`, `residueStatus`). Índice exacto de etiquetas normalizadas (`cleanAriaLabel` + minúsculas + espacios) por "Sección > Campo" y por "Campo"; tabla cerrada `FIELD_TYPE_TO_ACTION`; los ocho motivos de `UnresolvedValue` con `sendable` solo para `no_match` y `option_no_match`; cierre tras 3 pasadas, una pasada sin acciones nuevas o sin pendientes. También `closeOutcome`, `describeUnresolved` (detalle "clave: motivo") y `toLogEntry(outcome, { durationMs })`. Se conservan `fieldNamePart`, `actionTypeFor` y `LABEL_SEPARATOR` para `dom-resolver.js` y `orchestrator.js`.
- Nuevo `mapping/residue-resolver.js`: `buildResidueRequest` (pura; solo servicio, `domFields` del último escaneo, valores pedidos y residuo enviable; más de 500 campos → `form_too_large`) y `resolveResidue(outcome, { serviceName, domFields, requestedValues }, { mapResidue, signal })`.
- `rpa/orchestrator.js`: el escaneo y mapeo únicos se reemplazan por el ciclo M2 (`mapService`): hasta 3 pasadas, aplicando las acciones nuevas antes de reescanear; luego `resolveResidue` con `deps.mapResidue` (`null` hasta que U7 conecte `BRAIN_CALL`). Un residuo final es `field_not_recognized` con el detalle de `describeUnresolved`; la entrada de `toLogEntry` va al registro técnico.

**Tests**
- Movidos de `tests/u1/` a `tests/u3/` y ampliados: `option-match.test.js` (13 casos) y `deterministic-mapper.test.js` (15).
- Nuevos en `tests/u3/`: `fixtures.js` (DomField de EC2 y S3 derivados del inventario, con etiqueta repetida, campo condicional de IOPS y selectores de unidad; respuestas de `/map-residue`; `BrainCallError`), `residue-resolver.test.js` (12), `mapping-cycle.integration.test.js` (2, con dos dobles distintos del puerto), `imports.test.js` (3) y `aria-label.test.js` (3).
- `tests/u1/orchestrator.test.js`: el detalle de `field_not_recognized` pasa a "clave: motivo"; dos casos nuevos (campo condicional en dos pasadas; residuo resuelto por el puerto y residuo sin resolver).

**Configuración**
- `vitest.config.js`: `residue-resolver.js` y `dom/aria-label.js` en `coverage.include`; umbral propio `{ lines: 80, branches: 80 }` para los tres módulos de U3. El umbral global de 80 % de líneas no cambia.
- `eslint.config.js`: las listas base de `securityRules` se extraen a constantes y un bloque para `lib/mapping/**` las extiende con `XMLHttpRequest`, `self.fetch`, `window.XMLHttpRequest` y `chrome.storage`.
- `package.json`: script `test:u3`.

## Decisiones de implementación

- **Cierre y fallo.** Cuando las pasadas cierran con algún motivo no enviable, `actions = []` ya en `mapDeterministic` (el servicio falló, BR3.4). Si todo el residuo es enviable, las acciones se conservan para que `resolveResidue` aplique BR1.4 a las del cerebro; `resolveResidue` es quien deja el resultado final y vacía `actions` ante cualquier residuo.
- **Causa del cerebro no disponible.** `brainErrorCode` guarda solo el `code` del `BrainCallError` (desconocido → `internal_error`). Las causas locales van en el campo `residueDetail`, que se agrega a la entidad: `no_port`, `form_too_large`, `timeout`, `cancelled`, `unexpected_error`. Una respuesta mal formada deja `still_unresolved` con `residueDetail: "invalid_response"`.
- **Tope y cancelación.** Un temporizador propio de 30 s y la señal de la corrida compiten con el puerto (`Promise.race`); el puerto recibe una señal derivada que se aborta al vencer o al cancelar, y una respuesta tardía se ignora. U3 no reintenta. NFR8.5 todavía menciona "a lo sumo un reintento"; se siguen el plan aprobado y `cicd-pipeline.md` (el reintento de `rate_limited` lo hace el service worker de U7).
- **Validación de la respuesta.** Se valida la forma (lista `actions` de tamaño no mayor que las claves enviadas) y luego cada acción: `requestKey` enviado y única acción para esa clave, `fieldLabel` exacto y único en el último escaneo, `actionType` igual al de BR2.1, campo libre y valor válido. Fill, checkbox y toggle deben ser iguales al valor pedido. Los selectores deben estar anclados en las opciones escaneadas: sin opciones, la clave queda `option_no_match`; con una opción distinta de la pedida, la acción lleva `substituted: true` y `requestedValue`.
- **Registro.** `toLogEntry` devuelve una entrada con los campos permitidos por `log-format.js` (`level`, `event: "mapping_outcome"`, `message` con conteos y duración, `value` con el estado y `detail` con "clave: motivo"). No incluye valores pedidos, opciones ni la respuesta del cerebro.

## Cobertura y resultados de las verificaciones

| Comando | Resultado |
|---|---|
| `npx vitest run tests/u1` (línea base, antes de editar) | 17 archivos, 116/116 en verde |
| `npx vitest run tests/u3` | 6 archivos, 48/48 en verde |
| `npx vitest run tests/u3 --coverage --coverage.include=".../{deterministic-mapper,option-match,residue-resolver}.js"` | Líneas 99,55 %, ramas 92,88 %, funciones 100 % (umbral de U3: 80/80) |
| `aidlc engine swarm check u3-deterministic-mapper` (`lint`, `format:check`, `vitest run --coverage`, `check:bundle`) | `converged: true`; 21 archivos, 153/153 tests en verde; total: 97,49 % de líneas y 85,97 % de ramas; `lib/mapping` con 99,56 % de líneas y 93 % de ramas; `check:bundle` OK (30 archivos, sin dependencias de runtime) |

## Desviaciones y notas

- **Finales de línea del worktree.** El checkout del worktree salió con CRLF (`core.autocrlf=true`) y `format:check` fallaba en los 55 archivos antes de cualquier cambio. Se corrió el script del proyecto `npm run format`, que solo convirtió esos archivos a LF. Git no ve diferencias de contenido en ellos (`git diff --stat` lista solo los archivos de U3), así que no figuran en el manifiesto. Los worktrees de u2 y u4 probablemente tienen el mismo problema.
- **Prueba extra.** `tests/u3/aria-label.test.js` no estaba en el plan; cubre el módulo nuevo que entra en `coverage.include`.
- **Pendiente para otras unidades.** U7 debe pasar `mapResidue` en las dependencias de `runEstimate` (`content-main.js`). U5 debe mostrar como aviso las acciones con `substituted` y traducir los motivos al español (functional-spec §4). La verificación sobre calculator.aws la cubre el smoke de U5.
