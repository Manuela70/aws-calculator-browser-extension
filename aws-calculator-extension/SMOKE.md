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
corrida termina en ERROR con "Hay campos que no pude reconocer: …" y sin URL.
Eso es el comportamiento correcto: ajustar la etiqueta del JSON canónico (aquí y
en `sidepanel.js`) a la que muestra el formulario y volver a correr; nunca se
rellena por aproximación.

## Casos

### S1 — Caso canónico sobre un estimado vacío (≤ 3 min)

1. Abrir `https://calculator.aws/#/estimate` con un estimado **vacío**.
2. Panel → "Cargar ejemplo" → "Generar Estimado" → en la vista previa,
   "Generar en calculator.aws" (o "Revisar y generar" con el cerebro).
3. Esperado:
   - El progreso avanza ("Servicio 1 de 1"; en la fila: agregar, llenar cada
     campo, guardar; luego revisar el estimado, renombrar y obtener el enlace).
   - Resultado "Estimado listo." con "Amazon EC2: Guardado y confirmado" y un
     enlace `https://calculator.aws/…`.
   - Abrir el enlace en otra ventana: el estimado se llama **"Skeleton EC2"** y
     contiene **solo** el servicio EC2 (t3.micro, Linux, 1 instancia, On-Demand).
   - Duración (registro técnico) **≤ 180 s**; si es mayor, el smoke falla (NFR8.7).

### S2 — Fallo provocado por etiqueta inexistente

1. Vaciar el estimado (o abrir uno nuevo).
2. Pegar el JSON canónico añadiendo en `fields` `"Campo inexistente": "1"`.
3. Esperado: "No se generó el estimado." con "Algunos servicios no se
   completaron." y la línea "Amazon EC2: Hay campos que no pude reconocer:
   Campo inexistente…"; **sin URL** y sin guardar el servicio.

### S3 — Estimado con servicios previos

1. Con el estimado de S1 todavía abierto (ya tiene EC2), correr el JSON canónico.
2. Esperado: "El estimado de calculator.aws no está vacío. Ábrelo en una pestaña
   nueva y vuelve a intentar.", **sin URL**, con "Reintentar" visible, y el
   estimado existente queda intacto.

### S4 — Cerrar y reabrir el panel a mitad de corrida

1. Iniciar S1 sobre un estimado vacío; mientras configura EC2, cerrar el panel.
2. Reabrir el panel (icono): si la corrida sigue, muestra "Servicio N de M" con
   su último progreso; si ya terminó, abre en reposo y el resultado solo está
   dentro de "Última corrida", plegada (AC6.3.1).

### S5 — Cerrar la pestaña de calculator.aws a mitad de corrida

1. Iniciar S1; mientras configura EC2, cerrar la pestaña de `calculator.aws`.
2. Esperado: en **≤ 60 s** el panel muestra "La corrida dejó de responder.
   Revisa la pestaña de calculator.aws. Abre un estimado nuevo en
   calculator.aws y vuelve a generar." y "Volver" devuelve la entrada.
3. En "Historial de corridas" la corrida aparece como **Interrumpida**; al
   exportarla, las entradas llegan en orden (`seq` consecutivo) hasta el corte.

### S6 — Carga fallida del módulo

1. En `chrome://extensions`, con la extensión cargada, renombrar temporalmente
   `lib/content-main.js` (p. ej. a `content-main.js.bak`) y pulsar "Reload".
2. Recargar la pestaña de `calculator.aws` y correr el JSON canónico.
3. Esperado: error de conexión "No pude cargar la extensión en calculator.aws.
   Recarga la pestaña de calculator.aws y vuelve a intentar." con "Reintentar" y
   "Volver" (consola de la pestaña:
   `[aws-calc] loader No se pudo cargar lib/content-main.js`).
4. Restaurar el nombre del archivo, "Reload" de la extensión y recargar la pestaña.

### S7 — Registro técnico: exportar y borrar

