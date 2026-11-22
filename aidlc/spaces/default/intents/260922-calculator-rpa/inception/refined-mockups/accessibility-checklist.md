# Checklist de accesibilidad — Popup de la extensión RPA (WCAG 2.1 AA)

> Nivel objetivo afirmado: WCAG 2.1 AA (Q4=A). Popup de ancho fijo (~400px); sin
> responsive. Copy en español; criterios WCAG y propiedades en inglés.

## Sources

- `.kiro/knowledge/aidlc-design-agent/ux-guide.md` (WCAG 2.1 AA, heurísticas). [knowledge]
- `mockups.md`, `interaction-spec.md`. [stage]
- Decisión Q4=A (WCAG 2.1 AA baseline). [decidido]

## Perceivable

- [ ] Contraste de texto ≥ 4.5:1 (texto normal) y ≥ 3:1 (texto grande 18px+ bold / 24px+) sobre el tema oscuro.
- [ ] El estado por servicio NO depende solo del color: cada estado lleva ícono + texto (✓ confirmado, ✗ fallido, ⟳ configurando, · en cola).
- [ ] Los mensajes de error llevan ícono ⚠/✗ además del color rojo.
- [ ] El contorno azul del spotlight tiene contraste suficiente sobre la página atenuada; no transmite información solo por color (va con tooltip del label).

## Operable

- [ ] Toda la funcionalidad es alcanzable por teclado: Tab por pestañas/área/botones; flechas ←/→ entre pestañas (`tablist`); Enter/Espacio activan botones; Escape cancela la corrida (equivale a [Cancelar]).
- [ ] Orden de foco lógico: pestañas → área de entrada → acción primaria → (tras corrida) resultado/acciones.
- [ ] Indicador de foco visible siempre (`--focus-ring`); nunca `outline:none` sin reemplazo.
- [ ] Objetivos táctiles/clic ≥ 44×44px para botones (acción primaria, Copiar, Reintentar, pestañas).
- [ ] El spotlight no causa parpadeo > 3 veces/seg y respeta `prefers-reduced-motion` (sin transición animada; resalte estático).

## Understandable

- [ ] El `<html>` del popup declara `lang="es"`.
- [ ] Las áreas de entrada tienen label visible (no solo placeholder): "Lenguaje natural" / "JSON".
- [ ] Identificación de error específica y en lenguaje de dominio ("No reconocí la región para el bucket S3"), nunca un código, selector ni `awsui_*`.
- [ ] Navegación consistente: las pestañas [Estimado]/[WAF] en la misma posición en todas las pantallas del popup.

## Robust

- [ ] HTML semántico: encabezados en orden, listas (`<ul>`) para la lista de servicios, `role="tablist"/"tab"/"tabpanel"` correctos.
- [ ] ARIA usado con mesura, prefiriendo elementos nativos (`<button>`, `<a>`, `<textarea>`).
- [ ] El estado en vivo de la corrida se anuncia a lectores de pantalla (`aria-live="polite"` en la lista de progreso) para que el avance por servicio sea perceptible sin ver la pantalla.
- [ ] El panel WAF usa encabezados por servicio para que sea navegable por estructura.

## Notas específicas del contexto

- **Ancho fijo**: el popup no es responsive; no aplican breakpoints. El contenido largo (muchos servicios, muchas recomendaciones WAF) se maneja con scroll vertical dentro del popup, manteniendo la escaneabilidad (encabezados/agrupación).
- **Overlay en página de terceros**: el spotlight vive en el DOM de calculator.aws; su accesibilidad se limita a no interferir (pointer-events:none) y no romper la navegación de la página; no captura foco.
