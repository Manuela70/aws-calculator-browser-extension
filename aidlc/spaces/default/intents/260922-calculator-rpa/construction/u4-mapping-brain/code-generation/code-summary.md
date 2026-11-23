# Resumen de código — u4-mapping-brain

Los 18 pasos del plan aprobado están implementados y marcados en `code-generation-plan.md`, en orden test-after: cada capa se implementó y después se escribieron y corrieron sus pruebas. No se ejecutó `cdk deploy` ni se creó ningún recurso en AWS. Prosa en español; identificadores en inglés.

## Archivos creados y modificados

**Raíz (herramientas de desarrollo)**
- Modificados: `package.json` (script `test:u4`; `brain` e `infra` en `lint`; `brain/**/*.{js,mjs}` e `infra/**/*.mjs` en `format` y `format:check`), `eslint.config.js` (ignora `**/node_modules/**`, `.aidlc/**` e `infra/cdk.out/**`; bloque Node para `brain/**` e `infra/**` con las mismas reglas de seguridad, sin la restricción de `fetch`), `vitest.config.js` (`brain/core/**` en `coverage.include`, con umbral propio de 80 % en líneas y ramas).
- Nuevos: `.prettierignore` (`infra/cdk.out/`, `coverage/`) y `.github/workflows/brain.yml`.

**Servicio (`brain/`)**
- `package.json` y `package-lock.json` (`"type": "module"`, Node ≥ 22), `config.json` (modelo, `max_tokens` por operación, tiempos, concurrencia, límites), `prompts/{interpret,map-residue,waf-evaluate}.md`, `Dockerfile` y `.dockerignore`, `README.md`.
- `core/` (lógica pura, sin SDK de transporte): `inventory-model.js`, `limits.js`, `request-validators.js`, `candidate-selector.js`, `prompt-builder.js`, `output-validators.js`, `error-catalog.js`, `log-record.js`, `errors.js`, `auth-filter.js`, `usage-guard.js`, `model-gateway.js`, `inventory-loader.js`, `operations.js`.
- `adapters/`: `inventory-store.js` (S3 + SHA-256), `usage-store.js` (DynamoDB con tope de 50 ms), `bedrock-client.js`, `jwks-client.js`, `inventory-parser.js` e `inventory-parse-worker.js` (`worker_threads`).
- `server/`: `app.js` (`node:http`, cadena de filtros), `config.js`, `index.js`.
- `jobs/`: `build-inventory.mjs` (portado y completado), `canonical-services.json`, `synonyms-es.json`.
- `probe/handler.mjs` (Lambda `Probe`).

**IaC (`infra/`)**
- `package.json` y `package-lock.json`, `cdk.json`, `cdk.context.json` (vacío), `.gitignore` (`cdk.out/`, `deploy-params.json`), `cost-inputs.example.json` y `deploy-params.example.json` (valores ficticios, marcados como tales), `bin/app.mjs`, `lib/build-app.mjs`, `lib/brain-bootstrap-stack.mjs`, `lib/brain-stack.mjs`, `scripts/token-caps.mjs`, `scripts/gha-assume-role.sh`.

**Pruebas (`tests/u4/`)**
- Ayudantes y dobles: `helpers.js`, `token-helpers.js` (claves RSA y tokens RS256 con `node:crypto`).
- Datos: `fixtures/inventory-small.json` (5 entradas derivadas del inventario real: dos de EC2, una canónica, S3 Standard, Lambda y SQS), `fixtures/requests.json`, `fixtures/model-outputs.json`.
- 11 archivos de prueba, incluida la integración del servidor en puerto efímero (`server.test.js`) y las aserciones de síntesis de CDK (`infra.test.js`).

**Dependencias instaladas**
- `brain/`: `@aws-sdk/client-bedrock-runtime`, `@aws-sdk/client-s3`, `@aws-sdk/client-dynamodb`, `@aws-sdk/client-secrets-manager`, `jose`.
- `infra/`: `aws-cdk-lib`, `constructs` y, como dev-dependency, `aws-cdk`.
- Raíz: `npm ci` del lockfile existente, sin cambios en `package-lock.json`. Nada entra al bundle de la extensión (`check:bundle` OK).

## Decisiones clave de implementación