1. Desplegar "Historial de corridas". "Exportar" en una corrida descarga `aws-calc-<runId>.json` con
   `{ runId, index, entries }`; sin credenciales ni tokens.
2. "Borrar" quita esa corrida de la lista; "Borrar todo" deja la lista vacía
   ("Todavía no hay corridas registradas."). Ambos están deshabilitados durante
   una corrida.

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
3. Esperado en el panel: "Estimado listo." con "Amazon EC2: Guardado y
   confirmado" y el enlace `https://calculator.aws/#/estimate?id=…` con
   "Copiar URL". Al abrir el enlace, el estimado tiene **solo** EC2 con los
   cuatro valores pedidos.

### R2 — Multi-servicio con toggle condicional

1. JSON con EC2 y Amazon Bedrock con `"template": "Advanced estimate"` (o la
   plantilla que ofrezca la calculadora) y un toggle de proveedor en `fields`
   (FIX-7: el campo del proveedor solo aparece tras activarlo).
2. Esperado: la región se fija una sola vez (en el primer formulario); la
   plantilla se elige antes de los toggles; el progreso muestra cada servicio
   ("Servicio 1 de 2", "Servicio 2 de 2") y cada paso en su fila. Panel:
   "Estimado listo." con ambos servicios
   confirmados; el enlace abre un estimado **completo** (los dos servicios).

### R3 — Servicio inexistente

1. JSON con un servicio `"search_term": "Servicio Fantasma"` seguido de EC2.
2. Esperado: el primero falla con "No encontré el servicio en el catálogo de la
   calculadora." sin abrir formulario; EC2 se procesa igual y fija la región.
   Panel: "Algunos servicios no se completaron. Abre un estimado nuevo antes de
   volver a generar.", **sin URL** y sin "Reintentar".

### R4 — Campo obligatorio vacío

1. Servicio cuyo formulario exige un campo que el JSON no llena (por ejemplo
   dejar vacío un campo marcado como obligatorio).
2. Esperado: al guardar aparece `is required`; un solo intento, sin reintentos.
   Panel: "La calculadora pide completar un campo obligatorio: <campo>." y "Me
   detuve en <campo>."; ERROR **sin URL**; el formulario se cierra sin guardar.

### R5 — Fallo a mitad de corrida con salida sin guardar

1. Tres servicios; el segundo con un valor de opción inexistente (p. ej.
   `"Operating system": "Plan 9"`).
2. Esperado: el segundo falla con '"Plan 9" no es una opción del campo …' (nada se elige
   por aproximación), sale sin guardar (se vuelve a My Estimate) y el tercero se
   procesa y confirma. Panel: ERROR con el segundo en faltantes y "Me detuve en
   …"; **sin URL**. My Estimate muestra solo el primero y el tercero.
3. Variante: si la salida sin guardar no se confirma en 20 s (p. ej. un modal que
   la bloquea), el panel dice "No pude salir del formulario sin guardar y detuve
   la corrida…" y los servicios restantes figuran con "No se procesó porque la
   corrida se detuvo antes.".

### R6 — Cancelación

1. Iniciar R2 y, mientras configura el segundo servicio, pulsar "Cancelar" en
   el panel y confirmar con "Sí, cancelar" (el panel envía `CANCEL_RPA` con el
   `runId` de la corrida en curso).
2. Esperado: el RPA deja de tocar la página en segundos, sale del formulario sin
   guardar y el panel vuelve a la entrada con "Cancelaste la corrida.",
   **sin URL**. Si la confirmación no llega en 20 s, vuelve igual con "No llegó la
   confirmación de la cancelación…". En "Última corrida" figura con error; el
   servicio en curso y los siguientes quedan como no procesados en el registro.

### R7 — Sustitución del cerebro

1. Con el cerebro conectado (U7), pedir EC2 con un valor aproximado, p. ej.
   `"Instance type": "t3.m"`.
