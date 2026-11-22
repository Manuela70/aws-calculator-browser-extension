# Refined Mockups — Preguntas de diseño

> No hubo rough-mockups (etapa en SKIP). Diseño sobre el `popup.html` existente
> (tema oscuro, branding Applying, español) + las historias + el flujo de dominio.
> Las decisiones de contenido ya están (entrada NL/JSON, errores por servicio,
> resumen, WAF, spotlight). Estas preguntas afinan el layout del popup. Responde
> cada `[Answer]:`.

## Q1 — Disposición de la entrada (NL vs JSON) en el popup

La entrada acepta lenguaje natural o JSON en el mismo popup. ¿Cómo prefieres presentarlos?

A. **Un único área de texto** que acepta ambos (detecta si es JSON válido o lo trata como lenguaje natural); un solo botón "Generar Estimado". Lo más simple.
B. **Dos pestañas/toggles** "Lenguaje natural" / "JSON" dentro del popup, cada una con su área de texto; un botón "Generar Estimado" común.
C. **Un área de texto + un botón "Importar JSON"** (cargar archivo) junto al área de texto libre.
X. Other (please specify)

[Answer]: B

## Q2 — Dónde vive el panel de recomendaciones Well-Architected

El WAF es una acción posterior sobre el estimado ya construido. ¿Dónde se muestra?

A. **En el mismo popup**, en una sección/acordeón que aparece tras completar el estimado, con un botón "Evaluar Well-Architected".
B. **Una vista aparte dentro del popup** (segunda pantalla/tab del popup) a la que se navega tras generar el estimado.
C. **Other** (p. ej. un panel inyectado en la página calculator.aws).

[Answer]: B

## Q3 — Resumen final por servicio (pedido-vs-confirmado)

El resumen al terminar muestra cada servicio con su estado. ¿Qué formato prefieres?

A. **Lista vertical** con un ícono de estado (✓ confirmado / ✗ fallido + motivo) por servicio, y el veredicto global (URL o error todo-o-nada) arriba.
B. **Tabla compacta** (servicio | estado | motivo) + veredicto global.
X. Other (please specify)

[Answer]: A

## Q4 — Accesibilidad / responsive

El popup de una extensión tiene ancho fijo (~360-420px) y no es responsive como una web. ¿Qué nivel de accesibilidad fijamos?

A. **WCAG 2.1 AA** como baseline (contraste ≥4.5:1, foco visible por teclado, labels visibles, estado no solo por color, respeta `prefers-reduced-motion` en el spotlight). Sin responsive (ancho fijo de popup).
B. Solo lo mínimo funcional, sin comprometer un nivel WCAG.
X. Other (please specify)

[Answer]: A

## Consolidated Summary Confirmation

- Q1 (entrada): dos pestañas/toggles "Lenguaje natural" / "JSON" dentro del popup, cada una con su área de texto, botón "Generar Estimado" común.
- Q2 (WAF): vista aparte dentro del popup (segunda pantalla/tab) a la que se navega tras generar el estimado.
- Q3 (resumen): lista vertical con ícono de estado por servicio (✓ confirmado / ✗ fallido + motivo) y veredicto global (URL o error todo-o-nada) arriba.
- Q4 (accesibilidad): WCAG 2.1 AA como baseline (contraste ≥4.5:1, foco visible por teclado, labels visibles, estado no solo por color, prefers-reduced-motion en el spotlight); sin responsive (ancho fijo de popup).
- Base: diseño sobre el popup.html existente (tema oscuro, branding Applying, español); overlay spotlight sobre la página calculator.aws; sin nueva pantalla fuera del popup.

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
