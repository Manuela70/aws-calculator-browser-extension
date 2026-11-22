# Componentes lógicos — u6-popup-ui

> Módulos del panel lateral, la zona de cada uno y los NFR que alojan. U6 no
> tiene infraestructura propia: es una página de la extensión unpacked. Prosa
> en español; identificadores en inglés.

## Sources

- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u6-popup-ui/functional-design/functional-spec.md` (§1 alcance, §6 textos). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u6-popup-ui/nfr-requirements/tech-stack-decisions.md` (NFR6.1, NFR6.2). [stage]

## 1. Componentes

| Módulo | Zona | Responsabilidad | NFR que aloja |
|---|---|---|---|
| `lib/panel/panel-state.js` | A | Reductor puro con la máquina de estados, filtro por `runId`, regla DONE con URL válida | NFR3.2, NFR8.4, NFR5.5 |
| `lib/panel/url-check.js` | A | `isValidEstimateUrl` | NFR5.2 |
| `lib/messages-es.js` | A | `messageFor` con respaldo genérico y recorte de parámetros | NFR3.1, NFR5.3 |
| `lib/panel/history-model.js` | A | Orden, recorte a 200 y armado de filas del historial | NFR8.7 |
| `lib/panel/timers.js` | A | Topes de espera con reloj inyectable | NFR8.4 |
| `lib/panel/render/*.js` | B | Funciones de render con `textContent`; agrupación por `requestAnimationFrame` | NFR5.1, NFR8.6 |
| `lib/panel/tab-store.js` | B | Persistencia del texto en `storage.session` | NFR5.4 |
| `lib/panel/history-view.js` | B | Lectura única del historial al desplegar (vía `lib/history-store.js` de U1, su dueño), borrado de una o todas, exportación | NFR8.7 |
| `lib/panel/effects.js` | B | Dueño de los efectos: arranca y cancela temporizadores, crea los `callId`, envía `BRAIN_CANCEL` al cancelar o vencer, repite la llamada tras `LOGIN_OK`, consulta `BRAIN_SESSION` | NFR5.5, NFR8.4 |
| `lib/panel/brain-port.js` | B | `BRAIN_CALL`, `BRAIN_CANCEL`, `BRAIN_LOGIN`, `BRAIN_SESSION` hacia el service worker | NFR5.5, NFR8.4 |
| `sidepanel.html`, `sidepanel.js` | B | Esqueleto estático y arranque en paralelo | NFR8.5 |

## 2. Fronteras

- Zona A no usa `document` ni `chrome` (regla ESLint `no-restricted-globals` en esos módulos); se prueba sin navegador.
- Hacia afuera, el panel habla solo con el service worker (U7) y con el content script por los mensajes de u1. No hace `fetch` (ESLint lo prohíbe en `lib/panel/**` y `sidepanel.js`).

## 3. Verificación

| Requisito | Cómo |
|---|---|
| NFR6.1 | `npx vitest run --coverage` con `coverage.include` sobre los módulos de Zona A de §1 y `coverage.thresholds` de 80 % en líneas y ramas. Casos mínimos: cada estado de espera con su salida, `runId` ajeno, DONE sin URL válida, `unauthorized` / `LOGIN_OK` / `LOGIN_CANCELLED`, todos los códigos con texto, código desconocido, historial de 500 corridas. |
| NFR6.2 | `SMOKE.md` incluye la revisión de accesibilidad: navegación solo con teclado por pestañas y botones, anuncio de estados con lector de pantalla (`aria-live`, `aria-busy`, aviso con `aria-describedby`) y contraste de los colores de estado (WCAG 2.1 AA, 4,5:1 para texto). |
