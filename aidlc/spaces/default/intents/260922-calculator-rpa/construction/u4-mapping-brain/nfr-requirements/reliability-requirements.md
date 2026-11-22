# Requisitos de confiabilidad — u4-mapping-brain

> Disponibilidad y degradación del cerebro. Prosa en español; identificadores en
> inglés.

## Sources

- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/requirements-analysis/requirements.md` (NFR1, NFR3, NFR8). [requirements]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u4-mapping-brain/functional-design/rules.md` (BR1.5, BR4.2, BR5.1-BR5.3, BR6.2, BR7.3). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/contract-design/contract-summary.md` (C1-C3, topes, resiliencia del borde). [stage]
- `nfr-requirements-questions.md` de esta unidad: Q2 (10 SE, 3 corridas simultáneas), Q3 (99,5 % 24x7), Q4 (alerta y tope diario). [Q2, Q3, Q4]

## Requisitos

| ID | Requisito | Criterio de verificación |
|---|---|---|
| NFR1.4 | Disponibilidad objetivo 99,5 % mensual las 24 horas, en una sola región (Q3): como máximo unas 3,6 horas de indisponibilidad al mes. Se mide con una sonda sintética cada minuto que ejecuta un `/map-residue` mínimo con un token de servicio: un minuto cuenta como disponible si la sonda responde 2xx en menos de 25 s. Los 429 de usuarios no cuentan como indisponibilidad. | Métrica de disponibilidad mensual en el tablero de observabilidad. |
| NFR1.5 | El servicio no tiene punto único de fallo propio: cómputo gestionado con al menos dos zonas de disponibilidad y sin estado en memoria que no pueda reconstruirse (el inventario se recarga desde su almacenamiento). | Revisión de la arquitectura en Infrastructure Design. |
| NFR1.6 | Sin inventario activo o sin modelo disponible, el cerebro responde 503 con código tipado (`inventory_unavailable`, `model_unavailable`, ambos en el contrato) y la extensión lo muestra; nunca una respuesta vacía con 200 (BR7.3). | Prueba con inventario borrado y con Bedrock simulado caído. |
| NFR1.7 | Errores transitorios de Bedrock (throttling, 5xx) se reintentan una vez con espera de 1 a 2 s dentro del tope de 25 s; los errores de validación no se reintentan. | Prueba con fallo simulado una vez y luego éxito. |
| NFR1.8 | La actualización semanal del inventario no interrumpe el servicio: la versión nueva se activa de forma atómica y la anterior queda disponible para volver atrás (BR5.1, BR5.2). | Prueba de activación y reversión. |
| NFR1.9 | Una versión activa con más de 14 días se informa en la respuesta y en una alarma (BR5.3). | Prueba con fecha simulada. |
