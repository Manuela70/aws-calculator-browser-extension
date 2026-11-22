# Preguntas de NFR Requirements — u1-walking-skeleton

> Solo se pregunta lo que el Diseño Funcional y los requisitos dejaron abierto
> para el skeleton. Ya está decidido y no se repregunta: cotas de reintento
> (3 PING tras inyectar, 3 guardados, 10 s de banner), esperas de página de 20 s,
> latido de 60 s, panel lateral, último resultado en `chrome.storage.local`,
> sin credenciales en el cliente, sin código dinámico, Zona A con Vitest /
> Zona B con smoke manual.

## Q1. [seguridad] ¿Cuánta limpieza de permisos del manifest hace ya el skeleton?

Contexto: el skeleton tiene que tocar el manifest (añadir `sidePanel`, `storage`, `background` y `web_accessible_resources`, y quitar `default_popup`). La regla del proyecto exige declarar solo lo usado y eliminar el host muerto `https://dnd5zrqcec4or.cloudfront.net/*`; `activeTab` y `clipboardWrite` probablemente sobran (copiar la URL con un clic del usuario no necesita `clipboardWrite`). La limpieza completa estaba asignada a U7.

A. El skeleton aplica ya el mínimo privilegio: quita el host CloudFront, `activeTab` y `clipboardWrite`; mantiene `tabs` y `scripting`; añade `sidePanel` y `storage`. U7 solo añade el host del cerebro cuando exista.
B. El skeleton solo añade lo que necesita (`sidePanel`, `storage`); la limpieza (CloudFront, `activeTab`, `clipboardWrite`) queda para U7.
C. El skeleton quita solo el host CloudFront muerto; `activeTab` y `clipboardWrite` se revisan en U7.
X. Other (please specify)

[Answer]: A

## Q2. [rendimiento] ¿Fijamos un tiempo de referencia para la corrida canónica de EC2?

Contexto: NFR8.3 dice que no hay un umbral de latencia total; la garantía es terminación observable (ya cubierta por las cotas de 20 s y 60 s). Un tiempo de referencia sirve para detectar en el smoke que algo se volvió mucho más lento, sin ser una compuerta.

A. Sin objetivo numérico: solo terminación observable, como dice NFR8.3. El smoke anota la duración, sin umbral.
B. Referencia blanda: la corrida canónica de EC2 debería terminar en 3 minutos o menos; el smoke anota la duración y marca un aviso si la supera, pero no falla.
C. Referencia dura: si la corrida canónica pasa de 3 minutos, el smoke se da por fallido.
X. Other (please specify)

[Answer]: C

## Q3. [observabilidad] ¿Qué registro técnico deja el skeleton para diagnosticar un fallo?

Contexto: el SE ve mensajes en español en el panel, sin detalles técnicos (BR6.4). Para diagnosticar (sobre todo selectores stale, P2) hace falta un registro técnico. No hay backend de logs en el skeleton.

A. Logs en la consola de la pestaña y del panel, con prefijo fijo y el `runId` en cada línea, niveles error/warn/info; debug apagado por defecto. Nada persistido.
B. Lo de A, más las últimas 200 líneas técnicas de la corrida guardadas junto a `lastRunResult` en `chrome.storage.local`, para poder consultarlas después.
C. Solo los mensajes de error, sin logs de info.
X. Other (please specify)

[Answer]: X. Persistencia y trazabilidad completa

## Q4. [calidad] ¿El piso de cobertura del 80 % sobre la lógica pura ya aplica al skeleton?

Contexto: la práctica del equipo fija 80 % de cobertura sobre la Zona A; el Definition of Done del Bolt 1 solo pide "Vitest corre al menos un test". El skeleton crea versiones mínimas de módulos puros que U2, U3 y U5 completan después.

A. Sí: el 80 % aplica desde el skeleton sobre sus módulos puros (`json-parser`, `input-normalizer`, `deterministic-mapper`, `retry`, `result-aggregator`, `handshake`), cada uno con su caso feliz y al menos dos casos de error.
B. El skeleton exige caso feliz + al menos dos casos de error por módulo puro, sin piso numérico; el 80 % se exige a partir de U2/U3/U5.
C. Solo lo del Definition of Done: al menos un test de Vitest.
X. Other (please specify)

