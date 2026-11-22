**Collaborator:** aidlc-quality-agent

## Contribution

Reviso el draft (`stories.md`, `personas.md`) con la lente de **testabilidad de los
acceptance criteria**: cada AC como aserción con pass/fail observable, cobertura
happy/sad por historia, y clasificación Zona A (unit-testable con Vitest) vs Zona B
(smoke manual) según la postura afirmada en `team-practices.md`. El draft es sólido:
usa Given/When/Then consistente, ancla el éxito al banner verde literal
`Successfully added <Service> estimate.` (FR9.1) y respeta el criterio todo-o-nada
(AC7.1.2). Los puntos siguientes son refinamientos, en su mayoría advisory; dos son
bloqueantes de testabilidad (B1, B2) por dejar un AC sin predicado verificable o una
historia Must Have sin sad path.

### 1. Clasificación por modo de verificación (Zona A / Zona B)

Mapa para que Delivery Planning y Code Generation sepan **cómo** se verifica cada AC.
Deriva de la partición de `team-practices.md` (Zona A = lógica pura unit-testeable con
Vitest + piso 80%; Zona B = núcleo RPA/DOM = solo smoke manual versionado en
`SMOKE.md`, sin e2e).

| Historia / AC | Zona | Modo de verificación | Nota |
|---|---|---|---|
| US2.1 AC2.1.1 / AC2.1.2 (normalización NL → estructura interna) | A | Vitest unit | aserción sobre la estructura normalizada, sin DOM |
| US2.2 AC2.2.1 / AC2.2.2 (NL no interpretable → error, no llenado parcial) | A | Vitest unit | la función de normalización devuelve error tipado; el "no llenar nada" se asevera sobre su salida, no sobre el DOM |
| US3.1 AC3.1.2 (JSON sintácticamente inválido) / AC3.1.3 (sin `services` o vacío) | A | Vitest unit | inventario Zona A: parseo/validación JSON (happy, inválido, sin `services`/vacío) |
| US3.1 AC3.1.1 (cada servicio en orden) | A→B | Vitest (orden de la lista normalizada) + smoke (que el RPA los procese) | la parte pura es el orden de la cola; el consumo lo valida smoke |
| US7.1 AC7.1.2 / US6.2 agregación pedido-vs-confirmado | A | Vitest unit | función de agregación `DONE/ERROR/PARTIAL` — ancla de la compuerta P3 (ver B2) |
| US4.1, US4.2, US4.3 (RPA por servicio, resolución en cascada, FIX-1..9) | B | Smoke manual (`SMOKE.md`) | DOM CloudScape de terceros; `cleanAriaLabel`/`parseUnitButtonLabel` son la excepción pura (ver abajo) |
| US1.1 AC1.1.1/.1.2/.1.3 (skeleton end-to-end) | B | Smoke manual — caso canónico 1 servicio | es el camino completo; su único trozo puro es la agregación de AC1.1.3 |
| US5.1 (WAF) | B (+ A parcial) | Smoke manual; el parseo del contrato de salida FR8.4 es Zona A si se aísla | ver 3.d |
| US6.1 (errores visibles por servicio) | A+B | Vitest sobre el resultado tipado por servicio + smoke de que el popup lo muestra | el *contenido* del resultado tipado es puro; su *render* es smoke |
| US8.1 (spotlight overlay) | B | Smoke manual | cosmético; `pointer-events:none`/cleanup se inspeccionan a ojo |

Dos funciones puras **cruzan** la frontera y conviene nombrarlo: `cleanAriaLabel`
(FIX-1) y `parseUnitButtonLabel` (FIX-2) sirven al RPA (Zona B) pero son funciones
puras en el inventario Zona A de `team-practices.md` — se unit-testean con Vitest
aunque el AC4.3.1 que las consume sea smoke. Recomiendo que US4.3 (o la nota INVEST)
mencione que estos dos FIX tienen cobertura unit obligatoria aunque el resto de FIX-*
sea smoke.

### 2. ACs vagos sin check observable (reforzar predicado)

El draft dice "error claro" / "legible" / "mensaje claro" en varios AC. Donde pueden
anclar al banner verde o al **resultado tipado por servicio** (FR7.2), son
verificables; donde dicen solo "claro" falta el predicado. Propuestas (advisory salvo
B1):

- **AC1.1.3** (advisory): "muestra un error claro en el popup" → anclar a lo observable:
  *el popup no contiene URL de estimado* y *muestra el resultado tipado del servicio no
  confirmado con su motivo*. El "claro" no es testeable; "ausencia de URL + resultado
  tipado presente" sí.
- **AC2.2.1 — B1 (bloqueante de testabilidad)**: "mensaje de error indicando qué no se
  pudo interpretar" es verificable solo si fijamos **qué** devuelve la función: un error
  tipado que nombra el/los token(s) no reconocidos. Como está, "indicando qué" no tiene
  pass/fail. Recomiendo: *la normalización devuelve un error tipado cuyo campo identifica
  el fragmento no interpretado, y la estructura normalizada resultante está vacía
  (ningún servicio)*. Con eso es Vitest puro.
- **AC5.1.3** (advisory): "en español y legibles" — "legible" no es aserción. "En
  español" tampoco es observable de forma determinista sin un criterio. Sugiero reducir
  a lo verificable (estructura FR8.4: cada recomendación tiene pilar nombrado y texto no
  vacío) y dejar "español/legible" como nota de UX, no como AC.
