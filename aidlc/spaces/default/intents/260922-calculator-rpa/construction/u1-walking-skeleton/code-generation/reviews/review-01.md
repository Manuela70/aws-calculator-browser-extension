## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-11-21
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Minor | aws-calculator-extension/lib/dom/dom-resolver.js:83 (startService) y aws-calculator-extension/lib/content-main.js (latido solo vía emitProgress) | El latido (`activeRun.updatedAt`) solo se renueva con cada PROGRESS. `startService` encadena hasta 6 esperas de 20 s (openEstimate, Add service, Search all services, caja de búsqueda, tarjeta, formulario) sin emitir progreso. Con una página lenta una corrida viva puede pasar más de 60 s sin latido: el panel la cierra como `lost` (`closeAsLost`) y luego el content script, que sigue vivo, sobrescribe `lastRunResult` con otro resultado distinto. Falla hacia ERROR y no hacia DONE, pero el panel y el almacenamiento quedan en desacuerdo. Coincide con el diseño (BR6.6 / reliability-design), así que es un hueco del diseño y no del código. | Emitir un PROGRESS (o un latido de `activeRun`) en cada espera larga de `startService`, o un `setInterval` de latido de 15 s en content-main que se detenga al cerrar la corrida. Añadir un test con reloj falso. Alternativa: aceptar el riesgo y documentarlo en SMOKE.md. | New |
| R-02 | Minor | aws-calculator-extension/lib/rpa/result-aggregator.js:55 (estimateMatchesRequest) | La verificación BR5.6 compara el nombre pedido con `getText(row)`, que es el texto completo de la fila (nombre, descripción, región, costo), usando `name.includes(wanted)`. Un servicio guardado que mencione el nombre de otro en su resumen podría satisfacer la comprobación. El conteo exacto limita el riesgo, y los falsos negativos (p. ej. "Amazon S3" frente a "Amazon S3 Glacier") fallan hacia ERROR. Es el único punto donde el contenido del estimado cuenta como evidencia de DONE. | Hacer que `listEstimateServices` devuelva solo el texto de la celda del nombre, y comparar por igualdad exacta normalizada con respaldo a `includes` solo si el smoke lo exige. Añadir un test con una fila cuya descripción contenga otro servicio. | New |
| R-03 | Minor | aws-calculator-extension/lib/content-main.js:60-126 (executeRun / activeRunId) | `activeRunId` se limpia solo al final de `executeRun`, sin `try/finally`. `createLogger`, `logger.start` y el primer `emitProgress` están fuera del `try`. Si alguno lanza, `currentRun` se rechaza sin manejar y la pestaña queda en `busy` hasta recargarla (BR6.1). Es improbable, pero el botón del panel quedaría bloqueado en ERROR "busy" para siempre. | Envolver el cuerpo de `executeRun` en `try/finally` que haga `activeRunId = null`, `closedRunIds.add(runId)` y envíe un `RUN_RESULT` ERROR. Añadir un test con un logger que lance en `start`. | New |
| R-04 | Minor | aws-calculator-extension/content.js (import() con `use_dynamic_url`) y aws-calculator-extension/manifest.json:web_accessible_resources | Riesgo abierto que el constructor ya declaró: no hay verificación en Chrome real de que `import(chrome.runtime.getURL(...))` desde un content script cargue con `use_dynamic_url: true`. Si falla, ninguna corrida arranca; el fallo es visible (`module_load_failed`) y no hay éxito falso. Los 116 tests no pueden cubrirlo. | Ejecutar el smoke S1 antes de cerrar la unidad. Si el módulo no carga, quitar `use_dynamic_url` y registrar la decisión sobre NFR4.3. Dejar el resultado en SMOKE.md. | New |
| R-05 | Minor | aws-calculator-extension/lib/dom/dom-utils.js:cleanAriaLabel y vitest.config.js (coverage.include) | `team.md` incluye `cleanAriaLabel` (FIX-1) en la Zona A testeable. Está en `dom-utils.js`, fuera de `coverage.include` y sin test propio. No bloquea la unidad (FIX-1 pertenece a una unidad posterior), pero esa función pura queda sin piso de cobertura. | Extraer `cleanAriaLabel` a un módulo puro de `lib/`, con test de caso feliz y dos de error, cuando la unidad dueña de FIX-1 lo complete. Hasta entonces, registrar la excepción en el resumen. | New |
| R-06 | Minor | aws-calculator-extension/lib/content-main.js:141 (readDebugFlag) | `globalThis.localStorage` en un content script es el almacenamiento de la página calculator.aws, no el de la extensión. Solo se lee, pero el origen del flag es controlable por la página (dato no confiable). Efecto: activar logs de debug en consola, sin impacto de seguridad. | Leer el flag desde `chrome.storage.local` o dejarlo documentado como solo para desarrollo. | New |

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| npx vitest run --coverage | PASS: 116/116, líneas 96,81 %, ramas 82,9 % | Piso de 80 % de líneas cumplido, medido agregado sobre 19 módulos de Zona A. El umbral no se relajó y no hay exclusiones. |
| npm run lint | PASS, sin errores | `no-empty` (sin catch vacío), `no-eval`, `no-new-func`, prohibición de innerHTML y de fetch activos. Un grep manual no encontró `eval`, `new Function`, `innerHTML` ni catch vacíos. |
| npm run check:bundle | PASS: 28 archivos, sin dependencias de runtime | Cero dependencias de runtime empaquetadas. Sin `package.json` ni `node_modules` dentro del bundle. |

