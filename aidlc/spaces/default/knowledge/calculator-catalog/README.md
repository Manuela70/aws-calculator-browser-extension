# Inventario de calculator.aws — servicios y campos configurables

> Insumo para decidir cuánto del lenguaje natural puede resolverse de forma
> determinística (Q1 de Functional Design de u2-input-parsers). Fecha de corte:
> 2026-11-21. Fuente: las definiciones públicas que carga la propia calculadora
> (`https://d1qsjq9pzbk1k6.cloudfront.net/manifest/en_US.json` y
> `.../data/<serviceCode>/en_US.json`), no el DOM renderizado: describen cada
> formulario completo, incluidas las secciones condicionales que el DOM solo
> muestra tras ciertas selecciones.

## Cómo regenerarlo

```bash
node aidlc/spaces/default/knowledge/calculator-catalog/tools/build-inventory.mjs fetch 0 442
node aidlc/spaces/default/knowledge/calculator-catalog/tools/build-inventory.mjs build
```

`raw/manifest-en_US.json` es el catálogo; `raw/definitions/` (no versionado) las
442 definiciones; `inventory.json` el inventario plano por servicio (plantilla,
tarjeta, id, etiqueta, tipo, opciones, condicional).

## Cifras

| Medida | Valor |
|---|---|
| Servicios en el catálogo | 442 (436 activos) |
| Servicios sin campos configurables (estáticos o agregadores) | 41 |
| Campos configurables reales (sin textos ni alertas) | 3 985 |
| Campos cuantitativos (valor + unidad) | 3 110 (78 %) |
| Campos de opción cerrada (dropdown, radio, checkbox, estrategia de precio) | 709 (18 %) |
| Campos complejos o especializados | 166 (4 %) en 88 servicios |
| Campos condicionales (`displayIf`) | 1 231 (31 %) |
| Servicios con etiquetas repetidas dentro del formulario | 104 |
| Servicios con más de una plantilla (p. ej. EC2 Quick / Advanced) | 73 |
| Opciones por dropdown | mediana 2, p90 14, máximo 83 |
| Campos por servicio | 186 servicios con ≤ 5; 8 con > 50 |

Tipos cuantitativos: `numericInput` (1 649), `frequency` (502, valor por
periodo), `fileSize` (450, valor + unidad de datos), `durationInput` (274),
`percentInput` (184), `throughput` (32), `utilization` (18).

Tipos complejos: `columnFormIPM` (70 servicios; formularios tabulares por fila,
p. ej. instancias de Aurora), `dataTransferV2` (16 servicios), y componentes
propios de EC2 y de Windows/SQL Server (`instanceFinder`, `ec2InstanceSearch`,
`workload`, `ec2AdvPricingStrategy*`, `uploadTable`).

## Qué se puede resolver por catálogo y qué no

| Parte de la expresión | ¿Determinística? | Por qué |
|---|---|---|
| Identificar el servicio | Sí, con reglas | Hay nombre y `searchKeywords` por servicio (solo en inglés: los sinónimos en español hay que agregarlos). Hay ambigüedades que exigen una regla fija: "S3" es un paraguas con subservicios (S3 Standard, Intelligent-Tiering, Glacier…), "Amazon EC2" aparece dos veces (`eC2Next`, `ec2Enhancement`), y los proveedores de modelos de Bedrock figuran como entradas propias ("Anthropic", "OpenAI", "Meta"…). |
| Región | Sí | Código o nombre de región contra la tabla de regiones. |
| Cantidades con unidad | Sí | 78 % de los campos son valor + unidad ("100 GB", "1 millón de solicitudes al mes", "730 horas"). |
| Elegir una opción cerrada | Sí, si la expresión nombra la opción | Pocas opciones por campo (mediana 2); se compara contra la etiqueta de la opción. Si la expresión no la nombra, queda el valor por defecto del formulario. |
| Tipo de instancia EC2 | Sí, por patrón | `t3.micro`, `m5.large`… tienen forma fija; la lista viene de los datos de precios, no de la definición. |
| A qué campo va cada cantidad | Solo si es inequívoco | Si el servicio tiene un único campo de esa unidad, sí. Con varios campos del mismo tipo (S3 Standard tiene 3 `fileSize`), "100 GB" no dice cuál: es el residuo ambiguo. |
| Campos condicionales | Sí, con orden | El 31 % depende de otra selección; hay que fijar primero el campo padre (mismo principio que FR5.2 con los toggles). |
| Componentes complejos (tablas, transferencia de datos, cargas de trabajo) | No | Estructuras por fila o asistentes propios; van al cerebro o quedan fuera del alcance de la entrada libre. |

## Riesgo

La fuente es pública pero no es una API documentada: puede cambiar de forma o de
dirección sin aviso. El inventario se regenera con el script y se compara contra
el anterior; ningún código de la extensión depende de esta URL en tiempo de
ejecución.
