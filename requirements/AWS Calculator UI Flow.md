# Flujo de la calculadora de precios de AWS (calculator.aws) — documentación de referencia para la extensión RPA

Documento generado a partir de una demostración grabada por Manu usando la calculadora real (`calculator.aws`), con narración explicando el propósito: automatizar por RPA el trabajo manual que hoy hacen los Solutions Engineers de Applying al armar estimados de costos para propuestas de cliente. Sirve como insumo de dominio para la etapa de Inception/Requirements del proyecto `extension` (AI-DLC v2).

## Contexto y motivación

La calculadora de AWS es una SPA estática: no tiene API pública ni MCP Server con el que integrarse directamente. Por eso el enfoque de automatización es RPA (manejar el DOM del navegador), no llamadas a un backend. Hoy este proceso lo hacen manualmente los SE de Applying cada vez que arman una propuesta de nube, y consume tiempo significativo — de ahí la necesidad de la extensión.

## Flujo general (alto nivel)

1. **Nombrar el estimado**: en la pantalla `My Estimate` (`calculator.aws/#/estimate`), clic en "Edit" junto al título, reemplazar el nombre por defecto (ej. "My Estimate") por una convención `AWS Calculator - <Cliente>`, y guardar. Esto asocia el estimado a un cliente específico.
2. **Añadir servicio**: clic en "Add Service" (botón naranja arriba a la derecha, o el botón central cuando el estimado está vacío). Esto navega a `#/addService`.
3. **Elegir método de búsqueda de servicio**: la pantalla ofrece dos radios:
   - **Search by location type** (default): filtra por tipo de ubicación (Region/Wavelength/Local Zone) — solo muestra servicios disponibles en esa ubicación.
   - **Search all services**: da acceso al catálogo completo (~190 servicios). **Este es el que se debe usar siempre primero**, para no perder servicios por un filtro de ubicación restrictivo.
4. **Buscar el servicio por nombre completo** en el campo "Find Service" (ej. "AWS Lambda", "Amazon Bedrock", "Amazon SageMaker", "Amazon EC2"). El campo filtra en vivo las tarjetas de servicio.
5. **Configurar el servicio**: clic en "Configure" en la tarjeta del servicio deseado. Esto navega a `#/createCalculator/<slug-del-servicio>` (ej. `/ec2-enhancement`, `/Glue`, `/VPC`).
6. **Llenar el formulario de configuración** (ver tipos de campos abajo).
7. **Región del servicio**: siempre confirmar que quede en **US East (N. Virginia)** — es el estándar que usa Applying para las propuestas, independientemente de la región que traiga por defecto el formulario (a veces aparece Ohio u otra por defecto y hay que cambiarla manualmente).
8. **Guardar el servicio**: botón "Save and add service" (agrega y vuelve a la pantalla de Add Service para seguir agregando) o "Save and view summary" (agrega y va directo al resumen).
9. Repetir 2-8 para cada servicio de la arquitectura.
10. **Compartir el estimado**: en la pantalla de resumen (`#/estimate`), botón "Share" → "Agree and Continue" → "Copy Link". Ese link es el que se entrega en las propuestas comerciales.

## Tipos de campos encontrados en los formularios de configuración

Los formularios de servicio no son homogéneos — cada servicio tiene su propio set de controles. Los patrones observados (relevantes para diseñar los selectores DOM de la extensión):

- **Descripción de texto libre**: campo `Description` al inicio de casi todo formulario — texto libre, no obligatorio para guardar en todos los casos.
- **Dropdowns simples**: ej. `Tenancy` (Shared/Dedicated Instances/Dedicated Hosts), `Operating System` (Linux/Windows/etc.), `Choose a Region`.
- **Radios con contenido condicional**: ej. `Workloads` en EC2 (Constant usage / Daily spike traffic / Weekly / Monthly). Seleccionar "Daily spike traffic" despliega un sub-formulario nuevo (`Daily spike pattern`) con:
  - Checkboxes de días de la semana (`Workload days`: Sunday…Saturday).
  - Campos numéricos (`Baseline`, `Peak`).
  - Campos de duración (`Hours`, `Minutes`).
