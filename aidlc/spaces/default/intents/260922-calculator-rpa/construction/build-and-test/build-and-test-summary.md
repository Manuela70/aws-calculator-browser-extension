# Resumen de Build and Test — calculator-rpa

> Estrategia de pruebas: Standard. Alcance: `rpa-extension-full-lifecycle`, siete unidades integradas en `main` (`9d76f46`). Todas las pruebas automáticas corren en **Node con Vitest**; nada corrió en un navegador real ni en un DOM emulado.

## 1. Estado del build y prerrequisitos

- **Build: correcto.** Lint, `check:selectors`, formato, `check:bundle`, `npm audit` y `cdk synth` sin conexión terminan con código 0 (detalle en `test-results.md` §1).
- **Prerrequisitos:** Node LTS, `npm ci` en la raíz, `brain/` e `infra/`; Chrome 130 o posterior para el smoke manual. No hace falta ninguna credencial de AWS.
- **Correcciones hechas dentro de la etapa:**
  - `.gitattributes` con fin de línea LF y `npm run format`: `format:check` fallaba solo por CRLF.
  - Script `check:selectors` en `package.json`: lo pedía el diseño de U5 y no existía.
  - Casos R10 y R11 en `SMOKE.md`: faltaban para u5-NFR3.3, u5-NFR8.4 y u1-NFR8.6.
  - Registros de trazabilidad de U2 y U4.

## 2. Tipos de prueba generados

| Tipo | Archivo | Corrió aquí |
|---|---|---|
| Unitarias por unidad | `construction/<unidad>/code-generation/unit-test-instructions.md` | Sí, Node |
| Integración entre unidades | `integration-test-instructions.md` | Sí, Node |
| Smoke manual en navegador | `aws-calculator-extension/SMOKE.md` (S1-S15, R1-R11, P1-P8) | No: requiere Chrome con la extensión cargada |
| Rendimiento y seguridad dedicados | no se generan en la estrategia Standard | — |

## 3. Cobertura esperada

| Ámbito | Piso | Medido |
|---|---|---|
| Proyecto (suite completa) | 80 % líneas | 98,63 % líneas, 91,82 % ramas |
| U2 `lib/input/**` | 80 % líneas y ramas | 99,64 % / 94,46 % |
| U3 mapeo (3 módulos) | 80 % líneas y ramas | 99,55 % / 92,88 % |
| U4 `brain/core/**` | 80 % líneas y ramas | 98,58 % / 91,85 % |
| U5 Zona A (6 módulos) | 80 % líneas y ramas | 100 % / 96,27 % |
| U6 Zona A (7 módulos) | 80 % líneas y ramas | 98,10 % / 88,37 % |
| U7 `sw/**` y `brain-port.js` | 80 % líneas y ramas | 96,84 % / 94,58 % |

## Target Verification Matrix

Abreviaturas de Evidence:
- `suite`: `npx vitest run --coverage`, exit 0, 626 pruebas.
- `lint`: `npm run lint`, exit 0.
- `bundle`: `npm run check:bundle`, exit 0.
- `synth`: `cdk synth --no-lookups`, exit 0.
- `smoke <caso>`: caso manual de `SMOKE.md` sin ejecución registrada.

Owning Stage:
- `build-and-test`: esta etapa.
- `deployment-execution`: cuando exige el cerebro desplegado.
- `manual (navegador)`: cuando exige Chrome real.

Los objetivos `ci` son `N/A` en su parte de CI porque el plan no ejecuta CI Pipeline; su parte local se verificó aquí.

### U1 — walking skeleton

