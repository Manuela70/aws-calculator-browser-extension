# Diseño de seguridad — u4-mapping-brain

> Cómo el cerebro cumple sus requisitos de seguridad (`nfr-requirements/security-requirements.md`).
> El diseño es independiente del hogar (n8n recreado o proxy propio); Infrastructure
> Design elige los servicios concretos. Prosa en español; identificadores en
> inglés. Esta unidad no abrió preguntas: Q1-Q4 de NFR Requirements fijan las
> decisiones.

## Sources

- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u4-mapping-brain/nfr-requirements/security-requirements.md` (NFR1.1-NFR1.3, NFR3.1, NFR3.2, NFR4.1, NFR4.2, NFR5.1-NFR5.5). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u4-mapping-brain/nfr-requirements/tech-stack-decisions.md` (NFR1.10, NFR6.1, NFR7.1; identidad con Amazon Cognito). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u4-mapping-brain/functional-design/functional-spec.md` y `rules.md` (BR1.1-BR7.3). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/contract-design/contract-summary.md` (C1-C3, "Cambios de NFR Requirements"). [stage]

## 1. Cadena de una petición

Cada operación pasa, en este orden, por filtros que rechazan antes de gastar en el modelo. El orden de esta lista es el mismo que usa la tabla de §2.

1. **Freno previo por IP** en la entrada gestionada: 300 peticiones por minuto por IP de origen, antes de autenticar, para que un cliente sin token no consuma cómputo de validación (NFR1.1, NFR3.1).
2. **CORS**: solo el origen `chrome-extension://<id>` configurado (NFR1.1).
3. **Tamaño**: cuerpo ≤ 256 KB → si no, 400 `bad_request` (NFR1.2). El tope se impone en dos capas: la entrada gestionada (si el servicio elegido en Infrastructure Design lo permite) y, siempre, el propio servicio, que lee el cuerpo con un contador y corta al pasar 256 KB sin bufferizar el resto. Así el tope no depende de la capacidad del servicio de entrada.
4. **Autenticación**: validación del token de acceso de Cognito (detalle en §2, NFR5.2 / NFR5.4) → si no, 401 `unauthorized`.
5. **Límite de tasa por SE** (`sub` del token): ventana deslizante de 60 operaciones por minuto → 429 `rate_limited` con `retryAfterSeconds` (NFR3.1).
6. **Cuota diaria por SE**: contador de tokens del día (UTC-5) → 429 `daily_quota_exceeded` (NFR3.2).
7. **Validación de esquema** de C1/C2/C3 y topes → 400 `bad_request` (NFR1.2).
8. **Inventario disponible**: si la instancia no tiene ninguna versión cargada → 503 `inventory_unavailable` (NFR1.6). Este es el único caso en que B1 paso 2 responde por falta de inventario; `internal_error` queda para fallas no previstas.
9. **Invocación del modelo** con el rol del servicio (NFR5.1, NFR4.1), con los topes de `performance-design.md`.
10. **Validación de la salida** contra esquema e inventario; a lo sumo una segunda invocación compartida con el reintento transitorio; luego `empty_result` (NFR1.3, `performance-design.md`).
11. **Registro** sin datos del cliente (NFR5.5).

## 2. Decisiones por requisito

