# Requirements Verification Questions — AWS Calculator RPA Extension Revival

**Created**: 2026-07-23T23:14:46-05:00  
**Stage**: Requirements Analysis  
**Project**: AWS Calculator RPA Chrome Extension (v6 Revival)

---

## Instructions

Por favor, responde a cada pregunta colocando la letra de tu elección después de la etiqueta `[Answer]:`.

**Formato de respuesta**:
- Para opciones múltiples: Escribe la letra (A, B, C, D, X) después de `[Answer]:`
- Si eliges "X) Other": Describe tu respuesta personalizada después de la etiqueta
- Puedes editar este archivo directamente

**Ejemplo**:
```
[Answer]: A
```

o

```
[Answer]: X
Mi descripción personalizada aquí.
```

---

## Intent Analysis Summary

**User Request**: Revivir y reanudar la extensión Chrome RPA v6 para AWS Calculator (proyecto brownfield, ~14 meses inactivo)

**Request Type**: Enhancement + Bug Fix + Maintenance

**Scope Estimate**: Multiple Components (popup.js, content.js, background service worker, manifest)

**Complexity Estimate**: Complex (4 problemas conocidos P1-P4, dependencia externa crítica, selectores potencialmente obsoletos)

---

## 1. Revival Scope & Priority

### Question 1.1: Revival Goals
¿Cuál es el objetivo principal de esta reactivación?

A) Hacer funcionar la extensión v6 exactamente como estaba (sólo arreglar lo roto, sin cambios)

B) Hacer funcionar la extensión v6 Y resolver los 4 problemas conocidos (P1-P4) de REVIVAL_PLAN.md

C) Hacer funcionar la extensión v6 Y resolver los problemas críticos (P1, P2) pero posponer P3 y P4

D) Revisar completamente la arquitectura para eliminar la dependencia de n8n y migrar a llamada directa a Claude API

X) Other (por favor describe después de [Answer]: tag abajo)

[Answer]: X: "Llevar el RPA a Producción"

### Question 1.2: Testing Strategy Before Changes
Antes de hacer cualquier cambio en el código, ¿quieres ejecutar los tests de diagnóstico de REVIVAL_PLAN.md (Tests A, B, C) para verificar el estado actual?

**Context**: El REVIVAL_PLAN.md propone 3 tests para verificar:
- Test A: ¿La inyección del content script funciona?
- Test B: ¿Los selectores funcionan contra la UI actual de AWS?
- Test C: ¿El webhook de n8n está activo y sin problemas de CORS?

A) Sí — ejecutar los 3 tests primero para diagnosticar qué está roto antes de tocar código (recomendado)

B) No — asumir que todo está roto después de 14 meses y empezar directamente con las correcciones

C) Sólo Test C — verificar el webhook de n8n (el problema más crítico) antes de decidir la estrategia

X) Other (por favor describe después de [Answer]: tag abajo)

[Answer]: A

### Question 1.3: Problem Priority
Si tuvieras que priorizar los 4 problemas conocidos, ¿cuál es tu orden de urgencia?

**Context**:
- **P1: Brain Location** (CRÍTICO) — El webhook de n8n es un punto único de fallo, frágil a CORS y caídas
- **P2: Selector Resilience** (ALTO) — Los selectores tienen 14 meses sin actualización, AWS puede haber cambiado la UI
- **P3: Silent Failures** (MEDIO) — Los errores no se muestran al usuario, mala experiencia
- **P4: Repo Hygiene** (BAJO) — Sin git, permisos obsoletos en manifest

A) P1 → P2 → P3 → P4 (como se recomienda en known-issues.md)

B) P2 → P1 → P3 → P4 (verificar selectores primero porque es más fácil de diagnosticar)

C) P4 → P1 → P2 → P3 (empezar con lo más fácil: git init y limpiar manifest)

D) P1 sólo — resolver el problema crítico del webhook y posponer el resto

X) Other (por favor describe después de [Answer]: tag abajo)

[Answer]: A

---

## 2. Architecture & Technical Decisions

### Question 2.1: n8n Webhook Strategy (P1 Resolution)
¿Qué solución prefieres para el problema P1 (dependencia externa de n8n)?

