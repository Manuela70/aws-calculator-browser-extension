# Decisiones de stack — u2-input-parsers

> Tecnología de la capa de entrada. U2 hereda el stack del walking skeleton
> (u1) y no añade dependencias de runtime. Prosa en español; identificadores en
> inglés. Cada requisito hereda su ID de inception (`NFRx.y`).

## Sources

- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/requirements-analysis/requirements.md` (NFR1, NFR6, NFR7). [requirements]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u2-input-parsers/functional-design/functional-spec.md` (§3 módulos `lib/input/*`, interfaz y puerto). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/contract-design/contract-summary.md` (borde u6 → u2, C3 `/interpret`). [stage]
- `aidlc/spaces/default/codekb/extension/technology-stack.md` (vanilla JS, MV3, sin build). [brownfield]
- Reglas afirmadas en `aidlc/spaces/default/memory/project.md` y `team.md` (sin build step, cero dependencias de runtime, Vitest/ESLint/Prettier solo como dev-dependencies, módulo de mapeo extraíble, convención de idioma). [team-practices]

## 1. Decisiones

| Área | Decisión | Alternativas descartadas | Motivo |
|---|---|---|---|
| Lenguaje | JavaScript ES2022 como módulos ES nativos (`lib/input/*.js`), sin transpilar. | TypeScript; JSDoc con tipos. | Regla del equipo: sin build step ni anotaciones de tipo. |
| Validación del JSON | Validador escrito a mano con esquema cerrado (BR2.2-BR2.7). | Ajv, Zod u otra librería de esquemas. | Cero dependencias de runtime en el bundle; el esquema es pequeño y cerrado. |
| Parseo | `JSON.parse` nativo. | Parsers tolerantes (JSON5). | El esquema estricto (Q4 de Functional Design) no admite comentarios ni comas finales; un parser tolerante oculta errores del SE. |
| Interpretación de lenguaje natural | Puerto inyectado `interpretNaturalLanguage(request, { signal })`; la implementación real la conectan U4/U7. | Parser local por reglas; llamar al cerebro desde U2. | Decisión del mantenedor "IA interpreta, bot ejecuta" y capa de mapeo extraíble: U2 no sabe dónde vive el cerebro. |
| Cancelación y tope | `AbortSignal` de la plataforma más `setTimeout` de 30 s. | Librerías de promesas cancelables. | Nativo del navegador; sin dependencias. |
| Pruebas | Vitest (dev-dependency) con cobertura V8, piso de 80 % sobre `lib/input/**`. | Jest. | Ya adoptado en u1. |
| Calidad | ESLint flat config (`no-eval`, `no-new-func`, `no-empty`, `no-prototype-builtins`) y Prettier. | — | Ya adoptado en u1; atrapa los patrones prohibidos. |

## 2. Requisitos

| ID | Requisito | Criterio de verificación |
|---|---|---|
| NFR1.1 | U2 depende solo del puerto `interpretNaturalLanguage`; cambiar dónde vive el cerebro (n8n, proxy Bedrock, service worker) no cambia ningún archivo de `lib/input/**`. | Test: el mismo conjunto de pruebas pasa con dos dobles distintos del puerto; sin imports de U4 en `lib/input/**`. |
| NFR6.1 | `lib/input/**` alcanza al menos 80 % de cobertura de líneas y ramas con Vitest, con al menos un caso feliz y los casos de error conocidos de cada función pública. | `npx vitest run --coverage` en CI. |
| NFR6.2 | Las pruebas no necesitan red ni navegador: el puerto se reemplaza por un doble y los tiempos por temporizadores falsos. | Las pruebas corren en `node` sin `jsdom`. |
| NFR7.1 | U2 vive en módulos ES propios (`input-schema.js`, `json-parser.js`, `nl-interpreter.js`, `input-normalizer.js`, `input-errors.js`) y se consume solo por `import` desde U6. | Revisión del árbol y del grafo de imports. |
| NFR7.2 | `check:bundle` sigue confirmando cero dependencias de runtime en `aws-calculator-extension/`. | `npm run check:bundle` en CI. |
