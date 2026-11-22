**Collaborator:** aidlc-developer-agent

## Contribution

Reviso el borrador desde la lente de **implementabilidad y tamaño de historias**
para un mantenedor solo. El borrador está bien encaminado: el persona es
correcto, el desglose fino por journey (Q2=B) se respeta, la trazabilidad a
FR/NFR es sólida y —el punto más delicado de esta revivida— **ninguna historia
prejuzga la decisión diferida de ubicación del cerebro** (n8n / service worker /
local). US1.1 describe el camino como `entrada → mapeo → RPA → guardar →
compartir` sin nombrar n8n, y US5.1 abstrae a "proveedor de razonamiento". Eso
es exactamente lo que diseño necesita conservar abierto. Mis observaciones son
focalizadas; detallo cada OBJECT abajo con el cambio concreto propuesto.

### Lo que está bien (confirmo, no pido cambio)

- **US1.1 es un walking skeleton genuinamente delgado**: un solo servicio
  simple, solo camino JSON (no NL), happy + sad path, agnóstico del cerebro.
  Prueba el camino end-to-end sin comprometer OQ1. Correcto como primera Must
  Have.
- **Agnosticismo del cerebro**: ninguna historia asume n8n ni asume local.
  US5.1/AC5.1.2 y NFR1 quedan correctamente en "proveedor de razonamiento".
- **Granularidad NL**: la división US2.1 (llenar) / US2.2 (error visible) está
  justificada por Q2=B y mapea a unidades testeables distintas (normalización
  vs. camino de error). No fusionar.
- **WAF depende de un estimado ya construido**: dependencia correcta
  (US5.1 ← US4.x + US7.1).

### Hallazgo principal — falta una historia técnica de inyección/handshake (FR2)

FR2 y FR2.2 (reutilizar-o-abrir pestaña `calculator.aws`, handshake `PING`,
inyectar el content script si no responde) son **infraestructura que sostiene
TODAS las corridas**, pero hoy viven solo como una cláusula dentro de
`AC1.1.1` ("la extensión inyecta el content script"). No hay historia ni AC para
el caso "**el content script no es alcanzable**": no hay pestaña `calculator.aws`,
la inyección falla, o el `PING` no responde tras N intentos. Para un mantenedor
solo esto es una historia pequeña, independiente y testeable en su propia
unidad (lógica de `popup.js`: `tabs.query`/`create` → `PING` → `executeScript`).
Hoy el handshake está roto por diseño en el código actual (`popup.js` es el único
que lo orquesta) y P1/P3 lo agravan. Debe ser su propia historia en el Grupo 1,
antes de US1.1 en la dependencia, porque US1.1 asume que la inyección funciona.

### Hallazgo secundario — US4.3 es un epic disfrazado; dividir por la costura A/B

`US4.3` ("conjunto completo de servicios del v6, FIX-1..FIX-9") con un solo
`AC4.3.1` cubre CloudWatch, KMS, SageMaker, ELB, WAF, EC2, Bedrock y 9 fixes
distintos. Eso NO es small: son 7+ servicios con comportamientos de DOM
heterogéneos. Para un mantenedor solo debe dividirse, y la costura natural es la
**partición Zona A / Zona B afirmada en `team.md`**:

- **FIXes de lógica pura (Zona A, unit-testeable con Vitest, NFR6)**: FIX-1
  `cleanAriaLabel`, FIX-2 `parseUnitButtonLabel`. Nacen con tests por función.
- **FIXes de resolución de DOM (Zona B, smoke manual, NFR6)**: FIX-3 (sección por
  heading), FIX-5 (`instance_radio`), FIX-6 (radiogroup), FIX-7 (timing de
  toggles condicionales), FIX-8 (`resolveElementByLabel`), FIX-9 (toggle por
  `aria-labelledby`).

Dividir así alinea las historias con la estrategia de test afirmada (una no lleva
piso de cobertura, la otra sí) y da entregas pequeñas en vez de un bloque
inentregable de un tirón.

### Otros tres puntos menores

1. **Solape US4.2 ↔ FIX-8 de US4.3.** La resolución en cascada de US4.2 ES el
   mecanismo de FIX-8. No pido fusión, pero el borde debe declararse (US4.2 fija
   el contrato de cascada; la historia Zona B de FIX-8 lo aplica) para no
   implementarlo dos veces.

2. **NFR7 (capa de mapeo extraíble a módulo ES) no tiene ancla en ninguna
   historia.** Es una regla dura afirmada (`project.md`: ALWAYS mapeo extraíble a
   módulo ES) y es justo lo que mantiene reversible OQ1, pero no aparece como
   AC. Propongo un AC en US4.1 (o nota de diseño) asertando que la capa de mapeo
   queda aislada/importable, acoplada solo por message passing o `import`.

3. **AC6.1.1 nombra "cerebro vacío" como modo de fallo.** Es aceptable como
   ejemplo, pero está fraseado desde el contrato n8n actual (`callN8N`→`[]`).
   Para no filtrar la decisión diferida, sugiero "fuente de mapeo sin respuesta /
   vacía" en vez de "cerebro vacío".

### Nota sobre dependencias (no bloqueante)

La sección Dependencias dice "US2.x y US3.x alimentan US4.x", pero US1.1 ya
ejercita inline la lógica de US4.1 y US7.1 (es un slice vertical). Conviene
decir que **US1.1 establece la espina end-to-end que US4.x/US7.x luego
generalizan**, para que el grafo no lea como si US4.1 estuviera bloqueada por las
entradas cuando el skeleton ya probó ese camino.

## Positions

OBJECT: Falta una historia técnica de inyección/handshake (FR2/FR2.2). Hoy solo
vive como cláusula de `AC1.1.1`; no hay cobertura para "content script no
alcanzable" (sin pestaña `calculator.aws`, inyección falla, `PING` sin
respuesta). Añadir una historia propia en el Grupo 1 (Must Have), anterior a
US1.1 en la dependencia, sobre la lógica de `popup.js` (`tabs.query`/`create` →
`PING` → `executeScript`).

OBJECT: `US4.3` es un epic disfrazado (FIX-1..FIX-9 sobre 7+ servicios en un solo
AC). Dividir por la costura Zona A / Zona B de `team.md`: una historia para los
FIXes de lógica pura (FIX-1, FIX-2; unit-testeables, piso 80%) y otra(s) para los
FIXes de resolución de DOM (FIX-3/5/6/7/8/9; smoke manual, sin piso). Así cada
historia es small y entregable por un mantenedor solo.

OBJECT: NFR7 (capa de mapeo extraíble a módulo ES) —regla dura afirmada que
sostiene la reversibilidad de OQ1— no tiene ancla en ninguna historia. Añadir un
AC en US4.1 asertando que la capa de mapeo queda aislada/importable, acoplada
solo por message passing o `import`.

AGREE: US1.1 es un walking skeleton genuinamente delgado, end-to-end y agnóstico
del cerebro; correcto como primera Must Have.

AGREE: Ninguna historia prejuzga la decisión diferida de ubicación del cerebro
(con la salvedad menor de redacción en AC6.1.1: "cerebro vacío" → "fuente de
mapeo sin respuesta / vacía").

AGREE: La división fina US2.1/US2.2 y las dependencias input → ejecución →
finalización → WAF son correctas; aclarar solo que US1.1 establece la espina que
US4.x/US7.x generalizan, y declarar el borde US4.2 ↔ FIX-8 para no duplicar la
cascada de resolución.
