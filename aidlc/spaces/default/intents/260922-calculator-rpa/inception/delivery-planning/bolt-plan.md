# Plan de Bolts — Revivida de la extensión RPA AWS Pricing Calculator

> Un **Bolt** es una pasada de construcción sobre una parte del trabajo que
> termina en algo que corre. Este plan ordena los 7 Units en 7 Bolts (un Bolt =
> un Unit). El orden es la racional económica; el batching real lo computa el
> motor desde el DAG de `unit-of-work-dependency.md`. Prosa en español; nombres
> de Unit en inglés.

## Sources

- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/units-generation/unit-of-work.md` y `unit-of-work-dependency.md` (7 Units, DAG). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/domain-design/components.md` (9 componentes que las Units agrupan; informa el contenido de cada Bolt). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/requirements-analysis/requirements.md` (FR/NFR que cada Bolt realiza). [requirements]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/contract-design/contract-summary.md` (contratos del cerebro). [stage]
- `aidlc/spaces/default/memory/team.md` (`## Walking Skeleton` ON; `## Deployment`; `## Way of Working` directo a main). [team-practices]
- Decisiones Q1-Q6 de la entrevista. [decidido]

## Secuencia de Bolts

### Bolt 1 — u1-walking-skeleton · WALKING SKELETON (gated, solo)
- **Unit**: U1.
- **Qué es el walking skeleton**: la rebanada mínima que corre todo el camino de punta a punta con un servicio simple, construida primero para probar que las piezas conectan antes de meter las funciones completas.
- **Prueba de arquitectura**: el camino entrada (JSON de un servicio) → mapeo determinístico mínimo → RPA sobre `calculator.aws` → guardar (banner verde) → devolver URL. Agnóstico del cerebro (no toca U4). Introduce Vitest como dev-dependency.
- **Definition of Done**: recargar la extensión unpacked, correr un caso canónico de 1 servicio (p. ej. S3) contra `calculator.aws`, y obtener una URL de un estimado que contiene ese servicio confirmado. Vitest corre al menos un test de la lógica pura mínima.
- **Confidence hypothesis**: el camino end-to-end de inyección→escaneo→mapeo determinístico→guardado→URL vuelve a funcionar sin el webhook n8n.
- **Demo esperada**: una corrida en vivo de un servicio que produce una URL compartible.

### Bolt 2 — u5-rpa-dom · riesgo primero
- **Unit**: U5. Depende de U3 (en el DAG), que se construye en paralelo.
- **Definition of Done**: scanForm/resolveElementByLabel/executeActions + FIX-1..FIX-9 funcionando sobre los servicios del v6; confirmación por banner verde + detección de `is required`; agregación todo-o-nada; reintentos acotados; overlay spotlight con cleanup. Smoke manual (SMOKE.md) verde para 1 servicio simple + 1 multi-servicio con toggle condicional + 1 fallo provocado.
- **Confidence hypothesis**: los selectores CloudScape no están tan stale como para romper el RPA (resuelve la incertidumbre P2), y la resolución en cascada sobrevive cambios menores.
- **Demo**: multi-servicio con toggle (Bedrock/SageMaker) llenado correctamente.

### Bolt 3 — u2-input-parsers · valor
- **Unit**: U2.
- **Definition of Done**: NaturalLanguageParser (con el ejemplo canónico S3), JsonParser (4 casos del Anexo A), InputNormalizer; unit-tests Vitest con piso 80% sobre esta lógica pura.
- **Confidence hypothesis**: la entrada NL y JSON convergen en la misma estructura interna de forma fiable.
- **Demo**: la misma entrada expresada en NL y en JSON produce el mismo llenado.

### Bolt 4 — u6-popup-ui · valor
- **Unit**: U6. Depende de U2 y U5 (en el DAG).
- **Definition of Done**: los estados del popup (M1-M8), pestañas NL/JSON, progreso y resumen por servicio, panel WAF, accesibilidad WCAG 2.1 AA; copy en español.
- **Confidence hypothesis**: el SE distingue trabajando/colgado/error y entiende qué servicio falló.
- **Demo**: una corrida con un fallo parcial que muestra el servicio fallido con su motivo y NO devuelve URL.

### Bolt 5 — u4-mapping-brain · cerebro + WAF
- **Unit**: U4 (service server-side). Depende de la decisión de alojamiento (n8n vs Bedrock).
- **Definition of Done**: el endpoint server-side responde los contratos C1 (`/map-residue`) y C2 (`/waf-evaluate`) con la credencial del FM server-side; el mapeo del residuo y el WAF funcionan sobre data escaneada (nunca screenshots).
- **Confidence hypothesis**: el FM resuelve el residuo ambiguo con eficiencia de tokens aceptable y el WAF produce recomendaciones útiles por pilar.
- **Demo**: un servicio con campos ambiguos que el determinístico no resolvió, completado por el cerebro; y una evaluación WAF de un estimado.

### Bolt 6 — u7-packaging · packaging (P4)
- **Unit**: U7. Depende de U4 (host del cerebro en el manifest).
- **Definition of Done**: `manifest.json` de mínimo privilegio (quitar el host muerto CloudFront, declarar solo los hosts usados incluido el del cerebro); estructura del bundle; script de empaquetado `.zip` sin build step.
- **Confidence hypothesis**: el manifest queda limpio (P4 resuelto) y la extensión carga sin permisos muertos ni faltantes.
- **Demo**: `chrome://extensions` carga la extensión sin advertencias de permisos; el `.zip` se genera.

### Nota sobre marcadores y runtime
El marcador de walking skeleton aplica solo a Bolt 1. El orden de arriba es la racional económica; el motor construye según el DAG de `unit-of-work-dependency.md` (U1 primero por ser `depends_on: []` y skeleton-on; luego los Units independientes en paralelo donde el DAG lo permita). La primera revisión de una etapa de diseño NO es un skeleton entregado — el skeleton es Bolt 1 ejecutable.
