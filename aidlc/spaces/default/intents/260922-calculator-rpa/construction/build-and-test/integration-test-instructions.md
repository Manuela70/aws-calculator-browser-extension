# Instrucciones de pruebas de integración — calculator-rpa

> Estrategia Standard: pruebas de los bordes entre unidades. Todas corren en
> **Node con Vitest** (sin navegador ni DOM emulado). Son evidencia de
> integración, no de comportamiento en el navegador: lo que depende de Chrome o
> de calculator.aws reales se verifica con `aws-calculator-extension/SMOKE.md`.

## 1. Framework y configuración

- Vitest (dev-dependency), entorno `node`, módulos ES nativos; `vitest.config.js` en la raíz.
- Dobles: `tests/u1/fake-chrome.js`, `tests/u1/fake-dom.js`, `tests/u7/fakes.js`, puertos del cerebro falsos y reloj inyectable con `vi.useFakeTimers()`.
- Requisitos: `npm ci`, `npm ci --prefix brain`, `npm ci --prefix infra`.

## 2. Bordes cubiertos y pruebas

| Borde | Unidades | Prueba de integración |
|---|---|---|
| Entrada → normalización → `NormalizedRun` con dos dobles del puerto del cerebro | U2 ↔ U4 (contrato C2) | `tests/u2/normalize.integration.test.js` |
| Escaneo → mapeo en pasadas → residuo al cerebro | U3 ↔ U4 (contrato C1) ↔ U5 | `tests/u3/mapping-cycle.integration.test.js` |
| Orquestador multi-servicio con resolvedor de DOM falso, resultados y cancelación | U5 ↔ U3 ↔ U1 | `tests/u5/orchestrator-multi.test.js`, `tests/u1/orchestrator.test.js` |
| Content script: `RUN_RPA`, `CANCEL_RPA`, progreso y `mapResidue` por `brain-port` | U1 ↔ U5 ↔ U7 | `tests/u1/content-main.test.js`, `tests/u7/brain-port.test.js` |
| Borde del service worker: mensaje → autorización → cliente → respuesta | U7 ↔ U4 (cuerpo de error plano) | `tests/u7/dispatch.test.js`, `tests/u7/brain-client.test.js` |
| Panel: efectos sobre `brain-port`, sesión y mensajes de la corrida | U6 ↔ U7 ↔ U5 | `tests/u6/effects.test.js`, `tests/u6/panel-state.waits.test.js` |
| Servidor del cerebro: cadena de filtros, autenticación y uso | U4 | `tests/u4/server.test.js`, `tests/u4/auth-usage.test.js` |
| Reglas de lint por zona (no se debilitan entre unidades) | U2, U3, U5, U6, U7 | `tests/u5/eslint-config.test.js`, `tests/u6/eslint-panel.test.js`, `tests/u7/eslint-sw.test.js` |

## 3. Cómo correrlas

```bash
npx vitest run tests/u2/normalize.integration.test.js tests/u3/mapping-cycle.integration.test.js tests/u5/orchestrator-multi.test.js tests/u1/orchestrator.test.js tests/u1/content-main.test.js tests/u7/brain-port.test.js tests/u7/dispatch.test.js tests/u7/brain-client.test.js tests/u6/effects.test.js tests/u6/panel-state.waits.test.js tests/u4/server.test.js tests/u4/auth-usage.test.js
```

La suite completa (`npx vitest run --coverage`) también las incluye.

## 4. Cobertura esperada

- Piso del proyecto: 80 % de líneas en la suite completa (`vitest.config.js`).
- Umbrales propios de 80 % en líneas y ramas por unidad: `lib/input/**` (U2), tres módulos de `lib/mapping/` (U3), `brain/core/**` (U4), seis módulos de Zona A de U5, siete de U6, `sw/**` y `brain-port.js` (U7).

## 5. Datos de prueba

Cada unidad arma sus datos en `tests/<unidad>/fixtures.js`; nada mutable compartido entre pruebas. Ninguna prueba contacta AWS, Cognito ni calculator.aws.

## 6. Fuera de alcance aquí

- Comportamiento real en Chrome y en calculator.aws: smoke manual (S1-S15, R1-R9, P1-P8).
- Cerebro desplegado (Cognito, Bedrock, WAF, alarmas, costos reales): queda para Deployment Execution.
