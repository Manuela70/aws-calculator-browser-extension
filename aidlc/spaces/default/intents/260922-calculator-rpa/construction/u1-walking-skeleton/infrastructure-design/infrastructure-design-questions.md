# Preguntas de Infrastructure Design — u1-walking-skeleton

> El skeleton no usa infraestructura en la nube: corre entero en el navegador
> del SE (extensión MV3 unpacked) y no hace llamadas de red propias. El
> despliegue ya está decidido en la práctica del equipo (cargar/recargar
> unpacked; `.zip` manual a futuro). Solo queda abierto cómo se ejecutan las
> verificaciones automáticas.

## Q1. [desarrollo] ¿Dónde corren automáticamente el lint y los tests de Vitest (con el piso del 80 %)?

Contexto: hoy no hay CI (práctica del equipo: commits directos a `main`, sin pipeline). El default de la organización pide ejecutar los tests antes de integrar. El repo local no tiene ningún remoto configurado (`git remote -v` vacío); un pipeline en la nube exigiría primero publicar el repo en GitHub.

A. Solo local: scripts `npm run lint`, `npm test` y `npm run coverage`, más un hook de git `pre-commit` que corre lint + tests y bloquea el commit si fallan. Sin servicio externo.
B. Un workflow de GitHub Actions que corre lint + tests + cobertura en cada push a `main` (requiere que el repo esté en GitHub).
C. Ambos: hook local `pre-commit` y workflow de GitHub Actions.
X. Other (please specify)

[Answer]: B

## Consolidated Summary Confirmation

- Q1: lint, tests de Vitest y cobertura (piso 80 % sobre la lógica pura) corren en un workflow de GitHub Actions en cada push a `main`. Requisito previo: publicar el repo en GitHub (hoy no tiene remoto); hasta entonces, los mismos scripts (`npm run lint`, `npm test`, `npm run coverage`) se corren a mano.
- Sin infraestructura en la nube para el skeleton: todo corre en el navegador del SE; despliegue = cargar/recargar la extensión unpacked, como dice la práctica del equipo.

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
