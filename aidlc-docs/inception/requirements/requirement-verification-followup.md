# Requirements Verification — Follow-Up Questions

**Created**: 2026-07-24T00:25:30-05:00  
**Stage**: Requirements Analysis (Ambiguity Resolution)  
**Project**: AWS Calculator RPA Chrome Extension (v6 Revival)

---

## Context

Has respondido a las 19 preguntas iniciales. Varias de tus respuestas solicitan recomendaciones técnicas. A continuación, presento mis recomendaciones basadas en tu objetivo de **"llevar el RPA a producción"** con los criterios de éxito que definiste (production-ready, tests exhaustivos, modo ReAct completo).

Por favor, revisa cada recomendación y confirma si estás de acuerdo o prefieres otra opción.

---

## 1. Architecture Recommendations

### Follow-up 1.1: n8n Webhook Strategy (Original Question 2.1)

**Tu respuesta original**: "Recibo recomendaciones porque la idea es llevarlo a producción. El n8n en su momento lo escogí para poder habilitar un webhook y la respuestas fueran realtime. Adoptemos la mejor opción de arquitectura."

**Mi recomendación para PRODUCCIÓN**:

**Opción B: Eliminar n8n completamente y migrar a Claude API directa desde background service worker**

**Razones**:
1. **Eliminación de punto único de fallo**: n8n es un servicio externo que puede caer y dejar la extensión no funcional
2. **Control total**: API key propia de Anthropic, no dependes de disponibilidad de n8n
3. **Costos predecibles**: Pagas directamente a Anthropic por uso, sin intermediarios
4. **Latencia similar**: Llamada directa a Claude API vs llamada a n8n→Claude tiene latencia comparable
5. **Respuesta sigue siendo realtime**: Claude API devuelve respuestas en tiempo real (streaming opcional si lo necesitas)
6. **Seguridad mejorada**: API key almacenada de forma segura en la extensión, no expuesta en webhook público
7. **Escalabilidad**: Sin límites de n8n workflow, sólo límites de API de Anthropic (más generosos)

**Estrategia recomendada**:
- **Fase 1 (Diagnóstico)**: Ejecutar Test C para verificar estado actual de n8n
- **Fase 2 (Quick fix si es necesario)**: Si n8n tiene problemas de CORS, mover fetch a background service worker temporalmente
- **Fase 3 (Migración a producción)**: Reemplazar completamente n8n con llamada directa a Claude API
  - Implementar background service worker con llamada a Anthropic API
  - Configurar gestión segura de API key (ver siguiente pregunta)
  - Mantener la misma lógica de two-round mapping (expand→map) pero con llamadas directas

¿Estás de acuerdo con esta recomendación?

A) Sí — proceder con migración completa a Claude API directa (eliminar n8n)

B) No — prefiero mantener n8n y sólo mover el fetch a background service worker

C) Hybrid — mover a background service worker primero, luego evaluar migración a Claude API en fase posterior

X) Other (por favor describe)

[Answer]: 

---

### Follow-up 1.2: API Key Management (Original Question 2.2)

**Tu respuesta original**: "Debemos aplicar buenas practicas, si es que mantenemos el n8n, o cualquier secret key."

**Mi recomendación de BEST PRACTICES para PRODUCCIÓN**:

**Opción Híbrida: Variable de entorno + chrome.storage.local con cifrado**

**Estrategia recomendada**:

1. **Para desarrollo y testing**:
   - Variable de entorno `ANTHROPIC_API_KEY` durante el build
   - Archivo `.env.local` (gitignored) en el repo
   - Build step inyecta la key de forma segura en el bundle

2. **Para producción (distribución interna en Applying)**:
   - Build específico de producción con key embebida (cifrada)
   - Alternativamente: Usuario ingresa su propia API key en settings del popup
   - Key se almacena en `chrome.storage.local` con cifrado AES-256
   - Key nunca se loguea ni se expone en console

3. **Seguridad adicional**:
   - Key rotation cada 90 días (política recomendada de Anthropic)
   - Rate limiting en la extensión para prevenir abuso
   - Logging de uso (cuántas llamadas, cuándo) sin loguear contenido

**Justificación**:
- ❌ Hardcoded en código: No es seguro, fácil de extraer del bundle
- ❌ Solo variable de entorno: No permite key rotation sin rebuild
- ✅ Híbrido: Flexibilidad para dev + seguridad para producción + posibilidad de key rotation

¿Estás de acuerdo con esta recomendación?

A) Sí — usar variable de entorno + chrome.storage.local con cifrado

B) Hardcoded está bien — es uso interno en Applying, no se distribuye públicamente

C) Solo chrome.storage.local — usuario ingresa su API key en settings (sin build step)

X) Other (por favor describe)

[Answer]: 

---

### Follow-up 1.3: Build Step (Original Question 2.3)

**Tu respuesta original**: "Recibo recomendaciones."

**Mi recomendación para PRODUCCIÓN**:

**Opción C: Build step completo (bundler + TypeScript + linter + tests)**

