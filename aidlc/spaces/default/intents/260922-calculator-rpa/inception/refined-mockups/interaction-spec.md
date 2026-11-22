# Especificación de interacción — Popup de la extensión RPA

> Especificación de interacción por flujo y por estado. Copy de UI en español,
> identificadores/eventos en inglés. Complementa `mockups.md`.

## Sources

- `mockups.md` (M1-M9). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/user-stories/stories.md`. [stories]
- `requirements/AWS Calculator UI Flow.md` (banner de éxito, validaciones, pasos de dominio). [doc]

## Flujo 1 — Generar estimado desde lenguaje natural o JSON

```
Flujo: Generar estimado
Persona: SE / arquitecto de preventa (P1)
Trigger: el usuario abre el popup en una pestaña y acciona "⚡ Generar Estimado"
Pasos:
  1. M1/M2 (entrada) -> el usuario elige pestaña (NL o JSON) y escribe/pega -> el popup conserva el texto por pestaña
  2. M1/M2 -> clic "Generar Estimado" -> el popup valida/normaliza la entrada (Zona A)
     2a. entrada inválida -> M3 (error en dominio, entrada conservada) -> vuelve al paso 1
  3. handshake con calculator.aws (US1.0) -> inyecta content script si hace falta
     3a. no alcanzable -> M8 (error de conexión) -> [Reintentar]
  4. M4 (en progreso) -> por cada servicio: Add service -> Search all services -> Configure -> analyzeDOM -> mapear -> guardar -> confirmar por banner verde
  5. agregación pedido-vs-confirmado (Zona A)
Success outcome: M5 — todos confirmados: renombra, Share, Agree and Continue, Copy Link, muestra URL + lista por servicio
Error paths:
  - ≥1 servicio no confirmado -> M6 (sin URL, lista con el/los fallido(s) y motivo) -> [Reintentar] / [Volver a la entrada]
  - cancelación -> el usuario pulsa [Cancelar] en M4 -> corrida detenida, vuelve a M1 sin estado parcial
```

## Flujo 2 — Evaluación Well-Architected

```
Flujo: Evaluar Well-Architected
Persona: P1
Trigger: desde M5, clic "Evaluar Well-Architected →" (o la pestaña WAF, ya habilitada)
Pasos:
  1. M7 -> el popup solicita la evaluación al "cerebro" sobre el estimado construido
  2. respuesta -> agrupa por servicio, cada recomendación con su pilar como etiqueta
Success outcome: M7 — recomendaciones agrupadas y escaneables; servicios sin hallazgos se muestran explícitamente
Error paths:
  - proveedor no disponible -> M7-err (error visible) -> [Reintentar evaluación]
```

## Patrones de interacción por estado

| Estado | Patrón | Detalle |
|---|---|---|
| Entrada (reposo) | formulario con pestañas | pestañas NL/JSON preservan su contenido al alternar; acción primaria única |
| Validación de entrada | validación on-submit | se valida al accionar "Generar Estimado" (no en cada tecla); error inline en dominio |
| En progreso | progreso determinado + lista en vivo | barra "N de M" + estado por servicio; avisos `PROGRESS_TEXT` visibles; botón Cancelar |
| Éxito | confirmación inline | veredicto arriba, URL copiable, lista por servicio; no redirige automáticamente |
| Error de entrada | error inline cerca de la causa | ícono + texto en dominio; entrada conservada editable |
| Fallo parcial | resultado por servicio | sin URL (todo-o-nada); motivo por servicio; vías de recuperación |
| WAF | divulgación progresiva | agrupación por servicio con pilar etiquetado; estado "sin hallazgos" explícito |
| Spotlight | overlay no intrusivo | sobre la página; `pointer-events:none`; scroll-into-view; cleanup garantizado |

## Especificación de componentes (formato component-spec)

### C1 — Selector de modo de entrada (pestañas NL/JSON)
- **Rol**: alternar entre dos áreas de entrada sin perder el contenido de cada una.
- **Estados**: NL activa / JSON activa.
- **Interacción**: clic o teclado (flechas ←/→ entre pestañas, rol `tablist`/`tab`/`tabpanel`).
- **Comportamiento**: el contenido de cada pestaña persiste mientras el popup está abierto.

### C2 — Acción primaria "Generar Estimado"
- **Rol**: iniciar la corrida.
- **Estados**: habilitado (hay texto en la pestaña activa) / deshabilitado (vacío) / en progreso (muestra spinner, deshabilitado).
- **Interacción**: clic o Enter con foco; durante la corrida se transforma en estado de progreso.

### C3 — Lista de servicios (progreso y resumen)
- **Rol**: mostrar el estado por servicio en vivo y en el resumen final.
- **Estados por fila**: en cola (·) / configurando (⟳) / confirmado (✓) / fallido (✗ + motivo).
- **Interacción**: solo lectura; el estado se actualiza por mensajes del content script.

### C4 — Bloque de resultado global
- **Rol**: veredicto todo-o-nada + URL (éxito) o ausencia de URL + recuperación (fallo).
- **Estados**: éxito (URL + Copiar) / fallo parcial (sin URL + Reintentar/Volver).

### C5 — Panel Well-Architected
- **Rol**: presentar recomendaciones agrupadas por servicio con pilar etiquetado.
- **Estados**: cargando / con recomendaciones / sin hallazgos (por servicio) / error de proveedor.

### C6 — Overlay spotlight (en la página, no en el popup)
- **Rol**: resaltar el campo que el RPA está por llenar.
- **Estados**: activo (contorno + atenuado + tooltip) / limpio.
- **Restricciones**: `pointer-events:none`, z-index muy alto, follow-scroll, scroll-into-view previo, exclusión de analyzeDOM, cleanup en éxito y error, respeta `prefers-reduced-motion`.
