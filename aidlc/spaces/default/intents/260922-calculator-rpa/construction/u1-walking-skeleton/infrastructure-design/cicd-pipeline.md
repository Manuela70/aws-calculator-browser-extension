# Pipeline de CI/CD — u1-walking-skeleton

> Verificación automática con GitHub Actions (decisión Q1) y entrega manual de
> la extensión unpacked (práctica del equipo). No hay despliegue automatizado:
> no existen servidores ni tienda en esta revivida. Prosa en español;
> identificadores en inglés.

## Sources

- `infrastructure-design-questions.md` de esta unidad: Q1 (GitHub Actions en cada push a `main`). [Q1]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u1-walking-skeleton/nfr-design/reliability-design.md` §5 (Zona A con Vitest, umbral 80 %, smoke de Zona B). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u1-walking-skeleton/nfr-design/security-design.md` §1 y §4 (test del manifest, reglas de ESLint). [stage]
- `aidlc/spaces/default/intents/260922-calculator-rpa/construction/u1-walking-skeleton/nfr-design/logical-components.md` (módulos de Zona A). [stage]
- `aidlc/spaces/default/memory/team.md` (`## Way of Working` directo a `main`; `## Deployment` unpacked; `## Testing Posture`; `## Code Style` ESLint + Prettier). [team-practices]

## 1. Requisito previo

El repositorio local no tiene remoto. Para que el pipeline exista, el mantenedor publica el repo en GitHub (público o privado) y empuja `main`. Hasta entonces, el mismo pipeline se corre a mano con los scripts de §3. Es un paso del mantenedor, no de la extensión; el skeleton funciona igual sin él.

## 2. Workflow `.github/workflows/ci.yml`

- **Disparadores:** `push` a `main` y `pull_request` hacia `main` (por si alguna vez se usa una rama, según la práctica del equipo).
- **Entorno:** `ubuntu-latest`, Node LTS fijado por versión mayor en el workflow; `npm ci` con caché de npm.
- **Permisos del token:** `contents: read` únicamente. Sin secretos: el pipeline no necesita credenciales.
- **Acciones de terceros:** solo las oficiales (`actions/checkout`, `actions/setup-node`), fijadas por versión mayor.

| # | Paso | Comando | Gate (falla el workflow si…) |
|---|---|---|---|
| 1 | Instalar dev-dependencies | `npm ci` | Falla la instalación |
| 2 | Formato | `npm run format:check` (Prettier `--check`) | Hay archivos sin formatear |
| 3 | Lint | `npm run lint` (ESLint flat config: `no-empty`, `no-eval`, `no-implied-eval`, `no-new-func`, prohibición de `innerHTML`/`insertAdjacentHTML`/`outerHTML`) | Cualquier error de lint |
| 4 | Tests + cobertura | `npm run coverage` (Vitest con `coverage.thresholds.lines: 80` sobre los módulos de Zona A) | Un test falla o la cobertura agregada < 80 % |
| 5 | Test del manifest | Incluido en el paso 4: verifica la lista exacta de `permissions`, `host_permissions` y `minimum_chrome_version` | El manifest no coincide |
| 6 | Bundle sin dependencias | `npm run check:bundle`: script de Node que falla si algún archivo de `aws-calculator-extension/` importa desde `node_modules` o desde un paquete | Hay una dependencia de runtime empaquetada |
| 7 | Informe | Sube el informe de cobertura como artefacto del workflow (retención 14 días) | — |

`package.json`, `vitest.config.js`, `eslint.config.js` y `.prettierrc` viven en la raíz del repo, fuera de `aws-calculator-extension/`, para que nada de esto entre en la carpeta que carga Chrome.

## 3. Scripts locales (los mismos del CI)

| Script | Qué hace |
|---|---|
| `npm run lint` | ESLint sobre `aws-calculator-extension/` y los tests |
| `npm run format:check` / `npm run format` | Prettier en modo verificación / corrección |
| `npm test` | Vitest una vez |
| `npm run coverage` | Vitest con cobertura y umbral |
| `npm run check:bundle` | Verifica que el bundle no importa paquetes |

## 4. Entrega (deploy)

1. CI verde en el commit.
2. En `chrome://extensions` → "Reload" sobre la extensión unpacked (o "Load unpacked" la primera vez).
3. Ejecutar el smoke de `aws-calculator-extension/SMOKE.md` (Zona B) y anotar el resultado y la duración.

No hay promoción entre entornos ni estrategias blue-green/canary: hay un único entorno local.

## 5. Rollback

- Volver al commit anterior en `main` (`git revert` del commit problemático) y recargar la extensión unpacked. Lo guardado en `chrome.storage.local` es solo diagnóstico y no requiere migración; si un cambio altera el formato de las claves, `schemaVersion` permite ignorar o limpiar lo antiguo.

## 6. Secretos

Ninguno en el pipeline ni en la extensión. Cuando exista el cerebro (U4), su credencial vivirá server-side y el CI de la extensión seguirá sin secretos.
