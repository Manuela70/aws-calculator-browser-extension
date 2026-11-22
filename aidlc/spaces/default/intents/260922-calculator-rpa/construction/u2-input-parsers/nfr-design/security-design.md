# Diseño de seguridad — u2-input-parsers

> Cómo u2 cumple sus requisitos de seguridad (`nfr-requirements/security-requirements.md`
> y `tech-stack-decisions.md`). U2 es lógica pura de Zona A: el diseño se basa en
> validar en una sola frontera, devolver resultados tipados y no tener efectos
> secundarios. Prosa en español; identificadores en inglés. Esta unidad no abrió
> preguntas: los requisitos ya fijan cada decisión.

## Sources

- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u2-input-parsers/nfr-requirements/security-requirements.md` (NFR3.1-NFR3.6, NFR4.1, NFR5.1-NFR5.5, NFR8.4, NFR8.5). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u2-input-parsers/nfr-requirements/tech-stack-decisions.md` (NFR1.1, NFR6.1, NFR6.2, NFR7.1, NFR7.2). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u2-input-parsers/functional-design/functional-spec.md` (§3 interfaz y puerto, W1-W4). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/contract-design/contract-summary.md` (borde u6 → u2, C2, C3, "Cambios de NFR Requirements"). [stage]

## 1. Patrón general: validar una vez, en la frontera

`normalize` es la única puerta de entrada. Ejecuta, en este orden y sin saltos:

1. Topes de tamaño del texto (100 000 caracteres de JSON, 2000 de lenguaje natural) antes de cualquier parseo (NFR3.4).
2b. Para la respuesta del cerebro, validación de forma completa según BR3.6 antes de usarla: `status` en `interpreted | unresolved`; con `interpreted`, `runInput` presente y sin `unresolved`; con `unresolved`, entre 1 y 20 fragmentos, cada `fragment` y `service` de hasta 200 caracteres y `reason` dentro del enum, y sin `runInput`. Cualquier desvío → `nl_invalid_response`.
2. Parseo (`JSON.parse`) o interpretación por el puerto (NFR3.3).
3. Validación de esquema cerrado y topes de contenido (BR2.2-BR2.7) con el mismo validador para el JSON del SE y para el `runInput` del cerebro (NFR3.2, NFR3.4).
4. Normalización a objetos nuevos (NFR3.5).

Cada paso devuelve `{ ok: false, error }` en el primer fallo; nunca lanza excepciones hacia el llamador ni devuelve servicios parciales (NFR3.1).

## 2. Decisiones por requisito

| Requisito | Diseño |
|---|---|
| NFR3.1 | Tipo de resultado único `Result = { ok: true, value } \| { ok: false, error: InputError }`. Un `try/catch` en `normalize` convierte cualquier excepción inesperada en `{ ok: false, error: { code: "unexpected_error" } }` para que nunca se escape un fallo silencioso. |
| NFR3.2 | El adaptador del puerto clasifica antes de validar. (a) Si el puerto devuelve `{ ok: false, error }` con un código del contrato que el SE debe ver distinto (`unauthorized`, `login_cancelled`, `rate_limited`, `daily_quota_exceeded`, `inventory_unavailable`, `timeout`), U2 lo propaga tal cual como código de `InputError` (con `retryAfterSeconds` si viene), y U6 lo muestra con su texto (u6 functional-spec §6). (b) Error de red, `model_unavailable`, `brain_unavailable` o cualquier código desconocido → `brain_unavailable`. (c) Respuesta presente pero inválida, fuera de topes o que falla al normalizar → `nl_invalid_response`. U2 no reintenta: el único reintento (`rate_limited`) lo hace el service worker (u7 NFR8.1). |
| NFR3.3 | El validador recorre el objeto con una tabla de claves permitidas por nivel (raíz, servicio); cualquier clave fuera de la tabla → `unknown_key`. Sin `reviver`, sin `eval`. ESLint `no-eval` y `no-new-func` activos. |
| NFR3.4 | Constantes en `input-schema.js` (`MAX_JSON_CHARS = 100000`, `MAX_NL_CHARS = 2000`, `MAX_SERVICES = 20`, `MAX_FIELDS = 30`, `MAX_FIELD_CHARS = 100`), compartidas por los dos caminos; el error `input_limit_exceeded` lleva `{ limit, serviceIndex, key }`. |
| NFR3.5 | Las claves `__proto__`, `constructor` y `prototype` están en una lista de rechazo explícita, evaluada antes de la tabla de permitidas. Los objetos normalizados se crean con literales nuevos o `Object.create(null)` para `fields`, copiando solo valores primitivos. |
| NFR3.6 | U2 no tiene funciones que produzcan marcado; los textos salen como cadenas. La regla de render es de U6 (NFR5.1 de u6). |
| NFR4.1 | `lib/input/**` no importa nada que haga red ni use `chrome.*`; una regla `no-restricted-globals` (`fetch`, `XMLHttpRequest`, `chrome`) en ESLint para esa carpeta lo hace verificable. |
| NFR5.1 | El puerto llega ya autenticado: U2 solo conoce la firma `interpretNaturalLanguage(request, { signal })`. |
| NFR5.2 | El texto del aviso es la constante `NL_PRIVACY_NOTICE` en `input-errors.js`; U6 la pinta. |
| NFR5.3 / NFR5.4 | Función pura `toLogEntry(rawInput, result, { durationMs })` con dos ramas: lenguaje natural (solo `format`, longitud, código, conteos, duración) y JSON (rechazado: código, ruta y texto completo, salvo `input_too_long`, que guarda solo la longitud porque el texto supera el tope; aceptado: longitud, conteo, duración). Así ninguna entrada del registro supera unos 100 000 caracteres. La rama de lenguaje natural no recibe el texto en sus argumentos internos, para que no pueda filtrarse por error. |
| NFR5.5 | El registro lo escribe U1 en `storage.local`; U2 no decide almacenamiento. El borrado lo ofrece el historial de U6. |
| NFR8.4 | `AbortController` propio, abortado por un `setTimeout` de 30 s o por la señal externa (listener `abort`); su `signal` se pasa al puerto. `Promise.race` entre la respuesta del puerto y una promesa que se resuelve al abortar, así U2 termina aunque el puerto no respete la señal. Al vencer el temporizador resuelve `brain_unavailable`. Con `setTimeout` (no `AbortSignal.timeout`) la prueba usa los temporizadores falsos de Vitest. El temporizador y el listener se limpian al terminar. |
| NFR8.5 | Precedencia: gana el primer evento; el motivo del aborto se guarda en el controlador (`external` o `timeout`) y decide el código. Si la señal externa (U6) se aborta primero, la carrera resuelve `{ ok: false, error: { code: "cancelled" } }` y cualquier respuesta posterior se descarta. |

## 3. Amenazas consideradas

| Amenaza | Mitigación |
|---|---|
| JSON enorme que bloquea el panel | Tope de 100 000 caracteres antes de parsear. |
| Contaminación de prototipos vía claves | Lista de rechazo y objetos sin prototipo para `fields`. |
| Respuesta del cerebro manipulada (prompt injection) que inyecta claves o valores largos | Mismo validador cerrado y topes que el JSON del SE para `runInput`; topes y enum propios para la rama `unresolved` (paso 2b); texto solo como dato. |
| Fuga del texto del cliente al registro | `toLogEntry` sin acceso al texto en la rama de lenguaje natural. |
| Respuesta tardía que pisa una corrida nueva | Carrera con señal derivada; descarte tras abortar. |
