# Preguntas de Diseño Funcional — u5-rpa-dom

> U5 completa en sitio el RPA del skeleton (`lib/rpa/**`, `lib/dom/**`): flujo
> por servicio con varias pasadas de mapeo (u3), resolución en cascada, FIX-1 a
> FIX-9, confirmación por banner verde, agregación todo-o-nada, renombrado,
> Share y spotlight. Cubre US4.1-US4.4, US6.1, US6.2, US7.1 y US8.1.

## Contexto ya decidido (no se pregunta)

- Éxito solo por banner verde; `is required` es fallo; URL solo si todos los servicios pedidos se confirmaron (`project.md`, AC7.1.2).
- Corte duro de 3 minutos por servicio, estimado vacío al empezar, sin borrar datos del SE (u1).
- Toggles antes del primer escaneo; mapeo por pasadas (máx. 3); residuo una vez al cerebro (u3).
- Una revisión de u4 dejó abierta la elección de plantilla en servicios con varias (73 en el inventario, p. ej. EC2 Quick / Advanced).

## Q1 — Un servicio falla en una corrida de varios

A. **Seguir con los demás y no dar URL (Recomendado).** Se procesan todos para que el SE vea el estado de cada uno; como falta al menos uno, no hay URL y se listan los faltantes.
B. **Detener la corrida en el primer fallo.** Más rápido, pero el SE no sabe si los demás habrían funcionado.
X. Other (please specify)

[Answer]: A

## Q2 — Servicios con varias plantillas

A. **Solo la plantilla por defecto (Recomendado).** El bot usa la plantilla que la calculadora abre por defecto; pedir campos de otra plantilla es un error visible (`unsupported_component`) que nombra la plantilla. Se amplía cuando haga falta.
B. **Elegible por la configuración.** Una clave `__template__` en el servicio indica qué plantilla abrir; afecta al esquema de u2, a u3 y al cerebro (u4).
X. Other (please specify)

[Answer]: B — el mantenedor preguntó qué es una plantilla ("Cómo así plantillas"); tras la explicación eligió "Elegible".

## Q3 — Formulario a medio llenar cuando el servicio falla

A. **Cancelar el servicio sin guardarlo (Recomendado).** El bot sale del formulario con "Cancel" para que el estimado quede solo con lo confirmado.
B. **Dejarlo como está.** El SE ve dónde se detuvo, pero el formulario queda abierto y la corrida siguiente encuentra el estimado en otro estado.
X. Other (please specify)

[Answer]: A — primero eligió "Dejarlo abierto"; al señalar que choca con Q1 (seguir con los demás), eligió "Siempre sale sin guardar": el bot sale sin guardar y el panel indica en qué campo se detuvo.

## Q4 — Spotlight (US8.1, Could Have)

A. **Incluirlo en U5 (Recomendado).** Contorno sobre el campo que se llena, `pointer-events:none`, se limpia siempre, respeta `prefers-reduced-motion` y se excluye del escaneo.
B. **Diferirlo.** Se deja para después del resto del alcance.
X. Other (please specify)

[Answer]: A
