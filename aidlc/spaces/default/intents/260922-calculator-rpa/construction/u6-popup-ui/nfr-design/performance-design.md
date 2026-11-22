# Diseño de rendimiento — u6-popup-ui

> Cómo el panel cumple sus tiempos (`nfr-requirements/performance-requirements.md`).
> Prosa en español; identificadores en inglés.

## Sources

- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u6-popup-ui/nfr-requirements/performance-requirements.md` (NFR8.5-NFR8.7). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u6-popup-ui/functional-design/functional-spec.md` (§2 apertura, P3 historial). [stage]

## Decisiones

| Requisito | Diseño |
|---|---|
| NFR8.5 | **Apertura en ≤ 500 ms, incluida la corrida activa.** `sidepanel.html` trae el esqueleto estático (pestañas, área de texto, botón), que el navegador pinta antes de que corra el script. `sidepanel.js` lanza en paralelo, con `Promise.all`, la lectura del texto de las pestañas (`storage.session`) y la consulta de la corrida activa de u1 (`RESUME_ACTIVE`), esta última con un tope de 300 ms. El historial **no** se lee al abrir: su sección está plegada y se carga al desplegarla. **Medición**: `performance.mark('panel-ready')` se marca solo después de que ambas lecturas terminaron (o venció el tope de 300 ms), el reductor aplicó el estado (Idle o Running) y el área de texto quedó editable o deshabilitada según ese estado. El smoke mide de la apertura a esa marca con un perfil de 100 corridas en el historial. **Si `RESUME_ACTIVE` no responde en 300 ms**: el panel arranca en Idle con la entrada lista y, si la respuesta llega después y hay una corrida con latido vigente, pasa a Running y deshabilita la entrada; si no llega nunca, se queda en Idle. |
| NFR8.6 | **Progreso en ≤ 200 ms.** Cada `ProgressEvent` entra al reductor al llegar. La vista agrupa los cambios en el siguiente `requestAnimationFrame` y actualiza solo la fila del servicio afectado (filas indexadas por posición del servicio), sin repintar la lista. El smoke mide la diferencia entre la llegada del evento y el pintado con `performance.now()`. |
| NFR8.7 | **Historial en ≤ 1 s con 200 corridas.** Al desplegar, `lib/panel/history-view.js` lee una sola vez el historial de U1 en `storage.local`, lo ordena por fecha descendente y arma las 200 más recientes en un `DocumentFragment` que inserta de una vez. Las filas son texto plano, sin imágenes ni consultas por fila. Si hay más de 200, muestra "Mostrando las 200 más recientes" y el botón "Exportar todo", que genera un JSON con `Blob` y `URL.createObjectURL` y lo descarga con un enlace `download`, sin permisos nuevos. Prueba de Zona A del recorte y el orden con un historial sintético de 500 corridas; el tiempo se mide en el smoke. |
