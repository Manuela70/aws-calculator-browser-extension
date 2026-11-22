## Review

**Verdict:** READY
**Reviewer:** aidlc-product-lead-agent
**Date:** 2026-11-20T02:51:35Z
**Iteration:** 1
**Verdict Dictated:** no

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Minor | aidlc/spaces/default/intents/260922-calculator-rpa/inception/refined-mockups/mockups.md > M3 "Estado de error de entrada" | La pantalla de error de entrada ilustra un solo caso (NL no interpretable). Las tres variantes de error de JSON exigidas por las historias quedan plegadas en un patrón genérico sin mostrar su mensaje de dominio: `❌ JSON inválido.` (AC3.1.2), "JSON válido pero sin servicios / lista vacía" (AC3.1.3) y "JSON parseable no conforme al Anexo A que nombra el servicio/campo problemático" (AC3.1.4). El patrón de estado de error y la recuperación (texto conservado y editable) sí están, pero las tres variantes no son visibles para verificar su copy. | Mostrar en M3 (o añadir una variante de M3) el mensaje de dominio esperado para cada una de las tres condiciones de error de JSON (AC3.1.2, AC3.1.3, AC3.1.4), para que QA pueda verificar el texto exacto de cada caso. | New |
| R-02 | Minor | aidlc/spaces/default/intents/260922-calculator-rpa/inception/refined-mockups/mockups.md > "Mapeo pantalla → historia" | US1.1 (walking skeleton de un servicio simple — Must Have) no aparece en el mapa pantalla→historia. La espina está cubierta de hecho por la composición M1/M2 → M4 → M5 con un solo servicio, pero su ausencia del mapa se lee como un hueco de cobertura de una historia Must Have. | Añadir una fila que ate US1.1 a la secuencia de pantallas que la realizan (entrada de un servicio → progreso → éxito total con URL), o una nota de una línea indicando que el skeleton reutiliza M1/M2, M4 y M5. | New |
| R-03 | Minor | aidlc/spaces/default/intents/260922-calculator-rpa/inception/refined-mockups/mockups.md > M7 / interaction-spec.md > C5 | El estado de carga de la evaluación Well-Architected ("cargando", declarado como estado de C5 en interaction-spec) no tiene representación visual. M7 muestra el resultado y M7-err el error de proveedor, pero no el intervalo entre accionar "Evaluar Well-Architected" y recibir la respuesta del "cerebro". | Mostrar un estado de carga de la pantalla WAF (indicador "Evaluando…") para que el usuario distinga "evaluando" de "colgado", coherente con el mismo principio de visibilidad de progreso aplicado en M4. | New |
| R-04 | Minor | aidlc/spaces/default/intents/260922-calculator-rpa/inception/refined-mockups/mockups.md > M4 "Estado en progreso" | M4 asume que la lista de servicios ya está enumerada ("2 de 3 servicios"). No se muestra el intervalo inicial entre accionar "Generar Estimado" y conocer el conjunto de servicios (handshake con calculator.aws, normalización de la entrada), donde todavía no hay "N de M". | Confirmar cómo se presenta ese arranque (p. ej. un "Conectando…/Preparando…" indeterminado antes de la barra "N de M"), o declarar explícitamente que ese intervalo es instantáneo y no requiere estado propio. | New |

### Summary

Los mockups y sus artefactos acompañantes cubren todas las historias y estados de cara al usuario, honran las cuatro decisiones del humano (Q1 dos pestañas, Q2 vista WAF aparte, Q3 lista vertical, Q4 WCAG 2.1 AA) y hacen visible la regla todo-o-nada de forma verificable (M5 muestra URL solo con 3/3 confirmados; M6 no muestra URL con 2/3 y lista el faltante con su motivo). Los mensajes de error usan lenguaje de dominio sin códigos ni `awsui_*`, y el spotlight documenta `pointer-events:none`, limpieza garantizada y `prefers-reduced-motion`. Los cuatro hallazgos son menores y de precisión de verificación (variantes de error de JSON, fila de US1.1 en el mapa, estados de carga de WAF y de arranque del progreso); ninguno bloquea la implementación.
