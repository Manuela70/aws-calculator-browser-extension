# Instrucciones de tests unitarios — u3-deterministic-mapper

## Framework y configuración

- **Runner:** Vitest (dev-dependency), entorno `node`, módulos ES nativos. Los tests importan directamente `aws-calculator-extension/lib/mapping/**` y `lib/dom/aria-label.js`.
- **Configuración:** `vitest.config.js` en la raíz; tests en `tests/u3/*.test.js`.
- **Cobertura:** proveedor `v8`; umbral propio de 80 % en líneas y ramas sobre `deterministic-mapper.js`, `option-match.js` y `residue-resolver.js`.
- **Requisitos previos:** Node LTS y `npm ci` en la raíz.

## Cómo correr los tests de ESTA unidad

```bash
npx vitest run tests/u3
```

También como `npm run test:u3` (mismo comando).

## Objetivos de cobertura esperados

- Umbral de esta unidad, con su propio comando:

```bash
npx vitest run tests/u3 --coverage --coverage.include="aws-calculator-extension/lib/mapping/{deterministic-mapper,option-match,residue-resolver}.js"
```

- Piso del proyecto: lo verifica Build and Test sobre la suite completa con `npx vitest run --coverage`, aparte.
- Una corrida acotada que sale distinto de 0 solo por un umbral, con todas las pruebas en verde, se registra con los resultados de la unidad; no es una prueba fallida.
- Volumen (estrategia Standard): 5-8 pruebas por módulo, unas 35 en total, con una prueba de integración del ciclo de pasadas más residuo.

## Guía de dobles

- **Puerto `mapResidue`:** función falsa por prueba que devuelve acciones válidas, acciones inválidas, o rechaza con `BrainCallError { code }`, o no responde (para el tope de 30 s). Se cuenta cuántas veces se llamó (debe ser una).
- **Tiempo:** `vi.useFakeTimers()`.
- **Cancelación:** `AbortController` real de la prueba como señal de la corrida.
- **DOM:** no se usa; los `DomField` son datos planos.

## Datos de prueba

- `tests/u3/fixtures.js`: `DomField` de EC2 y de S3 derivados del inventario (con secciones repetidas y selectores de unidad), valores pedidos del caso canónico y respuestas de `/map-residue` con `requestKey`.
- Cada prueba arma sus datos; nada mutable compartido.
