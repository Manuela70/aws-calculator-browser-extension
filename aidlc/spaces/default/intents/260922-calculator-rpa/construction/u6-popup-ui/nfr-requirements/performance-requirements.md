# Requisitos de rendimiento — u6-popup-ui

> Respuesta del panel lateral medida en el navegador del SE. Prosa en español;
> identificadores en inglés.

## Sources

- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/requirements-analysis/requirements.md` (NFR8). [requirements]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u6-popup-ui/functional-design/functional-spec.md` (estados, progreso, historial). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u6-popup-ui/functional-design/rules.md` (BR1.1, BR3.1, BR5.3). [stage]

## Requisitos

| ID | Requisito | Criterio de verificación |
|---|---|---|
| NFR8.5 | Al abrir el panel, la entrada está lista para escribir en ≤ 500 ms, incluida la lectura de la corrida activa (BR1.1); el historial se carga solo al desplegar su sección. | Medición con `performance.now()` en el smoke, sobre un perfil con 100 corridas en el historial. |
| NFR8.6 | Cada `ProgressEvent` se refleja en pantalla en ≤ 200 ms desde que llega al panel. | Medición en el smoke de la corrida multi-servicio. |
| NFR8.7 | Desplegar el historial con hasta 200 corridas tarda ≤ 1 s; si hay más, se muestran las 200 más recientes con la opción de exportar el resto. | Prueba con un historial sintético de 500 corridas. |