| Target ID | Source | Expected | Actual | Evidence | Owning Stage | Verdict |
|---|---|---|---|---|---|---|
| u1-NFR8.4 | u1/NR/performance-requirements.md | Handshake 1+3 PING a 1 s; guardado 3×10 s; esperas 20 s | Cumple | tests/u1/retry-wait-timer.test.js, handshake.test.js; suite | build-and-test | Met |
| u1-NFR8.5 | u1/NR/performance-requirements.md | Progreso por paso; latido vencido a 60 s → `lost` | Lógica probada en Node; sin corrida real | tests/u1/heartbeat.test.js; smoke S5 | manual (navegador) | Unverified |
| u1-NFR8.6 | u1/NR/performance-requirements.md | Corte de 180 s por servicio, ±1 s | Cumple con reloj falso | tests/u1/retry-wait-timer.test.js; suite | build-and-test | Met |
| u1-NFR8.7 | u1/NR/performance-requirements.md | Corrida canónica de EC2 ≤180 s | Sin corrida real | smoke S1 | manual (navegador) | Unverified |
| u1-NFR8.8 | u1/NR/performance-requirements.md; ND/performance-design.md §1 | Retardos ≤1,5 s; esperas ≤20 s | Constantes `DELAY` dentro del tope | lib/rpa/wait.js; lint | build-and-test | Met |
| u1-NFR1.1 | u1/NR/reliability-requirements.md | Sin `fetch` en el content script | Cumple | lint; bundle | build-and-test | Met |
| u1-NFR2.1 | u1/NR/reliability-requirements.md | Selectores solo en la tabla de selectores | Cumple | lint; check:selectors; tests/u5/eslint-config.test.js | build-and-test | Met |
| u1-NFR2.2 | u1/NR/reliability-requirements.md | Selector fallido → resultado tipado | Cumple | tests/u1/orchestrator.test.js; suite | build-and-test | Met |
| u1-NFR3.1 | u1/NR/reliability-requirements.md | URL solo si todo se confirmó | Cumple | tests/u1/result-aggregator.test.js; suite | build-and-test | Met |
| u1-NFR3.2 | u1/NR/reliability-requirements.md | Sin catch vacío; excepción → `unexpected_error` | Cumple | lint (`no-empty`) | build-and-test | Met |
| u1-NFR6.1 | u1/NR/reliability-requirements.md | ≥80 % de líneas en Zona A | 98,63 % en la suite | suite | build-and-test | Met |
| u1-NFR6.2 | u1/NR/reliability-requirements.md | Smoke canónico, fallo, estimado previo, reapertura | Casos escritos, sin ejecución | smoke S1-S5 | manual (navegador) | Unverified |
| u1-NFR8.12 | u1/NR/reliability-requirements.md | Toda corrida termina; sin escrituras tras cerrar | Cumple | tests/u1/content-main.test.js, retry-wait-timer.test.js; suite | build-and-test | Met |
| u1-NFR8.13 | u1/NR/reliability-requirements.md | Fallo de `import()` → "recarga la pestaña" | Parcial en Node | smoke S6 | manual (navegador) | Unverified |
| u1-NFR4.1 | u1/NR/security-requirements.md | `permissions` exactas | 6 permisos | tests/u1/manifest.test.js; bundle | build-and-test | Met |
| u1-NFR4.2 | u1/NR/security-requirements.md | Solo calculator.aws; sin CloudFront | Cumple | bundle; tests/u1/manifest.test.js | build-and-test | Met |
| u1-NFR4.3 | u1/NR/security-requirements.md | Recursos accesibles solo `lib/*` para calculator.aws, URL dinámica | Cumple | bundle (bundle-policy.json) | build-and-test | Met |
| u1-NFR4.4 | u1/NR/security-requirements.md | `unlimitedStorage` justificado | Justificado | u1/NR/tech-stack-decisions.md | build-and-test | Met |
| u1-NFR4.5 | u1/NR/security-requirements.md | Sin `default_popup` | Cumple | tests/u1/manifest.test.js | build-and-test | Met |
| u1-NFR5.1 | u1/NR/security-requirements.md | Sin credenciales en bundle/storage/git | Cumple | bundle (`scanSecrets`) | build-and-test | Met |
| u1-NFR5.2 | u1/NR/security-requirements.md | Registro con campos permitidos | Cumple | tests/u1/log-format.test.js; suite | build-and-test | Met |
| u1-NFR5.3 | u1/NR/security-requirements.md | Borrar desde el panel vacía las claves | Sin corrida real | smoke S7 | manual (navegador) | Unverified |
| u1-NFR5.4 | u1/NR/security-requirements.md | Sin eval/new Function/innerHTML | Cumple | lint; tests/u6/eslint-panel.test.js | build-and-test | Met |
| u1-NFR5.5 | u1/NR/security-requirements.md | `import()` solo vía `chrome.runtime.getURL('lib/...')` | Cumple en código; carga real sin probar | content.js; smoke S9 | manual (navegador) | Unverified |
| u1-NFR5.6 | u1/NR/security-requirements.md | Valida `sender.id` y `runId` | Cumple | tests/u1/messages-validation.test.js, content-main.test.js; suite | build-and-test | Met |
| u1-NFR5.7 | u1/NR/security-requirements.md | Enlace de Share con prefijo calculator.aws | Cumple | tests/u1/messages-validation.test.js; suite | build-and-test | Met |
| u1-NFR5.8 | u1/NR/security-requirements.md | Cero dependencias de runtime | Cumple | bundle | build-and-test | Met |
| u1-NFR3.3 | u1/NR/observability-requirements.md | Panel en español, sin códigos técnicos | Textos probados en Node | tests/u6/messages-es.test.js; smoke S1, S2 | manual (navegador) | Unverified |
| u1-NFR3.4 | u1/NR/observability-requirements.md | Tamaño del registro, exportar, borrar | Sin corrida real | smoke S7 | manual (navegador) | Unverified |
| u1-NFR3.5 | u1/NR/observability-requirements.md | Entradas con seq, ts, nivel; run_start/run_end | Cumple | tests/u1/log-format.test.js; suite | build-and-test | Met |
| u1-NFR3.6 | u1/NR/observability-requirements.md; ND/observability-design.md §2 | Escritura inmediata, un escritor, en orden | Cumple | tests/u1/run-logger.test.js; suite | build-and-test | Met |
| u1-NFR3.7 | u1/NR/observability-requirements.md | Retención hasta borrado manual | Sin corrida real | smoke S7 | manual (navegador) | Unverified |
| u1-NFR3.8 | u1/NR/observability-requirements.md | Exportar `.json` | Sin corrida real | smoke S7 | manual (navegador) | Unverified |
| u1-NFR3.9 | u1/NR/observability-requirements.md | Prefijo `[aws-calc]` | Cumple | tests/u1/log-format.test.js; suite | build-and-test | Met |
| u1-NFR3.10 | u1/NR/observability-requirements.md | Registro sin credenciales | Cumple | tests/u1/log-format.test.js; suite | build-and-test | Met |
| u1-NFR3.11 | u1/NR/observability-requirements.md | Índice: alta, baja, reparación | Cumple | tests/u1/log-index.test.js; suite | build-and-test | Met |
| u1-NFR8.9 | u1/NR/scalability-requirements.md | Una corrida a la vez (`busy`) | Cumple | tests/u1/content-main.test.js; suite | build-and-test | Met |
| u1-NFR8.10 | u1/NR/scalability-requirements.md | Al abrir lee solo el índice | Cumple | tests/u6/history-store.test.js; suite | build-and-test | Met |
| u1-NFR8.11 | u1/NR/scalability-requirements.md | Una clave por corrida | Cumple | tests/u1/run-logger.test.js, log-index.test.js; suite | build-and-test | Met |
| u1-NFR7.1 | u1/NR/tech-stack-decisions.md | Carga unpacked sin build | Sin build; carga real sin probar | bundle; smoke S8 | manual (navegador) | Unverified |
| u1-NFR7.2 | u1/NR/tech-stack-decisions.md | Solo panel lateral | Cumple | tests/u1/manifest.test.js | build-and-test | Met |
| u1-NFR7.3 | u1/NR/tech-stack-decisions.md | `minimum_chrome_version` ≥116 | 130 (lo subieron U5 y U7) | tests/u1/manifest.test.js | build-and-test | Met |
| u1-D1 | u1/ND/scalability-design.md §2 | Trozos de ≤200 entradas | Cumple | tests/u1/run-logger.test.js; suite | build-and-test | Met |
| u1-D2 | u1/ND/observability-design.md §2 | 1 reintento de escritura, luego `degraded` | Cumple | tests/u1/run-logger.test.js; suite | build-and-test | Met |

