ARG BUILD_FROM=node:22-bookworm-slim
FROM ${BUILD_FROM}

LABEL org.opencontainers.image.title="Playwright CLI for Home Assistant OS" \
      org.opencontainers.image.source="https://github.com/syntask/playwright-cli-haos" \
      org.opencontainers.image.licenses="MIT"

ENV NODE_ENV=production \
    HOME=/data \
    PATH=/app/node_modules/.bin:${PATH} \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

WORKDIR /app

RUN mkdir -p /data

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

COPY playwright_cli/package*.json ./
RUN npm ci --omit=dev
RUN npx playwright install --with-deps chromium \
    && rm -rf /var/lib/apt/lists/*

COPY playwright_cli/src ./src
COPY playwright_cli/cli.config.json ./cli.config.json

RUN mkdir -p /usr/share/licenses/playwright-cli \
    && cp node_modules/@playwright/cli/LICENSE /usr/share/licenses/playwright-cli/playwright-cli-LICENSE \
    && cp node_modules/playwright/LICENSE /usr/share/licenses/playwright-cli/playwright-LICENSE \
    && cp node_modules/playwright/NOTICE /usr/share/licenses/playwright-cli/playwright-NOTICE \
    && cp node_modules/playwright/ThirdPartyNotices.txt /usr/share/licenses/playwright-cli/playwright-ThirdPartyNotices.txt \
    && cp node_modules/ws/LICENSE /usr/share/licenses/playwright-cli/ws-LICENSE \
    && chromium_license="$(find /ms-playwright -path '*/chrome-headless-shell-linux64/LICENSE.headless_shell' -print -quit)" \
    && test -n "$chromium_license" \
    && cp "$chromium_license" /usr/share/licenses/playwright-cli/chromium-LICENSE.headless_shell \
    && ffmpeg_license="$(find /ms-playwright -name COPYING.LGPLv2.1 -print -quit)" \
    && test -n "$ffmpeg_license" \
    && cp "$ffmpeg_license" /usr/share/licenses/playwright-cli/ffmpeg-COPYING.LGPLv2.1

COPY LICENSE THIRD_PARTY_NOTICES.md /usr/share/licenses/playwright-cli/

EXPOSE 8080
CMD ["node", "src/server.js"]
