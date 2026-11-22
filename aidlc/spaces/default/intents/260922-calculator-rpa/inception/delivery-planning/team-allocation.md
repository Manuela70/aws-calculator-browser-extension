# Asignación de equipo — Revivida de la extensión RPA AWS Pricing Calculator

> Qué "mob" (equipo) ejecuta cada Bolt. Este proyecto tiene un único mantenedor
> humano; Team Formation (1.5) estuvo en SKIP, así que todos los Bolts los
> ejecuta el agente AI de desarrollo. Prosa en español.

## Sources

- `bolt-plan.md` (7 Bolts). [stage]
- Scope `rpa-extension-full-lifecycle`: Team Formation (1.5) en SKIP → sin mobs humanos definidos. [scope]

## Asignación

Como Team Formation estuvo en SKIP (no hay múltiples mobs), **todos los Bolts los ejecuta `aidlc-developer-agent` (AI)**, bajo la supervisión y aprobación del mantenedor humano en cada checkpoint/gate.

| Bolt | Unit | Mob |
|---|---|---|
| Bolt 1 | u1-walking-skeleton | aidlc-developer-agent (AI) |
| Bolt 2 | u5-rpa-dom | aidlc-developer-agent (AI) |
| Bolt 3 | u2-input-parsers | aidlc-developer-agent (AI) |
| Bolt 4 | u6-popup-ui | aidlc-developer-agent (AI) |
| Bolt 5 | u4-mapping-brain | aidlc-developer-agent (AI) |
| Bolt 6 | u7-packaging | aidlc-developer-agent (AI) |

No hay Program Board (un solo mob ejecutor). El mantenedor humano es el único revisor/aprobador y mantiene la supervisión en los checkpoints por Unit (ejecución paralela stage-major + swarm tras el skeleton; U1 siempre solo y gated primero).