- **Inventario.** Cada `subType` de la definición pública se clasifica en `quantity`, `unit`, `choice`, `checkbox`, `toggle` o `complex`; los de presentación se descartan y un `subType` desconocido se trata como `complex` (el cerebro nunca lo llena). Los campos con unidad generan dos claves: `"<Campo>"` y `"<Campo> unit"`. La etiqueta lleva `"Sección > Campo"` solo si se repite dentro de la misma plantilla. Las entradas canónicas y los sinónimos en español viven en archivos versionados junto al job.
- **Puntero `active`.** `{ version, sha256, previous }`, con `previous = { version, sha256 }` para poder verificar la versión anterior al arrancar.
- **`/interpret`.** Un servicio fuera de los candidatos (o inexistente) se informa como `unresolved` con `unknown_service`, no como salida inválida (BR7.1). Si la región pedida no está en la lista del servicio, se informa `region_unavailable`. `search_term` siempre se completa con el nombre canónico.
- **Regla única de reintentos** en `model-gateway.js`: como máximo 2 invocaciones por operación o lote; 10 s por intento; espera de 1 a 2 s solo para transitorios; segundo intento solo con ≥ 6 s; códigos finales de `performance-design.md` §2. El semáforo de 7 lugares retiene el lugar durante los dos intentos; la cola estima la espera con la media móvil de 50 latencias.
- **UsageGuard.** Ventana deslizante aproximada (minuto actual + anterior ponderado) en DynamoDB; día contado en UTC-5; la sonda usa `probe#…` y nunca toca `global#day`. Si el almacén falla, limitador local con el mismo tope por minuto y tope global por instancia (`GLOBAL_DAILY_TOKEN_CAP / MAX_INSTANCES`), con métrica `UsageGuardFallback`.
- **Servidor.** Orden de filtros de `security-design.md` §1; cuerpo leído con contador que corta a 256 KB y cierra la conexión; `X-Request-Id` en toda respuesta; plazo de 25 s desde la llegada con espera de arranque de hasta 4 s; una línea de registro por operación con lista blanca y métricas EMF (dimensiones `operation` y total, y `Errors` por `operation` y `code`).
- **IaC.** Todos los roles del stack `brain` se llaman `brain-*` (encajan en `BrainCfnExecutionPolicy`); sin comodines salvo `ecr:GetAuthorizationToken`, que ECR exige con recurso `*`. Las zonas de disponibilidad se fijan en el stack para que `cdk synth` no consulte la cuenta. El identificador del modelo para el permiso de Bedrock se lee de `brain/config.json` (fuente única, NFR7.1). Los tres topes de tokens viajan como variables de entorno de la tarea.

## Cobertura y resultados de las verificaciones

| Comando | Resultado |
|---|---|
| `npx vitest run tests/u4` | 11 archivos, 133/133 en verde |
| `aidlc engine swarm check u4-mapping-brain` (lint, format:check, `npx vitest run --coverage`, check:bundle) | `"converged":true`; 28 archivos, 249/249 en verde (u1 + u4) |
| Cobertura de `brain/core/**` | líneas 98,58 %, ramas 91,85 %, sentencias 95,85 %, funciones 98,74 % (umbral 80 % en líneas y ramas) |
| `npm run lint` | Sin errores |
| `npm run format:check` | Todo con estilo Prettier |
| `npm run check:bundle` | 28 archivos revisados, sin dependencias de runtime |
| `npx cdk synth --no-lookups` con `cost-inputs.example.json` y `deploy-params.example.json` | Síntesis correcta de `BrainBootstrapStack` y `BrainStack`, sin credenciales |

No se bajó ningún umbral ni se desactivó ninguna regla.

## Pruebas definidas pero no ejecutadas en esta etapa

- **Calidad de las interpretaciones y recomendaciones** contra un conjunto de referencia con el modelo real: corresponde a Build and Test (`functional-spec.md` §10).
- **Latencia y carga** (p95 con 5, 10 y 20 servicios en `/waf-evaluate`, NFR8.6) contra el entorno desplegado: Build and Test.
- **Workflow `brain.yml`**: escrito pero no ejecutado en GitHub (no hay remoto ni cuenta configurada). Sus pasos locales (lint, pruebas, cobertura, síntesis) pasaron.
- **`InventoryJob` contra el catálogo público real** y **`Probe` contra un endpoint desplegado**: cubiertos con dobles; requieren el despliegue.

## Desviaciones respecto del plan y del diseño

