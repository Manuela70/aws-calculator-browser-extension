# Requirements Analysis — Preguntas de clarificación

> Los requisitos NO se levantan desde cero: se formalizan los FR1-FR7, P1-P4 y
> criterios de aceptación de `requirements/calculator-rpa-requirements.md` +
> `constraints.md`. Estas preguntas resuelven solo las tensiones entre ese
> documento y tu decisión de alcance (cerebro n8n eliminado; entrada por
> lenguaje natural o import JSON). Responde cada `[Answer]:`.

## Q1 — Modo ReAct (FR3 del documento original)

El documento original define DOS modos en el popup (FR1/sección 3): "Create Calculator" (ejecutar JSON determinísticamente) y "ReAct" (bucle razonar-y-actuar con el AWS Well-Architected Framework, acepta lenguaje natural). Tu decisión de alcance habla de "entrada por lenguaje natural o JSON", lo que se parece al selector de modos pero no es idéntico. ¿Qué formalizo?

A. Mantener los dos modos tal como el documento: "Create Calculator" (JSON) y "ReAct" (lenguaje natural + Well-Architected). El lenguaje natural vive dentro del modo ReAct.
B. Simplificar a una sola entrada que acepta ambos formatos (lenguaje natural O JSON) sin un modo "ReAct" separado con Well-Architected; el mapeo interpreta lo que reciba.
C. Dos formas de entrada (lenguaje natural / JSON) pero SIN el bucle ReAct ni Well-Architected por ahora (diferir ReAct a futuro).
X. Other (please specify)

[Answer]: X — Una sola entrada que acepta lenguaje natural O JSON (no un selector de dos modos). Flujo: el usuario abre calculator.aws y la extensión, introduce una expresión en lenguaje natural (o carga un JSON) y la calculadora se llena. El llenado debe dejar el estimado en un estado completo y bien mapeado sobre el cual se pueda razonar. Después, de forma opcional y on-demand, el usuario puede pedir evaluación/recomendación Well-Architected (WAF) sobre el estimado ya construido — disponible venga la entrada de NL o de JSON. El WAF está DENTRO del alcance de esta revivida (no diferido).

## Q2 — Alcance del "cerebro" de mapeo en esta revivida (P1)

El cerebro n8n ya no existe (tienes backup). La ubicación definitiva (recrear n8n / service worker con LLM / local sin LLM) se decide en las etapas de diseño. Para los REQUISITOS, ¿cómo enmarco P1?

A. Requisito neutral: "el mapeo campo↔valor debe tener un hogar robusto y no depender del webhook n8n frágil"; la implementación concreta se decide en diseño (recomendado — no prejuzga A/B/C).
B. Ya decidir aquí que se recrea n8n desde el backup.
C. Ya decidir aquí que el mapeo se internaliza (local, sin LLM) o va a un service worker.
X. Other (please specify)

[Answer]: A — Requisito neutral: el mapeo campo↔valor Y el razonamiento Well-Architected deben tener un hogar robusto, sin depender del webhook n8n frágil. Como el WAF está en alcance, el cerebro incluye razonamiento LLM, no solo mapeo. La implementación concreta (recrear n8n desde backup / service worker con LLM / local) se decide en las etapas de diseño. No prejuzga A/B/C.

## Q3 — Spotlight visual (FR5)

El documento define FR5 (overlay azul que resalta cada campo mientras el RPA actúa; cosmético, `pointer-events:none`, z-index alto, cleanup garantizado). Hoy NO está implementado. ¿Entra en el alcance de esta revivida?

A. Sí — incluir FR5 como requisito de esta revivida (feedback visual mientras corre el RPA).
B. No por ahora — diferir el spotlight; priorizar que el RPA funcione de nuevo (P1-P4) y el feedback de progreso/errores en el popup (FR7).
C. Versión mínima — solo feedback de progreso en el popup (FR7), sin el overlay de spotlight sobre la página.
X. Other (please specify)

