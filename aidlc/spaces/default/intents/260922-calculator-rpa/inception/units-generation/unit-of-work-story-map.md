# Mapa historia → unidad — Revivida de la extensión RPA

> Una fila por historia (`USx.y`), con la(s) unidad(es) que la implementan.
> Varias unidades en una celda se separan con `;`. Toda unidad nombrada en una
> fila traza los acceptance criteria de esa historia en su Functional Design.

## Mapa

| Historia | Unit ID | Directory |
|---|---|---|
| US1.0 | U1 | u1-walking-skeleton |
| US1.1 | U1 | u1-walking-skeleton |
| US2.1 | U2 | u2-input-parsers |
| US2.2 | U2 | u2-input-parsers |
| US3.1 | U2 | u2-input-parsers |
| US4.1 | U3; U5 | u3-deterministic-mapper; u5-rpa-dom |
| US4.2 | U5 | u5-rpa-dom |
| US4.3 | U5 | u5-rpa-dom |
| US4.4 | U5 | u5-rpa-dom |
| US5.1 | U4; U6 | u4-mapping-brain; u6-popup-ui |
| US6.1 | U5; U6 | u5-rpa-dom; u6-popup-ui |
| US6.2 | U5; U6 | u5-rpa-dom; u6-popup-ui |
| US6.3 | U6 | u6-popup-ui |
| US7.1 | U5 | u5-rpa-dom |
| US8.1 | U5 | u5-rpa-dom |

## Filas transversales (cross-cutting)

- **US4.1** abarca U3 (mapeo determinístico) y U5 (ejecución RPA): el mapeo produce acciones, el RPA las aplica.
- **US5.1** (WAF) abarca U4 (servicio FM que razona) y U6 (presentación del panel WAF).
- **US6.1 / US6.2** (errores y progreso) abarcan U5 (resultado tipado por servicio) y U6 (render en el popup).
- El walking skeleton (U1) ejercita en miniatura lógica que U2/U3/U5 generalizan; sus filas canónicas (US1.0, US1.1) se le asignan a U1, y la generalización vive en las unidades correspondientes.

## Orden de implementación dentro de cada unidad

- **U1**: inyección/handshake → flujo de un servicio → agregación todo-o-nada mínima.
- **U2**: JsonParser (determinístico) → InputNormalizer → NaturalLanguageParser.
- **U3**: match de label → valores directos → marca de residuo.
- **U4**: contrato de mapeo del residuo → endpoint WAF (tras fijar alojamiento en Contract/Infra).
- **U5**: scanForm → resolveElementByLabel (cascada) → executeActions → FIX-1..9 → saveService (banner verde) → ResultAggregator → spotlight.
- **U6**: estados base del popup → pestañas de entrada → progreso/resumen por servicio → panel WAF.
- **U7**: manifest mínimo privilegio → estructura del bundle → script `.zip`.

## Verificación de cobertura

Las 15 historias (US1.0-US8.1) están asignadas a al menos una unidad. Las NFR se trazan vía las historias que las anclan (NFR3→US6.1/US2.2; NFR6→U3/U5; NFR7→U4; NFR8→US6.2) y las diferidas (NFR1/4/5) se retoman en nfr-requirements.

**Cobertura por unidad:** U1-U6 aparecen en al menos una fila de historia. **U7 (u7-packaging) NO tiene fila de historia**: implementa la higiene del manifest / mínimo privilegio, que traza a **NFR4 (P4)**, no a una `USx.y`. Por eso queda fuera del mapa historia→unidad (que se clava solo a historias). No es un hueco de trazabilidad de historias: las 15 `USx.y` están asignadas y `traceability.json` pasa sin `GAP`. La cobertura de U7 se verifica vía NFR4/P4, no vía historia.