1. **Credenciales de AWS en el workflow sin `aws-actions/configure-aws-credentials`.** No hubo salida a GitHub para obtener y verificar el SHA de commit de esa acción, y fijarla con un SHA no verificado contradice el requisito de fijar por SHA. Se usa `infra/scripts/gha-assume-role.sh`: token OIDC del job + `aws sts assume-role-with-web-identity`, con las credenciales enmascaradas. Mismo modelo de identidad (dos roles, sin secretos en GitHub). Si el mantenedor prefiere la acción oficial, el cambio es reemplazar ese paso por la acción fijada por su SHA.
2. **Suma SHA-256 de `gitleaks`** en la variable del repositorio `GITLEAKS_SHA256` en lugar de escrita en el workflow, por el mismo motivo (no se pudo descargar la suma publicada). El job falla cerrado si la variable falta.
3. **Parámetros de despliegue.** Para cumplir R3 (`cdk synth` falla sin dominio ni hosted zone), la síntesis exige parámetros en `infra/deploy-params.json` o por `-c`. El comando de `unit-test-instructions.md` debe agregar `-c params=deploy-params.example.json` (y `--no-lookups`); sin eso se detiene con un mensaje claro, que es el comportamiento pedido por R3.
4. **Rol de `InventoryJob` con `s3:GetObject`** además de `s3:PutObject` (sobre `versions/*` y `active`): necesita leer la versión activa para la comparación del 10 % (BR5.2). La tabla de roles de la especificación solo listaba escritura.
5. **Estado `superseded`.** No se reescribe el archivo de la versión anterior (cambiaría su SHA-256); la versión vigente la define el puntero y la anterior queda en `previous`. Una versión rechazada sí se publica con `status: "rejected"`.
6. **Salida de los security groups** a TCP 443 hacia `0.0.0.0/0`, que ya cubre los gateway endpoints de S3 y DynamoDB (ambos HTTPS); no se agregaron reglas separadas por lista de prefijos.
7. **CORS rechazado, método o ruta desconocidos** responden 400 `bad_request`: el catálogo fijo (BR7.2) no tiene 403 ni 404.
8. **Bloque de ESLint para `brain/**` e `infra/**`** se agregó en el paso 2 (no en el 17), porque sin él no se podía correr el lint ampliado.
9. **Fin de línea en el worktree.** `git worktree` en Windows (`core.autocrlf=true`) dejó en CRLF 53 archivos previos y `format:check` fallaba antes de cualquier cambio de esta unidad. Se aplicó `npm run format`, igual que en los worktrees de u2 y u3: esos archivos quedan en LF, como en el árbol principal y en git, con diff de contenido vacío (`git diff` no los lista).
10. **Imagen base** `node:22-bookworm-slim` fijada por etiqueta, no por digest (sin acceso al registro para obtenerlo).

## Supuestos que el mantenedor debe confirmar

- **Modelo:** `config.json` usa `anthropic.claude-3-5-haiku-20241022-v1:0`. Confirmar que está habilitado en la cuenta y admite invocación directa on-demand en us-east-1 sin perfil de inferencia entre regiones; si no, cambiar el identificador en `config.json` (la IaC lo toma de ahí).
- **Listas de unidades por defecto** (`fileSize`: KB-PB; `frequency`; `durationInput`; `throughput`) cuando la definición pública no trae opciones: verificar contra la UI de la calculadora.
- **Presupuesto filtrado por la etiqueta `Project=brain`:** requiere activar la etiqueta de asignación de costos en Billing; sin eso el presupuesto no ve el gasto.
- **`cost-inputs.example.json` y `deploy-params.example.json` son ficticios** y solo sirven para sintetizar y probar; no son precios de AWS.

## Riesgos abiertos

- **Primer intento de síntesis con consulta a la cuenta.** Antes de fijar las zonas de disponibilidad en el stack, `cdk synth` intentó una vez asumir el rol de lectura de CDK en la cuenta ficticia `111111111111` con las credenciales locales; AWS lo rechazó y no se creó ni modificó nada. La versión final sintetiza sin consultas (`--no-lookups`), y el workflow hace lo mismo en `verify`.
- **Primera versión del inventario:** el cerebro responde 503 hasta que `InventoryJob` publique y active una versión; el README indica correrlo una vez antes de habilitar la extensión.
- **Costo fijo frente a USD 50 (R1):** la compuerta de `token-caps.mjs` impide desplegar si el fijo alcanza USD 25, pero el valor real depende de los precios que cargue el mantenedor.
