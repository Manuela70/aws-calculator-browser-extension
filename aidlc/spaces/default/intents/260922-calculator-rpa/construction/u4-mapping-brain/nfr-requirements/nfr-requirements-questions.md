# Preguntas de NFR Requirements — u4-mapping-brain

> Solo se pregunta lo que el Diseño Funcional dejó abierto para el cerebro. Ya
> está decidido y no se repregunta: Claude en Bedrock con credencial solo
> server-side (IAM), 25 s por operación, 1 reintento de salida del modelo,
> revisión Well-Architected en lotes de 5, inventario semanal versionado, ningún
> registro con datos del cliente, consumo de tokens medido por operación. El
> hogar concreto (recrear n8n o proxy Bedrock) se decide en Infrastructure
> Design.

## Q1. [seguridad] ¿Cómo se autentica la extensión ante el cerebro?

Contexto: el contrato dejó la autenticación reservada a un header (C1 de preguntas abiertas). Una clave fija en el bundle es una credencial de larga vida y está prohibida. Hace falta un token de corta vida por SE.

A. Inicio de sesión del SE con un proveedor de identidad gestionado (Amazon Cognito, con federación al directorio corporativo si existe) mediante `chrome.identity.launchWebAuthFlow`; token de 1 hora en memoria del service worker, renovado al vencer; el cerebro valida el token en cada llamada.
B. Igual que A, pero el token se guarda en `chrome.storage.session` para sobrevivir al reinicio del service worker durante la sesión del navegador.
C. Sin login: el cerebro solo acepta llamadas desde el ID de la extensión (cabecera `Origin`) y aplica límites de tasa por IP.
X. Other (please specify)

[Answer]: B

## Q2. [escala] ¿Cuántos SE usarán el cerebro?

Contexto: define los límites de tasa, la concurrencia de Bedrock y el costo esperado.

A. Hasta 10 SE, con un máximo de 3 corridas simultáneas.
B. Hasta 30 SE, con un máximo de 10 corridas simultáneas.
C. Más de 30 SE o uso por clientes externos.
X. Other (please specify)

[Answer]: A

## Q3. [confiabilidad] ¿Qué disponibilidad necesita el cerebro?

Contexto: sin cerebro, la pestaña de lenguaje natural y la revisión Well-Architected no funcionan (la corrida JSON tampoco inicia, porque la revisión es obligatoria desde U4).

A. 99 % mensual en horario laboral (lunes a viernes, 8:00 a 20:00, hora de Lima), sin redundancia multi-región.
B. 99,5 % mensual las 24 horas, en una sola región.
C. 99,9 % mensual, con conmutación a una segunda región.
X. Other (please specify)

[Answer]: B

## Q4. [costo] ¿Qué control de consumo de Bedrock aplicamos?

Contexto: BR6.2 mide los tokens por operación; NFR Design debe fijar límites. El monto es un presupuesto que decides tú, no una estimación.

A. Alerta al 80 % de un presupuesto mensual y tope diario por SE (corte con error visible al superarlo).
B. Solo alerta al 80 % del presupuesto mensual, sin cortes.
C. Solo medir, sin alertas ni cortes.
X. Other (please specify)

[Answer]: A
