# Requisitos de rendimiento — u4-mapping-brain

> Tiempos del cerebro medidos desde el cliente de prueba (incluye red, TLS y
> validación del token) salvo que se indique otra cosa. Prosa en español; identificadores en inglés.

## Sources

- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/requirements-analysis/requirements.md` (NFR1, NFR3, NFR8). [requirements]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u4-mapping-brain/functional-design/rules.md` (BR1.5, BR4.2, BR5.1-BR5.3, BR6.2, BR7.3). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/contract-design/contract-summary.md` (C1-C3, topes, resiliencia del borde). [stage]
- `nfr-requirements-questions.md` de esta unidad: Q2 (10 SE, 3 corridas simultáneas), Q3 (99,5 % 24x7), Q4 (alerta y tope diario). [Q2, Q3, Q4]

## Requisitos

| ID | Requisito | Criterio de verificación |
|---|---|---|
| NFR8.4 | Ninguna operación supera 25 s en el servicio, incluido el reintento de salida del modelo (BR1.5); vencido el tope, responde 504 `timeout`. Así la extensión, con su tope de 30 s, siempre recibe una respuesta antes de rendirse. | Prueba con un modelo simulado lento: respuesta 504 a los 25 s. |
| NFR8.5 | `/interpret` y `/map-residue`: p95 ≤ 12 s con la carga de referencia de 3 corridas simultáneas (Q2). | Prueba de latencia con 20 pedidos representativos; p95 medido. |
| NFR8.6 | `/waf-evaluate` p95 ≤ 12 s con 5 servicios y ≤ 18 s con 20 servicios (lotes de 5 en paralelo, BR4.2), dejando 7 s bajo el tope de 25 s y 12 s bajo los 30 s de la extensión. Se mide con 5, 10 y 20 servicios. | Prueba de latencia por tamaño de lote. |
| NFR8.7 | Arranque en frío: la primera operación tras 30 minutos sin tráfico responde en ≤ 20 s (el inventario activo se carga una vez y queda en memoria). | Prueba tras 30 min sin tráfico. |
