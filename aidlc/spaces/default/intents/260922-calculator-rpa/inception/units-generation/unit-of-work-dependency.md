# Dependencias entre unidades — Revivida de la extensión RPA

> Topología (DAG) entre las 7 unidades. Describe QUÉ puede depender de QUÉ, no
> el orden de construcción (eso lo decide Delivery Planning). Acíclico. Prosa en
> español; nombres de unidad en inglés.

## DAG de dependencias (prosa)

Una unidad depende de otra cuando su código o sus tests necesitan el código de
la otra para compilar/pasar. Las unidades sin arista entre sí pueden construirse
en paralelo, cada una en su propia copia del proyecto.

- **u1-walking-skeleton** — `depends_on: []`. Es el slice end-to-end mínimo y agnóstico del cerebro; se construye primero y no necesita a ninguna otra unidad (usa lógica mínima propia que U2/U3/U5 generalizan después).
- **u2-input-parsers** — `depends_on: []`. Lógica pura de entrada; independiente.
- **u3-deterministic-mapper** — `depends_on: []`. Lógica pura de mapeo obvio; independiente.
- **u4-mapping-brain** — `depends_on: []`. Servicio server-side independiente (su código no necesita el del bundle).
- **u5-rpa-dom** — `depends_on: [u3-deterministic-mapper]`. El `RpaOrchestrator` consume las acciones del `DeterministicMapper` (U3) y el residuo lo envía a U4 en runtime; a nivel de build, su código/tests necesitan la interfaz de U3. (La interacción con U4 es por red en runtime, no una dependencia de build.)
- **u6-popup-ui** — `depends_on: [u2-input-parsers, u5-rpa-dom]`. El `PopupController` invoca la normalización de entrada (U2) y renderiza los resultados por servicio que produce la agregación de U5.
- **u7-packaging** — `depends_on: [u4-mapping-brain]`. El `manifest.json` debe declarar el host del cerebro en `host_permissions`, que se fija con el alojamiento de U4. **Naturaleza de la arista:** es una dependencia de **decisión de alojamiento** (qué host declarar), resuelta en Contract/Infrastructure Design (ADR-001, Q2), **no** una dependencia de build del código de U4 — el `manifest.json` de U7 no necesita el código de U4 para compilar/pasar. Se mantiene la arista como secuenciación defendible (no cerrar el manifest hasta conocer el host), pero Delivery Planning no debe tratarla como un bloqueo de código inexistente: U7 solo espera la decisión del host, no un artefacto de código de U4.

## Puntos de integración entre unidades

- **U1 ↔ (U2/U3/U5)**: el skeleton cablea versiones mínimas; las unidades generalizan cada pieza. La integración se consolida cuando U2/U3/U5 reemplazan la lógica mínima del skeleton por la completa.
- **U5 → U4** (runtime, por red): el residuo ambiguo de mapeo y el WAF viajan al servicio server-side; es el contrato que Contract Design formaliza (payload de data escaneada, nunca screenshots).
- **U6 → U2**: el popup pasa la entrada cruda a los parsers/normalizador.
- **U6 ← U5**: el popup recibe el `RunResult`/`ServiceResult` para el render.
- **U7 → U4**: el host del cerebro se declara en el manifest.

## Oportunidades de paralelismo

Sin arista entre sí (construibles en paralelo): **u1**, **u2**, **u3**, **u4** son todas independientes. **u5** solo espera a u3. **u6** espera a u2 y u5. **u7** espera a u4. Existen varios órdenes topológicos válidos; Delivery Planning elige el camino económico.

## Slice integrado (skeleton-on)

El primer Unit del orden DAG resuelto es **u1-walking-skeleton**, que puede correr antes que las demás unidades: es un slice vertical completo (entrada JSON → mapeo determinístico mínimo → RPA de un servicio → guardar → URL) que no depende de u2-u7. Prueba la espina de integración end-to-end sin el servicio del FM (agnóstico del cerebro).

## Bloque de aristas (fuente de verdad, machine-readable)

```yaml
units:
  - name: u1-walking-skeleton
    kind: service
    depends_on: []
  - name: u2-input-parsers
    kind: library
    depends_on: []
  - name: u3-deterministic-mapper
    kind: library
    depends_on: []
  - name: u4-mapping-brain
    kind: service
    depends_on: []
  - name: u5-rpa-dom
    kind: library
    depends_on: [u3-deterministic-mapper]
  - name: u6-popup-ui
    kind: ui
    depends_on: [u2-input-parsers, u5-rpa-dom]
  - name: u7-packaging
    kind: packaging
    depends_on: [u4-mapping-brain]
```
