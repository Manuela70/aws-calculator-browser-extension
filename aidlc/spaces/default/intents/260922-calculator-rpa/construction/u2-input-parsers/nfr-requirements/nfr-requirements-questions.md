# Preguntas de NFR Requirements — u2-input-parsers

> Solo se pregunta lo que el Diseño Funcional y las reglas del proyecto dejaron
> abierto para u2. Ya está decidido y no se repregunta: validación estricta con
> esquema cerrado, topes comunes con C2 (20 servicios, 30 claves, 100
> caracteres), 2000 caracteres para lenguaje natural, 30 s de espera al cerebro,
> respuesta del cerebro tratada como dato no confiable y mostrada solo como
> texto plano, cero dependencias de runtime (validador escrito a mano), Vitest
> con piso de 80 % sobre la Zona A.

## Q1. [seguridad] ¿Qué hacemos con datos del cliente dentro del texto en lenguaje natural?

Contexto: en la pestaña de lenguaje natural el SE puede escribir el nombre del cliente, montos o detalles del proyecto. Ese texto viaja al cerebro (`/interpret`, Claude en Bedrock) y queda en el registro técnico local de U1. Custodiamos los datos de los clientes, así que conviene fijar el criterio ahora.

A. Aviso en la pestaña ("No incluyas nombres de clientes ni datos personales; describe solo la arquitectura") y el registro técnico local guarda solo la longitud del texto y su resultado, nunca el texto.
B. Solo el aviso en la pestaña; el registro técnico guarda el texto completo para depurar.
C. Sin aviso; el registro técnico guarda solo la longitud y el resultado.
X. Other (please specify)

[Answer]: A

## Q2. [seguridad] ¿Qué guarda el registro técnico de una configuración JSON rechazada?

Contexto: cuando el JSON no pasa la validación, el registro técnico de U1 anota el error. El JSON puede traer el campo `project` con el nombre del cliente.

A. Solo el código de error, la ruta (servicio y clave) y el tamaño del texto; nunca el contenido ni el valor de `project`.
B. El código de error y el JSON completo, para poder reproducir el fallo.
X. Other (please specify)

[Answer]: B
