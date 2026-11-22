# Imagen del cerebro (servicio brain-api e InventoryJob). Node.js LTS sin
# transpilar, Linux ARM64 (Graviton), usuario sin privilegios y solo
# dependencias de producción. Se construye desde la carpeta brain/:
#   docker build --platform linux/arm64 -t brain-api:<sha> brain/
FROM --platform=linux/arm64 node:22-bookworm-slim

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