**Context**: El webhook de n8n es el "cerebro" que usa Claude para mapear campos. Actualmente vive fuera del repo y es frágil.

A) **Short-term fix**: Mover el fetch al background service worker de la extensión para evitar CORS (mantener n8n)

B) **Long-term fix**: Eliminar n8n completamente y llamar a Claude API directamente desde el background service worker (requiere API key de Anthropic)

C) **Hybrid**: Opción A ahora + migración gradual a opción B después

D) **Status check first**: Ejecutar Test C para ver si el webhook sigue funcionando antes de decidir

X) Other (por favor describe después de [Answer]: tag abajo)

[Answer]: X: Recibo recomendaciones porque la idea es llevarlo a producción. El n8n en su momento lo escogí para poder habilitar un webhook y la respuestas fueran realtime. Adoptemos la mejor opción de arquitectura.

### Question 2.2: Claude API Key Management
Si se decide migrar a llamadas directas a Claude API (opción B o C de 2.1), ¿cómo prefieres gestionar la API key?

A) Almacenar en `chrome.storage.local` (usuario ingresa su API key en settings del popup)

B) Hardcoded en el código (sólo para uso interno en Applying)

C) Variable de entorno durante el build (requiere agregar build step)

D) No aplicable — vamos a mantener n8n por ahora

X) Other (por favor describe después de [Answer]: tag abajo)

[Answer]: X: Debemos aplicar buenas practicas, si es que mantenemos el n8n, o cualquier secret key.

### Question 2.3: Build Step
Actualmente la extensión no tiene build step (JavaScript vanilla). ¿Quieres mantener este enfoque o agregar tooling?

A) Mantener sin build step (JavaScript vanilla, carga directa en Chrome)

B) Agregar build step mínimo (bundler para módulos, sin framework adicional)

C) Agregar build step completo (bundler + TypeScript + linter + tests)

X) Other (por favor describe después de [Answer]: tag abajo)

[Answer]: X: Recibo recomendaciones.

---

## 3. Testing & Quality

### Question 3.1: Test Coverage
Actualmente la extensión tiene 0% de cobertura de tests. ¿Qué nivel de testing quieres implementar?

A) Sin tests — priorizar velocidad, testing manual sólo (como está actualmente)

B) Tests básicos — sólo para funciones críticas (scanForm, resolveElementByLabel, executeActions)

C) Tests completos — unit tests + integration tests con Puppeteer para validar selectores contra AWS Calculator real

D) Tests exhaustivos — unit + integration + E2E + property-based testing para lógica de negocio

X) Other (por favor describe después de [Answer]: tag abajo)

[Answer]: D

### Question 3.2: Selector Validation
¿Cómo quieres manejar la validación de selectores de CloudScape?

A) Validación manual única — revisar manualmente que los selectores actuales funcionen contra calculator.aws y actualizar los que estén rotos

B) Tests automatizados — Puppeteer tests que validan selectores críticos periódicamente

C) Auto-healing — usar Claude para detectar cuando un selector falla y sugerir actualizaciones (largo plazo)

D) Ninguna — asumir que los selectores actuales funcionan y arreglar sobre la marcha cuando se reporten problemas

X) Other (por favor describe después de [Answer]: tag abajo)

[Answer]: X; No lo sé, recomiendame

---

## 4. User Experience & Error Handling

### Question 4.1: Error Feedback (P3 Resolution)
¿Qué nivel de feedback de errores quieres implementar en el popup?

A) **Minimal** — mensajes de error básicos cuando algo falla (warning state en popup)

B) **Standard** — mensajes de error + resumen al final ("3 de 5 servicios configurados correctamente")

C) **Verbose** — modo verbose opcional que muestra en tiempo real cada acción del RPA (log stream en popup)

D) **Silent** — mantener como está (errores sólo en console.log, no en popup)

X) Other (por favor describe después de [Answer]: tag abajo)

[Answer]: X: Lo que mejor represente una buena experiencia para el usuario y el desarrollador

### Question 4.2: Visual Feedback Enhancement
El spotlight feedback actual (overlay azul que resalta el campo siendo llenado) ya existe. ¿Quieres mejorarlo?

