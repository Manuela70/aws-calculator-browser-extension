# Diseño de rendimiento — u1-walking-skeleton

> Cómo se cumplen las cotas de tiempo del skeleton: esperas por condición,
> reintentos acotados, corte duro de 3 minutos con cancelación y medición de la
> corrida. Prosa en español; identificadores en inglés.

## Sources

- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u1-walking-skeleton/nfr-requirements/performance-requirements.md` (NFR8.4-NFR8.8, semántica del corte). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u1-walking-skeleton/nfr-requirements/reliability-requirements.md` (NFR8.12). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u1-walking-skeleton/functional-design/functional-spec.md` (W2-W4). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u1-walking-skeleton/nfr-requirements/tech-stack-decisions.md`. [stage]

## 1. Esperas por condición con tope (NFR8.4, NFR8.8)

Una sola primitiva, `waitFor(condition, { timeoutMs, signal, label })`:

- Evalúa la condición, y si no se cumple, vuelve a evaluar cada 250 ms (sondeo) hasta cumplirse, hasta `timeoutMs` (20 000 por defecto) o hasta que el `signal` de cancelación se dispare, lo que ocurra primero.
- Devuelve un resultado tipado (`{ ok: true, value }` o `{ ok: false, reason: "timeout" | "cancelled", label }`), nunca lanza ni espera de más.
- Los retardos entre acciones (`DELAY.SHORT` 300 ms, `DELAY.MEDIUM` 800 ms, `DELAY.LONG` 1 500 ms) pasan por `sleep(ms, signal)`, que también se corta al cancelar.

Pseudocódigo ilustrativo:

```
waitFor(condition, {timeoutMs, signal}):
  deadline = now + timeoutMs
  loop:
    if signal.aborted: return {ok:false, reason:"cancelled"}
    value = condition(); if value: return {ok:true, value}
    if now >= deadline: return {ok:false, reason:"timeout"}
    await sleep(250, signal)
```

## 2. Reintentos acotados (NFR8.4)

`retry(attempt, { maxAttempts, delayMs, signal })` en `lib/rpa/retry.js`, función pura sobre un reloj inyectable:

| Uso | Intentos | Espera |
|---|---|---|
| Handshake (panel) | 1 inicial + 3 tras inyectar | 1 s entre intentos |
| Guardado | 3 | `waitFor(banner, 10 s)` por intento |
| Búsqueda de opción en dropdown | 1 (sin reintento) | `waitFor(opciones, 20 s)` |

## 3. Corte duro por servicio (NFR8.6)

- `lib/rpa/service-timer.js` crea, por servicio, un `AbortController` y un temporizador de 180 000 ms que llama `abort("service_timeout")`.
- El `signal` se pasa a todas las llamadas del servicio: `waitFor`, `sleep`, `retry` y cada acción del resolvedor del DOM, que comprueba `signal.aborted` antes de tocar el DOM.
- El orquestador espera el servicio en carrera con el `signal`: cuando el signal se dispara, el servicio queda resuelto como `failed / service_timeout` aunque una acción en curso termine después; cualquier resultado tardío (incluido un banner) se ignora.
- Precisión: como cada acción individual sobre el DOM dura menos de 1 s y la comprueba antes de empezar, el servicio deja de actuar como mucho 1 s después de los 180 s.
- El temporizador se limpia al terminar el servicio por cualquier vía.

## 4. Medición de la corrida (NFR8.7)

- El registro abre con `run_start` y cierra con `run_end` (hora ISO-8601 de cada uno). La duración = `run_end − run_start`; el `runLogIndex` la guarda junto a la corrida para que `SMOKE.md` la lea sin exportar.

## 5. Presupuesto de tiempo del caso canónico (EC2, un servicio)

| Tramo | Presupuesto típico | Tope |
|---|---|---|
| Handshake | < 2 s | 4 PING (≈ 4 s) |
| Ir a My Estimate + comprobar vacío | < 5 s | 20 s |
| Buscar EC2 + Configure + formulario | < 15 s | 3 × 20 s |
| Región + mapeo + 4 acciones con relectura | < 40 s | 180 s del servicio |
| Guardar (banner) | < 10 s | 3 × 10 s |
| Verificar estimado + renombrar + Share | < 20 s | 3 × 20 s |
| **Total esperado** | **≈ 1,5 min** | Smoke falla si > 3 min |

Los valores "típicos" son una estimación de diseño para orientar el smoke, no una medición; se confirman en la primera corrida real.

## 6. Coste de la escritura inmediata del registro

La escritura inmediata (decisión Q1 de esta etapa) añade una escritura en `chrome.storage.local` por entrada. Con el registro partido en trozos de tamaño acotado (ver `observability-design.md`), cada escritura reescribe solo el trozo actual, de modo que su coste no crece con la longitud de la corrida. La cola de escritura no bloquea el RPA: el orquestador encola y sigue; solo `run_end` espera a que la cola se vacíe antes de enviar `RUN_RESULT`.