2. Esperado: si el cerebro elige una opción escaneada distinta, el servicio se
   confirma y el panel avisa "Pediste t3.m; se usó t3.medium." Si elige
   exactamente lo pedido, no hay aviso. Con el cerebro caído o sin sesión, el
   servicio falla con "Hay campos que no pude reconocer: …" y **no** hay URL;
   sin sesión, el panel ofrece además "Iniciar sesión".

### R8 — Servicios homónimos

1. JSON con **dos** servicios EC2 (mismo `search_term`), con valores distintos.
2. Esperado: cada guardado se confirma con su **propio** banner nuevo
   "Successfully added Amazon EC2 estimate."; el banner del primero nunca
   confirma el segundo. Si el segundo no muestra banner nuevo en 3 intentos:
   "No pude confirmar que Amazon EC2 se guardó.", ERROR **sin URL**. Si ambos se
   confirman, My Estimate tiene exactamente dos EC2 y hay enlace.

### R9 — Overlay ausente tras cancelar

1. Iniciar R1 y, justo cuando un campo está resaltado, pulsar "Cancelar" y
   confirmar con "Sí, cancelar".
2. Esperado: el contorno y la etiqueta desaparecen al instante; en DevTools no
   queda ningún nodo `[data-aidlc-overlay]`; un nuevo "Generar Estimado" sobre un
   estimado vacío funciona normalmente.

### R10 — Campo que la página reformatea

1. Pedir EC2 con un valor numérico que la calculadora reescribe al perder el
   foco (por ejemplo, `"Number of instances": "1,000"` o un decimal con más
   precisión de la que el campo acepta).
2. Esperado: si el valor releído no es el pedido, el servicio falla con el
   texto de `field_not_applied` y la corrida termina en ERROR **sin URL**; si la
   calculadora conserva el valor, el servicio se guarda normalmente. Nunca DONE
   con un valor distinto del pedido.

### R11 — Servicio que se cuelga (corte de 3 minutos)

1. Iniciar R1 y, ya dentro del formulario de EC2, cortar la red de la pestaña
   (DevTools → Network → Offline) o pausar la página con el depurador para que
   el guardado no pueda confirmarse.
2. Esperado: a los 180 s (±1 s, medido con el registro técnico `run_start` /
   eventos del servicio) el servicio falla con el texto de `page_timeout` o
   `timeout:<paso>`, se sale sin guardar y la corrida termina en ERROR **sin
   URL**; los servicios siguientes quedan como `not_attempted` si la salida no
   se confirma.

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
| | | R10 | | | |
| | | R11 | | | |

## Casos del panel (U6)

Verifican la Zona B del panel lateral: render, foco, anuncios, tiempos y
accesibilidad. La Zona A (reductor, textos, URL, historial, WAF) se prueba con
`npm run test:u6`. Tiempos: en la consola del panel (clic derecho →
"Inspeccionar"), `performance.getEntriesByName("panel-ready")[0].startTime`
mide la apertura; repetir 5 veces y anotar el peor valor.

### P1 — Pestañas y aviso de privacidad

1. Abrir el panel: pestañas "JSON" y "Lenguaje natural", área de texto y
   "Generar Estimado"; sin mensajes de corridas anteriores.
2. Escribir en JSON, pasar a "Lenguaje natural" (clic y flechas), escribir y
   volver: cada pestaña conserva su texto. Cerrar y reabrir el panel: el texto
   sigue (sesión del navegador).
3. En "Lenguaje natural" se ve "No incluyas nombres de clientes ni datos
   personales; describe solo la arquitectura." y el lector de pantalla lo lee al
   entrar al área (`aria-describedby`).
4. Esperado: con el cerebro sin desplegar, "Generar Estimado" en lenguaje
   natural termina en "No pude conectar con el servicio de interpretación.
   Intenta más tarde." con el texto intacto.

### P2 — Vista previa

1. JSON sin `region` → "Generar Estimado".
2. Esperado: vista previa con cada servicio, su plantilla si la trae y
   "Región: us-east-1 (por defecto)". Editar el texto descarta la vista previa.

