# Units Generation — Plan de decomposición y preguntas

> Agrupa los 9 componentes de domain-design en unidades de trabajo con su DAG.
> Es una extensión MV3 monolítica (un solo bundle unpacked): las unidades son
> particiones de ENTREGA, no artefactos desplegables independientes. El primer
> Unit es el walking skeleton (slice end-to-end). Responde cada `[Answer]:`.

## Plan propuesto (para tu aprobación)

- **Estrategia de frontera**: por capacidad/feature alineada a la partición Zona A/Zona B y a las fronteras de componente.
- **Modelo de despliegue**: único bundle MV3 unpacked (no hay deploy independiente por unidad); el `MappingBrain` server-side es la excepción (vive fuera del bundle).
- **Primer Unit = walking skeleton**: slice mínimo end-to-end con un servicio simple, ejecutable antes que el resto, agnóstico del cerebro.

## Q1 — Granularidad de las unidades

¿Qué nivel de granularidad prefieres para las unidades de trabajo?

A. **Fina (≈6-7 unidades)**: skeleton, entrada (parsers+normalizer), mapeo determinístico, cerebro FM server-side (residuo+WAF), RPA/DOM, UI del popup (estados+WAF), empaquetado/manifest. Más unidades, cada una pequeña y entregable por separado.
B. **Media (≈4 unidades)**: skeleton, núcleo de mapeo+RPA, cerebro FM+WAF, UI+empaquetado. Menos piezas, unidades algo más grandes.
X. Other (please specify)

[Answer]: A

## Q2 — El cerebro FM server-side como unidad

El `MappingBrain` server-side (residuo de mapeo + WAF) vive fuera del bundle MV3 y su alojamiento concreto (recrear n8n vs. agente Bedrock) se decide en Contract/Infra Design. ¿Cómo lo tratamos como unidad?

A. **Unidad propia tipo `spec`**: en Units Generation la modelamos como un contrato/interfaz (qué recibe, qué devuelve) que la extensión consume; el servicio real se especifica en Contract Design. Mantiene el skeleton agnóstico.
B. **Unidad propia tipo `service`**: la tratamos como un servicio a construir desde ya (recrear n8n o Bedrock), con su propia complejidad.
X. Other (please specify)

[Answer]: B — el `MappingBrain` es una unidad `service` a construir en esta revivida (no solo un contrato diferido). La elección concreta de alojamiento (recrear n8n desde el backup vs. agente Bedrock) se afina en Contract/Infrastructure Design, pero el servicio es trabajo real del alcance. Complejidad propia; vive fuera del bundle MV3; custodia la credencial del FM server-side. El walking skeleton sigue siendo agnóstico del cerebro (corre con el mapeo determinístico local), así que esta unidad no bloquea el primer Unit.

## Q3 — Empaquetado/manifest como unidad separada

La higiene del manifest (P4: quitar host muerto, declarar hosts usados) y el empaquetado `.zip` futuro, ¿unidad propia o parte de otra?

A. **Unidad propia tipo `packaging`**: agrupa manifest.json (permisos/host_permissions, mínimo privilegio) + estructura del bundle + el futuro script de `.zip`. Aísla P4.
B. **Parte del skeleton/UI**: el manifest se toca dentro de las unidades que lo necesitan, sin unidad de empaquetado separada.
X. Other (please specify)

[Answer]: A — unidad `packaging` propia que aísla P4: manifest.json (mínimo privilegio, quitar el host muerto CloudFront, declarar solo hosts usados), estructura del bundle, y el futuro script de empaquetado `.zip` sin build step. Nota: como el manifest debe declarar el host del cerebro server-side en host_permissions, esta unidad depende de la unidad del MappingBrain (cuyo host se fija en Contract/Infra Design).

## Consolidated Summary Confirmation

- Q1 (granularidad): fina, ≈7 unidades.
- Q2 (cerebro): unidad `service` a construir en esta revivida (alojamiento n8n vs Bedrock se afina en Contract/Infra Design); el skeleton sigue agnóstico (corre con mapeo determinístico local).
- Q3 (empaquetado): unidad `packaging` propia (manifest mínimo privilegio + P4 + futuro .zip); depende de la unidad del cerebro por el host en host_permissions.
- Unidades previstas: u1-walking-skeleton (service, slice end-to-end un servicio simple, primer Unit), u2-input-parsers (library: NaturalLanguageParser+JsonParser+InputNormalizer), u3-deterministic-mapper (library, Zona A), u4-mapping-brain (service, FM server-side: residuo+WAF), u5-rpa-dom (library, Zona B: RpaOrchestrator+DomResolver+FIX+ResultAggregator+spotlight), u6-popup-ui (ui: estados+pestañas+panel WAF), u7-packaging (packaging: manifest+bundle+zip).
- DAG (topología, no orden de build): u1 sin dependencias (skeleton agnóstico); u2,u3,u5 independientes entre sí; u4 independiente (service externo); u6 depende de u2 (entrada) y consume resultados de u5; u7 depende de u4 (host en manifest). Acíclico. El orden económico de Bolts lo decide Delivery Planning.

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
