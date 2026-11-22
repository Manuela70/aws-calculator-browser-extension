# Practices Discovery — Preguntas de la entrevista

> Solo se preguntan las áreas que la evidencia no pudo establecer. Responde en
> cada `[Answer]:`. Los especialistas (quality/developer/devsecops) ya aportaron
> recomendaciones; aquí decides la intención del equipo.

## Q1 — Way of Working (ramas y merge)

Mantenedor solo, repo con git (`main`, un commit). ¿Cómo prefieres trabajar?

A. Directo sobre `main` con commits pequeños (lo más simple; sin ramas de PR)
B. Ramas de vida corta (1-2 días) + squash-merge a `main`, incluso siendo solo
C. Directo sobre `main` para cambios chicos, rama de vida corta solo para lo arriesgado (p. ej. la decisión del cerebro)
X. Other (please specify)

[Answer]: A

## Q2 — Walking Skeleton (rebanada end-to-end primero)

¿Construir primero una rebanada fina de punta a punta? Un walking skeleton es una versión mínima que corre todo el camino (entrada → mapeo → RPA → guardar un servicio simple), construida primero para probar que las piezas conectan antes de meter las funciones reales. Dado que es una revivida de código roto, tiene valor para reducir riesgo.

A. Sí — correr un walking skeleton primero (un servicio simple end-to-end), luego el resto
B. No — tratar el primer Bolt como cualquier otro, sin ceremonia de esqueleto
X. Other (please specify)

[Answer]: A

## Q3 — Testing Posture (metodología y runner)

Hoy no hay tests, ni runner, ni CI. Los especialistas proponen `test-after` Minimal: unit-tests solo sobre la lógica aislable del DOM (parseo de JSON, parseo de lenguaje natural, normalización, mapeo, `parseUnitButtonLabel`, `cleanAriaLabel`), y verificación manual (smoke) del núcleo RPA que depende del DOM de calculator.aws. ¿Qué adoptamos?

A. `test-after` Minimal como lo proponen: unit-tests de la lógica pura + smoke manual del RPA; runner `node:test` nativo (sin `node_modules`, sin build step)
B. Igual que A pero sin introducir runner por ahora — toda verificación manual
C. Algo más estricto (p. ej. piso de cobertura, o un runner con node_modules como Vitest)
X. Other (please specify)

[Answer]: C — Vitest + piso de cobertura 80% sobre la lógica pura aislable del DOM (parseo JSON, parseo de lenguaje natural, normalización, capa de mapeo, parseUnitButtonLabel, cleanAriaLabel). Vitest como dev-dependency: el bundle unpacked sigue siendo vanilla JS sin build step. Smoke manual (checklist versionado) para el núcleo RPA dependiente del DOM CloudScape; no se impone cobertura e2e sobre ese DOM de terceros.

## Q4 — Linter / Formatter

Hoy no hay linter ni formatter; el estilo se mantiene a mano. Developer y devsecops recomiendan introducir ESLint (flat config, standalone, sin build step) porque `no-empty` cazaría los `catch` vacíos que causan P3 y detectaría código muerto. Es opcional y solo dev-dependency (no cambia el bundle unpacked). ¿Lo introducimos?

A. Sí — ESLint standalone (y Prettier) como herramienta de desarrollo, sin build step
B. No por ahora — mantener el estilo a mano
C. Solo un pre-commit hook de secretos (Gitleaks/git-secrets), sin ESLint
X. Other (please specify)

[Answer]: A — ESLint (flat config, standalone) + Prettier como dev-dependency, sin build step; el bundle unpacked sigue siendo vanilla JS. ESLint con no-empty y detección de código muerto para atacar P3.

## Q5 — Distribución

Una extensión MV3 unpacked no tiene pipeline de deploy; "deploy" = cargar/recargar unpacked en Chrome. ¿Hay intención de publicarla (Chrome Web Store o distribución interna empaquetada), o permanece como herramienta interna unpacked?

A. Permanece interna/unpacked (cargar sin empaquetar) — sin publicación
B. A futuro empaquetar un `.zip` para distribución interna / Chrome Web Store
X. Other (please specify)

[Answer]: B — a futuro empaquetar un `.zip` del directorio para distribución interna / Chrome Web Store. Hoy no es necesario y no hay pipeline; sería un paso manual (o un script de empaquetado sin build step) cuando se decida publicar. El desarrollo diario sigue siendo cargar/recargar unpacked.

## Consolidated Summary Confirmation

Resumen de respuestas: (Q1) directo a `main`; (Q2) walking skeleton primero; (Q3) test-after + Vitest + cobertura 80% sobre lógica pura, smoke manual del RPA; (Q4) ESLint + Prettier standalone dev-dependency; (Q5) empaquetar `.zip` a futuro. Integraciones de especialistas: modelo de error explícito para P3, higiene de permisos mínimo privilegio, secretos nunca en el cliente, cero runtime deps, capa de mapeo extraíble a módulo ES sin build step.

[Answer]: Looks correct
