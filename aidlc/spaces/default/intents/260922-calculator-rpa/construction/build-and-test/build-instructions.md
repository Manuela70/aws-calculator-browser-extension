# Instrucciones de build — calculator-rpa

> La extensión se carga **unpacked, sin paso de build** (MV3, vanilla JS). "Build"
> aquí es instalar las herramientas de desarrollo, verificar el bundle y, para el
> cerebro de U4, sintetizar la infraestructura sin desplegar. Nada de esto entra
> al bundle que carga Chrome.

## 1. Requisitos previos

| Herramienta | Uso |
|---|---|
| Node LTS (18 o posterior) y npm | Vitest, ESLint, Prettier, scripts de `scripts/`, CDK |
| Git | `.gitattributes` fija fin de línea LF también en Windows |
| Chrome 130 o posterior | Carga unpacked y smoke manual (`aws-calculator-extension/SMOKE.md`) |
| Docker (solo para construir la imagen del cerebro) | `brain/Dockerfile`; no se usa en esta etapa |

No se necesitan credenciales de AWS para nada de esta etapa.

## 2. Instalación de dependencias

```bash
npm ci                      # raíz: herramientas de desarrollo (Vitest, ESLint, Prettier)
npm ci --prefix brain       # dependencias de runtime del cerebro (solo para sus pruebas y la imagen)
npm ci --prefix infra       # aws-cdk-lib, constructs y aws-cdk (solo síntesis)
```

`aws-calculator-extension/` no tiene `package.json` ni `node_modules`: `npm run check:bundle` falla si aparecen.

## 3. Configuración de entorno

- **Fin de línea:** `.gitattributes` (`* text=auto eol=lf`). En un clon de Windows anterior a ese archivo, correr una vez `npm run format` para dejar las copias en LF; Prettier exige LF.
- **Cerebro sin desplegar:** `aws-calculator-extension/sw/config.js` queda con `BRAIN_BASE_URL`, `COGNITO_DOMAIN` y `CLIENT_ID` en `null`; `host_permissions` solo lleva `https://calculator.aws/*`. Tras desplegar U4: `node scripts/sync-brain-config.js`, `npm run format` y `npm run check:bundle`.
- **Clave `key` del manifest:** pendiente; la genera el mantenedor y se agrega en `manifest.json` y en `scripts/bundle-policy.json` en el mismo commit.
- **Parámetros de despliegue de U4:** `infra/deploy-params.json` y `infra/cost-inputs.json` reales no se versionan; los `*.example.json` tienen valores ficticios rotulados.

## 4. Comandos de build y verificación

| # | Comando | Qué comprueba |
|---|---|---|
| 1 | `npm run lint` | ESLint flat config: reglas de seguridad por zona (content script, service worker, panel, Zona A) |
| 2 | `npm run format:check` | Prettier sobre JS, JSON, HTML, CSS, YAML y `brain/`, `infra/` |
| 3 | `npm run check:bundle` | Sin dependencias de runtime; manifest contra `scripts/bundle-policy.json` (permisos, hosts, CSP, recursos, versión mínima, `key`); sin secretos ni URL ajenas |
| 4 | `npm audit --audit-level=high` | Vulnerabilidades altas en dependencias de desarrollo |
| 5 | `cd infra && npx cdk synth -c account=111111111111 -c region=us-east-1 -c costInputs=cost-inputs.example.json -c params=deploy-params.example.json --no-lookups -q` | Síntesis de `BrainBootstrapStack` y `BrainStack` sin consultar AWS (zonas fijas, `--no-lookups`) |

Para la síntesis, conviene correrla sin credenciales en el entorno (sin `AWS_PROFILE` ni claves), para que la CLI no intente asumir roles con las credenciales locales.

## 5. Verificación del build

- Los cinco comandos terminan con código 0.
- `infra/cdk.out/` queda generado y está en `.gitignore`; no se versiona.
- "Load unpacked" de `aws-calculator-extension/` en `chrome://extensions` carga sin errores en la tarjeta (smoke S8).

## 6. Problemas frecuentes

| Síntoma | Causa | Solución |
|---|---|---|
| `format:check` falla en muchos archivos sin cambios de contenido | Copia de trabajo en CRLF (`core.autocrlf=true`) | `npm run format`; `.gitattributes` lo evita en clones nuevos |
| `Cannot find package 'jose'` / `@aws-sdk/*` / `aws-cdk-lib` en `tests/u4` | Faltan dependencias de `brain/` o `infra/` | `npm ci --prefix brain` y `npm ci --prefix infra` |
| `cdk synth` intenta asumir un rol | Lookups activos con credenciales locales | Usar `--no-lookups` y correr sin credenciales |
| `check:bundle` falla por un host | `host_permissions` y `sw/config.js` no coinciden | Correr `node scripts/sync-brain-config.js` o restaurar ambos |
| `tests/u5/eslint-config.test.js` supera 5 s | Carga de ESLint bajo carga de la máquina | Repetir; pendiente subir su tope (hallazgo menor de revisión) |
