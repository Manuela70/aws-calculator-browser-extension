# Componentes lógicos — u3-deterministic-mapper

> Inventario lógico de u3, fronteras de fallo y radio de impacto. Prosa en
> español; identificadores en inglés.

## Sources

- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u3-deterministic-mapper/nfr-requirements/tech-stack-decisions.md` (NFR1.1, NFR6.1, NFR6.2, NFR7.1, NFR7.2). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u3-deterministic-mapper/functional-design/functional-spec.md` (módulos e interfaces). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/contract-design/contract-summary.md` (C1 2.0.0, canal de error de los puertos). [stage]

## 1. Componentes

Los tres módulos son los que fija el Diseño Funcional (functional-spec §3); aquí se indica qué patrón de NFR aloja cada uno.

| Componente | Archivo | Responsabilidad | Patrones NFR que aloja |
|---|---|---|---|
| DeterministicMapper | `lib/mapping/deterministic-mapper.js` | `mapDeterministic`: índice de etiquetas normalizadas y "Sección > Campo", tipo → acción, pasadas y cierre; `toLogEntry` | NFR2.1, NFR2.2, NFR3.1, NFR5.4, NFR8.4 |
| OptionMatch | `lib/mapping/option-match.js` | Normalización, coincidencia de opciones, patrón numérico y unidades; también lo importa U5 al ejecutar | NFR3.2, NFR3.3 |
| ResidueResolver | `lib/mapping/residue-resolver.js` | `buildResidueRequest`, `resolveResidue`, validación de la respuesta, tope y cancelación | NFR3.2, NFR5.2, NFR5.3, NFR8.5, NFR1.1 |

Todos son módulos ES de Zona A, sin estado entre llamadas, consumidos solo por `import` desde U5 (NFR7.1); sin dependencias de runtime, verificado por `check:bundle` (NFR7.2).

## 2. Fronteras de fallo y radio de impacto

| Falla | Dónde se contiene | Impacto |
|---|---|---|
| Etiqueta no encontrada o ambigua | DeterministicMapper | Solo esa clave pasa al residuo. |
| Cerebro caído, lento o con error tipado | ResidueResolver | Solo ese servicio falla sin guardar; la corrida sigue con los demás (decisión u5). |
| Respuesta del cerebro inválida | Validador de ResidueResolver | Las acciones inválidas se descartan; sus claves siguen en el residuo. |
| Formulario que nunca converge | DeterministicMapper (3 pasadas) | Cierre forzado con residuo. |

## 3. Recursos compartidos

El puerto `mapResidue` es el único recurso externo; lo provee u7 vía service worker (contrato, canal de error de los puertos).

## 4. Verificación

Vitest sobre los tres módulos con fixtures de `DomField` derivados del inventario y un doble del puerto; temporizadores falsos para el tope; `coverage.include` en `lib/mapping/**` con umbral de 80 % (NFR6.1, NFR6.2).
