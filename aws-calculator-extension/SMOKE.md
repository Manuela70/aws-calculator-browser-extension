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