| Requisito | Diseño |
|---|---|
| NFR1.1 | Lista de orígenes permitidos como configuración (`ALLOWED_ORIGINS`); el preflight responde solo a esos orígenes; sin `*`. El freno previo por IP del paso 1 es configuración de la entrada gestionada. |
| NFR1.2 | Topes declarados una vez (`limits.js`) e importados por los validadores de C1-C3 y por el contador de cuerpo del paso 3. |
| NFR1.3 | Validadores puros por operación (`validateInterpretOutput`, `validateResidueOutput`, `validateWafOutput`) que exigen texto plano (sin `<`, `>`, secuencias de control ni URL: se rechaza cualquier `http://` o `https://`, como pide BR4.2) y pertenencia al inventario. Una salida inválida permite una segunda invocación con el mismo prompt más el error, dentro del máximo de dos invocaciones por operación o lote; si falla de nuevo, o no queda tiempo, `empty_result`. |
| NFR3.1 | Contador por `sub` en el almacén compartido (la tabla de uso), con tiempo máximo de consulta de 50 ms. Si el almacén no responde en ese tiempo, la petición pasa a un limitador en memoria de la instancia con el mismo tope de 60 por minuto por `sub`, así que el límite pasa a ser aproximado (por instancia) en vez de desaparecer. Cada caída al limitador local emite la métrica `UsageGuardFallback`, con alarma propia (`observability-design.md`). |
| NFR3.2 | El mismo almacén guarda tokens por `sub` y día; se suma tras cada invocación con los tokens reales que informa Bedrock; el tope es configuración (`DAILY_TOKEN_CAP`). Con el almacén caído, la cuota por SE no se puede comprobar; el gasto queda acotado por el tope global de gasto diario en memoria de `scalability-design.md` (NFR3.4) y por la alarma de `UsageGuardFallback`. |
| NFR4.1 | Tres roles separados, sin `*` en acción ni recurso. (a) Rol del servicio de pedidos: `bedrock:InvokeModel` sobre el ARN del modelo configurado; lectura del prefijo del inventario; lectura y escritura de la tabla de uso; escritura de sus registros y métricas. (b) Rol de `InventoryJob`: lectura de las fuentes del inventario, escritura en el prefijo del inventario y del puntero, sus registros y métricas; sin Bedrock ni tabla de uso. (c) Rol de `Probe`: lectura de un solo secreto (el del cliente de máquina de Cognito) y escritura de sus registros y métricas; sin Bedrock, inventario ni tabla de uso. |
| NFR4.2 | El host del cerebro y el del proveedor de identidad se publican como salida de Infrastructure Design para que u7 los ponga en `host_permissions`. |
| NFR5.1 | Cada rol se asume por el cómputo gestionado (sin claves de acceso). El único secreto es el del cliente de máquina de `Probe`, en el almacén de secretos gestionado y legible solo por el rol (c). El repositorio pasa un escaneo de secretos en CI. |
| NFR5.2 / NFR5.4 | Validación local del **token de acceso** de Cognito: firma RS256 con la clave cuyo `kid` está en el JWKS del user pool; `iss` igual a la URL del user pool; `token_use = access`; `client_id` dentro de la lista configurada (`ALLOWED_CLIENT_IDS`: el cliente de la extensión y el cliente de máquina de `Probe`); `exp` vigente con una tolerancia de reloj de 60 s. No se valida `aud`, porque los tokens de acceso de Cognito no lo traen. **Caché de JWKS**: se carga al arrancar y se refresca cada hora; un refresco fallido conserva las claves anteriores sin límite de tiempo, de modo que con el emisor caído los tokens ya emitidos siguen válidos hasta su `exp` (como promete `logical-components.md` §2). **`kid` desconocido**: se fuerza un refresco, como máximo uno cada 5 minutos por instancia, para no amplificar tráfico hacia el emisor; si tras ese refresco el `kid` sigue sin aparecer, 401 `unauthorized` y el service worker de u7 pide un login nuevo. Un token vencido, de otro emisor o de otro cliente se rechaza antes de cualquier otro paso posterior. |
| NFR5.3 | Responsabilidad de u7 (service worker); el cerebro solo recibe el token en la cabecera. |
| NFR5.5 | Función `toLogRecord(op, outcome)` con lista blanca de campos (operación, código, latencia, intentos, tokens, versión de inventario, hash del `sub`); el cuerpo del pedido y la salida del modelo nunca llegan al registrador. Las demás fuentes de registro también cumplen BR6.1: (a) los registros de acceso de la entrada gestionada se configuran sin cuerpo, sin cabecera `Authorization` y sin query; (b) los rechazos de los pasos 1 a 7 pasan por `toLogRecord` con el código y sin el cuerpo; (c) el registro de invocaciones de Bedrock (model invocation logging) queda **desactivado** en la cuenta, porque guardaría prompts y respuestas con datos del cliente. |
| NFR1.10 / NFR7.1 | Prompts e identificador de modelo como archivos de configuración versionados (`prompts/*.md`, `config.json`); la lógica de validación y selección de candidatos vive en módulos puros sin SDK de transporte. |
| NFR6.1 | Pruebas unitarias de los validadores, la selección de candidatos, la validación del token (con claves de prueba), el limitador local y la agregación de tokens, con el modelo y el almacén reemplazados por dobles; umbral de 80 %. |

## 3. Amenazas consideradas

| Amenaza | Mitigación |
|---|---|
| Uso del endpoint sin la extensión | Token de acceso obligatorio con `client_id` permitido; CORS no es la defensa principal; freno previo por IP. |
| Abuso de costo por un SE o un token robado | Límite por minuto y cuota diaria por `sub`; token de 1 hora; limitador local si cae el almacén; tope global de gasto diario. |
| Prompt injection en el texto del SE | Salida validada contra esquema e inventario, sin URL ni marcado; el modelo no tiene herramientas ni acceso a datos. |
| Fuga de datos del cliente por registros | Lista blanca en `toLogRecord`; registros de acceso sin cuerpo; registro de invocaciones de Bedrock desactivado. |
| Escalada desde el cómputo | Tres roles mínimos sin comodines; el secreto de la sonda solo lo lee su rol. |
