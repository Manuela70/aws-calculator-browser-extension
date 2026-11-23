# Preguntas — Deployment Execution

> Chequeo previo hecho desde la terminal de este agente:
> - **Identidad de AWS:** `aws sts get-caller-identity` responde con credenciales válidas, cuenta `********9610`, de tipo usuario de IAM.
> - **Prerrequisitos del despliegue del cerebro que faltan** (`cd-config.md` §5):
>   - El repo no tiene remoto en GitHub, así que no hay pipeline ni entorno `production`.
>   - No existe `infra/cost-inputs.json` con precios reales: `cdk synth` falla sin él.
>   - No existe `infra/deploy-params.json`: dominio, hosted zone, correo de alarmas, id de la extensión y prefijo de Cognito.
>   - El manifest no tiene la clave `key`, así que no hay id estable de la extensión.
>   - El modelo de `brain/config.json` está sin confirmar.
>   - Los cambios de `cd-config.md` §3 (arranque en dos pasos y verificación del modelo) no están aplicados.
> - **Migraciones de base de datos:** ninguna. El cerebro solo crea un bucket de S3 y una tabla de DynamoDB nuevos; no hay datos existentes que migrar.
> - **Servicios de los que depende:** calculator.aws (público), Bedrock y Cognito (se crean o habilitan con el despliegue).
>
> Con esto, hoy no se puede desplegar el cerebro. La extensión sí se puede "desplegar" en el sentido de `team.md` (carga unpacked), pero eso lo haces tú en Chrome.

## Pregunta 1 — Cómo seguir con el despliegue

A. Posponer el despliegue del cerebro. Esta etapa deja el estado de preparación documentado: la lista de prerrequisitos, el smoke de la extensión sin cerebro (S1-S9, R1-R11, P1-P2) y los objetivos que siguen pendientes. Se cierra sin desplegar nada en AWS. Cuando tengas los prerrequisitos, se despliega siguiendo `deployment-strategy.md` §3.
B. Lo mismo que A, pero antes aplico y pruebo en código los cambios de `cd-config.md` §3: el parámetro `bootstrap`, la verificación del modelo en el job `diff` y el ARN de IAM para perfiles de inferencia. El pipeline queda listo para el primer despliegue. Nada se despliega en AWS.
C. Desplegar ahora. Primero tienes que completar los prerrequisitos que faltan (repo en GitHub, clave `key`, precios reales con fuente, parámetros, modelo habilitado). Te guío paso a paso, y cada `cdk deploy` crea recursos con costo en tu cuenta y requiere tu aprobación explícita.
X. Other (please specify)

[Answer]: C

## Pregunta 2 — Smoke manual de la extensión

Los objetivos de navegador (27) siguen sin verificar: nada corrió en Chrome real. ¿Cuándo se corre el smoke de `SMOKE.md`?

A. Lo corres tú en Chrome antes de cerrar esta etapa (casos sin cerebro: S1-S9, R1-R11, P1-P2) y me pasas los resultados. Los anoto en `smoke-test-results.md`.
B. Se cierra la etapa con el smoke pendiente y queda registrado en `smoke-test-results.md` como no ejecutado, con la lista de casos.
C. Intento correr en Chrome, con la automatización del navegador, los casos que no necesitan cargar la extensión. La extensión unpacked no se puede cargar desde aquí, así que la mayoría de los casos seguiría pendiente.
X. Other (please specify)

[Answer]: A

## Consolidated Summary Confirmation

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
