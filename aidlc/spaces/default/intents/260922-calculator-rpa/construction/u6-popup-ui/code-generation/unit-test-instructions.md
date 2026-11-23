# Instrucciones de tests unitarios — u6-popup-ui

## Framework y configuración

- **Runner:** Vitest (dev-dependency), entorno `node`, módulos ES nativos. Los tests importan directamente los módulos de Zona A: `lib/panel/{panel-state,url-check,history-model,timers,session-rule,waf-model}.js` y `lib/messages-es.js`.
- **Configuración:** `vitest.config.js` en la raíz; tests en `tests/u6/*.test.js`.
- **Cobertura:** proveedor `v8`; umbral propio de 80 % en líneas y ramas sobre los siete módulos de Zona A.
- **Requisitos previos:** Node LTS y `npm ci` en la raíz.
- **Zona B** (`effects.js`, `tab-store.js`, `history-view.js`, `render/*.js`, `lib/history-store.js`, `sidepanel.*`) no tiene piso de cobertura; `effects.js`, `tab-store.js` y `history-store.js` tienen pruebas con dobles, y el render se verifica con `aws-calculator-extension/SMOKE.md`.

## Cómo correr los tests de ESTA unidad

```bash
npx vitest run tests/u6
```

También como `npm run test:u6` (mismo comando).

## Objetivos de cobertura esperados

- Umbral de esta unidad, con su propio comando:

```bash
npx vitest run tests/u6 --coverage --coverage.include="aws-calculator-extension/lib/{panel/panel-state,panel/url-check,panel/history-model,panel/timers,panel/session-rule,panel/waf-model,messages-es}.js"
```

- Piso del proyecto: lo verifica Build and Test sobre la suite completa con `npx vitest run --coverage`, aparte.
- Una corrida acotada que sale distinto de 0 solo por un umbral, con todas las pruebas en verde, se registra con los resultados de la unidad; no es una prueba fallida.
- Volumen (estrategia Standard): 5-8 pruebas por componente, unas 75 en total en 14 archivos, con una prueba de integración del reductor que recorre la máquina completa (NFR8.4) y una de los efectos con dobles del puerto.

## Guía de dobles

- **`chrome`:** `tests/u1/fake-chrome.js` y `tests/u7/fakes.js` (`runtime.sendMessage`, `storage.session` y `storage.local` en memoria).
- **Puerto del cerebro:** objeto falso con `interpret`, `wafEvaluate`, `login` y `session` que resuelven, rechazan con `BrainCallError { code }` o no responden.
- **Tiempo:** reloj inyectable `{ now, setTimeout, clearTimeout }` con `vi.useFakeTimers()` para 30 s, 35 s, 20 s, 2 s y 300 ms.
- **Cancelación:** `AbortController` real de la prueba.
- **ESLint:** `new ESLint()` con `calculateConfigForFile` sobre `sidepanel.js`, `lib/panel/` y un módulo de Zona A.
- **Sin DOM real:** ninguna prueba usa `jsdom`; el render queda para el smoke.

## Datos de prueba

- `tests/u6/fixtures.js`: `NormalizedRun` de JSON y de lenguaje natural, `InputError` de cada familia de U2, `RunResult` DONE con URL válida e inválida, ERROR con faltantes, sustituciones y `brainErrorCode = unauthorized`, `ProgressEvent` de cada `step`, respuestas WAF válidas e inválidas y sesiones con `expiresAt` a 5, 14, 16 y 60 minutos.
- 500 corridas sintéticas para el historial, generadas en la prueba.
- Cada prueba arma sus datos; nada mutable compartido.