[Answer]: A

## Q5. [observabilidad] ¿Qué significa "persistencia y trazabilidad completa" para el registro del skeleton?

Contexto (seguimiento de Q3): "completa" puede leerse de varias formas y cada una cambia el diseño. El skeleton no tiene backend (el backend de memoria del agente se planificará junto al cerebro, U4). `chrome.storage.local` tiene un límite de unos 10 MB por extensión; el registro no contiene credenciales, pero sí nombres de proyecto y el enlace público del estimado.

A. Cada corrida guarda su registro técnico completo (todas las líneas, con `runId`, hora, nivel y paso) en `chrome.storage.local`; se conservan las últimas 20 corridas y la más vieja se borra al entrar una nueva. El panel permite exportar el registro de una corrida como archivo `.json`.
B. Como A, pero sin límite de corridas: se conserva todo hasta que el SE lo borre a mano desde el panel.
C. Como A en el skeleton, y cuando exista el backend del cerebro (U4) el registro se envía también allí para trazabilidad entre sesiones y equipos.
X. Other (please specify)

[Answer]: B

## Q6. [rendimiento] ¿Dónde aplica el límite duro de 3 minutos?

Contexto (seguimiento de Q2): un límite "duro" puede ser solo un criterio del smoke manual o también un corte dentro de la propia extensión.

A. Solo en el smoke: si la corrida canónica pasa de 3 minutos, el smoke falla; la extensión no corta la corrida (sigue gobernada por las esperas de 20 s y el latido de 60 s).
B. También en la extensión: toda corrida de un servicio que pase de 3 minutos se corta y termina en ERROR con un motivo de tiempo agotado.
X. Other (please specify)

[Answer]: B

## Q7. [seguridad] Con el registro sin límite, ¿qué pasa cuando se llena el almacenamiento del navegador?

Contexto (seguimiento de Q5 = sin límite, en tensión con Q1 = mínimo privilegio): `chrome.storage.local` tiene un tope de unos 10 MB por extensión. Superarlo exige el permiso `unlimitedStorage`; sin él, las escrituras fallan al llegar al tope, y eso incluiría guardar `lastRunResult`.

A. Añadir el permiso `unlimitedStorage` (justificado por esta decisión) y conservar todo hasta que el SE lo borre desde el panel; el panel muestra cuánto ocupa el registro.
B. Sin permiso nuevo: al acercarse al tope (90 %) el panel avisa que hay que exportar y borrar; si se llena, el registro deja de escribirse con aviso visible, pero `lastRunResult` siempre se guarda (tiene espacio reservado).
X. Other (please specify)

[Answer]: A

## Consolidated Summary Confirmation

- Q1: el skeleton aplica ya el mínimo privilegio en el manifest: quita el host CloudFront muerto, `activeTab` y `clipboardWrite`; mantiene `tabs` y `scripting`; añade `sidePanel` y `storage`. U7 solo añade el host del cerebro cuando exista.
- Q2 + Q6: límite duro de 3 minutos por servicio, también dentro de la extensión: un servicio que pase de 3 minutos se corta y termina en ERROR por tiempo agotado; la corrida canónica de EC2 que pase de 3 minutos hace fallar el smoke.
- Q3 + Q5: registro técnico completo de cada corrida (todas las líneas, con `runId`, hora, nivel y paso) persistido en `chrome.storage.local` sin límite de corridas; se conserva hasta que el SE lo borre desde el panel y se puede exportar como `.json`. Además, logs en consola.
- Q7: se añade el permiso `unlimitedStorage` (justificado por Q5); el panel muestra cuánto ocupa el registro.
- Q4: el piso de cobertura del 80 % sobre la lógica pura aplica ya al skeleton (`json-parser`, `input-normalizer`, `deterministic-mapper`, `retry`, `result-aggregator`, `handshake`), cada módulo con caso feliz y al menos dos casos de error.

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
