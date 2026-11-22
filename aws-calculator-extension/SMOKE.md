# Smoke manual — walking skeleton (U1)

Verificación de la Zona B (RPA sobre el DOM real de `calculator.aws`), que no se
automatiza (NFR6.2). La Zona A se verifica con `npm run coverage` en la raíz del
repo. Correr este smoke tras cada cambio que toque `lib/dom/**`, `content.js`,
`lib/content-main.js`, `sidepanel.*`, `background.js` o `manifest.json`, y
anotar el resultado en el registro de ejecuciones del final.

## Preparación

1. En la raíz del repo: `npm run lint` y `npm run coverage` en verde.
2. `chrome://extensions` → modo desarrollador → "Load unpacked" sobre
   `aws-calculator-extension/` (o "Reload" si ya estaba cargada). Chrome 116 o
   superior.
3. Recargar (F5) cualquier pestaña de `calculator.aws` que estuviera abierta
   antes de recargar la extensión.
4. Pulsar el icono de la extensión: se abre el **panel lateral** (no un popup).

Duración de una corrida: en el panel, la lista "Registro técnico" muestra la
duración (`run_end − run_start`). También se puede exportar la corrida y leer
`ts` de las entradas `run_start` y `run_end`.

## JSON canónico (EC2 t3.micro)

Es el mismo que carga el botón "Cargar ejemplo (EC2 t3.micro)":

```json
{
  "project": "Skeleton EC2",
  "region": "us-east-1",
  "services": [
    {
      "name": "Amazon EC2",
      "search_term": "Amazon EC2",
      "fields": {
        "Operating system": "Linux",
        "Number of instances": "1",
        "Instance type": "t3.micro",
        "Pricing strategy": "On-Demand"
      }
    }
  ]
}
```

Si alguna etiqueta no coincide con el formulario vivo de EC2 (riesgo P2), la
corrida termina en ERROR con "No reconocí el campo … en Amazon EC2." y sin URL.
Eso es el comportamiento correcto: ajustar la etiqueta del JSON canónico (aquí y
en `sidepanel.js`) a la que muestra el formulario y volver a correr; nunca se
rellena por aproximación.

## Casos

### S1 — Caso canónico sobre un estimado vacío (≤ 3 min)

1. Abrir `https://calculator.aws/#/estimate` con un estimado **vacío**.
2. Panel → "Cargar ejemplo" → "Generar Estimado".
3. Esperado:
   - El progreso avanza (conectar, configurar EC2, cada campo, intentos de
     guardado, verificación, renombrado, enlace).
   - Resultado "✅ Estimado listo." con "Amazon EC2: guardado y confirmado." y un
     enlace `https://calculator.aws/…`.
   - Abrir el enlace en otra ventana: el estimado se llama **"Skeleton EC2"** y
     contiene **solo** el servicio EC2 (t3.micro, Linux, 1 instancia, On-Demand).
   - Duración (registro técnico) **≤ 180 s**; si es mayor, el smoke falla (NFR8.7).

### S2 — Fallo provocado por etiqueta inexistente

1. Vaciar el estimado (o abrir uno nuevo).
2. Pegar el JSON canónico añadiendo en `fields` `"Campo inexistente": "1"`.
3. Esperado: ERROR con "No todos los servicios quedaron guardados…" y la línea
   "No reconocí el campo Campo inexistente en Amazon EC2."; **sin URL** y sin
   guardar el servicio.

### S3 — Estimado con servicios previos

1. Con el estimado de S1 todavía abierto (ya tiene EC2), correr el JSON canónico.
2. Esperado: ERROR "El estimado abierto ya tiene servicios. Vacíalo o abre uno
   nuevo…", **sin URL**, y el estimado existente queda intacto.

### S4 — Cerrar y reabrir el panel a mitad de corrida

