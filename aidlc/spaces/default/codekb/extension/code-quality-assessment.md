# Code Quality Assessment — AWS Calculator RPA Extension

Evaluación al commit `45f888e`, escaneo estático (sin ejecución). Conteos de línea en `code-structure.md`.

## Cobertura de tests

**Ninguna.** Sin directorios de test, sin frameworks (Jest/Mocha/Playwright/…), sin config de cobertura. La única verificación es manual: recargar la extensión unpacked y leer la consola de Chrome DevTools. Para una extensión RPA que depende de un DOM de terceros cambiante (P2), la ausencia total de tests (unitarios, de integración, e2e, de contrato) es la deuda de calidad más grave.

## Linting

**Ninguno.** No hay `.eslintrc`, Prettier ni configuración equivalente. Estilo mantenido a mano. Sin anotaciones de tipo (ni TypeScript ni JSDoc).

## CI/CD

**Ninguno.** No hay `.github/workflows` ni pipeline. Hasta P4 (sin control de versiones histórico) no había ni siquiera versionado; no hay empaquetado ni publicación automatizados.

## Calidad de documentación

- **Sin `README.md` de producto.**
- **`REVIVAL_PLAN.md`**: diagnóstico previo en español, de buena calidad (verificar cerebro n8n → cargar/reproducir → tests de aislamiento A/B/C → fixes). Propone mover el `fetch` a un service worker (fix de P1).
- **Comentarios inline**: abundantes y de buena calidad en `content.js` (en español), incluido el comentario de cabecera que documenta FIX-1..FIX-9.
- **Docs previos de RE** (`aidlc-docs/inception/reverse-engineering/`): insumo a verificar; contenían conteos de línea erróneos, una errata de URL (`manuelabellen` vs `manuelaballen`) y listaban el spotlight y el modo ReAct como capacidades existentes (no lo son). Corregidos en esta síntesis.

## Deuda técnica

- **Cerebro externo hardcodeado (P1)**: `N8N_MAPPER_URL` fijo en `content.js`; punto único de fallo + CORS (host faltante en `host_permissions`, sin service worker).
- **`content.js` monolítico**: ~1264 líneas en un archivo, funciones largas (`scanForm`, `fillByLabel`, `addService`) — hotspot de complejidad.
- **Números mágicos**: `DELAY.SHORT/MEDIUM/LONG/TYPING` (600/1200/2500/60 ms) y conteos de reintento (3 en `saveService`, 6 en `selectAwsDropdown`, 5 rondas en `expandAllSections`) dispersos.
- **Código muerto**: `DELAY.TYPING` definido y no usado; handler `DOM_FIELDS` en `popup.js` sin emisor.
- **Fragilidad de selectores (P2, no verificado)**: clases `awsui_*` por substring + textos de botón en inglés; ~14 meses sin mantenimiento. Ver `dependencies.md`.
- **Higiene de permisos (P4)**: host n8n faltante, host CloudFront muerto, `activeTab`/`clipboardWrite` probablemente inertes/redundantes. Ver `technology-stack.md`.
- **Desajustes de contrato de mensajes**: `PROGRESS_TEXT` (sin handler), `DOM_FIELDS` (handler muerto). Ver `api-documentation.md`.

## Fallos silenciosos (P3)

Solo el error global de `runRPA` llega al popup (como `ERROR`). Todo fallo parcial es invisible: el usuario puede recibir la URL de un estimado incompleto creyendo que salió bien.

| Lugar | Comportamiento | ¿Visible al usuario? |
|---|---|---|
| `callN8N` (catch en `prepareForm`/`mapFields`) | `log()` + devuelve `[]` | No |
| `executeActions` (catch por acción) | `log()` advertencia, continúa | No |
| `resolveElementByLabel` → `null` | `log()`, acción omitida | No |
| `selectAwsDropdown` opción no hallada | `log()`, `return false` | No |
| `saveService` sin confirmar | `log()`, devuelve `false` (sin propagar error) | No |
| `addService` (catch por servicio) | `log()`, vuelve a `/estimate`, sigue | No |
| `PROGRESS_TEXT` emitido por content | — | No (sin handler en popup) |
| `runRPA` error global | `.catch` → `ERROR` al popup | **Sí** (único camino visible) |

Gap de robustez de guardado (vs `requirements/AWS Calculator UI Flow.md`): `saveService()` confirma éxito solo por URL `/estimate` o presencia del botón `Add service`; **no** detecta el banner verde `Successfully added <Service> estimate.` ni los mensajes de validación obligatoria ("is required"). Puede dar por guardado un servicio que falló validación.

## Gaps requisito ↔ código (a trazar)

- **FR1 — selector de modo Create Calculator | ReAct**: ausente en el popup (solo acepta JSON).
- **FR5 — spotlight visual feedback**: NO implementado; es requisito futuro, no capacidad del v6 (0 coincidencias de spotlight/overlay/z-index/box-shadow/pointer-events en el código).
- **P3 — surfacear errores**: parcialmente incumplido; los fallos parciales siguen siendo silenciosos.

## Parches aplicados: FIX-1..FIX-9 (en `content.js`)

Los 9 están documentados en el comentario de cabecera y aplicados en el cuerpo. No son deuda sino parches de resiliencia; se listan por trazabilidad:

- **FIX-1** `cleanAriaLabel()` — quita placeholders embebidos en aria-label (CloudWatch, KMS, SageMaker, ELB, WAF).
- **FIX-2** `parseUnitButtonLabel()` — parsing semántico (no posicional) de botones Unit (ELB, WAF).
- **FIX-3** `resolveSection()` — fallback a heading precedente cuando no hay `role="group"` (CloudWatch).
- **FIX-4** `scanForm()` toggles — label por `aria-labelledby` cuando no hay `label[for]` (Bedrock, SageMaker).
- **FIX-5** `scanForm()` — detecta `instance_radio` por contexto de fila de tabla (EC2).
- **FIX-6** `scanForm()` — nombre legible de radiogroup desde su heading (EC2 pricing).
- **FIX-7** `addService()` — aplica toggles `__switch__` ANTES del primer `scanForm` (campos condicionales: Bedrock, SageMaker).
- **FIX-8** `resolveElementByLabel()` — resolución de botones Unit por `aria-labelledby` reconstruido (ELB, WAF).
- **FIX-9** `setToggle()` — búsqueda por `aria-labelledby` además de `label[for]` (Bedrock, SageMaker).
