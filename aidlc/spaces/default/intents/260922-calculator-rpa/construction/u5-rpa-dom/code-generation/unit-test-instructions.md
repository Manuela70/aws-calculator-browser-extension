# Instrucciones de tests unitarios — u5-rpa-dom

## Framework y configuración

- **Runner:** Vitest (dev-dependency), entorno `node`, módulos ES nativos. Los tests importan directamente los módulos de Zona A: `lib/rpa/{orchestrator,result-aggregator,retry,service-timer}.js` y `lib/dom/{aria-label,cascade}.js`.
- **Configuración:** `vitest.config.js` en la raíz; tests en `tests/u5/*.test.js`, más los de U1 que esta unidad actualiza (`tests/u1/orchestrator.test.js`, `result-aggregator.test.js`, `retry-wait-timer.test.js`).
- **Cobertura:** proveedor `v8`; umbral propio de 80 % en líneas y ramas sobre los seis módulos de Zona A.
- **Requisitos previos:** Node LTS y `npm ci` en la raíz.
- **Zona B** (`dom-utils.js`, `dom-resolver.js`, `form-scanner.js`, `selectors.js`, `spotlight.js`, `content.js`) no tiene pruebas automáticas ni piso de cobertura: se verifica con `aws-calculator-extension/SMOKE.md` contra calculator.aws.

## Cómo correr los tests de ESTA unidad

```bash
npx vitest run tests/u5
```

También como `npm run test:u5` (mismo comando). Las pruebas de U1 que esta unidad actualiza corren con:

```bash
npx vitest run tests/u1/orchestrator.test.js tests/u1/result-aggregator.test.js tests/u1/retry-wait-timer.test.js
```

## Objetivos de cobertura esperados

- Umbral de esta unidad, con su propio comando:

```bash
npx vitest run tests/u5 tests/u1/orchestrator.test.js tests/u1/result-aggregator.test.js tests/u1/retry-wait-timer.test.js --coverage --coverage.include="aws-calculator-extension/lib/{rpa/orchestrator,rpa/result-aggregator,rpa/retry,rpa/service-timer,dom/aria-label,dom/cascade}.js"
```

- Piso del proyecto: lo verifica Build and Test sobre la suite completa con `npx vitest run --coverage`, aparte.
- Una corrida acotada que sale distinto de 0 solo por un umbral, con todas las pruebas en verde, se registra con los resultados de la unidad; no es una prueba fallida.
- Volumen (estrategia Standard): 5-8 pruebas por componente, unas 60 en total en 9 archivos, con una prueba de integración del orquestador multi-servicio sobre el DOM falso.

## Guía de dobles

- **Resolvedor de DOM:** `tests/u1/fake-dom.js` ampliado; cada método devuelve un resultado programado por prueba o lanza `DomError { code, step, label }`. Registra el orden de llamadas para verificar región, plantilla y toggles.
- **Mapeo:** `mapDeterministic` y `resolveResidue` reales de U3 con `mapResidue` falso; o un `MappingOutcome` fijo cuando la prueba es del orquestador.
- **Tiempo:** reloj inyectable `{ setTimeout, clearTimeout }` con `vi.useFakeTimers()` para el corte de 180 s y la salida de 20 s.
- **Cancelación:** `AbortController` real de la prueba como señal de la corrida.
- **ESLint:** `new ESLint()` con `calculateConfigForFile` sobre rutas de `lib/rpa/`, `lib/dom/` y `selectors.js`.
- **Sin DOM real:** ninguna prueba usa `jsdom`; la Zona B queda para el smoke.

## Datos de prueba

- `tests/u5/fixtures.js`: pedido canónico de EC2, pedido multi-servicio con plantilla y toggle condicional (Bedrock), dos servicios homónimos, `MappingOutcome` con `substituted`/`requestedValue`, `residueDetail` y `brainErrorCode`, candidatos por estrategia con y sin sección, etiquetas de botones de unidad.
- Enlaces de Share válidos e inválidos.
- Cada prueba arma sus datos; nada mutable compartido.
