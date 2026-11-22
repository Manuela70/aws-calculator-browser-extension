# Componentes lógicos — u2-input-parsers

> Inventario lógico de u2: dónde se aplican los patrones de NFR, sus fronteras
> de fallo y su radio de impacto. Prosa en español; identificadores en inglés.

## Sources

- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u2-input-parsers/nfr-requirements/tech-stack-decisions.md` (NFR1.1, NFR6.1, NFR6.2, NFR7.1, NFR7.2). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u2-input-parsers/functional-design/functional-spec.md` (§3 módulos). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/contract-design/contract-summary.md` (borde u6 → u2). [stage]

## 1. Componentes

| Componente | Archivo | Responsabilidad | Patrones NFR que aloja |
|---|---|---|---|
| InputSchema | `lib/input/input-schema.js` | Constantes de topes, tablas de claves permitidas y rechazadas | NFR3.3, NFR3.4, NFR3.5 |
| JsonParser | `lib/input/json-parser.js` | Tope de tamaño, `JSON.parse`, validación de esquema | NFR3.1, NFR3.3, NFR3.4 |
| NlInterpreter | `lib/input/nl-interpreter.js` | Adaptador del puerto: señal derivada, tope de 30 s, clasificación de errores | NFR3.2, NFR8.4, NFR8.5, NFR1.1 |
| InputNormalizer | `lib/input/input-normalizer.js` | `normalize`, construcción de `NormalizedRun`, `toLogEntry` | NFR3.1, NFR3.5, NFR5.3, NFR5.4 |
| InputErrors | `lib/input/input-errors.js` | Códigos, mensajes en español y `NL_PRIVACY_NOTICE` | NFR3.1, NFR5.2 |

Los cinco son módulos ES de Zona A, sin estado entre llamadas, consumidos solo por `import` desde U6 (NFR7.1). No hay dependencias de runtime (NFR7.2).

## 2. Fronteras de fallo y radio de impacto

| Falla | Dónde se contiene | Impacto |
|---|---|---|
| Entrada inválida o fuera de topes | JsonParser / InputSchema | Solo esa corrida: `InputError`, el SE corrige. |
| Cerebro caído o lento | NlInterpreter (tope de 30 s) | Solo la pestaña de lenguaje natural; el JSON sigue disponible. |
| Respuesta del cerebro inválida | NlInterpreter + validador común | Igual que una entrada inválida; nada llega a U3/U5. |
| Excepción no prevista | `try/catch` de `normalize` | `unexpected_error` visible; el panel no se rompe. |

## 3. Recursos compartidos

- El puerto `interpretNaturalLanguage` es el único recurso externo; lo provee U7 a través del service worker (NFR1.1).
- El registro técnico lo escribe U1 con la entrada que arma `toLogEntry` (NFR5.3, NFR5.4).

## 4. Verificación

Vitest sobre los cinco módulos, con el puerto reemplazado por un doble y temporizadores falsos, sin red ni navegador (NFR6.1, NFR6.2); `coverage.include` limitado a `lib/input/**` con umbral de 80 %.
