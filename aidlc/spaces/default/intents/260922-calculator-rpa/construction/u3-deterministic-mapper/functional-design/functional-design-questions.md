# Preguntas de Diseño Funcional — u3-deterministic-mapper

> U3 completa en sitio el mapeo provisional de U1 (`lib/mapping/deterministic-mapper.js`,
> `lib/mapping/option-match.js`): recibe los campos escaneados del formulario y
> los valores pedidos, y produce acciones para lo inequívoco y un residuo para
> lo demás. Cubre la parte de mapeo de US4.1.

## Contexto ya decidido (no se pregunta)

- Coincidencia de etiqueta exacta tras normalizar espacios y mayúsculas; nunca "contiene" ni "primer resultado" (U1, BR3.1-BR3.4).
- Un valor sin coincidencia única no se adivina: queda como residuo, y un servicio con residuo sin resolver falla tipado (U1 Q1).
- En u2 se decidió que el cerebro interpreta el lenguaje natural con el inventario de calculator.aws, así que las etiquetas que llegan son las del inventario; el residuo indica sobre todo diferencias entre el inventario y el formulario vivo.
- Inventario (`aidlc/spaces/default/knowledge/calculator-catalog/README.md`): 1 226 campos son valor + unidad (`fileSize` 450, `frequency` 502, `durationInput` 274); 104 servicios repiten etiquetas dentro del formulario.

## Q1 — Valores con unidad

Campos como "Storage amount" tienen un número y un selector de unidad (GB, TB…) o de periodo (por mes, por hora…).

A. **U3 descompone el valor (Recomendado).** "100 GB" se convierte en dos acciones: llenar 100 y elegir la unidad cuya opción coincida exactamente (normalizada) con "GB". Si la unidad no coincide con ninguna opción del selector, el valor va al residuo.
B. **Dos claves explícitas.** La configuración debe traer el número y la unidad por separado; U3 no descompone texto.
X. Other (please specify)

[Answer]: B

## Q2 — Qué pasa con el residuo

A. **Una consulta al cerebro y, si no, falla (Recomendado).** Con el cerebro integrado, el residuo de un servicio se envía una vez a `/map-residue` con los campos escaneados; lo que vuelva se valida contra esos campos. Lo que siga sin resolverse hace fallar el servicio, tipado. Sin cerebro, falla directo (como en U1).
B. **Nunca al cerebro.** Como el cerebro ya interpretó con el inventario, cualquier residuo es un fallo tipado; no hay segunda consulta.
X. Other (please specify)

[Answer]: A

## Q3 — Etiquetas repetidas en un mismo formulario

A. **La clave lleva la sección (Recomendado).** Si la etiqueta se repite, la configuración debe traer "Sección > Campo" (la tarjeta del formulario); con solo "Campo" y varias coincidencias, va al residuo.
B. **Por orden de aparición.** La primera coincidencia sin usar recibe el valor.
X. Other (please specify)

[Answer]: A