**Razones**:
1. **TypeScript**: Type safety crítica para proyecto de 1,500+ líneas (reducción de bugs en producción)
2. **Bundler (Webpack/Vite)**: 
   - Permite modularizar content.js (actualmente 1,193 líneas en un archivo)
   - Tree shaking para reducir tamaño del bundle
   - Soporte para variables de entorno (API keys)
   - Minificación y optimización
3. **Linter (ESLint + Prettier)**:
   - Consistencia de código
   - Detecta errores comunes antes de runtime
   - Enfuerza best practices
4. **Tests**:
   - Jest para unit tests
   - Puppeteer para E2E tests
   - Coverage reports

**Tooling recomendado**:
```
- TypeScript 5.x
- Vite (build rápido, HMR para desarrollo)
- ESLint + Prettier
- Jest + @testing-library
- Puppeteer para E2E
- npm scripts para build/dev/test
```

**Trade-off**:
- ❌ Más complejidad en setup inicial
- ❌ Requiere build antes de cargar en Chrome
- ✅ Mayor mantenibilidad a largo plazo
- ✅ Menos bugs en producción
- ✅ Refactoring más seguro
- ✅ Onboarding más fácil para nuevos desarrolladores

¿Estás de acuerdo con esta recomendación?

A) Sí — agregar build step completo con TypeScript

B) Build step mínimo — bundler + linter, pero mantener JavaScript (no TypeScript)

C) Sin build step — mantener vanilla JS por simplicidad

X) Other (por favor describe)

[Answer]: 

---

## 2. Testing & Validation Recommendations

### Follow-up 2.1: Selector Validation Strategy (Original Question 3.2)

**Tu respuesta original**: "No lo sé, recomiendame"

**Mi recomendación para PRODUCCIÓN**:

**Opción B + C (Híbrido): Tests automatizados + Auto-healing a largo plazo**

**Estrategia por fases**:

**Fase 1 (Immediate - MVP)**:
- Validación manual única (ejecutar Test B de REVIVAL_PLAN)
- Actualizar selectores rotos manualmente
- Documentar selectores críticos

**Fase 2 (Short-term - Production launch)**:
- Puppeteer integration tests que validan 10-15 servicios más comunes (Lambda, EC2, S3, RDS, etc.)
- Tests corren en CI/CD antes de cada release
- Tests fallan si selectores están rotos → bloquea deployment

**Fase 3 (Long-term - Maintenance)**:
- Auto-healing inteligente:
  - Cuando selector falla, capturar screenshot + DOM snapshot
  - Enviar a Claude con prompt: "Este selector dejó de funcionar: `[selector]`. Analiza el DOM actual y sugiere nuevo selector"
  - Loguear selector actualizado para revisión humana
  - Opcionalmente: aplicar auto-healing en runtime con fallback

**Justificación**:
- AWS actualiza CloudScape constantemente
- Tests manuales no escalan (100+ servicios en AWS Calculator)
- Auto-healing reduce mantenimiento a largo plazo
- Balance entre esfuerzo y robustez

¿Estás de acuerdo con esta recomendación?

A) Sí — implementar las 3 fases (manual → automated tests → auto-healing)

B) Solo Fase 1 y 2 — tests automatizados, pero sin auto-healing (demasiado complejo)

C) Solo Fase 1 — validación manual única, arreglar sobre la marcha cuando se reporten problemas

X) Other (por favor describe)

[Answer]: 

---

## 3. User Experience Recommendations

### Follow-up 3.1: Error Feedback Level (Original Question 4.1)

**Tu respuesta original**: "Lo que mejor represente una buena experiencia para el usuario y el desarrollador"

**Mi recomendación para PRODUCCIÓN**:

**Opción B + C (Híbrido): Standard feedback + Modo Verbose opcional**

**Estrategia**:

**Standard mode (default)**:
- Mensajes de error claros cuando algo falla:
  - "❌ Error: No se pudo encontrar el servicio 'AWS Lambda' en el catálogo"
  - "⚠️ Advertencia: 3 de 5 servicios configurados correctamente"
- Progress bar visual: "Procesando servicio 2 de 5: AWS Lambda"
- Resumen al final:
  ```
  ✅ 3 servicios configurados exitosamente
  ⚠️ 1 servicio configurado parcialmente (algunos campos no encontrados)
  ❌ 1 servicio falló (servicio no encontrado)
  
  🔗 URL pública: https://calculator.aws/#/estimate?id=abc123
  ```

**Verbose mode (toggle en popup)**:
- Checkbox "Modo verbose (para desarrolladores)"
- Stream de log en tiempo real en el popup:
  ```
  [12:34:01] Escaneando formulario...
  [12:34:02] Encontrados 47 campos
  [12:34:03] Mapeando campo "Number of requests" → 1000
  [12:34:04] Aplicando acción: fillByLabel("Number of requests", "1000")
  [12:34:05] ✅ Campo llenado exitosamente
  ```
- Para debugging y diagnóstico de problemas

