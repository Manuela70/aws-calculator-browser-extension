# Diseño de confiabilidad — u4-mapping-brain

> Cómo el cerebro cumple 99,5 % mensual en una región (`nfr-requirements/reliability-requirements.md`).
> Prosa en español; identificadores en inglés.

## Sources

- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u4-mapping-brain/nfr-requirements/reliability-requirements.md` (NFR1.4-NFR1.9). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u4-mapping-brain/functional-design/rules.md` (BR5.1-BR5.3, BR7.3). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u4-mapping-brain/nfr-design/performance-design.md` (topes y regla única de reintentos). [stage]

## Decisiones

| Requisito | Diseño |
|---|---|
| NFR1.4 | SLO: 99,5 % de minutos disponibles en 30 días; presupuesto de error de unos 216 minutos al mes. SLI: la sonda sintética `Probe` (detalle abajo). Un minuto cuenta como disponible si la sonda de ese minuto responde 2xx dentro del criterio de NFR1.4. |
| NFR1.5 | Cómputo gestionado en al menos dos zonas de disponibilidad, sin estado local salvo cachés reconstruibles (inventario, JWKS, limitador local); almacén de inventario y tabla de uso con replicación entre zonas gestionada por AWS. |
| NFR1.6 | 503 `inventory_unavailable` solo cuando la instancia **no tiene ninguna versión** cargada (arranque sin inventario válido, ver NFR1.8). Si Bedrock responde error de servicio y no queda segundo intento, 503 `model_unavailable` (`performance-design.md` §2). El chequeo de salud reporta ambos estados. |
| NFR1.7 | Reintento transitorio según la regla única de `performance-design.md` §2: comparte el máximo de dos invocaciones con el reintento por salida inválida, espera de 1 a 2 s y solo si quedan al menos 6 s. Nunca se reintenta un error de validación de la petición. |
| NFR1.8 | Ver "Activación y recarga del inventario". |
| NFR1.9 | Cada respuesta incluye `inventoryVersion`; `InventoryJob` emite la métrica de antigüedad, con alarma a los 14 días. |

## Activación y recarga del inventario (NFR1.8)

1. **Validación antes de activar.** `InventoryJob` genera la versión nueva y la valida completa: JSON que parsea, esquema del inventario, tamaño ≤ 50 MB, y pérdida de servicios ≤ 10 % frente a la versión activa. Si pasa, calcula su SHA-256.
2. **Activación atómica.** El puntero `active` es un objeto pequeño con `{ version, sha256, previous }`, y se reescribe en una sola escritura. La versión anterior queda guardada y revertir es reescribir el puntero. Si la validación falla, la versión queda marcada `rejected`, el puntero no cambia y se emite la métrica `InventoryJobFailed`, con su alarma.
3. **Recarga en las instancias.** Cada 5 minutos la instancia lee el puntero. Si cambió, descarga la versión en segundo plano, verifica el SHA-256 y la parsea en un hilo de trabajo (`worker_threads`) para no bloquear peticiones. Solo si todo pasa, cambia la referencia en memoria en un único paso. Las peticiones en curso terminan con la versión que tenían.
4. **Última versión buena.** Si la recarga falla (descarga, SHA-256 o parseo), la instancia **conserva la versión que ya tenía** y sigue respondiendo. Emite la métrica `InventoryReloadFailed`, con su alarma, y reintenta en el siguiente ciclo. Una versión activa dañada no interrumpe el servicio de las instancias que ya están arriba.
5. **Arranque sin versión buena.** Una instancia nueva intenta `active`; si falla, intenta `previous`. Solo si ambas fallan queda sin inventario y responde 503 `inventory_unavailable` (NFR1.6), mientras reintenta cada 30 s.

## Sonda `Probe` (SLI de NFR1.4)

- **Identidad.** Un cliente de máquina de Cognito (flujo de credenciales de cliente) con el alcance propio `brain/probe`. Su secreto vive en el almacén de secretos gestionado y solo lo lee el rol de `Probe` (`security-design.md`, NFR4.1). El token dura 1 hora y la sonda lo reutiliza hasta su vencimiento.
- **Qué mide.** Cada minuto ejecuta una operación real **que invoca el modelo**, porque un 2xx sin modelo no probaría disponibilidad. Rota entre las tres operaciones (`/map-residue`, `/interpret`, `/waf-evaluate` con 1 servicio), con casos sintéticos fijos sin datos de cliente y el `max_tokens` de la operación.
- **Límites propios.** El servicio reconoce el `client_id` de la sonda y le aplica un tope fijo de 2 operaciones por minuto. Sus tokens no cuentan para la cuota diaria de ningún SE ni para el contador global de los SE: se suman en su propio contador diario (`probe#day`) con un tope propio (`PROBE_DAILY_TOKEN_CAP`), y su costo entra en el costo fijo del presupuesto mensual (Infrastructure Design §4). Así la sonda nunca agota la capacidad de los SE ni queda bloqueada por ella.
- **Costo.** Unas 43 200 operaciones al mes con casos mínimos. Infrastructure Design las suma al presupuesto mensual con el precio del modelo configurado. Si el costo no cabe, la alternativa declarada es bajar la frecuencia a una operación cada 5 minutos; eso cambia la resolución del SLI y requiere volver a NFR Requirements (NFR1.4).
- **Fallo.** Tres fallos seguidos disparan alarma (`observability-design.md`).
