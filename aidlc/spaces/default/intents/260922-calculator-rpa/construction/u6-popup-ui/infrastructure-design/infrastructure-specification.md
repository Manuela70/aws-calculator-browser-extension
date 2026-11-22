# Especificación de infraestructura — u6-popup-ui

> El panel lateral es una página de la extensión: no tiene recursos en la nube.
> Su "infraestructura" es el panel dentro del bundle unpacked y lo que comparte
> con u1, u4 y u7. Prosa en español; identificadores en inglés.

## Sources

- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u6-popup-ui/nfr-design/security-design.md`, `performance-design.md`, `logical-components.md`. [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u7-packaging/infrastructure-design/infrastructure-specification.md`. [stage]

## 1. Despliegue

| Faceta | Elección | Motivo |
|---|---|---|
| Cómputo | Ninguno propio: `sidepanel.html` y `sidepanel.js` corren en el Chrome del SE | Extensión MV3 unpacked. |
| Red | Ninguna: el panel no hace `fetch`; habla con el service worker (U7) por mensajes | NFR5.5. |
| Almacenamiento | `chrome.storage.session` con prefijo `panel:` para el texto de las pestañas; el historial de u1 vía `lib/history-store.js` | NFR5.4, NFR8.7. |
| Entornos | Uno, el del bundle | Práctica del equipo. |

## 2. Servicios

| Servicio | Rol | Configuración | Notas |
|---|---|---|---|
| Service worker (U7) | Cerebro y sesión | `BRAIN_CALL`, `BRAIN_CANCEL`, `BRAIN_LOGIN`, `BRAIN_SESSION` | Contrato, sección "Cambios de NFR Requirements". |
| CSP de páginas de la extensión (U7) | Defensa contra scripts inyectados | `script-src 'self'; object-src 'self'` | NFR5.1. Dependencia de entrega con u7: hoy el manifest no la declara; u7 la agrega y el smoke de U6 verifica que el panel carga bajo ella. |

## 3. Infraestructura compartida

| Recurso compartido | Unidad dueña | Unidades consumidoras | Frontera de acceso |
|---|---|---|---|
| `chrome.storage.session` | u7 (token) | u6 (prefijo `panel:`) | `TRUSTED_CONTEXTS`; u6 nunca lee la clave del token |
| Historial en `chrome.storage.local` | u1 (`lib/history-store.js`) | u6 | Solo por las funciones de u1 |
