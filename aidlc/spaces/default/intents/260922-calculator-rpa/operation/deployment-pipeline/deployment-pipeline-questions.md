# Preguntas — Deployment Pipeline

> Lo ya decidido no se vuelve a preguntar:
> - **Entorno:** un solo entorno `prod` en us-east-1 (u4 Q2).
> - **Pipeline del cerebro:** GitHub Actions con OIDC y aprobación manual del mantenedor en el entorno `production` (u4 Q3).
> - **Estrategia del cerebro:** despliegue rolling de ECS con circuit breaker (`maximumPercent` 100, `minimumHealthyPercent` 50).
> - **Extensión:** unpacked hoy y `.zip` manual a futuro (`team.md` § Deployment).
> - **Rollback:** diseñado en `u4-mapping-brain/infrastructure-design/cicd-pipeline.md` §4.
>
> Quedan abiertas las decisiones que la revisión de código y Build and Test dejaron pendientes.

## Pregunta 1 — Primer despliegue del cerebro

Tal como está, el primer `cdk deploy` se revierte. El bucket del inventario nace vacío, `/health` responde 503, las tareas no pasan el chequeo del ALB y el circuit breaker revierte el stack (hallazgo mayor de la revisión de u4). ¿Cómo se hace el primer despliegue?

A. Arranque en dos pasos con un parámetro `bootstrap`: el primer despliegue crea el servicio de ECS con `desiredCount = 0`; se corre una vez el job `brain-inventory-job`; un segundo despliegue (aprobado igual que el primero) sube a 2 tareas. El workflow lo documenta y el runbook lo incluye.
B. `/health` responde 200 sin inventario y el servicio arranca igual. Las operaciones siguen respondiendo 503 `inventory_unavailable` hasta que exista inventario. Es un solo despliegue, pero el chequeo de salud deja de detectar un cerebro sin inventario.
C. El job del inventario corre antes del despliegue del servicio, dentro del mismo workflow (un paso previo con su propio rol). Es un solo despliegue, pero el pipeline queda más largo y el bucket tiene que existir antes, en `BrainBootstrapStack`.
X. Other (please specify)

[Answer]: A

## Pregunta 2 — Modelo de Bedrock

`brain/config.json` fija `anthropic.claude-3-5-haiku-20241022-v1:0`. La revisión de u4 advirtió que probablemente no se puede invocar de forma directa en us-east-1 (allí suele exigir un perfil de inferencia) y que está en retirada. No se pudo verificar contra la cuenta. ¿Cómo se fija el modelo?

A. Parámetro de despliegue `modelId` en `deploy-params.json`, sin valor por defecto: el despliegue falla si no se define. Tú eliges el modelo habilitado en tu cuenta (o su perfil de inferencia) y el rol de IAM se acota a ese ARN.
B. Mantener `brain/config.json` como única fuente, actualizado a mano antes de desplegar, y que el pipeline verifique en el job `verify` que el modelo esté habilitado.
C. Parámetro `modelId` con el valor actual como respaldo si no se define.
X. Other (please specify)

[Answer]: B

## Pregunta 3 — Feature flags

Hoy no hay ningún feature flag. Las funciones del cerebro ya se degradan solas: sin cerebro, la extensión sigue sin revisión Well-Architected. ¿Se agregan feature flags?

A. No. Para una herramienta interna de un solo mantenedor, el control es el despliegue y el rollback; agregar AppConfig suma costo y complejidad sin una necesidad concreta.
B. Sí, AWS AppConfig con un flag por operación del cerebro (`interpret`, `map-residue`, `waf-evaluate`), para apagar una operación sin redesplegar.
C. Sí, pero solo un interruptor general del cerebro en la configuración de la extensión (`sw/config.js`), sin servicio nuevo.
X. Other (please specify)

[Answer]: A

## Consolidated Summary Confirmation

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
