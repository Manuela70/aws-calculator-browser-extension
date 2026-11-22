# Mapa de dependencias externas — Revivida de la extensión RPA

> Elementos fuera de este trabajo que pueden frenar un Bolt. Proyecto mayormente
> auto-contenido (extensión cliente); la única dependencia externa real es el
> alojamiento del cerebro. Prosa en español.

## Sources

- Decisión Q5 (solo el alojamiento del cerebro). [decidido]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/contract-design/contract-summary.md` (preguntas abiertas de alojamiento y auth). [stage]

## Dependencias

| Dependencia | Dueño | Lead time | Bolt que bloquea | Qué hacemos si se retrasa |
|---|---|---|---|---|
| Alojamiento del cerebro FM (recrear n8n desde backup vs. agente Bedrock) + credencial del FM server-side | Mantenedor (decisión) + Infrastructure Design | Variable (decisión + setup) | Bolt 5 (U4) y, por el host en el manifest, Bolt 6 (U7) | Seguir con Bolts 1-4 (skeleton, RPA, entrada, UI), que son agnósticos del cerebro; el camino determinístico funciona sin él. Fijar la decisión en Infrastructure Design antes del Bolt 5. |
| Autenticación extensión↔cerebro (token/origen) | NFR Design / Infrastructure Design | Baja (reservada a un header, aditiva) | Bolt 5 (U4) | Está reservada a un header HTTP, así que añadirla es aditiva y no bloquea el contrato; se define junto con el alojamiento. |

## Nota

El resto del trabajo es auto-contenido: no hay APIs de terceros que esperar (más allá del FM detrás del cerebro), ni datos externos, ni aprobaciones de otro equipo, ni hand-offs. El DOM de `calculator.aws` es la superficie objetivo, no una dependencia bloqueante (su riesgo P2 se ataca en Bolt 2, no es una espera). El walking skeleton y los Bolts 2-4 no tienen ninguna dependencia externa.
