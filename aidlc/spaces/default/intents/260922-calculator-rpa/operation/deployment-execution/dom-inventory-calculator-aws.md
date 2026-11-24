# Inventario del DOM de calculator.aws (2026-11-23)

> Levantado en vivo con Chrome sobre `https://calculator.aws/#/addService` y `#/createCalculator/ec2-enhancement`, antes de ajustar el RPA (pedido de la mantenedora: primero conocer los componentes de la página). Base para corregir `lib/dom/selectors.js` y `lib/dom/dom-resolver.js`, que son el punto único de ajuste ante cambios de la UI (riesgo P2).

## Pantalla "Add service"

| Componente | Estructura | Nota para el RPA |
|---|---|---|
| Banner de cookies | `role="dialog"`, título "Select your cookie preferences", botones Accept / Decline / Customize | Aparece en la primera visita; también es un `role="dialog"`, así que no sirve buscar "el diálogo abierto" sin acotar |
| Modo de búsqueda | Radios "Search by location type" (marcado) / "Search all services" | — |
| Choose a location type | `label for` → `button.awsui_button-trigger`, `aria-haspopup="listbox"`, valor "Region" | — |
| Choose a Region | `label for` → `button.awsui_button-trigger`, **`aria-haspopup="dialog"`**, valor por defecto "US East (Ohio)" | Lista con campo de filtro y grupos por continente |
| Find Service | `input type="search"` | Filtra las tarjetas de servicios |
| Tarjetas | Título del servicio + botón "Configure" | — |

## Opciones de "Choose a Region"

```html
<div role="option" aria-selected="false" data-group-index="1" data-child-index="1">
  <span data-value="us-east-1" title="US East (N. Virginia)">
    <span>US East (N. Virginia)</span><span>us-east-1</span>
  </span>
</div>
```

- Texto visible: `"US East (N. Virginia)\nus-east-1"`. **La comparación exacta contra el nombre falla**: fue la causa de "El campo Region no quedó con el valor pedido".
- `title` = nombre visible; `data-value` = código de la región.
- Los encabezados de grupo ("North America", "Africa"…) también tienen la clase `awsui_option-content` pero no son `role="option"`.

## Formulario "Configure Amazon EC2"

Repite "Choose a location type" y "Choose a Region" arriba, con el mismo control.

| Tipo | Campos |
|---|---|
| Lista (`aria-haspopup="listbox"`) | Tenancy, Operating system, Instance family, vCPUs, Memory (GiB), Network performance, Storage for each EC2 instance, Unit (MBps, GB), Snapshot Frequency, Data transfer from / to, Data amount (TB per month ×3) |
| Número | Number of instances, Value, Storage amount, Enter Amount (×3) |
| Texto | Description, General Purpose SSD (gp3) - IOPS, costo adicional |
| Búsqueda | Search instance type (filtra la tabla de tipos de instancia) |
| Radios sin `label for` | Workloads: consistent, daily, weekly, monthly |
| Radios con `value` estable | Modelo de precio: `compute-savings`, `instance-savings`, `on-demand`, `spot`, `standard`, `convertible`; anidados: plazo `1 Year` / `3 Year`, pago `None` / `Partial` / `All` |
| Secciones opcionales | EBS, Detailed monitoring, Data transfer, Additional costs (`h2`/`h3`) |
| Botones finales | "Save and view summary", "Save and add service", "Cancel" |

**Etiquetas no únicas:** "Unit", "Enter Amount", "Data amount", "1 year", "3 year", "No upfront", "Partial upfront" y "All upfront" se repiten. Para esos campos el RPA tiene que acotar por sección o por grupo, no solo por etiqueta.

## Cambios aplicados a partir de este inventario

- `dropdown.optionLabel` en `selectors.js` y `optionLabel()` en `dom-resolver.js`: la opción se compara por el `title` de su span con `data-value` y, si no lo tiene, por el texto visible.