### U2 — entrada

| Target ID | Source | Expected | Actual | Evidence | Owning Stage | Verdict |
|---|---|---|---|---|---|---|
| u2-NFR3.1 | u2/NR/security-requirements.md | Entrada inválida → `InputError` tipado | Cumple | tests/u2/input-errors.test.js, input-normalizer.test.js; suite | build-and-test | Met |
| u2-NFR3.2 | u2/NR/security-requirements.md | Respuesta inválida → `nl_invalid_response` | Cumple | tests/u2/nl-interpreter.test.js, normalize.integration.test.js; suite | build-and-test | Met |
| u2-NFR3.3 | u2/NR/security-requirements.md | Solo `JSON.parse`; esquema cerrado | Cumple | tests/u2/json-parser.test.js; lint | build-and-test | Met |
| u2-NFR3.4 | u2/NR/security-requirements.md | Topes 100 000 / 2000 / 20 / 30 / 100 | Cumple | tests/u2/json-parser.test.js; suite | build-and-test | Met |
| u2-NFR3.5 | u2/NR/security-requirements.md | Rechaza `__proto__`, `constructor`, `prototype` | Cumple | tests/u2/json-parser.test.js; suite | build-and-test | Met |
| u2-NFR3.6 | u2/NR/security-requirements.md | `lib/input/**` sin marcado | Cumple | tests/u2/imports.test.js; suite | build-and-test | Met |
| u2-NFR4.1 | u2/NR/security-requirements.md | Sin fetch/XHR/chrome | Cumple | lint; tests/u2/imports.test.js | build-and-test | Met |
| u2-NFR5.1 | u2/NR/security-requirements.md | Sin credenciales | Cumple | bundle | build-and-test | Met |
| u2-NFR5.2 | u2/NR/security-requirements.md | Aviso de privacidad visible | Sin corrida real | smoke P1 | manual (navegador) | Unverified |
| u2-NFR5.3 | u2/NR/security-requirements.md | Registro sin texto ni fragmentos | Cumple | tests/u2/input-normalizer.test.js; suite | build-and-test | Met |
| u2-NFR5.4 | u2/NR/security-requirements.md | JSON rechazado completo; aceptado solo conteos | Cumple | tests/u2/input-normalizer.test.js; suite | build-and-test | Met |
| u2-NFR5.5 | u2/NR/security-requirements.md | Registro solo en `storage.local` | Cumple | lint (prohíbe `storage.sync`) | build-and-test | Met |
| u2-NFR8.4 | u2/NR/security-requirements.md | Tope de 30 s en la interpretación | Cumple con reloj falso (código `timeout`) | tests/u2/nl-interpreter.test.js; suite | build-and-test | Met |
| u2-NFR8.5 | u2/NR/security-requirements.md | Abortar → `cancelled`; respuesta tardía descartada | Cumple | tests/u2/nl-interpreter.test.js; suite | build-and-test | Met |
| u2-NFR1.1 | u2/NR/tech-stack-decisions.md | Pasa con dos dobles del puerto | Cumple | tests/u2/normalize.integration.test.js; suite | build-and-test | Met |
| u2-NFR6.1 | u2/NR/tech-stack-decisions.md | `lib/input/**` ≥80 % líneas y ramas (en CI) | 99,64 % / 94,46 %; CI: N/A, el plan no ejecuta CI Pipeline | `npx vitest run tests/u2 --coverage …` exit 0 | build-and-test | Met |
| u2-NFR6.2 | u2/NR/tech-stack-decisions.md | Node, sin red ni jsdom | Cumple | vitest.config.js (`environment: node`) | build-and-test | Met |
| u2-NFR7.1 | u2/NR/tech-stack-decisions.md | Módulos ES consumidos solo por import | Cumple | tests/u2/imports.test.js; suite | build-and-test | Met |
| u2-NFR7.2 | u2/NR/tech-stack-decisions.md | `check:bundle` en verde (en CI) | Verde; CI: N/A, el plan no ejecuta CI Pipeline | bundle | build-and-test | Met |

### U3 — mapeo

