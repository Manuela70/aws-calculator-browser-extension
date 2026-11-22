# Pipeline de CI/CD — u4-mapping-brain

> Verificación y despliegue del cerebro con GitHub Actions, OIDC hacia AWS y
> aprobación manual del mantenedor (Q3). Un solo entorno (`prod`) en us-east-1
> (Q2). Prosa en español; identificadores en inglés.

## Sources

- `infrastructure-design-questions.md` de esta unidad (Q2, Q3). [Q2] [Q3]
- `infrastructure-specification.md` de esta unidad (ECS Fargate, ECR, CDK en `infra/`, roles). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u1-walking-skeleton/infrastructure-design/cicd-pipeline.md` (workflow `ci.yml` común, acciones fijadas por SHA). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u4-mapping-brain/nfr-design/security-design.md` y `logical-components.md` (módulos puros, pruebas con dobles). [stage]
- `aidlc/spaces/default/memory/team.md` (`## Way of Working` directo a `main`; `## Testing Posture`). [team-practices]

## 1. Estructura del repo

| Carpeta | Contenido |
|---|---|
| `brain/` | Servicio Node.js (módulos puros de BrainCore, adaptadores de Bedrock, S3, DynamoDB), `Dockerfile`, `jobs/build-inventory.mjs`, `probe/` |
| `infra/` | App de AWS CDK en JavaScript (stack `BrainStack`) |
| `tests/u4/` | Pruebas de Vitest del cerebro |

`brain/` e `infra/` quedan fuera de `aws-calculator-extension/`, así que `check:bundle` y la extensión no los ven.

## 2. Workflow `.github/workflows/brain.yml`

- **Disparadores:** `push` a `main` con cambios en `brain/**`, `infra/**`, `tests/u4/**` o el propio workflow; también `workflow_dispatch` para redesplegar.
- **Permisos:** `contents: read` en todo el workflow; `id-token: write` solo en los jobs que hablan con AWS.
- **Acciones:** las oficiales (`actions/checkout`, `actions/setup-node`) y `aws-actions/configure-aws-credentials`, fijadas por SHA de commit como en `ci.yml`.
- **Secretos:** ninguno guardado en GitHub. La identidad es OIDC con **dos roles**: `github-brain-build`, que confía en `sub = repo:<org>/<repo>:ref:refs/heads/main` y lo usan los jobs sin entorno; y `github-brain-deploy`, que confía en `sub = repo:<org>/<repo>:environment:production` y lo usan solo los jobs del entorno `production`. Las variables guardan solo datos no secretos (cuenta, región, ARN de los roles, dominio, ID de la hosted zone, correo de alarmas).

| # | Job | Pasos | Compuerta |
|---|---|---|---|
| 1 | `verify` | `npm ci`; escaneo de secretos del repo con `gitleaks` (binario de una versión fijada, verificado por su suma SHA-256 antes de ejecutarlo; NFR5.1); `npm run lint`; `npx vitest run tests/u4 --coverage` con umbral de 80 % en líneas y ramas sobre `brain/core/**` (NFR6.1); `npx cdk synth` | Falla una prueba, la cobertura o la síntesis |
| 2 | `image` | Sin entorno. Asume `github-brain-build`; construye la imagen ARM64 con etiqueta = SHA de git; la sube a ECR; espera el resultado del escaneo de ECR | Hallazgos críticos o altos en el escaneo |
| 3 | `diff` | Sin entorno. Asume `github-brain-build` y, desde él, el rol de lectura (`lookup`) de CDK; `npx cdk diff` con la etiqueta de imagen nueva; publica el diff en el resumen del job | — (informativo para el aprobador) |
| 4 | `deploy` | Entorno `production` de GitHub con revisor obligatorio (el mantenedor), que aprueba **una sola vez** después de ver el diff del job 3. Asume `github-brain-deploy`; `npx cdk deploy --require-approval never` (la aprobación ya ocurrió en GitHub) | El mantenedor no aprueba, o el despliegue de ECS falla y el circuit breaker revierte |
| 5 | `smoke` | Mismo entorno `production` (no pide una segunda aprobación porque depende de `deploy`, que ya fue aprobado). Con `github-brain-deploy`, invoca una vez la Lambda `Probe` y verifica `ProbeSuccess = 1`; revisa que ECS tenga 2 tareas sanas | La sonda falla: el job queda en rojo y el mantenedor decide revertir (§4) |

El workflow `ci.yml` de la extensión sigue igual y no necesita credenciales de AWS.

## 3. Prerrequisitos (una sola vez, por el mantenedor)

1. Publicar el repo en GitHub (ya era requisito de u1).
2. Crear la política `BrainCfnExecutionPolicy` en IAM.
3. `cdk bootstrap` con `--cloudformation-execution-policies arn:aws:iam::<cuenta>:policy/BrainCfnExecutionPolicy` (política propia acotada a los servicios del stack, ver los roles de `infrastructure-specification.md`), en lugar del `AdministratorAccess` por defecto.
4. Desplegar una vez, a mano, el stack de arranque `BrainBootstrapStack`: proveedor OIDC de GitHub, roles `github-brain-build` y `github-brain-deploy` con sus condiciones `sub`, y la ECR `brain-api`. Así la ECR existe antes del primer push de imagen.
5. Habilitar el modelo de Claude en Bedrock (us-east-1) y pedir la cuota de 15 invocaciones simultáneas.
6. Completar `infra/cost-inputs.json` con los precios de la AWS Pricing Calculator; sin eso `cdk synth` falla (`infrastructure-specification.md` §4).
7. Configurar el entorno `production` en GitHub con el mantenedor como revisor obligatorio y las variables no secretas.
8. Primer despliegue: crear las cuentas de los SE en Cognito y copiar las salidas del stack a `sw/config.js` y al manifest de u7.

## 4. Rollback

| Caso | Acción |
|---|---|
| Tarea que no arranca o no pasa el chequeo de salud | El circuit breaker de ECS revierte solo a la definición de tarea anterior |
| Versión sana pero con comportamiento incorrecto | `workflow_dispatch` del workflow con la etiqueta de imagen anterior (ECR conserva 10), o `git revert` en `main`, que vuelve a pasar por la aprobación |
| Cambio de infraestructura problemático | `git revert` del commit de `infra/` y nuevo despliegue aprobado. Los recursos con datos (bucket del inventario, tabla de uso) tienen `RemovalPolicy.RETAIN` para que un revert no los borre |
| Inventario dañado | Reescribir el puntero `active` a la versión anterior (`reliability-design.md`, NFR1.8); no requiere redesplegar |

## 5. Gestión de secretos en CI/CD

- Sin claves de AWS en GitHub: OIDC con credenciales temporales por job.
- El secreto del cliente de máquina de la sonda se crea en Secrets Manager desde el stack de CDK (valor generado por Cognito) y nunca pasa por el pipeline ni por el repo.
- La extensión no recibe secretos: solo el `clientId` público y las URL.
