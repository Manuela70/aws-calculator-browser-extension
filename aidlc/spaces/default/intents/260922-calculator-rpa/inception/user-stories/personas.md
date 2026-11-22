# Personas — Revivida de la extensión RPA AWS Pricing Calculator

## Sources

- `aidlc/spaces/default/codekb/extension/business-overview.md` (herramienta interna de preventa de Applying). [brownfield]
- `requirements.md` (FR1-FR11). [requirements]
- Decisión de entrevista Q1: un único persona primario. [decidido]

## P1 — SE / Arquitecto de preventa (persona primario)

- **Nombre/rol**: Solutions Engineer / arquitecto de preventa de Applying.
- **Contexto**: arma propuestas de solución AWS para clientes; necesita convertir una lista de servicios de una solución en un **estimado de costos AWS compartible** rápido y repetible.
- **Objetivos**:
  - Generar un estimado AWS completo sin llenar manualmente `calculator.aws` campo por campo.
  - Poder describir la solución en **lenguaje natural** cuando aún no tiene un JSON estructurado, o cargar un **JSON** cuando ya lo tiene.
  - Obtener recomendaciones **Well-Architected** sobre el estimado para enriquecer la propuesta.
  - Entregar al cliente una **URL pública** del estimado.
- **Pain points (estado actual roto)**:
  - La herramienta no funciona hoy: el "cerebro" de mapeo (n8n) ya no existe y el camino de red falla por CORS (P1).
  - Cuando algo falla, falla **en silencio** (P3): recibe una URL de un estimado incompleto creyendo que salió bien.
  - Los selectores de la UI de AWS pueden haber cambiado tras ~14 meses (P2).
- **Nivel técnico**: alto en AWS; no necesariamente desarrollador de la extensión. Usa Chrome con la extensión cargada unpacked.
- **Idioma**: trabaja en español (la UI de la extensión está en español).

## Prioridad

Un único persona; es el usuario primario y exclusivo de la herramienta. No hay personas secundarios en el alcance (decisión Q1). El consumidor final del estimado (el cliente que recibe la URL) no interactúa con la extensión y no se modela como persona.