| Target ID | Source | Expected | Actual | Evidence | Owning Stage | Verdict |
|---|---|---|---|---|---|---|
| u3-NFR2.1 | u3/NR/security-requirements.md | Etiqueta ausente o repetida → `no_match` / `ambiguous_label` | Cumple | tests/u3/deterministic-mapper.test.js; suite | build-and-test | Met |
| u3-NFR2.2 | u3/NR/security-requirements.md | Tipo desconocido → `unsupported_type` | Cumple | tests/u3/deterministic-mapper.test.js; suite | build-and-test | Met |
| u3-NFR3.1 | u3/NR/security-requirements.md | Residuo final → `actions=[]` | Cumple | tests/u3/deterministic-mapper.test.js; suite | build-and-test | Met |
| u3-NFR3.2 | u3/NR/security-requirements.md | Acción inválida del cerebro se descarta | Cumple | tests/u3/residue-resolver.test.js; suite | build-and-test | Met |
| u3-NFR3.3 | u3/NR/security-requirements.md | Sustitución marcada | Cumple | tests/u3/residue-resolver.test.js; suite | build-and-test | Met |
| u3-NFR4.1 | u3/NR/security-requirements.md | Sin fetch/XHR/chrome | Cumple | lint; tests/u3/imports.test.js | build-and-test | Met |
| u3-NFR5.1 | u3/NR/security-requirements.md | Sin credenciales | Cumple | bundle | build-and-test | Met |
| u3-NFR5.2 | u3/NR/security-requirements.md | El pedido lleva solo residuo y domFields | Cumple | tests/u3/residue-resolver.test.js; suite | build-and-test | Met |
| u3-NFR5.3 | u3/NR/security-requirements.md | Más de 500 domFields → `form_too_large` sin llamar al puerto | Cumple | tests/u3/residue-resolver.test.js; suite | build-and-test | Met |
| u3-NFR5.4 | u3/NR/security-requirements.md | Registro con conteos | Cumple | tests/u3/deterministic-mapper.test.js; suite | build-and-test | Met |
| u3-NFR8.4 | u3/NR/security-requirements.md | Tope de 3 pasadas | Cumple | tests/u3/deterministic-mapper.test.js; suite | build-and-test | Met |
| u3-NFR8.5 | u3/NR/security-requirements.md; ND/security-design.md | Tope de 30 s; sin reintentos | Cumple | tests/u3/residue-resolver.test.js; suite | build-and-test | Met |
| u3-NFR1.1 | u3/NR/tech-stack-decisions.md | Sin imports de U4; pasa con dos dobles | Cumple | tests/u3/mapping-cycle.integration.test.js, imports.test.js; suite | build-and-test | Met |
| u3-NFR6.1 | u3/NR/tech-stack-decisions.md | Mapeo ≥80 % líneas y ramas (en CI) | 99,55 % / 92,88 %; CI: N/A, el plan no ejecuta CI Pipeline | `npx vitest run tests/u3 --coverage …` exit 0 | build-and-test | Met |
| u3-NFR6.2 | u3/NR/tech-stack-decisions.md | Node, temporizadores falsos | Cumple | tests/u3/residue-resolver.test.js; suite | build-and-test | Met |
| u3-NFR7.1 | u3/NR/tech-stack-decisions.md | No conoce el DOM | Cumple | tests/u3/imports.test.js; suite | build-and-test | Met |
| u3-NFR7.2 | u3/NR/tech-stack-decisions.md | `check:bundle` en verde (en CI) | Verde; CI: N/A, el plan no ejecuta CI Pipeline | bundle | build-and-test | Met |

### U4 — cerebro

