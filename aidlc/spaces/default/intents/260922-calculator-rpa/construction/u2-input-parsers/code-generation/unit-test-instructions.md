# Instrucciones de tests unitarios — u2-input-parsers

## Framework y configuración

- **Runner:** Vitest (dev-dependency), entorno `node`, módulos ES nativos. Sin build: los tests importan directamente `aws-calculator-extension/lib/input/**`.
- **Configuración:** `vitest.config.js` en la raíz; tests en `tests/u2/*.test.js`.
- **Cobertura:** proveedor `v8`; umbral propio de 80 % en líneas y ramas sobre `lib/input/**` (clave por glob en `coverage.thresholds`).
- **Requisitos previos:** Node LTS y `npm ci` en la raíz del repo.

## Cómo correr los tests de ESTA unidad

Comando acotado a la unidad, ejecutable desde la raíz del repo antes del primer paso de pruebas:

```bash
npx vitest run tests/u2
```

También como `npm run test:u2` (mismo comando).

## Objetivos de cobertura esperados

- Umbral de esta unidad: 80 % de líneas y ramas en `lib/input/**`, comprobado con su propio comando:

```bash
npx vitest run tests/u2 --coverage --coverage.include="aws-calculator-extension/lib/input/**"
```

- Piso del proyecto: 80 % de líneas sobre la lógica pura de Zona A. Lo verifica Build and Test sobre la suite completa con este comando, aparte:

```bash
npx vitest run --coverage
```

- Una corrida acotada que sale distinto de 0 solo por un umbral, con todas las pruebas en verde, se registra con los resultados de la unidad; no es una prueba fallida.
- Volumen (estrategia Standard): 5-8 pruebas por módulo, unas 40 en total, incluida una prueba de integración de `normalize` con dos dobles del puerto.

## Guía de dobles

- **Puerto del cerebro:** función `interpretNaturalLanguage(request, { signal })` falsa por prueba, programable para devolver `interpreted`, `unresolved`, una forma inválida, rechazar con `BrainCallError { code }` o no responder nunca.
- **Tiempo:** `vi.useFakeTimers()` para el tope de 30 s; nunca esperas reales.
- **Cancelación:** un `AbortController` real de la prueba como señal de la corrida.
- Verificar resultados (`{ ok, value | error }`, `InputError.code`, entradas de `toLogEntry`), no llamadas internas.

## Datos de prueba

- Fábricas en `tests/u2/fixtures.js`: JSON válido del Anexo A (caso canónico EC2 t3.micro), variantes con una sola clave alterada, respuestas del cerebro de ejemplo.
- Cada prueba arma sus datos; nada mutable compartido.
