# Mockups — Popup de la extensión RPA AWS Pricing Calculator

> Wireframes de media fidelidad del popup (ancho fijo ~400px, tema oscuro,
> branding Applying, copy en español). Base: `popup.html` existente + historias
> + flujo de dominio. El overlay spotlight va sobre la página calculator.aws, no
> en el popup. Diagramas ASCII (ver `common/ascii-diagram-standards.md`); copy de
> UI en español, tokens técnicos en inglés.

## Sources

- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/user-stories/stories.md` (US1.0-US8.1). [stories]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/requirements-analysis/requirements.md` (FR1, FR7, FR8, FR9, FR11). [requirements]
- `requirements/AWS Calculator UI Flow.md` (banner de éxito, validaciones). [doc]
- `aws-calculator-extension/popup.html` (estado actual: tema oscuro, español). [brownfield]
- Decisiones de diseño Q1-Q4. [decidido]

## Pantallas del popup

El popup tiene dos pantallas navegables: **(1) Estimado** (entrada → progreso → resumen) y **(2) Well-Architected**. Se navega a la pantalla 2 tras completar un estimado.

---

### M1 — Pantalla Estimado · estado inicial (reposo) — US6.3, FR1

```
+--------------------------------------------------+
|  Applying · Estimado AWS            [Estimado][WAF]|
+--------------------------------------------------+
|  ( ● Lenguaje natural )  ( ○ JSON )              |   <- pestañas/toggles (Q1)
|                                                  |
|  +--------------------------------------------+  |
|  | Describe los servicios que necesitas…      |  |   <- textarea NL
|  |                                            |  |
|  |                                            |  |
|  +--------------------------------------------+  |
|                                                  |
|  Región por defecto: US East (N. Virginia)       |   <- recognition, no recall
|                                                  |
|  [       ⚡ Generar Estimado        ]            |   <- acción primaria única
+--------------------------------------------------+
```

Notas: una sola acción primaria clara; sin mensajes residuales de corridas previas (AC6.3.1). La pestaña "WAF" está visible pero deshabilitada hasta que exista un estimado.

---

### M2 — Pantalla Estimado · pestaña JSON — US3.1, FR1.2

```
+--------------------------------------------------+
|  Applying · Estimado AWS            [Estimado][WAF]|
+--------------------------------------------------+
|  ( ○ Lenguaje natural )  ( ● JSON )              |
|                                                  |
|  +--------------------------------------------+  |
|  | { "project": "...", "region": "...",       |  |   <- textarea JSON (monoespaciada)
|  |   "services": [ { "name": "...", ... } ] } |  |
|  +--------------------------------------------+  |
|                                                  |
|  [ 📋 Pegar ejemplo ]                            |   <- ayuda contextual (EXAMPLE_JSON)
|                                                  |
|  [       ⚡ Generar Estimado        ]            |
+--------------------------------------------------+
```

---

### M3 — Estado de error de entrada (NL no interpretable / JSON inválido) — US2.2, US3.1, FR7

```
+--------------------------------------------------+
|  Applying · Estimado AWS            [Estimado][WAF]|
+--------------------------------------------------+
|  ( ● Lenguaje natural )  ( ○ JSON )              |
|                                                  |
|  +--------------------------------------------+  |
|  | Un bocket S3 en no-sé-qué región           |  |   <- la entrada PERMANECE editable (AC2.2.3)
|  +--------------------------------------------+  |
|                                                  |
|  ⚠ No reconocí la región para el bucket S3.      |   <- error en lenguaje de dominio (icono+texto, no solo color)
|     Corrige el texto y vuelve a generar.         |
|                                                  |
|  [       ⚡ Generar Estimado        ]            |
+--------------------------------------------------+
```

Notas: ícono ⚠ + texto (no color solo, WCAG). El mensaje nombra el servicio/campo, nunca un código, selector ni `awsui_*`. El texto del usuario no se borra.

---

### M4 — Estado en progreso (corrida activa) — US6.2, FR7, NFR8

```
+--------------------------------------------------+
|  Applying · Estimado AWS            [Estimado][WAF]|
+--------------------------------------------------+
|  Generando estimado…                             |
|  [■■■■■■■■□□□□□□]  2 de 3 servicios               |   <- progreso activo por servicio
|                                                  |
|  ✓ Amazon S3            confirmado                |
|  ⟳ Amazon EC2          configurando…             |   <- 🤖 avisos PROGRESS_TEXT visibles (AC6.1.2)
|  · AWS Lambda           en cola                  |
|                                                  |
|  [ Cancelar ]                                    |   <- control y libertad (Nielsen #3)
+--------------------------------------------------+
```

Notas: el usuario distingue "trabajando" de "detenido". Cada servicio muestra su estado en vivo.

---

### M5 — Resumen final · éxito total (todo-o-nada) — US7.1, FR9, FR10

