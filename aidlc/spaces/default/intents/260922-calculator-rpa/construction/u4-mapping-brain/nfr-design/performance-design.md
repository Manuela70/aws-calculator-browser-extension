# Diseño de rendimiento — u4-mapping-brain

> Cómo el cerebro cumple sus tiempos (`nfr-requirements/performance-requirements.md`).
> Este archivo es la **única fuente** de los topes de tiempo y de reintentos;
> `reliability-design.md` (NFR1.7) y `scalability-design.md` (NFR3.4) lo
> referencian sin repetir valores. Prosa en español; identificadores en inglés.

## Sources

- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u4-mapping-brain/nfr-requirements/performance-requirements.md` (NFR8.4-NFR8.7). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u4-mapping-brain/nfr-requirements/reliability-requirements.md` (NFR1.7). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u4-mapping-brain/functional-design/rules.md` (BR1.5, BR4.2, BR7.1). [stage]

## 1. Reloj de la operación

- El **plazo de 25 s** (`OP_DEADLINE_MS = 25000`) empieza cuando la petición llega a la instancia, **antes** de esperar el arranque en frío. Así el servidor siempre responde en 25 s como dice el contrato, y quedan 5 s para red y TLS bajo los 30 s de la extensión.
- El **arranque en frío** consume ese mismo plazo y tiene un tope de 4 s (`INIT_DEADLINE_MS`): si la instancia no termina de cargar el inventario y el JWKS en 4 s, la petición que la despertó responde 503 `inventory_unavailable` y la carga sigue en segundo plano. Si el arranque termina a tiempo, la operación sigue con el plazo que le queda; la regla de §2 decide con ese tiempo restante si cabe un segundo intento.
- Al vencer el plazo de 25 s se aborta la invocación en curso (`AbortController`) y se responde 504 `timeout`.

## 2. Invocaciones y reintentos (regla única)

- **Máximo dos invocaciones del modelo por operación**; en `/waf-evaluate`, por lote. El reintento por error transitorio (NFR1.7) y el reintento por salida inválida (NFR1.3) **comparten** ese máximo: nunca hay una tercera invocación.
- **Tope por intento**: 10 s (`ATTEMPT_TIMEOUT_MS`). Un intento que llega al tope se aborta y cuenta como transitorio.
- **Espera antes del segundo intento**: aleatoria de 1 a 2 s, solo para transitorios (throttling, 5xx de Bedrock, tope por intento). Una salida inválida reintenta sin espera.
- **Condición del segundo intento**: se lanza solo si quedan al menos 6 s del plazo después de la espera; su tope es `min(10 s, tiempo restante − 2 s)`.
- **Código final cuando no hay segundo intento posible** (porque ya se usó o porque no queda tiempo):

| Último fallo | Respuesta |
|---|---|
| Salida inválida | `empty_result` (BR1.5) |
| Throttling de Bedrock | 429 `rate_limited` con `retryAfterSeconds = 5` |
| 5xx de Bedrock | 503 `model_unavailable` |
| Tope por intento alcanzado | 504 `timeout` |
| Plazo de 25 s vencido | 504 `timeout` |

## 3. Presupuesto de una operación (25 s)

| Tramo | Presupuesto |
|---|---|
| Filtros (freno, CORS, tamaño, token, límites, esquema) | ≤ 300 ms (JWKS e inventario en memoria; consulta al almacén ≤ 50 ms) |
| Selección de candidatos por código (BR7.1) | ≤ 100 ms |
| Primer intento del modelo | ≤ 10 s |
| Validación de salida | ≤ 100 ms |
| Espera antes del segundo intento (solo transitorios) | ≤ 2 s |
| Segundo intento | ≤ 10 s |
| Margen de respuesta | ≥ 2 s (más los 0,5 s que no usan los tramos cortos) |

La suma es 25 s. La espera en la cola del semáforo (`scalability-design.md`) consume el mismo plazo; por eso la cola rechaza antes de que la espera deje sin tiempo al primer intento.

## 4. Tokens de salida

El tamaño de la salida es lo que más pesa en la latencia de cada intento, así que cada operación tiene un `max_tokens` fijo en `config.json`:

| Operación | `max_tokens` | Base |
|---|---|---|
| `/interpret` | 1 200 | Pedido normalizado de hasta 20 servicios con sus campos |
| `/map-residue` | 600 | Solo los campos residuales de un servicio |
| `/waf-evaluate`, por lote | 2 200 | Peor caso de BR4.2 con 5 servicios: 5 recomendaciones de ≤ 300 caracteres por servicio, unos 2 000 tokens |

Una salida cortada por `max_tokens` no pasa la validación y sigue la regla de §2.

## 5. Decisiones por requisito

| Requisito | Diseño |
|---|---|
| NFR8.4 | Plazo de 25 s desde la llegada de la petición, arranque en frío incluido, con aborto y 504 `timeout` (§1); reintentos según la regla única de §2. |
| NFR8.5 | Prompts compactos: solo los candidatos (hasta 8 servicios, BR7.1) y sus campos, nunca el inventario completo; `max_tokens` por operación (§4). |
| NFR8.6 | `/waf-evaluate` divide en lotes de 5 servicios (`WAF_BATCH_SIZE`) y los invoca en paralelo; cada lote ocupa un lugar del semáforo y sigue la regla de §2. 20 servicios son 4 lotes. Que un lote completo quepa en 10 s depende de la velocidad de salida del modelo configurado, que no tenemos medida. Build and Test la mide con 5, 10 y 20 servicios. Si el p95 de un lote supera 10 s, la medida es bajar `WAF_BATCH_SIZE` a 3; ese cambio vuelve a pasar por NFR Requirements, porque NFR8.6 fija lotes de 5. |
| NFR8.7 | El inventario activo y el JWKS se cargan al iniciar la instancia (tope de 4 s, §1) y quedan en memoria. El parseo del inventario corre en un hilo de trabajo para no bloquear las peticiones (`reliability-design.md`, NFR1.8). La primera operación tras 30 minutos sin tráfico cabe en ≤ 20 s: hasta 4 s de arranque más la operación con su p95 de 12 s. |