[Answer]: A — Sí, incluir FR5 (spotlight visual) en el alcance de esta revivida: overlay azul que resalta cada campo antes de llenarlo, cosmético, pointer-events:none, z-index muy alto, follow-scroll, cleanup garantizado en éxito y en error. No bloquea ni altera los clicks/inputs del propio RPA.

## Q4 — Prioridad de los 9 servicios vs. walking skeleton

Practices Discovery afirmó un walking skeleton primero (un servicio simple end-to-end). El código actual soporta ~9 servicios con FIX-1..FIX-9. Para los requisitos, ¿cómo trato el conjunto de servicios?

A. El requisito es soportar el conjunto completo de servicios que ya manejaba el v6 (con sus FIX), pero la ENTREGA arranca con el walking skeleton de un servicio simple y luego amplía.
B. Reducir el alcance a un subconjunto de servicios por ahora; dime cuáles.
C. Solo el walking skeleton (un servicio) en esta revivida; los demás son futuro.
X. Other (please specify)

[Answer]: A — Requisito: soportar el conjunto completo de servicios que ya manejaba el v6 (preservando los casos de FIX-1..FIX-9). La ENTREGA arranca con el walking skeleton de un servicio simple end-to-end y luego amplía al resto.

## Q5 — Criterio de éxito del guardado (P3 + criterios de aceptación)

Practices Discovery afirmó como regla dura: confirmar guardado solo por el banner verde `Successfully added <Service> estimate.` y detectar `is required`; nunca reportar éxito en un fallo (éxito = todos los servicios pedidos confirmados). ¿Lo formalizo como criterio de aceptación de los requisitos?

A. Sí — es criterio de aceptación: una corrida solo devuelve la URL si TODOS los servicios pedidos se confirmaron por el banner verde; cualquier fallo parcial se muestra en el popup.
B. Igual que A pero permitir "éxito parcial" explícito (devolver URL + lista de los que fallaron, visible en el popup) en vez de fallar toda la corrida.
X. Other (please specify)

[Answer]: A — Todo-o-nada: la corrida solo devuelve la URL del estimado si TODOS los servicios pedidos se confirmaron por el banner verde `Successfully added <Service> estimate.`. Cualquier fallo parcial (servicio no confirmado, `is required`, acción no resuelta, cerebro vacío) se muestra como error claro en el popup y NO devuelve una URL "a medias".

## Consolidated Summary Confirmation

- Q1 (modo/entrada): una sola entrada que acepta lenguaje natural O JSON (no un selector de dos modos); el llenado deja el estimado en estado evaluable; el Well-Architected (WAF) es una acción posterior opcional on-demand sobre el estimado ya construido, disponible venga la entrada de NL o JSON. WAF DENTRO de alcance de esta revivida.
- Q2 (cerebro P1): requisito neutral — el mapeo campo↔valor y el razonamiento WAF deben tener un hogar robusto sin depender del webhook n8n frágil; la implementación (recrear n8n / service worker con LLM / local) se decide en diseño.
- Q3 (spotlight FR5): dentro de alcance — overlay azul cosmético que resalta cada campo antes de llenarlo (pointer-events:none, z-index alto, follow-scroll, cleanup en éxito y error); no bloquea los clicks del RPA.
- Q4 (servicios): requisito = conjunto completo del v6 (preservando FIX-1..FIX-9); la entrega arranca por el walking skeleton de un servicio simple y luego amplía.
- Q5 (éxito P3): todo-o-nada — la URL solo se devuelve si todos los servicios pedidos se confirmaron por el banner verde; cualquier fallo parcial se muestra como error en el popup, sin URL a medias.
- Base: se formalizan FR1-FR7, P1-P4 y criterios de aceptación de requirements/calculator-rpa-requirements.md + constraints.md; se preservan las reglas afirmadas (MV3, sin build step, UI español/código inglés, mínimo privilegio de permisos, Vitest+80% sobre lógica pura, smoke manual del RPA).

Does this all look correct before I generate the requirements artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
