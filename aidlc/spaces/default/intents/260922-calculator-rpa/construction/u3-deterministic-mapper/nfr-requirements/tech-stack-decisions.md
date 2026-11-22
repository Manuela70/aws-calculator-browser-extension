# Decisiones de stack — u3-deterministic-mapper

> Tecnología del mapeo determinístico y de la resolución del residuo. U3 hereda
> el stack del walking skeleton (u1) y no añade dependencias de runtime. Prosa en
> español; identificadores en inglés. Cada requisito hereda su ID de inception
> (`NFRx.y`).

## Sources

- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/requirements-analysis/requirements.md` (NFR1, NFR6, NFR7). [requirements]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u3-deterministic-mapper/functional-design/functional-spec.md` (módulos, interfaces y verificación). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/inception/contract-design/contract-summary.md` (C1 2.0.0, interfaces internas). [stage]
- `aidlc/spaces/default/codekb/extension/technology-stack.md` (vanilla JS, MV3, sin build). [brownfield]
- Reglas afirmadas en `aidlc/spaces/default/memory/project.md` y `team.md` (sin build step, cero dependencias de runtime, Zona A con Vitest y 80 %, capa de mapeo extraíble). [team-practices]

## 1. Decisiones

| Área | Decisión | Alternativas descartadas | Motivo |
|---|---|---|---|
| Lenguaje | JavaScript ES2022 en módulos ES nativos bajo `lib/mapping/`, sin transpilar. | TypeScript. | Sin build step ni anotaciones de tipo. |
| Coincidencia de etiquetas | Igualdad exacta tras normalizar (minúsculas, espacios, `cleanAriaLabel`). | Similitud difusa (Levenshtein, fuse.js). | Decisión de diseño: lo determinístico nunca adivina; lo dudoso va al residuo. Sin dependencias. |
| Números y unidades | Parser propio de decimal simple; la unidad va en su clave "<Campo> unit". | Librerías de unidades. | Formato acotado por BR2.2 y BR2.3. |
| Resolución del residuo | Puerto inyectado `mapResidue(request, { signal })`; la implementación real la conectan U4/U7. | Llamar al cerebro desde U3. | Capa de mapeo extraíble y agnóstica del hogar del cerebro. |
| Pruebas | Vitest con fixtures de DomField derivados del inventario de la calculadora. | DOM emulado. | Las funciones son puras; el DOM real lo cubre el smoke de U5. |

## 2. Requisitos

| ID | Requisito | Criterio de verificación |
|---|---|---|
| NFR1.1 | U3 depende solo del puerto `mapResidue`; cambiar dónde vive el cerebro no cambia ningún archivo de `lib/mapping/**`. | Sin imports de U4 en `lib/mapping/**`; las pruebas pasan con dos dobles distintos del puerto. |
| NFR6.1 | `lib/mapping/**` alcanza al menos 80 % de cobertura de líneas y ramas, con al menos un caso feliz y los casos de error conocidos de `mapDeterministic` y `resolveResidue`. | `npx vitest run --coverage` en CI. |
| NFR6.2 | Las pruebas corren sin red ni navegador, con el puerto reemplazado por un doble y los tiempos por temporizadores falsos. | Las pruebas corren en `node`. |
| NFR7.1 | U3 se consume solo por `import` desde U5; no conoce el DOM ni el transporte de mensajes. | Revisión del grafo de imports. |
| NFR7.2 | `check:bundle` sigue confirmando cero dependencias de runtime. | `npm run check:bundle` en CI. |