A) Mantener como está — el spotlight actual funciona bien

B) Mejorar — agregar tooltip con el nombre del campo y valor siendo llenado

C) Expandir — agregar barra de progreso visual en overlay mostrando "Servicio 2 de 5: AWS Lambda"

D) Eliminar — quitar el spotlight y dejar que el RPA corra invisible

X) Other (por favor describe después de [Answer]: tag abajo)

[Answer]: C

---

## 5. ReAct Mode (Future Feature)

### Question 5.1: ReAct Mode Scope
El requirement FR menciona un modo "ReAct" (reason-and-act loop) además del modo "Create Calculator" actual. ¿Cuál es el scope de esta feature?

**Context**: ReAct mode aceptaría prompts en lenguaje natural y usaría AWS Well-Architected Framework para recomendar servicios antes de actuar.

A) **Fuera de scope** — este revival sólo se enfoca en hacer funcionar el modo "Create Calculator" existente; ReAct es para una fase futura

B) **Minimal spike** — crear un prototipo básico de ReAct para probar la viabilidad (prompt → Claude → JSON spec → existing RPA flow)

C) **Full implementation** — implementar ReAct completo con Well-Architected recommendations como parte de este revival

X) Other (por favor describe después de [Answer]: tag abajo)

[Answer]: C

---

## 6. Version Control & Documentation

### Question 6.1: Git Initialization (P4 Resolution)
¿Quieres inicializar git como parte de este workflow?

A) Sí — ejecutar `git init` inmediatamente y hacer commit del baseline antes de cualquier cambio

B) Sí, pero después — inicializar git después de que la extensión esté funcionando

C) No — mantener sin version control

X) Other (por favor describe después de [Answer]: tag abajo)

[Answer]: Sí, pero no spe en qué momento.

### Question 6.2: Documentation Updates
¿Qué documentación adicional necesitas además de los docs generados por AI-DLC?

A) README.md — guía de instalación, uso, y troubleshooting para el equipo de Applying

B) ARCHITECTURE.md — documentación técnica detallada de la arquitectura y decisiones

C) CHANGELOG.md — registro de cambios y versiones

D) Todas las anteriores

E) Ninguna — los docs generados por AI-DLC son suficientes

X) Other (por favor describe después de [Answer]: tag abajo)

[Answer]: D

---

## 7. Extension Opt-Ins

### Question 7.1: Security Extensions
¿Deben aplicarse las reglas de la extensión de Security Baseline para este proyecto?

A) Sí — aplicar todas las reglas de SECURITY como restricciones obligatorias (recomendado para aplicaciones de grado de producción)

B) No — omitir todas las reglas de SECURITY (adecuado para PoCs, prototipos y proyectos experimentales)

X) Other (por favor describe después de [Answer]: tag abajo)

[Answer]: A

### Question 7.2: Resiliency Extensions
¿Debe aplicarse la línea base de resiliencia a este proyecto?

**Qué es esta extensión**: Aplicarla implementa un conjunto de **mejores prácticas direccionales en tiempo de diseño** para construir sistemas resilientes, derivadas del **AWS Well-Architected Framework (Pilar de Confiabilidad)** y guía de revisión de resiliencia. Orienta requisitos, diseño y código hacia tolerancia a fallos, alta disponibilidad, observabilidad y recuperabilidad — cubriendo 15 áreas de práctica en objetivos de negocio, gestión de cambios, observabilidad, alta disponibilidad, recuperación ante desastres y mejora continua.

**Qué NO es esta extensión**: Aplicarla **no** hace que tu carga de trabajo esté lista para producción, ni certifica ni garantiza ningún objetivo de disponibilidad, RTO o RPO. Es un **punto de partida** que estructura buenas decisiones de resiliencia temprano — no es un sustituto de una **Revisión Well-Architected de AWS** formal del sistema construido.

Trata el resultado como un **primer borrador bien fundamentado de tu postura de resiliencia** para construir y validar — no un resultado terminado y certificado para producción.

A) Sí — aplicar la línea base de resiliencia como mejores prácticas direccionales y guía en tiempo de diseño (recomendado para cargas de trabajo críticas para el negocio, como punto de partida informado que puedes validar y endurecer antes del lanzamiento)