### P3 — Revisión Well-Architected con y sin cerebro

1. Sin cerebro desplegado: en la vista previa, "Revisar y generar" → "Iniciar
   sesión" → el login responde sin cerebro.
2. Esperado sin cerebro: la corrida sigue y aparece "Esta corrida no tiene
   revisión Well-Architected."; al terminar bien no hay evaluación final y se ve
   "Nueva corrida".
3. Con cerebro y sesión: sin hallazgos, "Revisión Well-Architected sin
   hallazgos." y la corrida arranca; con hallazgos, lista por servicio, pilar y
   severidad con "Llenar igual" y "Corregir". Al terminar bien, la evaluación
   final se lanza sola, con "Sin hallazgos" explícito por servicio y la URL
   visible arriba.

### P4 — Login y regla de 15 minutos

1. Con cerebro desplegado, sin sesión: "Revisar y generar" muestra "Iniciar
   sesión para revisar la configuración con Well-Architected." y el botón
   "Iniciar sesión".
2. Con una sesión de menos de 15 minutos (editarla como en S13), pasa lo mismo.
3. Cerrar la ventana de login: "No se completó el inicio de sesión." y el botón
   sigue disponible. Iniciar sesión: la revisión arranca sola.

### P5 — Cancelación

1. Durante "Interpretando…" o la revisión, pulsar Escape: vuelve a la entrada
   con el texto intacto y sin error.
2. Durante una corrida, "Cancelar" abre la confirmación con el foco en "Sí,
   cancelar"; Escape la cierra sin cancelar. Confirmar: ver R6.

### P6 — Reapertura durante una corrida

1. Iniciar R2 y cerrar el panel; reabrirlo en menos de 60 s.
2. Esperado: el panel abre en "Servicio N de M" con la entrada y el historial
   deshabilitados, y termina igual que sin cerrar. Apertura **≤ 500 ms**
   (marca `panel-ready`, peor de 5, con 100 corridas en el historial).

### P7 — Historial

1. Con más de 200 corridas en el registro, desplegar "Historial de corridas".
2. Esperado: lista en **≤ 1 s** con "Mostrando las 200 más recientes de N." y
   "Exportar todo"; enlace "Abrir estimado" solo en corridas con URL válida.
   Durante una corrida, "Borrar", "Borrar todo" y "Reparar índice" están
   deshabilitados.

### P8 — Accesibilidad y tiempos

1. Recorrer todo solo con teclado (Tab, flechas en las pestañas, Enter, Escape):
   cada control es alcanzable, con foco visible y objetivos de 44 px.
2. Con lector de pantalla: la región de estado anuncia "Validando…",
   "Interpretando…", "Conectando con calculator.aws…" y "Servicio N de M" sin
   anunciar cada acción; al entrar a un error el foco va al mensaje
   (`role="alert"`).
3. Contraste WCAG 2.1 AA (4,5:1 para texto) en textos de estado, errores,
   avisos y severidades; el estado de cada servicio se lee también como texto,
   no solo por color.
4. Ancho de 320 px: sin desplazamiento horizontal.
5. Tiempos: progreso reflejado en **≤ 200 ms** desde la llegada del evento
   (`performance.now()` en la consola) y los de P6 y P7.

| Fecha | Versión / commit | Caso | Duración | Resultado | Notas |
|---|---|---|---|---|---|
| | | P1 | | | |
| | | P2 | | | |
| | | P3 | | | |
| | | P4 | | | |
| | | P5 | | | |
| | | P6 | | | |
| | | P7 | | | |
| | | P8 | | | |

## U7 — Empaquetado y cliente del cerebro

Casos manuales del service worker, el login y el `.zip`. El login también se
prueba desde el panel con "Iniciar sesión" (P4); los mensajes del borde se
pueden enviar desde la consola del panel lateral (clic derecho en el panel →
"Inspeccionar"). Los casos con el
cerebro desplegado requieren haber corrido `node scripts/sync-brain-config.js`
con `infra/cdk-outputs.json` y recargado la extensión.

