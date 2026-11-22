# Instrucciones de tests unitarios — u1-walking-skeleton

## Framework y configuración

- **Runner:** Vitest (dev-dependency), entorno `node`, módulos ES nativos. Sin build: los tests importan directamente los archivos de `aws-calculator-extension/lib/**`.
- **Configuración:** `vitest.config.js` en la raíz del repo; tests en `tests/u1/*.test.js`.
- **Cobertura:** proveedor `v8` (`@vitest/coverage-v8`), umbral de líneas del 80 % agregado sobre los módulos de Zona A listados en `vitest.config.js`.
- **Requisitos previos:** Node LTS y `npm ci` (o `npm install` la primera vez) en la raíz del repo.

## Cómo correr los tests de ESTA unidad

Comando acotado a la unidad (todos los archivos de `tests/u1/`), ejecutable desde la raíz del repo:

```bash
npx vitest run tests/u1
```

También disponible como `npm run test:u1` (mismo comando).

## Objetivos de cobertura esperados

- Piso del proyecto: 80 % de líneas sobre la lógica pura de Zona A (práctica del equipo, Testing Contract). Lo verifica Build and Test sobre la suite completa del proyecto ensamblado con este comando, propio y separado:

```bash
npx vitest run --coverage
```

- Una corrida acotada a la unidad puede salir con código distinto de 0 solo por el umbral de cobertura aun con todos los tests en verde; eso se registra junto a los resultados de la unidad y no es un test fallido.
- Volumen (estrategia Standard): 5-8 tests por componente; ≈65 en total, incluidos 2 archivos de integración (`orchestrator.test.js`, `content-main.test.js`) que prueban los bordes clave con dobles.

## Guía de mocks y dobles

- **API de Chrome:** un objeto `chrome` falso por test (sin globales compartidas) con `tabs`, `scripting`, `runtime` y `storage.local` mínimos; se inyecta como dependencia en `handshake.js`, `content-main.js` y `run-logger.js`.
- **Almacenamiento:** un `Map` en memoria que imita `chrome.storage.local` (`get`, `set`, `remove`), con modo "falla la próxima escritura" para probar reintento y `degraded`.
- **Resolvedor del DOM:** un objeto falso con las mismas funciones que `dom-resolver.js`, programable por test (banner que aparece/no aparece, `is required`, servicio no encontrado, contenido del estimado). La Zona B real no se prueba con DOM emulado.
- **Tiempo:** `vi.useFakeTimers()` para `waitFor`, `retry`, `service-timer` y latido; nunca esperas reales.
- Preferir stubs a mocks de interacción; verificar resultados (`RunResult`, `ServiceResult`, entradas del registro), no llamadas internas.

## Datos de prueba

- Fábricas en `tests/u1/fixtures.js`: `makeRunInput()` (caso canónico EC2 t3.micro de `functional-spec.md` §6), `makeDomFields()` (campos de EC2 con la tabla de instancias como un solo `instance_radio`), `makeServiceResult()`.
- Los casos de error parten de un valor válido y cambian solo el campo bajo prueba.
- Cada test crea sus propios datos; nada mutable compartido entre tests.

## Zona B (no automatizada)

El resolvedor del DOM (`lib/dom/**`) y la integración real con `calculator.aws` se verifican con el smoke manual de `aws-calculator-extension/SMOKE.md` tras recargar la extensión unpacked.
