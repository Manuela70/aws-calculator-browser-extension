# Racional de riesgo y secuenciación — Revivida de la extensión RPA

> El porqué del orden de los Bolts. Secuenciación por juicio (sin WSJF numérico),
> apoyada en el DAG de Units Generation y en la estrategia "mix" afirmada.
> Heurística: walking-skeleton-first (Cockburn) para el primer Bolt, risk-first
> (Cohn) para el residuo. Prosa en español.

## Sources

- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/units-generation/unit-of-work-dependency.md` (DAG). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/requirements-analysis/requirements.md` (P1-P4, NFRs). [requirements]
- Decisiones Q1 (mix), Q2 (por juicio), Q4 (paralelo). [decidido]

## Modelo de secuenciación

Se secuencia **por juicio**, no con un modelo numérico (WSJF): para 7 unidades y un mantenedor solo, el DAG de dependencias más la estrategia "mix" dan un orden claro sin la sobrecarga de puntuar. El DAG es la restricción dura; la estrategia elige el camino económico dentro de él.

## Racional del orden

1. **Bolt 1 (U1, walking skeleton) primero — walking-skeleton-first.** Es una revivida de código roto cuyo supuesto central (que el camino end-to-end vuelve a funcionar sin n8n) está sin verificar. Probarlo con un servicio simple antes que nada reduce el mayor riesgo de todos: reconstruir sobre una base que no corre. Agnóstico del cerebro, así que no espera a la decisión de alojamiento.

2. **Bolt 2 (U5, RPA/DOM) — risk-first.** Tras el skeleton, lo más incierto es la salud de los selectores CloudScape (P2): el DOM de terceros lleva ~14 meses sin verificar y es donde el RPA puede romperse en silencio. Atacarlo temprano convierte una incógnita en un hecho antes de invertir en lo demás. Es también la unidad más grande (XL).

3. **Bolts 3-4 (U2 entrada, U6 popup) — value-first.** Con el camino RPA probado, se agrega el valor visible: las dos formas de entrada (NL/JSON) y la UI completa del popup con errores y resumen. Dan la experiencia que el SE usa en cada corrida.

4. **Bolt 5 (U4, cerebro + WAF) — tras resolver su dependencia externa.** El cerebro FM server-side depende de la decisión de alojamiento (n8n vs Bedrock), la única dependencia externa. Se secuencia después de que el camino determinístico esté probado, para que el skeleton y el RPA no dependan de él; el residuo ambiguo y el WAF llegan cuando el servicio esté disponible.

5. **Bolt 6 (U7, packaging) último.** El manifest de mínimo privilegio necesita conocer el host del cerebro (de U4) para declararlo; cerrar P4 al final garantiza que el manifest refleja el estado final de red.

## Riesgos principales (lo que más preocupa, atacado temprano)

| Riesgo | Severidad | Bolt que lo ataca |
|---|---|---|
| El camino end-to-end no vuelve a correr sin n8n | Alto | Bolt 1 (skeleton) |
| Selectores CloudScape stale (P2) rompen el RPA | Alto | Bolt 2 (U5) temprano |
| Fallos silenciosos (P3) ocultan estimados incompletos | Alto | U5 (agregación todo-o-nada) + U6 (errores visibles) |
| Decisión de alojamiento del cerebro se retrasa | Medio | Aislado en Bolt 5; no bloquea 1-4 |
| Higiene de permisos del manifest (P4) | Bajo | Bolt 6 |

## Nota de paralelismo

El DAG permite construir en paralelo los Units independientes (u2/u3/u4 además de u1). Tras el skeleton (que va solo y gated), la ejecución es stage-major + swarm: varios Units a la vez donde el DAG no impone orden. El orden de Bolts de arriba es la narrativa económica; el motor computa los batches reales desde el DAG.
