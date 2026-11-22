# Contract Design — Preguntas de contratos

> El contrato formal clave es el del `MappingBrain` (U4) server-side, que la
> extensión consume por red. Los bordes entre unidades embebidas (u2/u3/u5/u6)
> son interfaces de módulo ES internas, no contratos de red. Responde cada
> `[Answer]:`.

## Q1 — Mecanismo del contrato del cerebro (U4)

La extensión llama al servicio del cerebro para (a) mapear el residuo ambiguo y (b) la evaluación WAF. ¿Qué mecanismo formalizamos?

A. **HTTP(S) REST síncrono** con dos endpoints (`POST /map-residue`, `POST /waf-evaluate`), request/response JSON. Simple, encaja con n8n webhook o un endpoint Bedrock-proxy.
B. **Un solo endpoint HTTP(S)** (`POST /brain`) con un campo `operation: map | waf` que discrimina. Menos superficie, un solo host.
X. Other (please specify)

[Answer]: A

## Q2 — ¿El contrato pin-ea el alojamiento (n8n vs Bedrock) o queda agnóstico?

A. **Agnóstico del alojamiento** (recomendado): el contrato fija el shape del request/response HTTP; si detrás vive n8n o un proxy Bedrock se decide en Infrastructure Design. Mantiene reversible la decisión.
B. **Pin-ear ya n8n** (recrear desde backup) como el proveedor del contrato.
C. **Pin-ear ya un proxy Bedrock** como el proveedor.
X. Other (please specify)

[Answer]: A

## Q3 — Formato del payload de mapeo del residuo

El request de mapeo lleva la data escaneada del DOM y los valores no resueltos (nunca screenshots). ¿Qué shape prefieres?

A. **`{ service, domFields[], requestedValues[], unresolved[] }` → `{ actions[] }`** — el cliente envía todo el contexto escaneado + qué quedó sin resolver; el cerebro devuelve solo las acciones del residuo.
B. **`{ service, unresolved[] }` → `{ actions[] }`** — el cliente envía solo lo no resuelto con su contexto mínimo; más pequeño, menos tokens, pero el cerebro tiene menos contexto.
X. Other (please specify)

[Answer]: A — contexto completo: `{ service, domFields[], requestedValues[], unresolved[] }` → `{ actions[] }`. El residuo ambiguo es justo donde el cerebro necesita el contexto del formulario escaneado para desambiguar; como el DeterministicMapper ya resolvió lo obvio y solo el residuo llega al FM, el gasto de tokens sigue acotado. Nunca screenshots.

## Q4 — Manejo de errores y timeout del contrato del cerebro

¿Cómo se comporta el borde ante fallo del cerebro (caído, timeout, respuesta vacía)?

A. **Timeout explícito + error tipado visible** (recomendado): el cliente fija un timeout; ante caída/timeout/respuesta vacía propaga un resultado tipado de error al popup (NFR3/NFR8), nunca degrada en silencio ni reporta éxito.
B. **Reintento con backoff + luego error visible**: uno o dos reintentos antes de rendirse, luego el error tipado.
X. Other (please specify)

[Answer]: B — timeout explícito + reintento con backoff acotado (1-2 intentos) ante caída/timeout; si tras los reintentos sigue fallando o la respuesta es vacía, propaga un resultado tipado de error visible al popup (NFR3/NFR8). Nunca degrada en silencio ni reporta éxito. Coherente con la cota de reintentos acotados de NFR8 (terminación observable).

## Consolidated Summary Confirmation

- Q1 (mecanismo): HTTP(S) REST síncrono con dos endpoints — `POST /map-residue` (mapeo del residuo) y `POST /waf-evaluate` (Well-Architected), request/response JSON.
- Q2 (alojamiento): el contrato queda agnóstico del alojamiento; n8n (backup) vs. proxy Bedrock se decide en Infrastructure Design.
- Q3 (payload de mapeo): contexto completo `{ service, domFields[], requestedValues[], unresolved[] }` → `{ actions[] }`; nunca screenshots; solo el residuo llega al FM (tokens acotados).
- Q4 (errores): timeout explícito + reintento con backoff acotado; tras fallo/respuesta vacía, error tipado visible en el popup (NFR3/NFR8); nunca silencio ni éxito falso.
- Contratos a documentar: C1 extensión→cerebro `/map-residue`, C2 extensión→cerebro `/waf-evaluate` (externos, dueño U4). Los bordes entre unidades embebidas (u2/u3/u5/u6) son interfaces de módulo ES internas, no contratos de red formales; se nombran como interfaces, no como specs OpenAPI.

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