1. Iniciar S1 sobre un estimado vacío; mientras configura EC2, cerrar el panel.
2. Reabrir el panel (icono): debe mostrar la corrida en curso y su último
   progreso, o su resultado si ya terminó ("Resultado de la corrida" / "Última
   corrida").

### S5 — Cerrar la pestaña de calculator.aws a mitad de corrida

1. Iniciar S1; mientras configura EC2, cerrar la pestaña de `calculator.aws`.
2. Esperado: en **≤ 60 s** el panel muestra "La corrida dejó de responder…" y el
   botón vuelve a estar habilitado.
3. En "Registro técnico" la corrida aparece como **interrumpida**; al
   exportarla, las entradas llegan en orden (`seq` consecutivo) hasta el corte.

### S6 — Carga fallida del módulo

1. En `chrome://extensions`, con la extensión cargada, renombrar temporalmente
   `lib/content-main.js` (p. ej. a `content-main.js.bak`) y pulsar "Reload".
2. Recargar la pestaña de `calculator.aws` y correr el JSON canónico.
3. Esperado: ERROR "No pude cargar la extensión en calculator.aws. Recarga la
   pestaña de calculator.aws y vuelve a intentar." (consola de la pestaña:
   `[aws-calc] loader No se pudo cargar lib/content-main.js`).
4. Restaurar el nombre del archivo, "Reload" de la extensión y recargar la pestaña.

### S7 — Registro técnico: exportar y borrar

1. "Exportar" en una corrida descarga `aws-calc-<runId>.json` con
   `{ runId, index, entries }`; sin credenciales ni tokens.
2. "Borrar" quita esa corrida de la lista; "Borrar todo" deja la lista vacía y
   el tamaño en 0 B. Ambos están deshabilitados durante una corrida.

## Casos del RPA (U5)

Verifican sobre el DOM vivo lo que la Zona A no puede probar: cascada de
resolución, FIX-1 a FIX-9, plantilla, guardado confirmado solo por el banner
verde nuevo, salida sin guardar, cancelación y Spotlight. Todos parten de un
estimado **vacío**. En cada caso se anota la duración y se revisa que ningún
caso de fallo muestre un enlace.

Comprobación común a todos: tras terminar (bien o mal) **no queda overlay** del
Spotlight en la página (DevTools → Elements: ningún nodo `[data-aidlc-overlay]`).

### R1 — Servicio simple canónico (EC2)

1. JSON canónico de arriba ("Cargar ejemplo") → "Generar Estimado".
2. Durante la corrida, cada campo se resalta (contorno naranja y etiqueta) antes
   de llenarse; con "Reducir movimiento" del sistema activo, sin animación.
3. Esperado en el panel: "✅ Estimado listo." con "Amazon EC2: guardado y
   confirmado." y el enlace `https://calculator.aws/#/estimate?id=…`. Al abrir
   el enlace, el estimado tiene **solo** EC2 con los cuatro valores pedidos.

### R2 — Multi-servicio con toggle condicional

1. JSON con EC2 y Amazon Bedrock con `"template": "Advanced estimate"` (o la
   plantilla que ofrezca la calculadora) y un toggle de proveedor en `fields`
   (FIX-7: el campo del proveedor solo aparece tras activarlo).
2. Esperado: la región se fija una sola vez (en el primer formulario); la
   plantilla se elige antes de los toggles; el progreso muestra cada servicio
   (1/2, 2/2) y cada paso. Panel: "✅ Estimado listo." con ambos servicios
   confirmados; el enlace abre un estimado **completo** (los dos servicios).

### R3 — Servicio inexistente

1. JSON con un servicio `"search_term": "Servicio Fantasma"` seguido de EC2.
2. Esperado: el primero falla con "No encontré el servicio Servicio Fantasma en
   la calculadora." sin abrir formulario; EC2 se procesa igual y fija la región.
   Panel: ERROR "No todos los servicios quedaron guardados…", **sin URL**.

### R4 — Campo obligatorio vacío