- **Campos numéricos simples**: ej. `Number of instances`, que además dispara un cálculo en vivo mostrando la instancia EC2 más barata que cumple los requisitos (`EC2 Instances (N)` con `Chosen instance`, `Family`, `vCPU`, `Memory`).
- **Selector de instancia con tabla paginada**: al hacer "Search instance type" se abre una tabla con filtros (`Instance family`, `vCPUs`, `Memory (GiB)`, `Network performance`, checkbox "Show only current generation instances") y paginación (135 páginas en el caso observado). Cada fila es seleccionable por radio button.
- **Toggles tipo switch (on/off)**: usados para activar/desactivar sub-servicios o features dentro de un servicio (ej. en AWS Glue: `AWS Glue ETL jobs and interactive sessions`, `AWS Glue Crawlers`, etc.; en VPC: `VPN Connection`, `Transit Gateway`, `NAT Gateway`, etc.). Activar un toggle despliega su propia sección de configuración debajo.
- **Secciones colapsables**: muchas secciones del formulario vienen comprimidas por defecto (ej. `Amazon Elastic Block Store (EBS) - optional`, `Detailed monitoring - optional`, `Data transfer - optional`, `Additional costs - optional`) y hay que expandirlas con clic en la flecha (▶/▼) para ver o llenar sus campos. **Importante para el RPA: recorrer todo el DOM expandiendo secciones colapsadas, no asumir que un campo no existe si no es visible.**
- **Campos valor + unidad**: comunes en storage (ej. `General Purpose SSD (gp3) - Throughput`: un campo de valor numérico + un dropdown de unidad `MBps`; o snapshot storage: cantidad + unidad `GB`).
- **Dropdowns con opciones dependientes**: ej. `Snapshot Frequency` (`No snapshot storage` y otras).
- **Checkboxes simples**: ej. `Enable monitoring` bajo "Detailed monitoring".
- **Validación obligatoria bloqueante**: algunos campos son obligatorios y el formulario los marca en rojo con mensaje de error si se intenta guardar sin llenarlos (ej. en Transit Gateway: `Number of Transit Gateway attachments` e `Ingress data processed per TGW attachment` — ambos "is required"). **La extensión debe detectar estos mensajes de error tras un intento de guardado y no asumir éxito solo porque se hizo clic en el botón.**

## Confirmación de guardado

Al guardar exitosamente un servicio, la pantalla muestra un banner verde superior tipo `Successfully added <Service> estimate.` (ej. "Successfully added Amazon EC2 estimate.", "Successfully added AWS Glue estimate."). Este banner es una señal fiable de éxito que la extensión puede usar para confirmar que el paso se completó antes de continuar con el siguiente servicio.

## Resumen final observado

Tras agregar EC2 (con daily spike traffic, ~$2.65/mes), Glue (ETL jobs + Crawlers) y VPC (VPN Connection + Transit Gateway con 1 attachment / 10 GB), el resumen mostró:

- Upfront cost: 0.00 USD
- Monthly cost: 2.65 USD
- Total 12 months cost: 31.80 USD

La tabla de recursos (`AWS Calculator - Cliente`) lista cada servicio agregado con su descripción, costo mensual y región — esta tabla es la fuente de verdad final que la extensión debería poder leer/exportar para alimentar la propuesta.

## Implicaciones para el diseño de la extensión RPA

1. El DOM de la calculadora cambia de estructura según el servicio (no hay un formulario genérico) — el RPA necesita, como mínimo, un mapeo por servicio de qué campos existen y en qué orden, o un modo de "recorrido exhaustivo del DOM" que expanda todo lo colapsado antes de mapear campos.
2. La extensión debe manejar: dropdowns nativos, radios con contenido condicional, checkboxes, toggles tipo switch, campos numéricos, campos valor+unidad, tablas paginadas con selección por fila, y secciones colapsables.
3. Debe verificar mensajes de error de validación antes de considerar un guardado exitoso.
4. Debe normalizar siempre la región a **US East (N. Virginia)** salvo que la propuesta indique otra cosa explícitamente.
5. El banner verde de éxito es el checkpoint recomendado entre servicio y servicio.
6. El flujo de salida (compartir el link) es un paso corto y estable (Share → Agree and Continue → Copy Link) — buen candidato para ser el último paso automatizado antes de entregarle el link al flujo de generación de propuestas.