# Preguntas de Diseño Funcional — u6-popup-ui

> U6 es la interfaz del panel lateral (la UI dejó de ser popup en u1). Los
> mockups refinados (M1-M9, `inception/refined-mockups/`) ya fijan pestañas
> JSON / lenguaje natural, progreso por servicio, resultado todo-o-nada y el
> panel Well-Architected agrupado por servicio con el pilar visible. Lo que
> agregan u2-u5 son estados nuevos: interpretando, revisión Well-Architected
> previa con confirmación, región por defecto, aviso de "sin revisión" mientras
> no exista el cerebro, servicios no intentados, sustituciones del cerebro y la
> lista de corridas del registro técnico (u1).

## Q1 — Revisión Well-Architected previa sin hallazgos

A. **Seguir directo (Recomendado).** Si la revisión previa no encuentra nada en ningún servicio, el panel lo dice en una línea y la corrida arranca sola; la pantalla de confirmación solo aparece cuando hay hallazgos.
B. **Confirmar siempre.** El SE confirma "Llenar" aunque no haya hallazgos.
X. Other (please specify)

[Answer]: A

## Q2 — Dónde vive la lista de corridas (registro técnico)

A. **Sección plegable al pie del panel (Recomendado).** Como en u1: cerrada por defecto, con exportar y borrar; no compite con la entrada.
B. **Pestaña propia "Historial".** Junto a las pestañas de entrada.
X. Other (please specify)

[Answer]: A