**Justificación**:
- Usuario final ve sólo información relevante (no ruido)
- Desarrollador puede activar verbose para diagnosticar
- Logs se guardan en `chrome.storage.local` para soporte

¿Estás de acuerdo con esta recomendación?

A) Sí — implementar standard + verbose mode opcional

B) Solo standard — mensajes de error + resumen, sin modo verbose

C) Solo verbose — todos los usuarios ven log detallado

X) Other (por favor describe)

[Answer]: 

---

## 4. Timing & Scope Clarifications

### Follow-up 4.1: Git Initialization Timing (Original Question 6.1)

**Tu respuesta original**: "Sí, pero no spe en qué momento."

**Mi recomendación**:

**Timing: INMEDIATAMENTE (antes de cualquier cambio de código)**

**Estrategia**:
1. **Ahora (antes de empezar Construction phase)**:
   - `git init`
   - Crear `.gitignore` (node_modules, dist, .env.local, etc.)
   - Commit inicial: "chore: initial commit - AWS Calculator RPA v6 baseline"
   - Crear branch `revival/production-ready`

2. **Beneficios de hacerlo ahora**:
   - ✅ Puedes hacer rollback si algo se rompe
   - ✅ Historial claro de qué cambió desde v6
   - ✅ Code reviews más fáciles (diffs claros)
   - ✅ Posibilidad de crear branches por feature

3. **Estructura de commits recomendada**:
   ```
   chore: initial commit - v6 baseline
   test: add diagnostic tests (Test A, B, C)
   fix(p4): clean up manifest permissions
   feat(p1): migrate from n8n to Claude API direct
   feat(p2): update CloudScape selectors
   feat(p3): add error feedback UI
   feat: add ReAct mode
   test: add E2E test suite
   docs: add README, ARCHITECTURE, CHANGELOG
   ```

¿Estás de acuerdo con inicializar git AHORA (antes de empezar cambios de código)?

A) Sí — inicializar git ahora (antes de Construction phase)

B) Después de Tests A/B/C — inicializar git después de diagnóstico pero antes de fixes

C) Después de P1-P4 fixes — inicializar git después de que la extensión funcione

X) Other (por favor describe)

[Answer]: 

---

### Follow-up 4.2: Property-Based Testing Extension (Original Question 7.3)

**Tu respuesta original**: "Creería que no, tú dime"

**Mi recomendación**:

**Opción B: Parcial — PBT sólo para funciones puras y serialización**

**Análisis**:

**Funciones que SÍ se benefician de PBT**:
1. **`cleanAriaLabel(text)`** — función pura que limpia strings
   - Property: `cleanAriaLabel(cleanAriaLabel(x)) === cleanAriaLabel(x)` (idempotencia)
   - Property: Output nunca contiene "Enter amount" o "Enter the number of"
2. **`parseUnitButtonLabel(segments)`** — función pura que parsea arrays
   - Property: Output siempre tiene estructura `{section, value}`
   - Property: Nunca pierde información de los segments de entrada
3. **JSON serialization** (input spec → internal format → actions)
   - Property: `parseSpec(JSON.stringify(spec)) === spec` (round-trip)

**Funciones que NO se benefician de PBT**:
- `scanForm()` — interactúa con DOM real, no es función pura
- `executeActions()` — tiene side effects (llena formularios)
- `resolveElementByLabel()` — depende de DOM state

**Conclusión**:
- ✅ PBT para ~10-15 funciones puras de utility/parsing
- ❌ PBT para funciones de DOM manipulation (mejor usar integration tests con Puppeteer)

**Scope de work**:
- Agregar `fast-check` library
- Escribir 10-15 property tests para funciones puras
- ~1-2 días de trabajo adicional

¿Estás de acuerdo con esta recomendación?

A) Sí — aplicar PBT parcialmente (sólo funciones puras)

B) No — omitir PBT completamente (focus en E2E tests)

C) Sí — aplicar PBT completo (incluso para funciones con side effects usando mocks)

X) Other (por favor describe)

[Answer]: 

---

## Summary of Recommendations

| Aspecto | Recomendación |
|---------|---------------|
| **n8n Strategy** | Migrar a Claude API directa (eliminar n8n) |
| **API Key Management** | Variable de entorno + chrome.storage.local cifrado |
| **Build Step** | Build completo con TypeScript |
| **Selector Validation** | Manual → Automated tests → Auto-healing (3 fases) |
| **Error Feedback** | Standard + Verbose mode opcional |
| **Git Initialization** | Ahora (antes de Construction phase) |
| **Property-Based Testing** | Parcial (sólo funciones puras) |

---

## Next Steps

Una vez que respondas a todas estas preguntas de seguimiento:
1. Guarda este archivo
2. Notifícame que has completado las respuestas
3. Generaré el documento formal de requisitos (`requirements.md`)
4. Presentaré el análisis de requisitos completo para tu aprobación
5. Procederemos a la siguiente fase del workflow (Workflow Planning)

**Por favor, responde a las 7 preguntas de seguimiento arriba.**
