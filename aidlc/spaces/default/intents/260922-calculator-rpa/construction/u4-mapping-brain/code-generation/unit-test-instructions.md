# Instrucciones de tests unitarios — u4-mapping-brain

## Framework y configuración

- **Runner:** Vitest (dev-dependency de la raíz), entorno `node`, módulos ES nativos. Los tests importan `brain/**` e `infra/**` directamente.
- **Configuración:** `vitest.config.js` en la raíz; tests en `tests/u4/*.test.js`.
- **Cobertura:** proveedor `v8`; umbral propio de 80 % en líneas y ramas sobre `brain/core/**`.
- **Requisitos previos:** Node LTS; `npm ci` en la raíz, en `brain/` y en `infra/`. No se necesitan credenciales de AWS ni red: todos los clientes de AWS se reemplazan por dobles.

## Cómo correr los tests de ESTA unidad

```bash
npx vitest run tests/u4
```

También como `npm run test:u4` (mismo comando).

Síntesis local de la IaC, sin credenciales (usa `infra/cost-inputs.example.json` y cuenta y región ficticias por contexto):

```bash
cd infra && npx cdk synth -c account=111111111111 -c region=us-east-1 -c costInputs=cost-inputs.example.json
```

## Objetivos de cobertura esperados

- Umbral de esta unidad: 80 % de líneas y ramas en `brain/core/**`, con su propio comando:

```bash
npx vitest run tests/u4 --coverage --coverage.include="brain/core/**"
```

- Piso del proyecto: lo verifica Build and Test sobre la suite completa con `npx vitest run --coverage`, aparte.
- Una corrida acotada que sale distinto de 0 solo por un umbral, con todas las pruebas en verde, se registra con los resultados de la unidad; no es una prueba fallida.
- Volumen (estrategia Standard): 5-8 pruebas por componente, unas 70 en total, con integración del servidor HTTP y aserciones de la síntesis de CDK.

## Guía de dobles

- **Bedrock:** cliente falso inyectado en `bedrock-client.js`, programable con respuesta válida, salida inválida, throttling, 5xx o sin respuesta (para el tope de 10 s).
- **S3 y DynamoDB:** objetos en memoria con la misma interfaz que usan los adaptadores; modo "no responde" para el tope de 50 ms.
- **JWKS y tokens:** par de claves RSA generado en la prueba con `jose`; tokens firmados con distintos `iss`, `client_id`, `exp` y `kid`.
- **Tiempo:** `vi.useFakeTimers()` para plazos, reintentos, recargas y ventanas de límite.
- **Servidor HTTP:** instancia real en un puerto efímero, cerrada al terminar cada prueba.
- Verificar respuestas, códigos y registros, no llamadas internas.

## Datos de prueba

- `tests/u4/fixtures/inventory-small.json`: 5 servicios derivados del inventario real (incluidos EC2 y S3 del caso canónico) con su versión y SHA-256.
- Pedidos de ejemplo de C1, C2 y C3 y salidas del modelo válidas e inválidas en `tests/u4/fixtures/`.
- Cada prueba arma sus datos; nada mutable compartido.
