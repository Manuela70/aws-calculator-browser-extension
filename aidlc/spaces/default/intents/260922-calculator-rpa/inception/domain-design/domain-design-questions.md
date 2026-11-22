# Domain Design — Preguntas de diseño

> El modelo de componentes está casi determinado por las historias y el flujo.
> La decisión de peso es el **hogar del cerebro (P1/OQ1)**, que define el
> componente de mapeo y razonamiento. Responde cada `[Answer]:`.

## Contexto para la decisión del cerebro (perspectiva del platform engineer)

Dos hechos acotan las tres alternativas de P1:

1. **El WAF (FR8) necesita un LLM** que razone sobre el estimado — no es lógica determinística. Así que un enfoque "100% local sin LLM" **no puede servir el WAF** por sí solo; serviría solo el mapeo de campos.
2. **Regla dura afirmada**: nunca una credencial de larga vida (Claude/Bedrock) en el bundle, `chrome.storage` ni el service worker. Si el LLM se llama, la clave debe vivir **server-side** (un proxy / n8n) o ser de corta vida federada.

Combinando ambos: si quieres WAF con IA, necesitas un **endpoint server-side** que guarde la credencial y hable con el LLM. Eso es exactamente lo que el webhook n8n hacía. Las opciones reales son:

## Q1 — Hogar del "cerebro" (mapeo + razonamiento WAF) — decisión central P1

A. **Recrear el servicio server-side (n8n desde tu backup)** como el cerebro: la extensión le llama por `fetch` (con su host en `host_permissions`, resolviendo el CORS de P1); n8n guarda la credencial de Claude y hace tanto el mapeo como el WAF. Reutiliza tu backup. El cerebro vive fuera del repo de la extensión.
B. **Un proxy server-side propio nuevo** (no n8n): un endpoint mínimo que guarda la credencial y expone mapeo + WAF; la extensión le llama igual que en A. Más control que n8n, pero hay que construirlo y alojarlo.
C. **Híbrido**: mapeo de campos **local sin LLM** (determinístico, en un módulo ES de la extensión) para el llenado, y un **endpoint server-side solo para el WAF** (que sí necesita LLM). El llenado no depende de red; solo el WAF.
X. Other (please specify)

[Answer]: C (refinada) — Híbrido eficiente en tokens. Principio: separar la lógica DETERMINÍSTICA del razonamiento del FM. (1) `scanForm` escanea el DOM determinísticamente y produce data estructurada (campos/labels/secciones). (2) Un mapeador determinístico LOCAL (módulo ES, Zona A, unit-testeable) resuelve los mapeos obvios: match exacto de label y valores directos del JSON. (3) El FM server-side (p. ej. el agente que recreaba n8n, o un agente Bedrock) razona SOLO sobre el residuo ambiguo que el determinístico no resolvió, recibiendo la DATA escaneada (nunca screenshots — se evita el anti-patrón "computer use" de pantallazos que quema tokens). (4) El mismo endpoint server-side sirve el WAF. La credencial del FM vive server-side (regla dura). Playwright NO es viable dentro de MV3; el "brazo robot" que actúa sobre el DOM es `content.js` (scanForm/executeActions). Decisión: empezar por aquí, probar y afinar la frontera determinístico/FM con el uso real. La ubicación concreta del endpoint server-side (recrear n8n desde backup vs. agente Bedrock nuevo) se afina en Contract Design / Infrastructure Design; el componente se modela aquí como `MappingBrain` con interfaz estable e independiente de su alojamiento.

## Q2 — Frontera del componente de entrada (NL + JSON)

El parseo de lenguaje natural y la validación/normalización de JSON convergen en una estructura interna. ¿Un solo componente de entrada o dos?

A. **Un componente `InputNormalizer`** que maneja ambos formatos (NL y JSON) y produce la estructura interna normalizada. Más simple; una sola frontera.
B. **Dos componentes** (`NaturalLanguageParser` y `JsonParser`) que alimentan un normalizador común. Más separación, más piezas.
X. Other (please specify)

[Answer]: B — dos parsers (`NaturalLanguageParser`, `JsonParser`) que alimentan un `InputNormalizer` común. El NL es capacidad nueva con su propio razonamiento (y potencialmente apoyo del FM para expresiones libres); el JSON es validación determinística del esquema del Anexo A. Separarlos mantiene cada parser unit-testeable de forma aislada y refleja que son concerns distintos que convergen en la estructura interna normalizada.

## Q3 — Frontera del motor RPA vs. el resolvedor de DOM

El núcleo RPA (orquestación por servicio) y la resolución/escaneo de DOM (analyzeDOM, resolución en cascada) son concerns distintos. ¿Los separamos en componentes?

A. **Sí, dos componentes**: `RpaOrchestrator` (flujo por servicio, agregación de resultados) y `DomResolver` (scanForm/resolveElementByLabel/selectAwsDropdown + los FIX). Separa la Zona A testeable de la Zona B dependiente del DOM.
B. **Un solo componente RPA** que incluye orquestación y resolución. Menos piezas, pero mezcla Zona A y Zona B.
X. Other (please specify)

[Answer]: A — dos componentes: `RpaOrchestrator` (flujo por servicio, agregación de resultados pedido-vs-confirmado — Zona A pura) y `DomResolver` (scanForm/resolveElementByLabel/selectAwsDropdown/executeActions + FIX — Zona B dependiente del DOM). La separación alinea las fronteras de componente con la partición Zona A/Zona B afirmada (testeable vs smoke).

## Consolidated Summary Confirmation

- Q1 (hogar del cerebro, P1): híbrido eficiente en tokens. Determinístico primero (scanForm escanea el DOM → data estructurada; un mapeador LOCAL resuelve lo obvio: match de label, valores directos del JSON). El FM server-side razona SOLO sobre el residuo ambiguo + sirve el WAF, recibiendo DATA escaneada (nunca screenshots). Credencial del FM server-side. Se modela como componente `MappingBrain` con interfaz estable, independiente de su alojamiento (recrear n8n desde backup vs. agente Bedrock se afina en Contract/Infra Design). Playwright descartado en MV3; el brazo que actúa sobre el DOM es content.js.
- Q2 (entrada): dos parsers (`NaturalLanguageParser`, `JsonParser`) que alimentan un `InputNormalizer` común.
- Q3 (RPA): dos componentes, `RpaOrchestrator` (Zona A, orquestación + agregación) y `DomResolver` (Zona B, scanForm/resolveElementByLabel/executeActions + FIX).
- Componentes previstos: NaturalLanguageParser, JsonParser, InputNormalizer, DeterministicMapper, MappingBrain (FM server-side, residuo + WAF), RpaOrchestrator, DomResolver, PopupUI (controlador del popup), ResultAggregator (agregación todo-o-nada). Entidades modeladas a nivel ownership+shape. ADRs para la decisión del cerebro y las fronteras.

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
