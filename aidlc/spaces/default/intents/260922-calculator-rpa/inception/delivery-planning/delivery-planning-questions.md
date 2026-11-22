# Delivery Planning — Preguntas

> Secuencia los 7 Units en Bolts (un Bolt = una pasada de construcción sobre
> una parte del trabajo que termina en algo que corre). El walking skeleton (U1)
> es el primer Bolt. Mantenedor solo → todos los Bolts los ejecuta el AI
> (developer). Responde cada `[Answer]:`.

## Q1 — Estrategia de secuenciación (qué construir primero)

Dado que ya afirmamos walking-skeleton-primero, ¿cómo ordenamos el resto tras el skeleton?

A. **Riesgo primero**: tras el skeleton (U1), atacar lo más incierto — U5 (RPA/DOM, riesgo P2 de selectores stale) y U4 (cerebro FM server-side) temprano, porque es donde más puede fallar la revivida.
B. **Valor primero**: tras el skeleton, lo que da valor visible al usuario — U2 (entrada NL/JSON) y U6 (popup) antes, luego el RPA completo.
C. **Mix**: skeleton → riesgo (U5 RPA/DOM) → entrada+UI (U2/U6) → cerebro+WAF (U4) → packaging (U7). Equilibra probar lo frágil temprano con entregar valor incremental.
X. Other (please specify)

[Answer]: C

## Q2 — Modelo de scoring

¿Rankeamos el trabajo con un modelo formal (tipo WSJF: valor y urgencia contra tamaño), o secuenciamos por juicio?

A. **Por juicio** (recomendado para 7 unidades y un mantenedor solo): el DAG + la estrategia de Q1 bastan; registrar la racional en prosa, sin scoring numérico.
B. **WSJF**: puntuar cada Bolt (valor + criticidad + reducción de riesgo) ÷ tamaño. Dime los pesos.
X. Other (please specify)

[Answer]: A

## Q3 — Tamaño de Bolt

¿Qué tamaño tiene un Bolt?

A. **Un Bolt = un Unit** (≈7 Bolts): simple, mapea 1:1 con las unidades; el skeleton es su propio Bolt.
B. **Bolts que agrupan Units relacionados** (menos Bolts, cada uno más grande).
X. Other (please specify)

[Answer]: A

## Q4 — Ejecución: serial o paralela

El DAG permite paralelismo (u1/u2/u3/u4 independientes). ¿Construimos en serie o en paralelo?

A. **Serial** (recomendado para un mantenedor solo): un Bolt tras otro, con checkpoint por Unit. El skeleton primero siempre va solo y gated.
B. **Paralelo donde el DAG lo permita** (stage-major + swarm): varios Units a la vez. Más complejo de supervisar para una sola persona.
X. Other (please specify)

[Answer]: B — paralelo donde el DAG lo permita (stage-major + swarm) para los Units posteriores al skeleton. El walking skeleton (U1) siempre corre primero, solo y gated. El humano acepta la mayor complejidad de supervisión a cambio de velocidad. Se aplicará `set-construction-iteration stage-major` + `set-construction-execution swarm` en el Step 6.

## Q5 — Dependencias externas

¿Algo fuera de este trabajo nos puede frenar (APIs, datos, aprobaciones, otro equipo)?

A. **Solo el alojamiento del cerebro (U4)**: la decisión n8n-vs-Bedrock y su credencial del FM es la única dependencia externa real; bloquea U4 y U7 (host en manifest), no el skeleton.
B. **Hay más** — descríbelas.
X. Other (please specify)

[Answer]: A — la única dependencia externa real es el alojamiento del cerebro (U4): la decisión n8n-vs-Bedrock y la credencial del FM. Bloquea U4 y, por el host en el manifest, U7. NO bloquea el walking skeleton (U1), que es agnóstico del cerebro y corre con mapeo determinístico local.

## Q6 — Comando de verificación de cada Unit

El proyecto NO tiene aún `package.json`/`node_modules` ni Vitest instalado (es tooling greenfield; se introduce en Construction). El comando verifica la lógica pura de Zona A; el RPA/DOM (Zona B) es smoke manual aparte. ¿Qué hacemos?

A. **Diferir la selección al primer checkpoint**: como Vitest aún no existe, dejar el comando sin fijar ahora; el primer checkpoint (tras introducir Vitest en el skeleton) preguntará el comando real (p. ej. `npx vitest run --coverage`).
B. **Fijar ya `npx vitest run`** como comando, asumiendo que el skeleton introduce Vitest antes del primer checkpoint.
X. Other (please specify)

[Answer]: A — diferir la selección del comando de verificación al primer checkpoint. Vitest aún no existe (tooling greenfield); el skeleton (U1) lo introduce. El primer checkpoint preguntará el comando real (p. ej. `npx vitest run --coverage`) una vez exista. El campo de comando de verificación queda sin fijar ahora. La verificación del RPA/DOM (Zona B) es smoke manual versionado (SMOKE.md), fuera del comando automatizado.

## Consolidated Summary Confirmation

- Q1 (secuencia): mix — skeleton (U1) → riesgo (U5 RPA/DOM) → entrada+UI (U2/U6) → cerebro+WAF (U4) → packaging (U7).
- Q2 (scoring): por juicio, sin WSJF numérico; racional en prosa.
- Q3 (tamaño de Bolt): un Bolt = un Unit (≈7 Bolts); el skeleton es su propio Bolt.
- Q4 (ejecución): paralelo donde el DAG lo permita (stage-major + swarm) tras el skeleton; U1 siempre primero, solo y gated. Se aplicará set-construction-iteration stage-major + set-construction-execution swarm.
- Q5 (dependencias externas): solo el alojamiento del cerebro (U4) — n8n vs Bedrock + credencial del FM; bloquea U4 y U7, no el skeleton.
- Q6 (comando de verificación): diferido al primer checkpoint (Vitest aún no existe; el skeleton lo introduce). RPA/DOM = smoke manual aparte.
- team-allocation: todos los Bolts los ejecuta el AI (aidlc-developer-agent); mantenedor solo.

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