### S8 — Carga unpacked en Chrome 130 o posterior

1. `npm run check:bundle` termina en `check:bundle OK`.
2. "Reload" de la extensión en `chrome://extensions`: sin errores en la tarjeta
   y "service worker" activo.
3. Los permisos de la tarjeta muestran solo calculator.aws (y, si está
   configurado, el host del cerebro y el de Cognito); ningún CloudFront.

### S9 — Módulos de `lib/**` con URL dinámica desde el content script

1. Correr S1. En la consola de la pestaña de calculator.aws no aparece
   "Failed to fetch dynamically imported module" ni errores de
   `lib/connection/brain-port.js`.
2. En la pestaña de Red, los módulos de `lib/` se cargan desde
   `chrome-extension://<id dinámico>/`, distinto del id de la extensión.

### S10 — Cerebro sin configurar (`brain_unavailable`)

Con `sw/config.js` en `null`:

1. En la consola del panel:
   `await chrome.runtime.sendMessage({ type: "BRAIN_LOGIN" })` → `ok: false`,
   `error.code: "brain_unavailable"`, sin abrir ventana.
2. `await chrome.runtime.sendMessage({ type: "BRAIN_CALL", callId: "s10", operation: "interpret", body: { text: "ec2", locale: "es", schemaVersion: 1 } })`
   → `error.code: "unauthorized"` (sin token) o `brain_unavailable`; nunca `ok: true`.

### S11 — Login completo

Con el cerebro desplegado y sincronizado:

1. `await chrome.runtime.sendMessage({ type: "BRAIN_LOGIN" })` abre la ventana
   de Cognito; iniciar sesión con un usuario del grupo de SE.
2. La respuesta es `{ ok: true, expiresAt }` con `expiresAt` cerca de 1 hora.
3. `await chrome.runtime.sendMessage({ type: "BRAIN_SESSION" })` →
   `authenticated: true`.
4. En la consola de la pestaña de calculator.aws,
   `await chrome.storage.session.get(null)` falla o no muestra el token.

### S12 — Login cancelado

1. Enviar `BRAIN_LOGIN` dos veces seguidas y cerrar la ventana de Cognito.
2. Ambas respuestas son `error.code: "login_cancelled"`; `BRAIN_SESSION` sigue
   en `authenticated: false`.

### S13 — Token vencido (`unauthorized`)

1. Después de S11, en la consola del service worker (`chrome://extensions` →
   "service worker") editar la sesión:
   `const s = (await chrome.storage.session.get("brain:session"))["brain:session"]; await chrome.storage.session.set({ "brain:session": { ...s, expiresAt: Date.now() + 30000 } })`.
2. Una corrida con residuo (o un `BRAIN_CALL` de `interpret` desde el panel)
   responde `unauthorized` sin abrir ventanas; la corrida termina en `ERROR`
   sin URL, nunca en `DONE`.

### S14 — Cerebro caído (`brain_unavailable`)

1. Con la sesión activa, apuntar `BRAIN_BASE_URL` a un origen https que no
   responda (solo en la copia local, sin commit) y recargar.
2. `BRAIN_CALL` responde `brain_unavailable` (o `timeout` a los 30 s); una
   corrida con residuo termina sin `DONE`. Restaurar `sw/config.js` al terminar.

### S15 — `.zip` de distribución

1. `npm run package` termina en `package OK — N archivos en dist/aws-calculator-extension-<versión>.zip`.
2. Descomprimir en una carpeta temporal: no hay `*.md`, pruebas ni archivos
   ocultos; "Load unpacked" sobre esa carpeta carga sin errores (repetir S8).

| Fecha | Versión / commit | Caso | Duración | Resultado | Notas |
|---|---|---|---|---|---|
| | | S8 | | | |
| | | S9 | | | |
| | | S10 | | | |
| | | S11 | | | |
| | | S12 | | | |
| | | S13 | | | |
| | | S14 | | | |
| | | S15 | | | |
