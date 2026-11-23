# Imagen del cerebro (Lambdas brain-api y brain-inventory-job). Node.js LTS sin
# transpilar, Linux ARM64 (Graviton) sobre Alpine, usuario sin privilegios y solo dependencias
# de producción. AWS Lambda Web Adapter (extensión de Lambda de awslabs,
# Apache-2.0, 1.0.1 arm64 fijada por digest) traduce cada invocación a una
# petición HTTP local, así el mismo servidor corre en Lambda sin cambios.
# Se construye desde la carpeta brain/:
#   docker build --platform linux/arm64 -t brain-api:<sha> brain/
# Base Alpine (menos paquetes del sistema que Debian: el escaneo de ECR bloqueaba
# por CVE altos de zlib, glibc, util-linux y pam de bookworm). Fijada por digest;
# `apk upgrade` toma los parches publicados al construir.
FROM --platform=linux/arm64 node:22-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a

RUN apk upgrade --no-cache

COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter@sha256:8fcedca3d6991c3e0a317855aa08ad15e0884f5db8235daaf02292db426c69d3 /lambda-adapter /opt/extensions/lambda-adapter

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY config.json ./
COPY prompts ./prompts
COPY core ./core
COPY adapters ./adapters
COPY server ./server
COPY jobs ./jobs

USER node
EXPOSE 8080
CMD ["node", "server/index.js"]