1. Servicio cuyo formulario exige un campo que el JSON no llena (por ejemplo
   dejar vacío un campo marcado como obligatorio).
2. Esperado: al guardar aparece `is required`; un solo intento, sin reintentos.
   Panel: "Falta un dato obligatorio en <servicio>: <campo>." y "Me detuve en
   <campo>."; ERROR **sin URL**; el formulario se cierra sin guardar.

### R5 — Fallo a mitad de corrida con salida sin guardar

1. Tres servicios; el segundo con un valor de opción inexistente (p. ej.
   `"Operating system": "Plan 9"`).
2. Esperado: el segundo falla con "Ninguna opción coincide con …" (nada se elige
   por aproximación), sale sin guardar (se vuelve a My Estimate) y el tercero se
   procesa y confirma. Panel: ERROR con el segundo en faltantes y "Me detuve en
   …"; **sin URL**. My Estimate muestra solo el primero y el tercero.
3. Variante: si la salida sin guardar no se confirma en 20 s (p. ej. un modal que
   la bloquea), el panel dice "No pude salir del formulario sin guardar; detuve
   la corrida…" y los servicios restantes figuran como "no se procesó".

### R6 — Cancelación

1. Iniciar R2 y, mientras configura el segundo servicio, cancelar la corrida
   desde el panel (mensaje `CANCEL_RPA` con el `runId`). Mientras U6 no tenga el
   botón, desde la consola del panel lateral (clic derecho → Inspeccionar):
   `chrome.tabs.sendMessage(<tabId>, { type: "CANCEL_RPA", runId: "<runId>" })`,
   con el `runId` y el `tabId` del "Registro técnico" de la corrida en curso.
2. Esperado: el RPA deja de tocar la página en segundos, sale del formulario sin
   guardar y el panel muestra "Cancelaste la corrida; los servicios pendientes no
   se procesaron." **sin URL**; el servicio en curso y los siguientes figuran como
   "no se procesó".

### R7 — Sustitución del cerebro

1. Con el cerebro conectado (U7), pedir EC2 con un valor aproximado, p. ej.
   `"Instance type": "t3.m"`.
2. Esperado: si el cerebro elige una opción escaneada distinta, el servicio se
   confirma y el panel avisa "Pediste t3.m; se usó t3.medium." Si elige
   exactamente lo pedido, no hay aviso. Con el cerebro caído o sin sesión, el
   servicio falla con "No reconocí el campo …" y **no** hay URL.

### R8 — Servicios homónimos

1. JSON con **dos** servicios EC2 (mismo `search_term`), con valores distintos.
2. Esperado: cada guardado se confirma con su **propio** banner nuevo
   "Successfully added Amazon EC2 estimate."; el banner del primero nunca
   confirma el segundo. Si el segundo no muestra banner nuevo en 3 intentos:
   "No pude confirmar que Amazon EC2 se guardó.", ERROR **sin URL**. Si ambos se
   confirman, My Estimate tiene exactamente dos EC2 y hay enlace.

### R9 — Overlay ausente tras cancelar

1. Iniciar R1 y cancelar justo cuando un campo está resaltado.
2. Esperado: el contorno y la etiqueta desaparecen al instante; en DevTools no
   queda ningún nodo `[data-aidlc-overlay]`; un nuevo "Generar Estimado" sobre un
   estimado vacío funciona normalmente.

## Registro de ejecuciones

| Fecha | Versión / commit | Caso | Duración | Resultado | Notas |
|---|---|---|---|---|---|
| | | S1 | | | |
| | | S2 | | | |
| | | S3 | | | |
| | | S4 | | | |
| | | S5 | | | |
| | | S6 | | | |
| | | S7 | | | |
| | | R1 | | | |
| | | R2 | | | |
| | | R3 | | | |
| | | R4 | | | |
| | | R5 | | | |
| | | R6 | | | |
| | | R7 | | | |
| | | R8 | | | |
| | | R9 | | | |