```
+--------------------------------------------------+
|  Applying · Estimado AWS            [Estimado][WAF]|
+--------------------------------------------------+
|  ✓ Estimado completo                             |   <- veredicto global arriba
|                                                  |
|  🔗 https://calculator.aws/#/estimate/abc123     |
|  [ 📋 Copiar URL ]                               |
|                                                  |
|  Servicios (3/3 confirmados):                    |   <- lista vertical (Q3=A)
|  ✓ Amazon S3            confirmado                |
|  ✓ Amazon EC2          confirmado                |
|  ✓ AWS Lambda           confirmado               |
|                                                  |
|  [ Evaluar Well-Architected → ]                  |   <- habilita pestaña WAF
+--------------------------------------------------+
```

---

### M6 — Resumen final · fallo parcial (sin URL, todo-o-nada) — US7.1 AC7.1.2, FR9.3

```
+--------------------------------------------------+
|  Applying · Estimado AWS            [Estimado][WAF]|
+--------------------------------------------------+
|  ✗ Estimado incompleto — no se generó la URL     |   <- veredicto global (todo-o-nada)
|                                                  |
|  Servicios (2/3 confirmados):                    |
|  ✓ Amazon S3            confirmado                |
|  ✓ Amazon EC2          confirmado                |
|  ✗ AWS Lambda           no confirmado:           |   <- fallo + motivo en lenguaje de dominio
|     el campo "Number of requests" is required    |
|                                                  |
|  [ Reintentar ]   [ Volver a la entrada ]        |   <- recuperación
+--------------------------------------------------+
```

Notas: NO hay URL (criterio todo-o-nada). El motivo se expresa en dominio (incluye el `is required` detectado). Vías de recuperación visibles.

---

### M7 — Pantalla Well-Architected — US5.1, FR8

```
+--------------------------------------------------+
|  Applying · Well-Architected        [Estimado][WAF]|
+--------------------------------------------------+
|  Recomendaciones Well-Architected                |
|                                                  |
|  ▸ Amazon EC2                                    |   <- agrupado por servicio (AC5.1.3, escaneable)
|    [Cost Optimization] Considera Savings Plans…  |   <- pilar como etiqueta visible
|    [Reliability] Habilita Auto Scaling…          |
|                                                  |
|  ▸ Amazon S3                                     |
|    Sin hallazgos.                                |   <- estado "sin hallazgos" explícito (AC5.1.4)
|                                                  |
|  ▸ AWS Lambda                                    |
|    [Security] Restringe el rol de ejecución…     |
|                                                  |
|  [ ← Volver al estimado ]                        |
+--------------------------------------------------+
```

#### M7-err — WAF · proveedor no disponible (AC5.1.2)

```
+--------------------------------------------------+
|  ⚠ No se pudo obtener la evaluación Well-         |
|    Architected en este momento. Intenta de nuevo.|
|  [ Reintentar evaluación ]                       |
+--------------------------------------------------+
```

---

### M8 — Error de conexión con calculator.aws (handshake) — US1.0 AC1.0.4

```
+--------------------------------------------------+
|  ⚠ No pude conectar con calculator.aws.          |
|    Abre o recarga la pestaña de la calculadora   |
|    y vuelve a intentar.                          |
|  [ Reintentar ]                                  |
+--------------------------------------------------+
```

---

### M9 — Overlay spotlight (sobre la página calculator.aws, NO en el popup) — US8.1, FR11

```
  Página calculator.aws (atenuada)  ░░░░░░░░░░░░░░░░
  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
  ░░░░┌───────────────────────────┐░░░ tooltip: ░░░
  ░░░░│ Number of instances       │░░░ "Number of ░
  ░░░░│ [ 3 ]                      │░░░  instances" ░
  ░░░░└───────────────────────────┘░░░░░░░░░░░░░░░░░
  ░░░░  ^ contorno azul, resto atenuado  ░░░░░░░░░░░
```

Notas: `pointer-events:none`, z-index muy alto, sigue el scroll, scroll-into-view antes de dibujar (AC8.1.4), sus nodos se excluyen de analyzeDOM (AC8.1.5), respeta `prefers-reduced-motion` (AC8.1.6), y se limpia siempre incluido en error (AC8.1.3). No bloquea los clicks del RPA (C5).

## Mapeo pantalla → historia

| Mockup | Historia(s) |
|---|---|
| M1 estado inicial | US6.3, FR1 |
| M2 pestaña JSON | US3.1 |
| M3 error de entrada | US2.2, US3.1 |
| M4 en progreso | US6.2, US6.1 |
| M5 éxito total | US7.1, FR10 |
| M6 fallo parcial | US7.1 (AC7.1.2) |
| M7 Well-Architected | US5.1 |
| M8 error de handshake | US1.0 |
| M9 spotlight overlay | US8.1 |
