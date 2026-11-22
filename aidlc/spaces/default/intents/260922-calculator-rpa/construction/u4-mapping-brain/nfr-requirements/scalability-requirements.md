# Requisitos de escala — u4-mapping-brain

> Carga esperada del cerebro y cómo se acota. Prosa en español; identificadores
> en inglés.

## Sources

- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/requirements-analysis/requirements.md` (NFR1, NFR3, NFR8). [requirements]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u4-mapping-brain/functional-design/rules.md` (BR1.5, BR4.2, BR5.1-BR5.3, BR6.2, BR7.3). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/contract-design/contract-summary.md` (C1-C3, topes, resiliencia del borde). [stage]
- `nfr-requirements-questions.md` de esta unidad: Q2 (10 SE, 3 corridas simultáneas), Q3 (99,5 % 24x7), Q4 (alerta y tope diario). [Q2, Q3, Q4]

## Carga de referencia (Q2)

Hasta 10 SE y 3 corridas simultáneas. Una corrida de 20 servicios hace como máximo: 1 `/interpret`, 4 lotes de revisión previa, 20 `/map-residue` y 4 lotes de revisión final, unas 29 operaciones. De ahí sale el límite de 60 operaciones por minuto por SE de `security-requirements.md` NFR3.1 (el doble, para absorber reintentos). Las 3 corridas simultáneas son la carga de dimensionamiento, no un límite que el servicio imponga: el contrato no tiene identificador de corrida.

Invocaciones en vuelo por corrida: U5 llena los servicios uno a la vez, así que como máximo hay 1 `/map-residue` o 4 lotes de `/waf-evaluate` a la vez; 3 corridas suman como máximo 12 invocaciones.

## Requisitos

| ID | Requisito | Criterio de verificación |
|---|---|---|
| NFR3.3 | El servicio atiende 3 corridas simultáneas de 20 servicios (unas 90 operaciones en 3 minutos) sin errores 5xx ni violar NFR8.5. | Prueba de carga con 3 corridas simuladas. |
| NFR3.4 | La concurrencia hacia Bedrock se limita en el servicio a 15 invocaciones en vuelo (12 de la carga de referencia más margen). El exceso espera en cola; solo si la espera dejaría la operación por encima de 25 s responde 429 `rate_limited` con `retryAfterSeconds`, nunca un error genérico. | Prueba con 20 invocaciones simultáneas. |
| NFR3.5 | El inventario (unos 442 servicios y 3985 campos) se carga una vez por instancia y su tamaño en memoria queda bajo 50 MB. | Medición en la prueba de arranque. |
