# Instrucciones de tests unitarios — u7-packaging

## Framework y configuración

- **Runner:** Vitest (dev-dependency), entorno `node`, módulos ES nativos. Los tests importan directamente `aws-calculator-extension/sw/**`, `lib/connection/brain-port.js` y las funciones exportadas de `scripts/*.js`.
- **Configuración:** `vitest.config.js` en la raíz; tests en `tests/u7/*.test.js`.
- **Cobertura:** proveedor `v8`; umbral propio de 80 % en líneas y ramas sobre `aws-calculator-extension/sw/**` y `aws-calculator-extension/lib/connection/brain-port.js`.
- **Requisitos previos:** Node LTS y `npm ci` en la raíz. Las pruebas de `package-zip` no llaman a `tar` ni a `zip`: prueban la selección de archivos y la verificación de entradas con listas en memoria.

## Cómo correr los tests de ESTA unidad

```bash
npx vitest run tests/u7
```

También como `npm run test:u7` (mismo comando).

## Objetivos de cobertura esperados

- Umbral de esta unidad, con su propio comando:

```bash
npx vitest run tests/u7 --coverage --coverage.include="aws-calculator-extension/sw/**" --coverage.include="aws-calculator-extension/lib/connection/brain-port.js"
```

- Piso del proyecto: lo verifica Build and Test sobre la suite completa con `npx vitest run --coverage`, aparte.
- Una corrida acotada que sale distinto de 0 solo por un umbral, con todas las pruebas en verde, se registra con los resultados de la unidad; no es una prueba fallida.
- Volumen (estrategia Standard): 5-8 pruebas por componente, unas 70 en total en 11 archivos, con una prueba de integración del borde (`dispatch.test.js`: mensaje → autorización → cliente → respuesta).

## Guía de dobles

- **`chrome`:** objeto falso por prueba (`tests/u7/fakes.js`) con `runtime.id`, `runtime.getPlatformInfo`, `runtime.sendMessage`, `runtime.lastError`, `identity.launchWebAuthFlow`, `identity.getRedirectURL` y `storage.session` en memoria (`get`, `set`, `remove`, `setAccessLevel`). Nada global compartido entre pruebas.
- **`fetch`:** función falsa que devuelve `Response` con estado, cabeceras (`x-request-id`) y cuerpo JSON o HTML, o rechaza con `TypeError`; se cuentan las llamadas.
- **`crypto`:** `globalThis.crypto` de Node (`getRandomValues`, `subtle.digest`); para fijar el `state` se inyecta un generador determinista.
- **Tiempo:** reloj inyectable `{ now, setTimeout, clearTimeout }` con `vi.useFakeTimers()`.
- **Cancelación:** `AbortController` real de la prueba.
- **ESLint:** `new ESLint()` con `calculateConfigForFile` sobre rutas de `sw/` y `lib/connection/`.

## Datos de prueba

- Respuestas del cerebro con el cuerpo plano de `brain/core/error-catalog.js` (`{ code, message, requestId, retryAfterSeconds? }`) y respuestas 200 válidas e inválidas por operación (`map-residue`, `interpret`, `waf-evaluate`).
- Manifests de prueba armados en memoria a partir del manifest real, con una sola desviación cada uno.
- `cdk-outputs.json` de ejemplo con valores ficticios rotulados como tales.
- Cada prueba arma sus datos; nada mutable compartido.
