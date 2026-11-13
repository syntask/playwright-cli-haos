ARG BUILD_FROM=node:22-bookworm-slim
FROM ${BUILD_FROM}

ENV NODE_ENV=production \
    HOME=/data \
    PATH=/app/node_modules/.bin:${PATH} \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    PLAYWRIGHT_CLI_CONFIG=/app/cli.config.json

WORKDIR /app

RUN mkdir -p /data

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev
RUN npx playwright install --with-deps chromium \
    && rm -rf /var/lib/apt/lists/*

COPY src ./src
COPY cli.config.json ./cli.config.json

EXPOSE 8080
CMD ["node", "src/server.js"]
