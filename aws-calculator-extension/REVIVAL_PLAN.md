# Plan de revivida — AWS Calculator Extension

**Fecha:** 2026-07-14
**Estado del código:** completo, sin git, última edición abr–may 2025 (~14 meses sin tocar).
**Arquitectura:** RPA MV3. `popup.js` orquesta → inyecta `content.js` en `calculator.aws` → `scanForm()` extrae campos → webhook n8n (llama a Claude) devuelve acciones → `executeActions()` las aplica → guarda, renombra, comparte, devuelve URL.

**Dependencia crítica:** el "cerebro" NO está en el repo. Vive en `https://n8n-retirado.example/webhook/aws-field-mapper` (content.js:20). Sin ese workflow activo, `scanForm` corre pero `mapFields` devuelve `[]` y la RPA no llena nada (falla en silencio).

---

## Fase 0 — Verificar el cerebro n8n (antes de tocar código)

En tu n8n cloud, sobre el workflow `aws-field-mapper`, confirma:

1. **Existe y está Active** (toggle arriba a la derecha en verde). Si está inactivo, la URL de producción `/webhook/` no responde.
2. **Nodo Webhook:** método `POST`, path `aws-field-mapper`.
3. **CORS:** debe haber un nodo "Respond to Webhook" (o config del Webhook) que devuelva el header `Access-Control-Allow-Origin: *` (o `https://calculator.aws`). Si falta, el `fetch` desde la página se bloquea por CORS aunque el workflow funcione.
4. **Contrato de salida:** el workflow debe devolver un array de acciones, o `{actions:[...]}`, o `{mappedFields:[...]}` (content.js:92-98 acepta esos 3 formatos). Confirma que sigue devolviendo eso.
5. **Prueba interna:** ejecuta el workflow desde n8n con un payload de ejemplo (ver Fase 2, test C) y verifica que Claude responde acciones válidas. Confirma que la credencial de Anthropic/API key del nodo sigue vigente (las API keys expiran o se rotan).

**Resultado esperado:** sabrás si el cerebro está vivo, muerto, o vivo-pero-sin-CORS.

---

## Fase 1 — Cargar y reproducir

1. Chrome → `chrome://extensions` → activar **Developer mode** → **Load unpacked** → seleccionar `C:\extension\aws-calculator-extension`.
2. Abrir `https://calculator.aws/#/estimate`.
3. Abrir **DevTools → Console** en esa pestaña (aquí salen los logs `[RPA]`).
4. Click en el ícono de la extensión → **← Cargar ejemplo** → **⚡ Generar Estimado**.
5. Observar la consola y anotar hasta dónde llega.

---

## Fase 2 — Tests de aislamiento (correr en la Console de calculator.aws)

Estos 3 tests dicen **qué capa está rota** sin depender de la RPA completa.

### Test A — ¿Inyecta el content script?
Tras darle "Generar Estimado", buscar en consola:
- `[RPA] Iniciando RPA: ...` → content script vivo. ✅
- Nada / error de sendMessage → falla la inyección (revisar manifest, permisos).

### Test B — ¿scanForm ve el formulario?
Entra a configurar un servicio manualmente (Add service → Lambda → Configure) y en consola busca:
- `[RPA] 📋 DOM escaneado: N campos`
- **N alto (>10):** el scanner funciona, el UI no cambió tanto.
- **N = 0 o muy bajo:** selectores CloudScape stale → arreglar Fase 3.

### Test C — ¿Vive el webhook n8n? (reproduce el CORS exacto)
Pegar en la consola de `calculator.aws` (mismo origen que usa la extensión):

```js
fetch('https://n8n-retirado.example/webhook/aws-field-mapper', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    round: 2,
    service: 'AWS Lambda',
    domFields: [{ label: 'Number of requests', type: 'number' }],
    requestedValues: { 'Number of requests': '1000' }
  })
})
.then(r => r.json())
.then(d => console.log('✅ N8N OK:', d))
.catch(e => console.error('❌ N8N FAIL:', e));
```

Interpretación:
- **Devuelve un array de acciones** → cerebro vivo y CORS ok. El problema (si lo hay) es de selectores.
- **Error `CORS` / `blocked by CORS policy`** → workflow vivo pero sin header CORS → Fase 3, fix CORS.
- **Error 404 / respuesta vacía / `not registered`** → workflow inactivo o borrado → decidir reemplazo (Fase 3, opción cerebro).
- **Devuelve `[]`** → workflow responde pero la lógica/Claude no mapea → revisar el prompt y la API key dentro de n8n.

---

## Fase 3 — Fixes según lo que muestre la Fase 2

### Si es CORS (Test C falla por CORS)
Dos arreglos, aplicar ambos:
1. En n8n: agregar header `Access-Control-Allow-Origin: *` en la respuesta del webhook.
2. Estructural (recomendado): mover el `fetch` a n8n desde `content.js` a un **background service worker** (`background.js`). El fetch desde el service worker NO está sujeto al CORS de la página. Requiere:
   - Agregar `"background": { "service_worker": "background.js" }` al manifest.
   - Agregar `https://n8n-retirado.example/*` a `host_permissions`.
   - `content.js` pide el mapeo vía `chrome.runtime.sendMessage`, el background hace el fetch y responde.

### Si el cerebro está muerto (Test C 404/vacío)
Decidir reemplazo (esto es una decisión de arquitectura, la vemos juntos):
- **A) Reconstruir el workflow n8n** — más rápido si aún tienes el JSON del workflow o recuerdas el prompt.
- **B) Llamada directa a la API de Claude desde un background worker** — saca la dependencia de n8n, pero la API key no puede ir hardcodeada en la extensión (riesgo de exposición); habría que pedirla al usuario y guardarla en `chrome.storage`.
- **C) Aprovechar Cowork/Claude** — replantear el flujo para que el mapeo lo haga Claude en Cowork y la extensión solo ejecute. Cambio mayor de diseño.

### Si son selectores stale (Test B da N bajo, o la RPA no encuentra botones)
Actualizar los selectores de alto riesgo contra el DOM actual del Calculator:
- Flujo "Search all services" (content.js:1017).
- Card de resultado + botón `Configure` (content.js:1037-1049).
- Listbox de opciones `awsui_option-content` (content.js:700).
- Botones de guardado (content.js:899).
Método: inspeccionar cada paso en el DOM real y ajustar los `[class*="awsui_..."]` / textos.

---

## Quick wins (bajo riesgo, aplicar en cualquier caso)

- **manifest.json:** quitar el `host_permissions` de `dnd5zrqcec4or.cloudfront.net` (parece basura) y agregar el dominio de n8n.
- **Inicializar git** en el repo para versionar los cambios de la revivida (`git init` + primer commit del estado actual como baseline).
- **Feedback al usuario:** hoy si n8n devuelve `[]` la RPA no avisa. Agregar un estado de error visible en el popup cuando un servicio no mapea ningún campo.

---

## Qué necesito de ti para pasar a ejecutar

El output de la **Fase 2** (Tests A, B, C): con esos 3 resultados sé exactamente cuál de las 3 ramas de la Fase 3 aplica y empiezo a arreglar código con certeza, no adivinando.