B) No — omitir la línea base de resiliencia (adecuado para PoCs, prototipos y proyectos experimentales donde la iteración rápida importa más que la confiabilidad)

X) Other (por favor describe después de [Answer]: tag abajo)
, pero en caso de necesitarse, que seafácil después adoptarlo.
[Answer]: B

### Question 7.3: Property-Based Testing Extension
¿Deben aplicarse las reglas de Property-Based Testing (PBT) para este proyecto?

A) Sí — aplicar todas las reglas de PBT como restricciones obligatorias (recomendado para proyectos con lógica de negocio, transformaciones de datos, serialización o componentes con estado)

B) Parcial — aplicar reglas de PBT sólo para funciones puras y round-trips de serialización (adecuado para proyectos con complejidad algorítmica limitada)

C) No — omitir todas las reglas de PBT (adecuado para aplicaciones CRUD simples, proyectos sólo de UI o capas de integración delgadas sin lógica de negocio significativa)

X) Other (por favor describe después de [Answer]: tag abajo)

[Answer]: X: Creería que no, tú dime

---

## 8. Success Criteria

### Question 8.1: Definition of Done
¿Qué necesitas ver para considerar este revival "completo"?

A) **Minimal viable**: La extensión se carga en Chrome, inyecta el content script, y el modo "Create Calculator" genera una URL pública con al menos 1 servicio configurado correctamente

B) **Feature complete**: Todo lo anterior + los 4 problemas P1-P4 resueltos + tests básicos + documentación

C) **Production ready**: Todo lo anterior + tests completos + migración a Claude API directo (sin n8n) + modo ReAct prototipo

D) **Current state validation only**: Sólo ejecutar Tests A, B, C para documentar qué funciona y qué no, sin hacer cambios

X) Other (por favor describe después de [Answer]: tag abajo)

[Answer]: C

### Question 8.2: Acceptance Testing
¿Cómo planeas validar que la extensión funciona correctamente?

A) **Manual testing**: Cargar la extensión en Chrome y probar manualmente con 2-3 servicios de AWS

B) **Automated E2E**: Puppeteer test que ejecuta un JSON spec completo y valida que la URL pública se genera correctamente

C) **Hybrid**: Tests manuales para validación inicial + tests automatizados para regresión

D) **No formal testing**: Confiar en que si compila y se carga, funciona

X) Other (por favor describe después de [Answer]: tag abajo)

[Answer]: X: Diría que hibrid pero se deben armar casos de prueba porque hay demasiadas casuísticas posibles con la calculadora de AWS.

---

## 9. Timeline & Constraints

### Question 9.1: Timeline
¿Cuál es tu expectativa de timeline para este revival?

A) **Urgente** — necesito esto funcionando en 1-2 días (scope mínimo: arreglar lo crítico)

B) **Normal** — 1 semana está bien (scope completo: P1-P4 + tests básicos + docs)

C) **Flexible** — no hay prisa, prefiero hacerlo bien (scope completo + migración Claude API + tests completos)

X) Other (por favor describe después de [Answer]: tag abajo)

[Answer]: C

### Question 9.2: Breaking Changes Tolerance
¿Estás dispuesto a aceptar breaking changes en la estructura del código si mejora la arquitectura?

**Context**: Por ejemplo, refactorizar content.js en múltiples módulos, cambiar el schema de mensajes entre popup y content script, etc.

A) Sí — mejora la arquitectura incluso si requiere reescribir partes significativas

B) Sólo si es necesario — prefiero cambios mínimos pero acepto refactors si están justificados

C) No — quiero cambios mínimos, mantener la estructura existente lo más posible

X) Other (por favor describe después de [Answer]: tag abajo)

[Answer]: A

---

## Next Steps

Una vez que completes todas las respuestas:
1. Guarda este archivo
2. Notifica que has completado las respuestas
3. El AI analizará tus respuestas para detectar ambigüedades
4. Si hay ambigüedades, se generarán preguntas de seguimiento
5. Una vez todo esté claro, se generará el documento de requisitos formal (`requirements.md`)

**No procedas a la siguiente fase hasta que recibas confirmación de que el análisis de requisitos está completo.**