| Target ID | Source | Expected | Actual | Evidence | Owning Stage | Verdict |
|---|---|---|---|---|---|---|
| u4-NFR8.4 | u4/NR/performance-requirements.md | Operación ≤25 s, luego 504 `timeout` | Cumple con reloj falso | tests/u4/gateway-loader-ops.test.js; suite | build-and-test | Met |
| u4-NFR8.5 | u4/NR/performance-requirements.md | `/interpret` y `/map-residue` p95 ≤12 s con 3 corridas | Sin cerebro desplegado | — | deployment-execution | Unverified |
| u4-NFR8.6 | u4/NR/performance-requirements.md; ND/performance-design.md §5 | `/waf-evaluate` p95 ≤12 s (5) y ≤18 s (20) | Lotes de 5 probados; latencia real sin medir | tests/u4/gateway-loader-ops.test.js | deployment-execution | Unverified |
| u4-NFR8.7 | u4/NR/performance-requirements.md | Primera operación tras 30 min ≤20 s | Sin cerebro desplegado | — | deployment-execution | Unverified |
| u4-NFR1.4 | u4/NR/reliability-requirements.md | 99,5 % mensual por sonda | Lógica de la sonda probada; disponibilidad sin medir | tests/u4/jobs.test.js | deployment-execution | Unverified |
| u4-NFR1.5 | u4/NR/reliability-requirements.md | ≥2 zonas, sin punto único de fallo | 2 tareas en 2 zonas | tests/u4/infra.test.js; synth | build-and-test | Met |
| u4-NFR1.6 | u4/NR/reliability-requirements.md | Sin inventario o modelo → 503 tipado | Cumple | tests/u4/server.test.js, gateway-loader-ops.test.js; suite | build-and-test | Met |
| u4-NFR1.7 | u4/NR/reliability-requirements.md | 1 reintento tras 1-2 s | Cumple | tests/u4/gateway-loader-ops.test.js; suite | build-and-test | Met |
| u4-NFR1.8 | u4/NR/reliability-requirements.md | Activación atómica y última versión buena | Cumple | tests/u4/gateway-loader-ops.test.js, jobs.test.js; suite | build-and-test | Met |
| u4-NFR1.9 | u4/NR/reliability-requirements.md | Inventario de más de 14 días con alarma | Cumple | tests/u4/gateway-loader-ops.test.js, infra.test.js; suite | build-and-test | Met |
| u4-NFR5.1 | u4/NR/security-requirements.md | IAM solo `InvokeModel` del modelo; sin secretos | Cumple | tests/u4/infra.test.js; synth; bundle | build-and-test | Met |
| u4-NFR5.2 | u4/NR/security-requirements.md | Bearer obligatorio; token ≤60 min | Cumple | tests/u4/auth-usage.test.js, server.test.js; suite | build-and-test | Met |
| u4-NFR5.3 | u4/NR/security-requirements.md | Token en `storage.session`, ilegible por el content script | Entregado por U7; lógica probada; lectura real sin probar | tests/u7/session.test.js; smoke S11 | manual (navegador) | Unverified |
| u4-NFR5.4 | u4/NR/security-requirements.md | Firma, emisor, cliente y `exp` → 401 | Cumple | tests/u4/auth-usage.test.js; suite | build-and-test | Met |
| u4-NFR5.5 | u4/NR/security-requirements.md | Registros sin texto ni salida del modelo | Cumple | tests/u4/error-log.test.js, server.test.js; suite | build-and-test | Met |
| u4-NFR4.1 | u4/NR/security-requirements.md; ND/security-design.md | 3 roles sin comodines | Un solo comodín (`ecr:GetAuthorizationToken`, que AWS exige así) | tests/u4/infra.test.js; synth | build-and-test | Met |
| u4-NFR4.2 | u4/NR/security-requirements.md | La extensión declara solo hosts del cerebro y del IdP | Cumple | bundle; tests/u7/check-bundle.test.js | build-and-test | Met |
| u4-NFR1.1 | u4/NR/security-requirements.md | CORS solo `chrome-extension://<id>` | Cumple | tests/u4/server.test.js; suite | build-and-test | Met |
| u4-NFR1.2 | u4/NR/security-requirements.md | Topes C1-C3; cuerpo ≤256 KB | Cumple | tests/u4/request-validators.test.js, server.test.js; suite | build-and-test | Met |
| u4-NFR1.3 | u4/NR/security-requirements.md | Salida validada; 1 reintento y `empty_result` | Cumple | tests/u4/output-validators.test.js, gateway-loader-ops.test.js; suite | build-and-test | Met |
| u4-NFR3.1 | u4/NR/security-requirements.md | 60 operaciones/min por SE → 429 | Cumple | tests/u4/auth-usage.test.js, server.test.js; suite | build-and-test | Met |
| u4-NFR3.2 | u4/NR/security-requirements.md | Tope diario → 429 `daily_quota_exceeded` | Cumple | tests/u4/auth-usage.test.js; suite | build-and-test | Met |
| u4-NFR3.6 | u4/NR/observability-requirements.md | Log JSON con lista blanca y `seHash` | Cumple | tests/u4/error-log.test.js; suite | build-and-test | Met |
| u4-NFR3.7 | u4/NR/observability-requirements.md | Métricas por operación y tablero | Tablero sintetizado; EMF probado | tests/u4/infra.test.js, error-log.test.js; synth | build-and-test | Met |
| u4-NFR3.8 | u4/NR/observability-requirements.md; ND/observability-design.md | Alarmas disparadas en simulación | Alarmas existen; disparo sin probar | tests/u4/infra.test.js | deployment-execution | Unverified |
| u4-NFR3.9 | u4/NR/observability-requirements.md | `requestId` de punta a punta con error forzado | Parcial en Node | tests/u4/server.test.js, tests/u7/brain-client.test.js | deployment-execution | Unverified |
| u4-NFR3.10 | u4/NR/observability-requirements.md | Retención de 30 días | `RetentionDays.ONE_MONTH` | infra/lib/brain-stack.mjs; synth | build-and-test | Met |
| u4-NFR3.11 | u4/NR/observability-requirements.md | Revisión semanal del tablero registrada | Proceso operativo | — | deployment-execution | Unverified |
| u4-NFR3.3 | u4/NR/scalability-requirements.md | 3 corridas × 20 servicios sin 5xx | Sin cerebro desplegado | — | deployment-execution | Unverified |
| u4-NFR3.4 | u4/NR/scalability-requirements.md; ND/scalability-design.md | 15 invocaciones en vuelo; cola → 429 | Cumple | tests/u4/gateway-loader-ops.test.js, server.test.js; suite | build-and-test | Met |
| u4-NFR3.5 | u4/NR/scalability-requirements.md | Inventario en memoria <50 MB | Tope de archivo probado; memoria real sin medir | tests/u4/inventory-model.test.js | deployment-execution | Unverified |
| u4-NFR1.10 | u4/NR/tech-stack-decisions.md | Lógica pura sin SDK de transporte | `brain/core` solo importa `jose` (criptografía), ningún SDK de AWS | revisión de imports de brain/core | build-and-test | Met |
| u4-NFR6.1 | u4/NR/tech-stack-decisions.md | `brain/core` ≥80 % líneas y ramas | 98,58 % / 91,85 % | `npx vitest run tests/u4 --coverage …` exit 0 | build-and-test | Met |
| u4-NFR7.1 | u4/NR/tech-stack-decisions.md | Prompts y modelId versionados | Cumple | brain/config.json, brain/prompts/*.md | build-and-test | Met |
| u4-D1 | u4/ND/performance-design.md §1 | Arranque en frío ≤4 s, si no 503 | Cumple | tests/u4/gateway-loader-ops.test.js; suite | build-and-test | Met |
| u4-D2 | u4/ND/performance-design.md §2 | ≤2 invocaciones, 10 s por intento | Cumple | tests/u4/gateway-loader-ops.test.js; suite | build-and-test | Met |
| u4-D3 | u4/ND/performance-design.md §4 | `max_tokens` 1200 / 600 / 2200 | Cumple | brain/config.json | build-and-test | Met |
| u4-D4 | u4/ND/performance-design.md §3 | Filtros ≤300 ms; almacén ≤50 ms | Tope de 50 ms probado; latencia real sin medir | tests/u4/adapters.test.js | deployment-execution | Unverified |
| u4-D5 | u4/ND/security-design.md §1; infrastructure-design/infrastructure-specification.md | Freno por IP del WAF | 1000/min, como fija la especificación de infraestructura aprobada después (el NFR Design decía 300/min) | infra/lib/brain-stack.mjs; tests/u4/infra.test.js | build-and-test | Met |
| u4-D6 | u4/ND/security-design.md §2 | JWKS 1 h; kid desconocido ≤1 cada 5 min; 60 s de tolerancia | Cumple | tests/u4/auth-usage.test.js; suite | build-and-test | Met |
| u4-D7 | u4/ND/reliability-design.md | Sonda 2 op/min con contador propio | Cumple | tests/u4/auth-usage.test.js; suite | build-and-test | Met |
| u4-D8 | u4/ND/reliability-design.md §1 | Pérdida de inventario ≤10 % para activar | Cumple | tests/u4/jobs.test.js; suite | build-and-test | Met |
| u4-D9 | u4/ND/observability-design.md | Alarmas con muestra mínima ≥20 | Cumple | infra/lib/brain-stack.mjs; synth | build-and-test | Met |
| u4-D10 | u4/ND/security-design.md NFR5.5 | Registro de invocaciones de Bedrock desactivado | Configuración de la cuenta | — | deployment-execution | Unverified |

### U5 — RPA

| Target ID | Source | Expected | Actual | Evidence | Owning Stage | Verdict |
|---|---|---|---|---|---|---|
| u5-NFR2.1 | u5/NR/security-requirements.md | Selectores y textos de botón solo en selectors.js | Cumple | lint; check:selectors; tests/u5/eslint-config.test.js | build-and-test | Met |
| u5-NFR2.2 | u5/NR/security-requirements.md | Elemento ausente → fallo tipado | Cumple | tests/u5/cascade.test.js, error-codes.test.js; suite | build-and-test | Met |
| u5-NFR2.3 | u5/NR/security-requirements.md | Opción no exacta → `option_no_match` / `option_ambiguous` | Cumple | tests/u3/option-match.test.js; suite | build-and-test | Met |
| u5-NFR3.1 | u5/NR/security-requirements.md; ND/security-design.md | Confirmación solo por banner nuevo, sin `is required` | Código escrito; DOM real sin probar | smoke R1, R4, R8 | manual (navegador) | Unverified |
| u5-NFR3.2 | u5/NR/security-requirements.md | DONE solo con todo confirmado | Cumple | tests/u1/result-aggregator.test.js, tests/u5/orchestrator-multi.test.js; suite | build-and-test | Met |
| u5-NFR3.3 | u5/NR/security-requirements.md | Relectura distinta → `field_not_applied` | Caso agregado en esta etapa | smoke R10 | manual (navegador) | Unverified |
| u5-NFR3.4 | u5/NR/security-requirements.md | Sustituciones en `brainSubstitutions` | Cumple | tests/u5/service-result.test.js; suite | build-and-test | Met |
| u5-NFR3.5 | u5/NR/security-requirements.md | Salida sin guardar ≤20 s; si no, `not_attempted` | Lógica probada; DOM real sin probar | tests/u5/orchestrator-multi.test.js; smoke R5 | manual (navegador) | Unverified |
| u5-NFR4.1 | u5/NR/security-requirements.md | Content script sin red | Cumple | tests/u5/eslint-config.test.js; lint | build-and-test | Met |
| u5-NFR4.2 | u5/NR/security-requirements.md | `lib/**` sin URL ajenas ni secretos | Cumple | bundle; tests/u7/check-bundle.test.js | build-and-test | Met |
| u5-NFR5.1 | u5/NR/security-requirements.md | Content script sin `chrome.storage` | Cumple | tests/u5/eslint-config.test.js; lint | build-and-test | Met |
| u5-NFR5.2 | u5/NR/security-requirements.md | Spotlight solo con `textContent` | Cumple | lint | build-and-test | Met |
| u5-NFR5.3 | u5/NR/security-requirements.md | Sin overlay tras terminar o cancelar | Sin corrida real | smoke R9 | manual (navegador) | Unverified |
| u5-NFR5.4 | u5/NR/security-requirements.md | URL de Share exacta; si no, `share_invalid` | Cumple | tests/u5/share-url.test.js; suite | build-and-test | Met |
| u5-NFR5.5 | u5/NR/security-requirements.md | Texto del DOM recortado a 200 | Cumple | tests/u5/service-result.test.js; suite | build-and-test | Met |
| u5-NFR8.4 | u5/NR/security-requirements.md | Corte de 3 min por servicio | Cumple con reloj falso | tests/u5/service-timer.test.js; suite (smoke R11 para la página real) | build-and-test | Met |
| u5-NFR8.5 | u5/NR/security-requirements.md | Contador de reintentos | Cumple | tests/u5/retry-counter.test.js; suite | build-and-test | Met |
| u5-NFR8.6 | u5/NR/security-requirements.md | Progreso en cada paso | Lógica probada; panel real sin probar | smoke R1, R2 | manual (navegador) | Unverified |
| u5-NFR6.1 | u5/NR/tech-stack-decisions.md | Zona A ≥80 % líneas y ramas | 100 % / 96,27 % | comando de cobertura de U5, exit 0 | build-and-test | Met |
| u5-NFR6.2 | u5/NR/tech-stack-decisions.md | `SMOKE.md` con los casos mínimos | 11 casos R con "Esperado" | tests/u5/smoke-doc.test.js; suite | build-and-test | Met |
| u5-NFR7.1 | u5/NR/tech-stack-decisions.md | Zona A sin DOM ni chrome | Cumple | tests/u5/eslint-config.test.js; lint | build-and-test | Met |
| u5-NFR7.2 | u5/NR/tech-stack-decisions.md | Sin dependencias de runtime | Cumple | bundle | build-and-test | Met |
| u5-D1 | u5/ND/security-design.md NFR3.1 | Banner 10 s por intento, 3 intentos | Cumple | tests/u1/orchestrator.test.js; suite | build-and-test | Met |
| u5-D2 | u5/ND/security-design.md NFR3.5 | Salida con señal propia de 20 s | Cumple | tests/u5/service-timer.test.js; suite | build-and-test | Met |
| u5-D3 | u5/ND/security-design.md NFR2.1 | `npm run check:selectors` | Script agregado en esta etapa, exit 0 | `npm run check:selectors` | build-and-test | Met |

### U6 — panel

| Target ID | Source | Expected | Actual | Evidence | Owning Stage | Verdict |
|---|---|---|---|---|---|---|
| u6-NFR8.5 | u6/NR/performance-requirements.md; ND/performance-design.md | Panel listo ≤500 ms con 100 corridas | Tope de 300 ms en la lógica; tiempo real sin medir | tests/u6/effects.test.js; smoke P6 | manual (navegador) | Unverified |
| u6-NFR8.6 | u6/NR/performance-requirements.md | Progreso pintado ≤200 ms | Sin medir | smoke P8 | manual (navegador) | Unverified |
| u6-NFR8.7a | u6/NR/performance-requirements.md | Historial de 200 corridas en ≤1 s | Sin medir | smoke P7 | manual (navegador) | Unverified |
| u6-NFR8.7b | u6/ND/performance-design.md | 500 corridas → se muestran las 200 más recientes | Cumple | tests/u6/history-model.test.js; suite | build-and-test | Met |
| u6-NFR5.1 | u6/NR/security-requirements.md | Sin innerHTML, style ni on* con datos | Cumple | tests/u6/eslint-panel.test.js; lint | build-and-test | Met |
| u6-NFR5.2 | u6/NR/security-requirements.md | URL válida o no hay enlace | Cumple | tests/u6/url-check.test.js; suite | build-and-test | Met |
| u6-NFR5.3 | u6/NR/security-requirements.md | Aviso de privacidad visible | Sin corrida real | smoke P1 | manual (navegador) | Unverified |
| u6-NFR5.4 | u6/NR/security-requirements.md | Texto de pestañas solo en `storage.session` | Cumple | tests/u6/tab-store.test.js, eslint-panel.test.js; suite | build-and-test | Met |
| u6-NFR5.5 | u6/NR/security-requirements.md | `unauthorized` → "Iniciar sesión"; panel sin token | Cumple | tests/u6/panel-state.login.test.js; suite | build-and-test | Met |
| u6-NFR3.1 | u6/NR/security-requirements.md | Cada código con texto | Cumple | tests/u6/messages-es.test.js; suite | build-and-test | Met |
| u6-NFR3.2 | u6/NR/security-requirements.md | DONE sin URL → fallo; `runId` ajeno se ignora | Cumple | tests/u6/panel-state.ids.test.js, panel-state.waits.test.js; suite | build-and-test | Met |
| u6-NFR8.4 | u6/NR/security-requirements.md | Todo estado de espera tiene salida | Cumple | tests/u6/panel-state.waits.test.js; suite | build-and-test | Met |
| u6-NFR6.1 | u6/NR/tech-stack-decisions.md | Zona A ≥80 % líneas y ramas | 98,10 % / 88,37 % | comando de cobertura de U6, exit 0 | build-and-test | Met |
| u6-NFR6.2 | u6/NR/tech-stack-decisions.md | Teclado, lector de pantalla, contraste | Sin corrida real | smoke P8 | manual (navegador) | Unverified |
| u6-D1 | u6/ND/security-design.md NFR8.4 | Topes 30 s, 35 s, 20 s, 2 s, 300 ms | Cumple | tests/u6/timers.test.js; suite | build-and-test | Met |
| u6-D2 | u6/ND/security-design.md NFR5.5 | Menos de 15 min → pide login | Cumple | tests/u6/session-rule.test.js; suite | build-and-test | Met |
| u6-D3 | u6/ND/security-design.md NFR5.4 | Guardado 500 ms tras la última tecla | Cumple | tests/u6/tab-store.test.js; suite | build-and-test | Met |
| u6-D4 | u6/ND/logical-components.md §3 | WCAG AA 4,5:1; 44 px; 320 px sin scroll | Sin corrida real | smoke P8 | manual (navegador) | Unverified |

### U7 — empaquetado

| Target ID | Source | Expected | Actual | Evidence | Owning Stage | Verdict |
|---|---|---|---|---|---|---|
| u7-NFR4.1 | u7/NR/security-requirements.md | `host_permissions` exactos | Solo calculator.aws (cerebro sin configurar) | bundle; tests/u7/check-bundle.test.js | build-and-test | Met |
| u7-NFR4.2 | u7/NR/security-requirements.md | 6 `permissions` exactos | Cumple | bundle | build-and-test | Met |
| u7-NFR4.3 | u7/NR/security-requirements.md | Recursos accesibles con URL dinámica | Cumple | bundle | build-and-test | Met |
| u7-NFR4.4 | u7/NR/security-requirements.md | CSP `script-src 'self'` | Cumple | bundle | build-and-test | Met |
| u7-NFR5.1 | u7/NR/security-requirements.md | Sin secretos; configuración solo en `sw/config.js` | Cumple | bundle | build-and-test | Met |
| u7-NFR5.2 | u7/NR/security-requirements.md | Token solo en `storage.session` con TRUSTED_CONTEXTS | Código en background.js; lectura real sin probar | smoke S11 | manual (navegador) | Unverified |
| u7-NFR5.3 | u7/NR/security-requirements.md | Solo el SW hace fetch; `sender.id`; BRAIN_CANCEL aborta | Cumple | tests/u7/dispatch.test.js, brain-client.test.js, eslint-sw.test.js; suite | build-and-test | Met |
| u7-NFR5.4 | u7/NR/security-requirements.md | 401 borra el token sin reintento | Cumple | tests/u7/brain-client.test.js; suite | build-and-test | Met |
| u7-NFR5.5 | u7/NR/security-requirements.md | Lista por contexto; cuerpo >256 KB → `bad_request` | Cumple | tests/u7/router.test.js; suite | build-and-test | Met |
| u7-NFR5.6 | u7/NR/security-requirements.md; ND/security-design.md | Login único; cancelación; margen de 60 s; PKCE | Cumple | tests/u7/session.test.js, auth-flow.test.js, call-registry.test.js; suite | build-and-test | Met |
| u7-NFR3.1 | u7/NR/security-requirements.md | Código desconocido → `internal_error`; nunca ok con 200 inválido | Cumple | tests/u7/brain-client.test.js; suite | build-and-test | Met |
| u7-NFR8.1 | u7/NR/security-requirements.md | Tope de 30 s; reintento con 5 s, no con 25 s | Cumple | tests/u7/brain-client.test.js; suite | build-and-test | Met |
| u7-NFR1.1 | u7/NR/security-requirements.md | Host del cerebro solo en sus dos lugares | Cumple | bundle | build-and-test | Met |
| u7-NFR7.1 | u7/NR/security-requirements.md | MV3 cargado unpacked sin build | Sin build; carga real sin probar | bundle; smoke S8 | manual (navegador) | Unverified |
| u7-NFR7.2 | u7/NR/security-requirements.md | `.zip` con exactamente la lista | Cumple | tests/u7/package-zip.test.js; suite | build-and-test | Met |
| u7-NFR6.1 | u7/NR/tech-stack-decisions.md | `sw/**` y brain-port ≥80 % líneas y ramas | 96,84 % / 94,58 % | comando de cobertura de U7, exit 0 | build-and-test | Met |
| u7-NFR7.3 | u7/NR/tech-stack-decisions.md | `check:bundle` corre en CI | Verde aquí; ejecución en CI: el plan no ejecuta CI Pipeline | bundle | build-and-test | N/A |
| u7-D1 | u7/ND/security-design.md NFR8.1 | Keepalive cada 20 s | Cumple | tests/u7/keepalive.test.js; suite | build-and-test | Met |

### Testing Contract (común a las siete unidades)

| Target ID | Source | Expected | Actual | Evidence | Owning Stage | Verdict |
|---|---|---|---|---|---|---|
| TC-1 | code-generation-plan.md § Testing Contract (equipo) | ≥80 % de líneas en Zona A | 98,63 % en la suite; todos los pisos por unidad cumplen | suite y comandos por unidad | build-and-test | Met |
| TC-2 | § Testing Contract `scope_floor` | La suite existente sigue en verde | 626/626 | suite | build-and-test | Met |
| TC-2-CI | § Testing Contract (CI antes de merge) | Ejecutar las pruebas en CI antes de merge | — | — | build-and-test | N/A (el plan no ejecuta CI Pipeline) |
| TC-3 | § Testing Contract `strategy_volume` | 5 a 8 pruebas por componente | `lib/panel/heartbeat.js` tiene 3 y ningún otro archivo lo ejerce | tests/u1/heartbeat.test.js | build-and-test | Not Met |
| TC-4 | § Testing Contract `strategy_volume` | Integración en los bordes clave | 12 archivos de borde, 133 pruebas | integration-test-instructions.md, exit 0 | build-and-test | Met |
| TC-5 | § Testing Contract (smoke) | Smoke: simple, multi-servicio con toggle, URL completa, fallo sin DONE | Casos escritos, sin ejecución | smoke S1, R1, R2, R3 | manual (navegador) | Unverified |

### Conteo

| Verdict | Objetivos |
|---|---|
| Met | 150 |
| Not Met | 1 (TC-3) |
| Unverified, solo falta navegador real | 27 |
| Unverified, exige el cerebro desplegado (Deployment Execution) | 11 |
| N/A (CI) | 2 |

## 4. Evaluación de preparación

| Aspecto | Estado |
|---|---|
| Build-ready | **Sí.** Build sin errores; sin dependencias de runtime; síntesis de la infraestructura correcta |
| Test-ready | **Sí, con un faltante.** 626 pruebas en verde y todos los pisos de cobertura cumplen; TC-3 no se cumple en `heartbeat.js` |
| Deployment-ready | **No todavía.** Faltan la clave `key`, los precios reales en `cost-inputs.json`, la ruta del primer despliegue (hallazgo mayor de U4), confirmar el modelo de Bedrock y el smoke manual en Chrome |

## 5. Limitaciones y pendientes

- **Navegador real:** las pruebas de comportamiento del navegador corrieron solo en Node. Nada corrió en Chrome ni en calculator.aws: 27 objetivos dependen del smoke manual (S1-S15, R1-R11, P1-P8), sin ejecuciones registradas.
- **Cerebro desplegado:** 11 objetivos de U4 dependen del despliegue y quedan para Deployment Execution.
- **Hallazgos mayores de U4 abiertos desde Code Generation:**
  - El primer despliegue se revierte porque el inventario nace vacío.
  - El modelo `anthropic.claude-3-5-haiku-20241022-v1:0` probablemente no es invocable en us-east-1 y está en retirada.
- **Hallazgos menores registrados en las revisiones de cada unidad:** quedan como deuda conocida; ninguno produce un DONE falso.
- **`tests/u5/eslint-config.test.js`:** es inestable bajo carga por su tope de 5 s.
- **`REVIVAL_PLAN.md`:** contiene la URL de un webhook n8n personal en git; decide el mantenedor.

## 6. Resultado de esta corrida

**Build and Test no pasa:** TC-3 es `Not Met` y hay 11 objetivos `Unverified` que exigen el cerebro desplegado. Diagnóstico y opciones en `test-results.md` §7.

**Fallo aceptado por el mantenedor (2026-11-22).** Pendientes que siguen abiertos:
- Ampliar las pruebas de `heartbeat.js` (TC-3).
- Verificar los 11 objetivos del cerebro en Deployment Execution.
- Correr el smoke manual en Chrome (27 objetivos).
