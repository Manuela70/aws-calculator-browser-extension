# Requisitos de seguridad — u4-mapping-brain

> Requisitos de seguridad del cerebro: servicio de red con tres operaciones
> (`/interpret`, `/map-residue`, `/waf-evaluate`) que invoca Claude en Bedrock con
> credencial server-side, más el inventario versionado de la calculadora. Prosa
> en español; identificadores en inglés. Cada requisito hereda su ID de
> inception (`NFRx.y`).

## Sources

- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/requirements-analysis/requirements.md` (NFR1, NFR4, NFR5, FR8.1). [requirements]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u4-mapping-brain/functional-design/functional-spec.md` (operaciones B1-B4, estados). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u4-mapping-brain/functional-design/rules.md` (BR1.1-BR7.3). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/contract-design/contract-summary.md` (C1-C3, autenticación reservada a un header, topes). [stage]
- `nfr-requirements-questions.md` de esta unidad: Q1 (login con token en sesión), Q2 (10 SE, 3 simultáneos), Q4 (alerta y tope diario). [Q1, Q2, Q4]
- Reglas afirmadas en `aidlc/spaces/default/memory/project.md` (Forbidden: credenciales de larga vida en el cliente, código dinámico, fallo reportado como éxito; Mandated: `host_permissions` mínimos). [team-practices]

## 1. Superficie de ataque

| Elemento | Frontera de confianza | Datos que cruzan |
|---|---|---|
| Endpoint HTTPS del cerebro | Internet → servicio | Token del SE, pedidos C1-C3 |
| Proveedor de identidad (Cognito, federado si existe) | Gestionado por AWS | Credenciales del SE (nunca pasan por la extensión) |
| Bedrock (Claude) | Cuenta AWS, IAM | Prompts con configuración y etiquetas; respuestas no confiables |
| Inventario versionado | Almacenamiento del servicio | Manifest y definiciones públicas de la calculadora |
| Registros y métricas | Cuenta AWS | Operación, tokens, latencia, códigos; sin datos del cliente |

## 2. Requisitos

### NFR5 — Credenciales y autenticación

| ID | Requisito | Criterio de verificación |
|---|---|---|
| NFR5.1 | La credencial de Bedrock vive solo en el servicio, como rol IAM con permiso `bedrock:InvokeModel` limitado al modelo elegido; ninguna clave en el bundle, `chrome.storage`, el service worker ni git (BR1.3). | Revisión de la política IAM; escaneo de secretos del repositorio. |
| NFR5.2 | Cada llamada al cerebro lleva `Authorization: Bearer <token>` emitido por el proveedor de identidad tras el login del SE con `chrome.identity.launchWebAuthFlow` (Q1). El token dura 1 hora como máximo y no hay token de refresco de larga vida en el cliente. Antes de iniciar una corrida, si al token le quedan menos de 15 minutos, la extensión pide un login nuevo; así una corrida (menos de 15 minutos) no vence a mitad. | Prueba: llamada sin token o con token vencido → 401 `unauthorized`; el token emitido expira en ≤ 60 min; con 10 min restantes, la corrida pide login antes de empezar. |
| NFR5.3 | El token se guarda solo en `chrome.storage.session` (Q1): sobrevive al reinicio del service worker pero se borra al cerrar el navegador, nunca en `storage.local` ni `storage.sync`, y `setAccessLevel` queda en `TRUSTED_CONTEXTS` para que el content script no lo lea. | Revisión del código de U7; prueba: el content script no puede leer la clave. |
| NFR5.4 | El cerebro valida firma, emisor, audiencia y vencimiento del token en cada llamada y rechaza con 401 `unauthorized` sin invocar el modelo. | Pruebas del validador con token alterado, de otro emisor y vencido. |
| NFR5.5 | Ningún registro, error ni métrica contiene texto en lenguaje natural, valores de configuración, nombre de proyecto ni respuesta del modelo (BR6.1). | Prueba: los registros de una operación no contienen subcadenas del pedido. |

### NFR4 — Mínimo privilegio

| ID | Requisito | Criterio de verificación |
|---|---|---|
| NFR4.1 | El rol del servicio solo puede invocar el modelo elegido, leer y escribir el inventario y emitir registros y métricas propios; nada más. | Revisión de la política IAM (sin comodines de acción ni de recurso). |
| NFR4.2 | La extensión declara en `host_permissions` solo el host del cerebro y el del proveedor de identidad que use el login (U7). | Revisión del manifest. |

### NFR1 — Hogar robusto

| ID | Requisito | Criterio de verificación |
|---|---|---|
| NFR1.1 | El cerebro responde CORS solo al origen `chrome-extension://<id>` de la extensión publicada y a ningún comodín; la autenticación no depende del origen. | Prueba de preflight desde otro origen → rechazado. |
| NFR1.2 | Los pedidos se validan y acotan antes de invocar el modelo: topes de C1-C3 (20 servicios, 30 claves, 100 caracteres, 500 `domFields`, 2000 caracteres de texto) y cuerpo de hasta 256 KB; fuera de tope → 400 sin invocar (BR1.1). | Pruebas en el borde de cada tope. |
| NFR1.3 | La salida del modelo se valida contra el esquema de la operación y el inventario; texto plano sin marcado; un reintento y luego `empty_result` (BR1.4, BR4.2). | Pruebas con salidas inválidas simuladas. |

### NFR3 — Abuso y costo

| ID | Requisito | Criterio de verificación |
|---|---|---|
| NFR3.1 | Límite de tasa por SE (identificado por el `sub` del token): 60 operaciones por minuto, el doble de las 29 que hace una corrida de 20 servicios, para que un reintento no corte una corrida legítima. Excedido → 429 `rate_limited` con `retryAfterSeconds`, que la extensión muestra en español (contrato, "Cambios de NFR Requirements"). | Prueba: la operación 61 del minuto devuelve 429 con `retryAfterSeconds`. |
| NFR3.2 | Tope diario de tokens por SE (Q4): al superarlo, el cerebro responde 429 `daily_quota_exceeded` sin invocar el modelo, y la extensión lo muestra en español sin reintentar. El valor del tope y del presupuesto mensual los fija el mantenedor en Infrastructure Design; criterio: el tope diario debe permitir al menos 10 corridas de 20 servicios por SE, medido con los tokens reales de la prueba de NFR8.6. | Prueba con un tope bajo configurado. |
