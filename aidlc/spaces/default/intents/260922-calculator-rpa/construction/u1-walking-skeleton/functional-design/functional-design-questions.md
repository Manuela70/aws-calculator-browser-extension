# Preguntas de Diseño Funcional — u1-walking-skeleton

> Unidad U1: el walking skeleton (un servicio simple, JSON → mapeo determinístico
> → RPA sobre `calculator.aws` → guardar con banner verde → URL). Solo se
> pregunta lo que las etapas anteriores dejaron abierto para esta unidad; lo ya
> decidido (agnóstico del cerebro, éxito todo-o-nada, confirmación solo por el
> banner verde, módulos compartidos con U2/U3/U5, Zona A/B) se toma como dado.

## Q1. [arquitectura] ¿Qué hace el skeleton con un campo del JSON que no coincide con ningún campo escaneado?

Contexto: en el skeleton no hay cerebro (U4); solo existe el mapeo determinístico mínimo (coincidencia exacta o normalizada de la etiqueta). Si un valor pedido no encuentra campo, hay que decidir si el servicio sigue o falla. La regla del proyecto prohíbe reportar éxito ante un fallo.

A. El servicio falla con resultado tipado ("campo no reconocido: <campo>"), no se guarda, y la corrida no devuelve URL.
B. Se guarda el servicio igual y se marca como confirmado-con-aviso (la corrida devuelve URL con advertencia).
C. Se ignora el campo y se continúa sin avisar.
X. Other (please specify)

[Answer]: A

## Q2. [arquitectura] ¿El skeleton renombra el estimado al nombre del proyecto antes de compartir?

Contexto: AC1.1.2 solo exige devolver la URL pública; el renombrado (FR10) es parte de US7.1, que pertenece a U5. El código v6 ya tiene `renameEstimate`, pero es frágil (busca un botón "Edit" y un input por placeholder).

A. No: el skeleton solo hace Share y devuelve la URL; el renombrado se construye en U5.
B. Sí: renombrar (si el JSON trae `project`) y luego Share, como el v6; un fallo al renombrar NO bloquea la URL.
C. Sí, y un fallo al renombrar hace fallar la corrida.
X. Other (please specify)

[Answer]: C

## Q3. [desarrollo] ¿Cómo carga el content script los módulos de lógica pura compartidos con U2/U3/U5?

Contexto: en MV3, los content scripts declarados en el manifest se cargan como scripts clásicos, no como módulos ES; pero la regla del proyecto exige que la capa de mapeo viva en su propio módulo ES y que Vitest pueda importarla. Esto fija la estructura de archivos que U2/U3/U5 heredan.

A. Un content script clásico y delgado que carga los módulos ES con `import(chrome.runtime.getURL(...))`, declarados en `web_accessible_resources` restringidos a `https://calculator.aws/*`.
B. Varios scripts clásicos listados en `content_scripts.js`, compartiendo un namespace global; los tests los importan mediante un shim de doble exportación.
C. El popup inyecta los archivos en orden con `chrome.scripting.executeScript` (scripts clásicos), sin declarar content scripts en el manifest.
X. Other (please specify)

[Answer]: A

## Q4. [desarrollo] ¿Qué cotas de reintento usa el skeleton para el handshake y la confirmación de guardado?

Contexto: NFR8.1 exige un máximo de intentos por operación y un error tipado al agotarlo. Hoy `saveService` reintenta 3 veces pero confirma por URL/botón (incorrecto), y el `PING` no reintenta.

A. Handshake: hasta 3 `PING` (1 s entre intentos) tras inyectar; guardado: hasta 3 clics en guardar, esperando el banner verde hasta 10 s cada vez; agotado → error tipado.
B. Mantener los valores del v6 tal cual y solo cambiar la señal de confirmación al banner verde.
C. Dejar las cotas como constantes con nombre y fijar los números en NFR Requirements.
X. Other (please specify)

[Answer]: A

## Q5. [desarrollo] ¿Qué pasa si el popup se cierra mientras la corrida está en marcha?

Contexto: el popup de Chrome se cierra al hacer clic fuera; la corrida sigue en la pestaña, pero el popup pierde los mensajes de progreso y el resultado final. Guardarlo para mostrarlo al reabrir exige el permiso `storage` (mínimo privilegio).

A. El skeleton exige mantener el popup abierto; se documenta en `SMOKE.md` y el resultado queda en la consola de la pestaña. Persistir el resultado se decide en U6.
B. Guardar el último resultado de la corrida en `chrome.storage.session` (añade el permiso `storage`) y mostrarlo al reabrir el popup.
C. Mostrar el resultado final como un aviso dentro de la propia página de `calculator.aws`.
X. Other (please specify)

[Answer]: X. Estaba pensando que mejor que un pop up. sea una ventada al lado derecho de la ventana del navegador. Y por otro lado, la memoria debe persistir, como vamos a tener un agente, el agente debe persistir la memoria en chat, en contexto y entre sesiones.

## Q6. [calidad] ¿Cuál es el caso canónico exacto del skeleton (el JSON del smoke)?

Contexto: el Definition of Done del Bolt 1 pide correr "un caso canónico de 1 servicio (p. ej. S3)". Las etiquetas reales del formulario de S3 no se pueden verificar sin el DOM vivo; el smoke las confirma.

A. `{"project":"Skeleton S3","region":"us-east-1","services":[{"name":"Amazon S3","search_term":"Amazon Simple Storage Service (S3)","fields":{"S3 Standard storage":"100"}}]}` — la unidad GB/mes se toma del valor por defecto del formulario.
B. El mismo caso S3, pero incluyendo también la unidad explícita (`"S3 Standard storage unit": "GB per month"`).
C. Otro servicio más simple, p. ej. AWS Lambda con solo `"Number of requests"`.
X. Other (please specify)

