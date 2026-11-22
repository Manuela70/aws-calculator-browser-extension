# Mapeo de sistema de diseño — Popup de la extensión RPA

> No hay una librería de componentes ni design system formal: el popup es HTML+CSS
> inline en `popup.html` (tema oscuro, branding Applying). Este documento fija los
> tokens y patrones a preservar/consolidar, sin introducir dependencias ni build
> step (restricción C1). Copy en español; tokens/propiedades CSS en inglés.

## Sources

- `aws-calculator-extension/popup.html` (estilos inline existentes: tema oscuro, branding Applying). [brownfield]
- `mockups.md`, `interaction-spec.md`. [stage]
- Regla afirmada: sin build step; UI en español, código en inglés. [team-practices]

## Enfoque

El sistema de diseño es el **CSS inline existente del popup**, consolidado y documentado como tokens. No se introduce Tailwind, CSS framework, ni componentes de terceros (cero dependencias de runtime, C7). Los estilos siguen viviendo en `popup.html`/`popup.css` cargados directamente.

## Tokens de diseño (a consolidar desde el CSS actual)

> Valores indicativos a confirmar contra el `popup.html` real en Construction;
> el punto es tener nombres estables, no inventar una paleta nueva.

| Token | Uso | Nota |
|---|---|---|
| `--bg` | fondo del popup | tema oscuro existente |
| `--surface` | tarjetas / áreas de texto | un paso más claro que `--bg` |
| `--text` | texto principal | contraste ≥4.5:1 sobre `--bg` (WCAG AA) |
| `--text-muted` | texto secundario | contraste ≥4.5:1 (o ≥3:1 si es texto grande) |
| `--accent` | acción primaria, branding Applying | color de marca |
| `--ok` | estado confirmado (✓) | verde; acompañado de ícono, no color solo |
| `--error` | estado fallido (✗), errores | rojo; acompañado de ícono ⚠/✗, no color solo |
| `--focus-ring` | indicador de foco de teclado | visible, nunca `outline:none` sin reemplazo |
| `--spotlight` | contorno azul del overlay | azul de alto contraste sobre el atenuado |

## Componentes y su realización CSS (sin framework)

| Componente (interaction-spec) | Realización |
|---|---|
| C1 pestañas NL/JSON | `role="tablist"` + botones `role="tab"`; CSS de estado activo |
| C2 acción primaria | `<button>` con estados `:disabled` y variante "en progreso" |
| C3 lista de servicios | `<ul>` con ícono + texto por fila; estado por clase (`.ok`/`.err`/`.pending`/`.running`) |
| C4 resultado global | bloque con variante éxito/fallo; URL en `<a>` + botón Copiar |
| C5 panel WAF | lista agrupada (`<section>` por servicio, `<span>` etiqueta de pilar) |
| C6 overlay spotlight | nodos creados por el content script con estilos inline de alto z-index y `pointer-events:none` |

## Consistencia con el estado actual

- Se **preserva** el tema oscuro y el branding Applying existentes (no rediseño visual).
- Se **consolida** el copy de estados de error/progreso que hoy está disperso en `popup.js` (p. ej. `❌ JSON inválido.`) en un conjunto coherente de mensajes en español.
- Se **añade** solo lo que las historias nuevas requieren: pestañas de entrada, lista por servicio, panel WAF, y el overlay spotlight.