- **AC6.1.1** (advisory): enumera bien los modos de fallo, pero "mensaje claro por
  servicio" debería decir *resultado tipado por servicio con enum {éxito | fallo+motivo}*
  (FR7.2) para que el assert sea sobre la forma del mensaje, no sobre su claridad.

### 3. Sad-path / modos de fallo faltantes

- **B2 (bloqueante) — US7.1 / AC7.1.2: formalizar "pedido-vs-confirmado" como igualdad
  de conjuntos.** El criterio todo-o-nada es el corazón de P3 y hoy es la única regla
  dura (`project.md`: "éxito = **todos** los servicios solicitados confirmados
  presentes, no 'se produjo una URL'"). Para que QA lo verifique de forma determinista,
  el AC debe afirmar la relación como conjuntos: *devuelve URL si y solo si
  `{servicios confirmados por banner verde}` ⊇ `{servicios solicitados}`; si falta ≥1,
  no hay URL y se listan los faltantes por nombre*. Sin el "si y solo si" explícito, un
  falso positivo (URL con un servicio de más/menos) no tiene un assert que lo atrape.
  Esta es la función de agregación Zona A; nace con tests de: todos confirmados → URL;
  uno faltante → sin URL + lista; cero servicios → sin URL (coherente con AC3.1.3).
- **US4.1 (advisory): falta sad path.** AC4.1.1/.1.2/.1.3 son todos happy. El modo de
  fallo "el servicio se agrega/configura pero **no** se confirma el guardado" (banner
  ausente, o aparece `is required` de FR9.2) no tiene AC propio en US4.1 — hoy solo lo
  cubre indirectamente AC6.1.1. Recomiendo un **AC4.1.4** sad: *Given un servicio cuyo
  guardado no se confirma por el banner verde (o aparece validación `is required`),
  When el RPA termina ese servicio, Then produce un resultado tipado de fallo con motivo
  y NO lo cuenta como confirmado* (ancla FR9.2 + FR5.3). Es smoke en su ejecución, pero
  la decisión "confirmado/no confirmado" es la función pura Zona A.
- **US3.1 (advisory): falta el fallo de JSON bien-formado pero no conforme al esquema.**
  AC3.1.2 cubre JSON *sintácticamente* inválido y AC3.1.3 el `services` vacío, pero no
  un JSON parseable con forma incorrecta (p. ej. `services` presente pero un servicio sin
  `name`/`search_term`, o `fields` no-objeto). El Anexo A define el esquema; un **AC3.1.4**
  *Given un JSON parseable pero no conforme al Anexo A, Then error visible sin iniciar
  RPA* cierra el hueco. Zona A puro.
- **US4.2 AC4.2.2 (observación)**: el sad path del selector stale (P2) está bien
  cubierto ("fallo visible, nunca silencioso"). Correcto; solo noto que su verificación
  es smoke (no se puede provocar un selector stale en unit sin fabricar un DOM falso, lo
  que `team-practices.md` descarta explícitamente). Dejarlo como smoke.
- **US6.2 AC6.2.2 (observación)**: la cota de reintentos → resultado tipado (NFR8.1) es
  Zona A si la lógica de "agotó intentos" se aísla del `setTimeout`/DOM. Sugiero que
  Functional Design extraiga el contador de reintentos como función pura para que este
  AC sea unit-testeable y no dependa de esperar delays reales en smoke.

### 4. Nota de cobertura y trazabilidad (para Delivery / Build-and-Test)

- El piso del 80% aplica **solo a Zona A**; ninguna historia Zona B arrastra piso de
  cobertura (coherente con `team-practices.md`). La nota INVEST ya lo dice; sugiero que
  Delivery Planning no derive una métrica de cobertura global de estas historias, porque
  el denominador correcto es solo la lógica pura.
- Baseline brownfield: suite vacía, 0 tests, 0% — el primer test de cada función pura es
  mejora neta, no regresión. Build-and-Test debería registrar ese baseline antes de
  medir el 80%.
- El smoke manual (`SMOKE.md`) ya tiene su caso de **fallo provocado** (cerebro caído /
  `[]` → no `DONE` con URL); ese caso es la verificación end-to-end de B2. Recomiendo
  que US6.1/US7.1 referencien `SMOKE.md` como su evidencia de Zona B para cerrar la
  trazabilidad AC → modo de verificación.

## Positions

OBJECT: AC2.2.1 ("mensaje de error indicando qué no se pudo interpretar") no es
testeable como está: "indicando qué" carece de predicado observable. Debe afirmar un
**error tipado** cuyo campo nombre el fragmento no interpretado y una estructura
normalizada vacía, para ser una aserción Vitest con pass/fail. (B1)

OBJECT: AC7.1.2 debe formalizar el criterio todo-o-nada como **igualdad/inclusión de
conjuntos** ("devuelve URL si y solo si confirmados ⊇ solicitados; si falta ≥1, sin URL
+ faltantes por nombre"). Sin el "si y solo si" explícito, QA no puede atrapar de forma
determinista un falso positivo, y éste es exactamente el riesgo P3 que la revivida
existe para cerrar. (B2)

AGREE: El resto del draft — desglose fino por journey, anclaje al banner verde literal,
cobertura happy/sad en US1.1, US2.2, US3.1, US5.1, US6.x, US8.1, y la nota INVEST sobre
Zona A unit / Zona B smoke — es correcto y consistente con la postura de testing
afirmada. Los puntos 1, 2 (salvo B1), 3 (salvo B2) y 4 son refinamientos advisory que
el lead puede incorporar o diferir a Functional Design sin bloquear la etapa.
