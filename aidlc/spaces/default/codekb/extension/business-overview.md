# Business Overview — AWS Calculator RPA Extension

## Dominio de negocio

Herramienta interna de automatización (RPA) de Applying que convierte la lista de servicios de una solución cloud en un estimado de costos de AWS compartible. El dominio es la **preventa / ingeniería de soluciones**: los Solutions Engineers de Applying arman manualmente estimados en el AWS Pricing Calculator (`calculator.aws`) cada vez que preparan una propuesta de cliente, tarea repetitiva y lenta.

`calculator.aws` es una SPA estática de AWS construida sobre CloudScape Design System, sin API pública ni backend con el que integrarse. Por eso el enfoque es RPA sobre el DOM del navegador, no llamadas a servicio.

## Propósito

Eliminar el trabajo manual del SE: a partir de un JSON de servicios, la extensión abre `calculator.aws`, agrega y configura cada servicio, nombra el estimado y lo comparte, devolviendo una URL pública lista para la propuesta comercial. Es una revivida/retoma de una implementación v6 existente que lleva ~14 meses sin mantenimiento.

## Funcionalidad clave (implementada hoy, commit `45f888e`)

- **Entrada por popup**: el usuario pega un JSON `{ project, region, services: [...] }` y pulsa "⚡ Generar Estimado". (El JSON admite campos `fields` y toggles `__switch__:<toggle>`.)
- **Inyección del content script**: el popup localiza (o abre) una pestaña `https://calculator.aws/*`, verifica con `PING` e inyecta `content.js` vía `chrome.scripting.executeScript`.
- **Escaneo de DOM (`scanForm()`)**: enumera inputs de texto/número, native `select`, dropdowns CloudScape, checkboxes/toggles, radios, radios de tabla de instancias, sliders y radiogroups, resolviendo etiqueta y sección por campo.
- **Mapeo asistido por IA**: por servicio, `content.js` consulta un "cerebro" externo (workflow n8n + Anthropic Claude) en dos rondas — ronda 1 decide qué secciones expandir, ronda 2 mapea los valores pedidos a campos del DOM.
- **Ejecución de acciones**: rellena/selecciona/activa cada campo (`fill`/`select`/`dropdown`/`radio`/`checkbox`/`instance_search`/`instance_radio`/`toggle_on`/`toggle_off`).
- **Flujo por servicio**: Add service → Search all services → Configure → aplicar toggles y campos → Save and add service → volver a My Estimate.
- **Finalización**: renombra el estimado al nombre del proyecto (`renameEstimate`), comparte (`shareEstimate`: Share → Agree and continue → Copy link) y devuelve la URL pública.
- **Progreso en popup**: barra de progreso y mensajes de estado vía mensajes `PROGRESS`.

> **No implementado (requisito futuro, NO capacidad actual):** el **spotlight visual feedback** (FR5 en `requirements/calculator-rpa-requirements.md` y la constraint de overlay) — resaltar cada campo con un contorno y atenuar el resto de la página mientras el RPA actúa. No existe código de spotlight/overlay en el producto en commit `45f888e`. Tampoco existe el **selector de modo Create Calculator | ReAct** que pide FR1; el popup solo acepta JSON.

## Personas

- **Solutions Engineer (SE) de Applying** — usuario principal. Arma propuestas de nube y necesita el estimado compartible sin tipeo manual en la calculadora.
- **Autor de la Skill 3** — proceso/persona que produce el JSON de servicios que alimenta el popup.
- **Cliente final (indirecto)** — recibe la propuesta comercial que incluye la URL del estimado; no interactúa con la extensión.
- **Mantenedor de la extensión / del workflow n8n (indirecto)** — opera el "cerebro" de mapeo externo (n8n + Claude), fuera del repo.

## Transacciones de negocio

1. **Generar estimado desde JSON** — transacción principal: el SE pega el JSON, la extensión automatiza todo el alta/configuración de servicios y devuelve la URL pública del estimado. Es la única transacción end-to-end del producto.
2. **Copiar URL del estimado** — el popup ofrece "📋 Copiar URL" para llevar el enlace a la propuesta (`navigator.clipboard.writeText`).
3. **(Dominio, aún no cubierto por el código)** — confirmación fiable de guardado por el banner verde `Successfully added <Service> estimate.` y detección de validaciones obligatorias bloqueantes, según `requirements/AWS Calculator UI Flow.md`. Hoy el código asume éxito por URL/botón; ver `code-quality-assessment.md`.

## Valor de negocio

Ahorro de tiempo del SE en una tarea manual, repetitiva y propensa a error, acortando el ciclo de preparación de propuestas y estandarizando la convención de nombre y la región (US East, N. Virginia) de los estimados.
