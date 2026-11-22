# Requisitos de fiabilidad — u1-walking-skeleton

> Fiabilidad del skeleton entendida como: nunca reportar éxito ante un fallo,
> degradar de forma visible ante cambios de la UI de terceros y terminar
> siempre de forma observable. No hay SLA de disponibilidad: la extensión
> corre en el navegador del SE y depende de `calculator.aws`, que no
> controlamos. Prosa en español; identificadores en inglés.

## Sources

- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/requirements-analysis/requirements.md` (NFR1 hogar del cerebro, NFR2 resiliencia ante cambios de UI, NFR3 visibilidad de errores, NFR6 testabilidad, NFR7 estructura). [requirements]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u1-walking-skeleton/functional-design/rules.md` (BR3.3, BR4.3-BR4.10, BR5.1-BR5.6, BR6.6). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u1-walking-skeleton/functional-design/functional-spec.md` (máquinas de estado, módulos, smoke). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/contract-design/contract-summary.md` (resiliencia del borde con el cerebro; no aplica al skeleton). [stage]
- `nfr-requirements-questions.md` de esta unidad: Q4 (80 % desde el skeleton), Q6 (corte de 3 min). [Q4, Q6]
- `aidlc/spaces/default/memory/team.md` (Zona A / Zona B, `SMOKE.md`). [team-practices]

## Requisitos

### NFR1 — Hogar robusto del cerebro

| ID | Requisito | Criterio de verificación |
|---|---|---|
| NFR1.1 | El skeleton no depende de ningún cerebro ni endpoint de red: el mapeo es determinístico y local. Una corrida nunca falla por la caída de un servicio externo propio. | Ausencia de `fetch` en el código del skeleton; smoke sin red hacia otros hosts. |

### NFR2 — Resiliencia ante cambios de la UI de CloudScape

| ID | Requisito | Criterio de verificación |
|---|---|---|
| NFR2.1 | Todos los selectores, textos de botón en inglés y dependencias de clases `awsui_*` viven en un único lugar de `lib/dom/dom-resolver.js` (tabla de selectores con nombre), para que un cambio de la UI se ajuste en un solo punto. | Revisión: ningún selector literal fuera de esa tabla. |
| NFR2.2 | Un selector que no resuelve produce un resultado tipado visible (`service_not_found`, `field_not_recognized`, `field_not_applied`, `toggle_not_applied`, `page_timeout`), nunca un fallo silencioso ni un "primer resultado" por defecto. | Smoke con fallo provocado; revisión de que no hay `catch` vacíos (ESLint `no-empty`). |

### NFR3 — Visibilidad de errores (fiabilidad del veredicto)

| ID | Requisito | Criterio de verificación |
|---|---|---|
| NFR3.1 | La corrida devuelve URL si y solo si todos los servicios pedidos se confirmaron por banner verde, el estimado contiene exactamente lo pedido, el renombrado (si hay `project`) tuvo éxito y Share entregó un enlace `https://calculator.aws/` (BR5.1-BR5.6). | Tests de Zona A de `result-aggregator` (todos confirmados → DONE; uno faltante → ERROR con lista; cero servicios → ERROR); smoke de fallo provocado. |
| NFR3.2 | Toda excepción no prevista se convierte en resultado tipado (`unexpected_error`) y queda en el registro técnico; ningún `catch` vacío. | ESLint `no-empty`; revisión. |

### NFR6 — Testabilidad

| ID | Requisito | Criterio de verificación |
|---|---|---|
| NFR6.1 | Piso de cobertura de líneas del 80 % sobre los módulos puros del skeleton: `json-parser`, `input-normalizer`, `deterministic-mapper`, `retry`, `result-aggregator`, `handshake` (con la API de Chrome simulada), el cronómetro y token de cancelación por servicio (NFR8.6), la comprobación del latido (BR6.6), el formateador de entradas del registro y el índice `runLogIndex` (NFR3.5, NFR3.11), y los validadores de mensajes y de URL. El umbral se mide agregado sobre ese conjunto de archivos (no por archivo). Cada módulo tiene su caso feliz y al menos dos casos de error. | `vitest --coverage` con umbral de 80 % configurado sobre esos archivos; el informe se guarda junto a los resultados de Build and Test. |
| NFR6.2 | La Zona B se verifica por smoke manual versionado en `aws-calculator-extension/SMOKE.md`, sin piso de cobertura. Casos mínimos: canónico EC2 sobre estimado vacío (DONE, URL con solo EC2, nombre "Skeleton EC2", ≤ 3 min); fallo provocado por etiqueta inexistente (ERROR sin URL); estimado con servicios previos (ERROR `preconditions`); cierre y reapertura del panel a mitad de corrida. | Checklist de `SMOKE.md` completado y fechado. |

### NFR8 — Terminación observable (vista de fiabilidad)

| ID | Requisito | Criterio de verificación |
|---|---|---|
| NFR8.12 | Toda corrida termina en DONE o ERROR en un tiempo acotado: esperas de 20 s, guardado 3 × 10 s, corte duro de 3 min por servicio con cancelación (`service_timeout`, NFR8.6) y latido de 60 s en el panel. No existe un estado del que el panel no pueda salir, y una corrida cerrada no vuelve a escribir progreso ni `activeRun`. | Revisión de las máquinas de estado; tests de Zona A del cronómetro y del token; smoke cerrando la pestaña a mitad de corrida. |
| NFR8.13 | Si el `import()` de `lib/content-main.js` falla, la pestaña queda marcada como no lista y el mensaje al SE indica que hay que **recargar la pestaña de calculator.aws** para reintentar (la guardia de carga única impide reinyectar). | Smoke: forzar un error de carga → mensaje con la indicación de recargar. |

## Recuperación

- No hay datos de negocio que respaldar: el estimado vive en `calculator.aws`. Lo que la extensión guarda (registro, último resultado) es de diagnóstico.
- Una corrida fallida se repite desde cero sobre un estimado vacío (BR5.5); no hay reanudación parcial en el skeleton.
