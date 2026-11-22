# Preguntas de Diseño Funcional — u4-mapping-brain

> U4 es el único componente server-side: custodia la credencial del modelo y
> expone lo que la extensión no puede hacer sola. Tras u2 y u3 su alcance creció:
> interpretar lenguaje natural con el inventario de calculator.aws, resolver el
> residuo de mapeo (C1 `/map-residue`, con `requestKey`), revisar la
> configuración con criterio Well-Architected antes de llenar y evaluar el
> estimado al terminar (C2 `/waf-evaluate`). Cubre US5.1 (con U6).

## Contexto ya decidido (no se pregunta)

- Ninguna credencial de larga vida en el cliente; el modelo se invoca server-side (`project.md`).
- El alojamiento concreto (n8n o proxy Bedrock) y la autenticación extensión ↔ cerebro se fijan en Infrastructure Design / NFR Design; aquí se fija el comportamiento.
- Revisión Well-Architected obligatoria antes de llenar y al terminar, para toda corrida, desde que U4 se integra (u2 Q1b, Q1c).
- La memoria del agente conversacional vivirá en un backend junto al cerebro (u1 Q8, Q9: capacidad nueva).

## Q1 — Revisión Well-Architected antes de llenar

A. **Aviso con confirmación (Recomendado).** El cerebro devuelve hallazgos por pilar sobre la configuración; el panel los muestra y el SE elige "llenar igual" o "corregir". Nada se bloquea sin que el SE lo vea.
B. **Bloqueante ante hallazgos graves.** Un hallazgo de severidad alta impide llenar hasta corregir la configuración.
C. **Solo informativa.** Se muestra y la corrida sigue sola.
X. Other (please specify)

[Answer]: A

## Q2 — Agente conversacional con memoria

A. **Unidad propia, después (Recomendado).** U4 cubre interpretación, residuo y Well-Architected; el agente con memoria (chat, contexto y entre sesiones) se diseña como una unidad nueva que reutiliza el mismo backend.
B. **Dentro de U4 ahora.** El agente y su memoria se diseñan en esta unidad.
X. Other (please specify)

[Answer]: A

## Q3 — Inventario de calculator.aws en el cerebro

A. **Copia versionada con refresco periódico (Recomendado).** El cerebro usa el inventario generado por el script de `knowledge/calculator-catalog`, regenerado periódicamente (p. ej. semanal) y versionado; cada respuesta indica la versión usada.
B. **Consulta en vivo.** El cerebro descarga las definiciones de calculator.aws en cada pedido.
X. Other (please specify)

[Answer]: A

## Q4 — Modelo

A. **Claude en Amazon Bedrock (Recomendado).** Coherente con la práctica AWS de Applying y con la credencial server-side vía IAM; el modelo concreto se fija en NFR Requirements.
B. **Otro proveedor o modelo** (especificar).
X. Other (please specify)

[Answer]: A
