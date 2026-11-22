# Diseño de monitoreo — u7-packaging

> La extensión no envía telemetría a ningún servidor: corre en el navegador de
> cada SE y los datos de los clientes no salen de él. Su monitoreo es local
> (registro técnico) y se correlaciona con el del cerebro por `requestId`. Las
> alarmas de disponibilidad, latencia y gasto viven en u4. Prosa en español;
> identificadores en inglés.

## Sources

- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u7-packaging/nfr-design/security-design.md` (NFR3.1, NFR5.2, NFR8.1). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u4-mapping-brain/infrastructure-design/monitoring-design.md` (alarmas, `requestId`). [stage]

## 1. Métricas y KPI

| Métrica | Fuente | Umbral | Por qué importa |
|---|---|---|---|
| Resultado de cada `BRAIN_CALL` por `code` | Registro técnico local (u1) | Revisión manual cuando un SE reporta un problema | Distingue fallas del cerebro, de sesión y de red |
| Duración de cada `BRAIN_CALL` | Registro técnico local | Cerca de 30 s indica que el cerebro llegó a su plazo | Correlaciona con la alarma de latencia de u4 |
| Logins (`ok`, `login_cancelled`) | Registro técnico local | — | Detecta problemas del proveedor de identidad |

**Quién escribe**: el service worker escribe cada `BRAIN_CALL` en el registro técnico de u1 **solo a través de** `lib/log/run-logger.js` (el registrador de u1), que es el único módulo autorizado a usar `chrome.storage.local`; la regla de lint de `sw/**` prohíbe llamar a `chrome.storage.local` directamente, no importar ese registrador. El registro guarda solo `requestId` (uno por intento), `operation`, `code`, duración e intento; nunca el token, el cuerpo del pedido ni la respuesta (NFR5.2). Hacia el llamador, la respuesta del borde sigue el contrato: el `requestId` viaja dentro de `error` cuando falla, que es lo que el panel muestra.

## 2. Alertas

| Alerta | Condición | Severidad | Destino |
|---|---|---|---|
| — | La extensión no emite alertas: no hay servidor que reciba. Las alertas operativas del cerebro (`brain-5xx-rate`, `brain-probe-failed`, entre otras) están en u4 | — | SNS `brain-alarms` de u4 |

## 3. SLI y SLO

| SLI | Objetivo | Ventana |
|---|---|---|
| Disponibilidad del cerebro vista por la extensión | La de u4: 99,5 % | 30 días (medida por la sonda de u4) |
| Llamadas que terminan dentro del plazo de 30 s | 100 % (el plazo es un corte duro, NFR8.1) | Por llamada; verificado con pruebas |

## 4. Registros y trazas

- **Correlación**: cada `BRAIN_CALL` envía un `X-Request-Id` nuevo (y otro en el reintento); el registro técnico guarda los dos. Para investigar un problema, el SE exporta su historial (función de u1) y el mantenedor busca ese `requestId` en el grupo `/brain/api` de u4.
- **Panel de la extensión**: el SE ve el `code` traducido en español; el `requestId` aparece en el detalle técnico exportable.
- **Sin trazado distribuido ni telemetría remota**: decisión de privacidad, no limitación técnica.

## 5. Dueño y mecanismo

| Qué | Dueño | Frecuencia | Mecanismo |
|---|---|---|---|
| Disponibilidad y latencia vistas por los SE | Mantenedor | Semanal | Consume la revisión semanal del tablero `Brain` de u4; la extensión no tiene tablero propio |
| Problemas reportados por un SE | Mantenedor | Al recibir el reporte | Historial exportado por el SE y búsqueda del `requestId` en `/brain/api` |
