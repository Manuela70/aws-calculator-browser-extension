# Preguntas de Infrastructure Design — u4-mapping-brain

> U4 es la única unidad con infraestructura en la nube: el cerebro que
> interpreta, mapea el residuo y evalúa Well-Architected con Claude en Amazon
> Bedrock, detrás de Cognito. El NFR Design ya fija el comportamiento (cadena de
> filtros, plazo de 25 s, tope de 15 invocaciones, inventario versionado, sonda,
> alarmas); aquí se eligen los servicios concretos. Queda decidido por
> etapas anteriores: Bedrock, Cognito, Node.js LTS sin transpilar, 99,5 % en una
> región, 10 SE y 3 corridas simultáneas.

## Q1. [hogar] ¿Dónde corre el cerebro?

Contexto: el n8n original ya no existe. El NFR Design es agnóstico del hogar, pero la elección cambia el costo fijo, la operación y cómo se cumplen el tope de concurrencia y el arranque en frío.

A. Serverless propio en AWS: API Gateway (HTTP API) + AWS Lambda (Node.js) + DynamoDB (uso y cuotas) + S3 (inventario). Paga por uso, sin servidores que parchear; el tope de 15 invocaciones se fija con la concurrencia reservada de Lambda.
B. Contenedor propio en AWS: Application Load Balancer + ECS Fargate (Node.js, 2 tareas en 2 zonas) + DynamoDB + S3. Instancias siempre calientes, encaja literal con el semáforo por instancia del NFR Design; costo fijo mensual mayor.
C. Recrear n8n (autoalojado en AWS) como orquestador, con los mismos módulos puros dentro de nodos de código. Mantiene la herramienta original; agrega un servidor que operar y parchear.
X. Other (please specify)

[Answer]: B

## Q2. [región] ¿En qué región de AWS se despliega?

Contexto: el cerebro corre en una sola región (99,5 %). La región debe ofrecer en Bedrock el modelo de Claude elegido; la latencia desde Perú y Colombia pesa poco frente a los segundos del modelo.

A. us-east-1 (N. Virginia).
B. us-west-2 (Oregón).
C. sa-east-1 (São Paulo), si el modelo elegido está disponible ahí.
X. Other (please specify)

[Answer]: A

## Q3. [despliegue] ¿Cómo se despliega la infraestructura del cerebro?

Contexto: la IaC sería AWS CDK en JavaScript (mismo lenguaje del repo). El equipo trabaja directo en `main`, sin entornos de staging.

A. GitHub Actions con OIDC hacia AWS (sin claves estáticas): al hacer push a `main`, corre pruebas y `cdk diff`, y el despliegue espera la aprobación manual del mantenedor en un entorno protegido de GitHub. Un solo entorno.
B. Manual desde la máquina del mantenedor con `cdk deploy` y su perfil de AWS; el CI solo verifica (pruebas y `cdk synth`). Un solo entorno.
C. Dos entornos (dev y prod) con GitHub Actions y OIDC: dev se despliega solo al hacer push; prod con aprobación manual.
X. Other (please specify)

[Answer]: A

## Q4. [costo] ¿Cuál es el presupuesto mensual del cerebro?

Contexto: el NFR Design usa este valor para la alarma al 80 % (AWS Budgets) y para derivar el tope global de tokens por día y la cuota diaria por SE. Incluye Bedrock, la sonda de cada minuto y la infraestructura.

A. Hasta USD 50 al mes.
B. Hasta USD 100 al mes.
C. Hasta USD 200 al mes.
X. Other (please specify)

[Answer]: A
