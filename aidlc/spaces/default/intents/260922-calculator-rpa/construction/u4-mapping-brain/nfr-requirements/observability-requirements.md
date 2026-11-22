# Requisitos de observabilidad — u4-mapping-brain

> Métricas, registros y alarmas del cerebro, sin datos del cliente. Prosa en
> español; identificadores en inglés.

## Sources

- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/requirements-analysis/requirements.md` (NFR1, NFR3, NFR8). [requirements]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u4-mapping-brain/functional-design/rules.md` (BR1.5, BR4.2, BR5.1-BR5.3, BR6.2, BR7.3). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/contract-design/contract-summary.md` (C1-C3, topes, resiliencia del borde). [stage]
- `nfr-requirements-questions.md` de esta unidad: Q2 (10 SE, 3 corridas simultáneas), Q3 (99,5 % 24x7), Q4 (alerta y tope diario). [Q2, Q3, Q4]

## Requisitos

| ID | Requisito | Criterio de verificación |
|---|---|---|
| NFR3.6 | Registro estructurado (JSON) por operación: `requestId`, operación, versión de inventario, código de resultado, latencia, intentos, tokens de entrada y salida, y un identificador seudónimo del SE (hash del `sub` del token). Nunca texto, configuración ni respuesta del modelo (BR6.1). | Prueba sobre los registros de una operación. |
| NFR3.7 | Métricas por operación: cantidad, errores por código, latencia p50/p95, tokens. Son los SLI de la tasa de error y la latencia. | Tablero con las cuatro métricas. |
| NFR3.8 | Alarmas: tasa de 5xx > 5 % en 5 minutos; tasa de 429 > 10 % en 15 minutos; p95 > 20 s en 15 minutos (antes del tope de 25 s); sonda de salud fallida 3 veces seguidas; consumo mensual ≥ 80 % del presupuesto (Q4); inventario con más de 14 días. | Disparo simulado de cada alarma. |
| NFR3.9 | El `requestId` del servicio se devuelve en cada respuesta y la extensión lo guarda en su registro técnico, para cruzar un fallo visto por el SE con el registro del cerebro. | Prueba de extremo a extremo con un error forzado. |
| NFR3.10 | Retención de registros de 30 días. | Revisión de la configuración en Infrastructure Design. |
| NFR3.11 | Dueño y mecanismo: el mantenedor revisa cada semana el tablero (disponibilidad, p95 por operación, errores por código, tokens frente al presupuesto) junto con la actualización semanal del inventario, y anota las acciones en el registro del proyecto. | Revisión semanal registrada. |
