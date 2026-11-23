# Runbook de rollback — calculator-rpa

> **Actualización 2026-11-22 (Deployment Execution):** el cerebro pasó de ECS Fargate + ALB + WAF a dos Lambdas ARM64 con la misma imagen (AWS Lambda Web Adapter) y una Function URL, por decisión de costo del mantenedor (2 SE, proyecto open source, presupuesto USD 20/mes). Ya no aplican: el modo `bootstrap` de dos pasos, las tareas de ECS, el dominio propio, el ALB y el WAF. El primer despliegue es uno solo: el `smoke` corre `brain-inventory-job` si aún no hay inventario y exige `/health` 200 por la Function URL. El rollback de la aplicación sigue igual (redesplegar una `image_tag` anterior). Detalle en `deployment-execution/deployment-log.md`.

> Todos los pasos los ejecuta el mantenedor; no hay rollback automático salvo el circuit breaker de ECS. Antes de revertir, anotar en el registro de incidentes: hora, versión actual (SHA / etiqueta de imagen), síntoma y `requestId` de ejemplo.

## Sources

- `construction/u4-mapping-brain/infrastructure-design/cicd-pipeline.md` §4 (casos de rollback). [stage]
- `construction/u4-mapping-brain/nfr-design/reliability-design.md` (NFR1.8, puntero `active` y última versión buena). [stage]
- `construction/u7-packaging/infrastructure-design/cicd-pipeline.md` §4 (rollback de la extensión). [stage]
- `deployment-strategy.md` y `cd-config.md` de esta etapa. [stage]

## Escalamiento

Hay un solo mantenedor, que es el primer y único escalón. Si no está disponible:
- Los SE siguen usando la extensión **sin cerebro**: sin revisión Well-Architected, que la extensión avisa, y sin lenguaje natural.
- El problema se reporta por el canal interno del equipo de SE.

## 1. Tarea nueva que no arranca o no pasa `/health`

1. **Síntoma:** el job `deploy` falla y ECS muestra el circuit breaker activado.
2. **Acción:** ninguna. ECS revierte solo a la definición de tarea anterior.
3. **Verificar:** `aws ecs describe-services --cluster brain --services brain-api` muestra `runningCount = 2` y el despliegue `PRIMARY` con la definición anterior. `curl -fsS https://<dominio>/health` responde 200.
4. **Después:** corregir en `main`; el siguiente push vuelve a pasar por la aprobación.

## 2. Versión sana pero con comportamiento incorrecto

1. **Síntoma:** `smoke` en rojo, o reportes de los SE con `requestId`.
2. **Opción rápida:** `workflow_dispatch` de `brain` con `image_tag` = etiqueta anterior. ECR conserva 10. Se aprueba en `production`.
3. **Opción por código:** `git revert <sha>` en `main` y pipeline completo con aprobación.
4. **Verificar:** `smoke` en verde; probar una corrida en el panel con un servicio que use el cerebro.

## 3. Cambio de infraestructura problemático

1. `git revert` del commit de `infra/` y despliegue aprobado.
2. El bucket del inventario y la tabla `brain-usage` tienen `RemovalPolicy.RETAIN`: un revert no los borra.
3. Si el revert deja recursos huérfanos retenidos, se limpian a mano después de confirmar que no se usan.
4. **Verificar:** `cdk diff` sin cambios inesperados; `smoke` en verde.

## 4. Inventario dañado

1. **Síntoma:** errores `inventory_unavailable` u opciones incorrectas en `/map-residue`.
2. **Acción:** reescribir el puntero `active` en S3 a la versión anterior (`{version, sha256}` del puntero `previous`). No hace falta redesplegar: las tareas recargan la última versión buena.
3. **Verificar:** `/health` responde 200 y el log muestra la versión activa nueva.

## 5. Modelo de Bedrock rechazado o retirado

1. **Síntoma:** 503 `model_unavailable`, o el job `diff` falla en la verificación del modelo.
2. **Acción:** cambiar `model.modelId` en `brain/config.json` a un modelo habilitado (o su perfil de inferencia) y hacer push. El pipeline lo verifica antes de pedir la aprobación.
3. **Verificar:** `smoke` en verde.

## 6. Primer despliegue interrumpido

1. **Si falla el paso con `bootstrap = true`:** revisar el evento de CloudFormation, corregir y repetir. No hay tráfico ni datos que proteger.
2. **Si falla la carga del inventario:** repetir `brain-inventory-job`. El servicio sigue con 0 tareas.
3. **Si falla el paso con `bootstrap = false`:** el circuit breaker revierte a 0 tareas. Revisar `/health` y el inventario y repetir.

## 7. Extensión

1. **Unpacked:** `git revert` del commit y "Reload" en `chrome://extensions`.
2. **`.zip`:** redistribuir el `.zip` del release anterior de GitHub.
3. **Si el problema es la configuración del cerebro** (`sw/config.js`): revertir `sw/config.js` y `manifest.json` juntos, porque `check:bundle` exige que coincidan.
4. **Verificar:** smoke S8 y el caso afectado de `SMOKE.md`.
