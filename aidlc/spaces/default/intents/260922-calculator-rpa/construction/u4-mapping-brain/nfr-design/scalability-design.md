# Diseño de escala — u4-mapping-brain

> Cómo el cerebro absorbe la carga de referencia (`nfr-requirements/scalability-requirements.md`):
> 10 SE y 3 corridas simultáneas. Prosa en español; identificadores en inglés.

## Sources

- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u4-mapping-brain/nfr-requirements/scalability-requirements.md` (NFR3.3-NFR3.5). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u4-mapping-brain/nfr-design/performance-design.md` (plazo y topes por intento). [stage]

## Decisiones

| Requisito | Diseño |
|---|---|
| NFR3.3 | Servicio sin estado compartido en la instancia: cualquier instancia atiende cualquier pedido; límite de tasa, cuota e inventario viven fuera. **Máximo de instancias** configurado (`MAX_INSTANCES = 2`, una por zona), que fija el techo de cómputo y de concurrencia. Con la carga de referencia (unas 90 operaciones en 3 minutos) bastan dos instancias. Subir `MAX_INSTANCES` obliga a recalcular el semáforo (fila NFR3.4) y la cuota de Bedrock. |
| NFR3.4 | **Tope de 15 invocaciones en vuelo en todo el servicio**, repartido entre instancias: cada instancia tiene un semáforo de `floor(15 / MAX_INSTANCES)` lugares (7 con dos instancias, 14 en total ≤ 15). Ese reparto estático evita un contador distribuido en el camino caliente. La cuota de Bedrock de la cuenta se pide en Infrastructure Design para al menos 15 invocaciones simultáneas. **Cola**: FIFO por instancia. La espera estimada se calcula como `ceil(posición / lugares) × latencia media de invocación`, con la media móvil de las últimas 50 invocaciones de la instancia y 6 s como valor inicial. Si `ahora + espera estimada + 10 s` (un intento completo, `performance-design.md` §2) supera el plazo de la operación, responde 429 `rate_limited` con `retryAfterSeconds = ceil(espera estimada)`. Un pedido que ya está en cola se abandona igual al vencer su plazo (504 `timeout`). |
| NFR3.4 (gasto) | **Tope global de gasto diario** (`GLOBAL_DAILY_TOKEN_CAP`), sumado en la tabla de uso junto con la cuota por SE. Al alcanzarlo, 429 `daily_quota_exceeded` para todos. Si el almacén no responde, cada instancia aplica en memoria `GLOBAL_DAILY_TOKEN_CAP / MAX_INSTANCES`, de modo que una caída del almacén nunca deja el gasto sin techo. Infrastructure Design fija el valor con el presupuesto mensual. |
| NFR3.5 | El inventario se guarda como un objeto JSON por versión; la instancia carga solo la versión activa, la parsea en un hilo de trabajo y la indexa por nombre de servicio (Map), por debajo de 50 MB (`reliability-design.md`, NFR1.8). |