### Verificación de reglas duras

- **DONE solo con evidencia completa:** `finalizeRunResult` es el único productor de DONE. Exige todos los servicios confirmados, contenido del estimado verificado, renombrado válido si hay `project` y URL de `isCalculatorUrl` (https, host `calculator.aws`). `isRunResult` en el panel rechaza un DONE sin URL válida. No encontré ninguna ruta que reporte éxito ante un fallo.
- **Confirmación de guardado:** `saveService` confirma solo con un banner nuevo (no presente antes del clic) que contenga "Successfully added", "estimate" y el nombre del servicio. Detecta `is required` y falla sin reintento (BR4.4, BR4.5). Máximo 3 intentos de 10 s.
- **Corte de 3 minutos:** `createServiceTimer` usa 180000 ms con `AbortController`; `raceWithSignal` resuelve `timedOut` y el resultado tardío se ignora. Todas las esperas y clics reciben el signal y lo comprueban antes de actuar. El timer se limpia en `finally`. Hay test con reloj falso para el corte de 180 s con precisión de 1 s y para el banner tardío ignorado.
- **Registro:** cola única de promesas; escritura inmediata por entrada en trozos de 200; el índice se escribe antes del trozo nuevo (`row.chunks` se actualiza antes de `persistIndex`); un reintento y luego `degraded` sin escribir en el almacenamiento que falló; cierre con vaciado de cola y tope de 5 s; sin escrituras ni PROGRESS tras cerrar.
- **Handshake:** 1 + 3 PING (4 intentos, 1 s de intervalo), una sola inyección, distingue `module_load_failed`, `inject_failed` y `tab_load_timeout`. Cubierto por `handshake.test.js` con la API de Chrome simulada.
- **Guardián busy:** `activeRunId` bloquea una segunda corrida con `reason: busy`. Ver el hallazgo sobre la limpieza sin `finally`.
- **Seguridad:** `sender.id` verificado en `content.js` y en `validateIncomingMessage`; todo texto del panel con `textContent`; enlace solo si `isCalculatorUrl`; sin credenciales, sin `fetch` ni host n8n; `host_permissions` solo `https://calculator.aws/*`; CloudFront muerto eliminado.
- **Idioma:** identificadores en inglés y comentarios y copy de UI en español, de forma consistente en lo revisado.
- **Trazabilidad:** los IDs revisados (BR4.4-BR4.6, BR5.1-BR5.6, BR6.1-BR6.6, NFR8.6, NFR8.12, NFR3.5, NFR3.11) tienen implementación en los módulos nombrados. No encontré un ID que apunte a código inexistente.
- **Zona B:** `dom-resolver.js` y `form-scanner.js` no tienen verificación automática por diseño aprobado. Los selectores vivos y el texto del banner siguen sin comprobar contra la página real; solo el smoke S1-S7 lo cubre y aún no se ejecutó.

### Summary

No encontré defectos Critical ni Major: el veredicto todo-o-nada, la confirmación por banner, el corte de 180 s con cancelación, el registro de un solo escritor y el handshake implementan lo diseñado, y las pruebas ejercen el código real (no hay aserciones vacías ni umbrales relajados). Los seis hallazgos Minor son de robustez (latido sin progreso, verificación por texto de fila, limpieza de `busy`) y de validación pendiente (smoke manual y `import()` con `use_dynamic_url`), que deben cerrarse con el smoke antes de dar la unidad por verificada en Chrome real.

READY