[Answer]: X. Una máquina EC2

## Q7. [arquitectura] ¿El panel lateral entra ya en el skeleton o es un cambio de alcance para U6?

Contexto (seguimiento de Q5): los requisitos, los mockups M1-M8 y U6 están definidos sobre un popup. Pasar a un panel lateral del navegador (Side Panel de Chrome, permiso `sidePanel`) cambia la superficie de la UI y el manifest (U7). El panel no se cierra al hacer clic fuera, lo que además resuelve la pérdida de progreso de Q5.

A. El skeleton ya usa el panel lateral en lugar del popup (mínimo: entrada JSON, progreso, resultado); U6 construye el resto de estados sobre el panel.
B. El skeleton mantiene un popup mínimo; el cambio a panel lateral se registra como cambio de alcance y lo construye U6.
C. Ambos: el skeleton abre el panel lateral y el popup queda solo como lanzador.
X. Other (please specify)

[Answer]: A

## Q8. [producto] ¿El agente con memoria persistente es una capacidad nueva del alcance, y qué parte entra en el skeleton?

Contexto (seguimiento de Q5): los requisitos actuales no incluyen un agente conversacional; el "cerebro" (U4) solo mapea el residuo y evalúa el WAF, sin chat. Persistir memoria "en chat, en contexto y entre sesiones" es una capacidad nueva que toca requisitos, U4 y U6. El skeleton está acotado a un servicio de punta a punta.

A. Es una capacidad nueva: se registra como cambio de alcance para planificarla (requisito nuevo, U4/U6); el skeleton solo persiste el último resultado de la corrida para que sobreviva al cierre.
B. El skeleton ya debe guardar un historial de conversación persistente entre sesiones (aunque todavía no haya agente que lo use).
C. No es capacidad nueva: me refiero solo a que el resultado y el estado de la corrida persistan entre sesiones.
X. Other (please specify)

[Answer]: A

## Q9. [arquitectura] ¿Dónde vive la memoria persistente?

Contexto (seguimiento de Q5): guardarla en el navegador (`chrome.storage.local`) no requiere red ni servidor pero queda solo en ese navegador; guardarla en el cerebro server-side (U4) la hace compartible entre equipos pero exige red y autenticación. La regla dura prohíbe guardar credenciales en el cliente; el historial de chat no es una credencial.

A. En el navegador (`chrome.storage.local`, permiso `storage`), por usuario y por equipo.
B. En el cerebro server-side (U4), asociada al usuario.
C. Ambas: local como caché y server-side como fuente de verdad.
X. Other (please specify)

[Answer]: X. Memoria del agente en un backend junto al cerebro (U4), definida al planificar el agente (capacidad nueva, Q8); el último resultado de la corrida del skeleton en `chrome.storage.local`. (Respuesta del humano a la pregunta "Deberíamos configurar un backend para la memoria no?" + "adelante".)

## Q10. [calidad] ¿Qué configuración exacta tiene la máquina EC2 del caso canónico?

Contexto (seguimiento de Q6): EC2 no es un servicio "simple": su formulario usa la tabla de instancias con radios por fila (FIX-5) y radiogroups con nombre desde el heading (FIX-6), que hoy pertenecen a U5. Elegir EC2 para el skeleton adelanta esa parte del RPA a U1.

A. EC2 mínimo: 1 instancia `t3.micro`, Linux, On-Demand, us-east-1; todo lo demás con los valores por defecto del formulario. El skeleton incluye la búsqueda y el radio de la tabla de instancias (se adelanta de U5).
B. EC2 mínimo como en A, pero el skeleton arranca con S3 y EC2 queda como segundo caso del smoke cuando U5 entregue FIX-5/FIX-6.
C. EC2 con otra configuración (indícala).
X. Other (please specify)

[Answer]: A

## Consolidated Summary Confirmation

- Q1: un campo del JSON sin coincidencia en el formulario hace fallar el servicio con resultado tipado ("campo no reconocido"); no se guarda y la corrida no devuelve URL.
- Q2: el skeleton renombra el estimado al `project` del JSON y luego hace Share; un fallo al renombrar hace fallar la corrida (sin URL).
- Q3: content script clásico y delgado que carga los módulos ES compartidos con `import(chrome.runtime.getURL(...))`, declarados en `web_accessible_resources` solo para `https://calculator.aws/*`.
- Q4: hasta 3 `PING` (1 s entre intentos) tras inyectar; hasta 3 clics en guardar esperando el banner verde hasta 10 s cada vez; agotado → error tipado.
- Q5 + Q7: la UI del skeleton es un panel lateral (Side Panel de Chrome, permiso `sidePanel`) en lugar del popup: entrada JSON, progreso y resultado. U6 construye el resto de estados sobre el panel. Es un cambio de alcance respecto a los requisitos y mockups (popup).
- Q8: el agente conversacional con memoria persistente es una capacidad nueva, fuera del skeleton, a planificar aparte (requisito nuevo, U4/U6).
- Q9: la memoria del agente vivirá en un backend junto al cerebro (U4), definida al planificar el agente; el skeleton solo guarda el último resultado de la corrida en `chrome.storage.local` (permiso `storage`).
- Q6 + Q10: caso canónico = 1 instancia EC2 `t3.micro`, Linux, On-Demand, us-east-1, resto por defecto. El skeleton adelanta de U5 la búsqueda de instancia y el radio de la tabla de instancias (FIX-5/FIX-6).

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
