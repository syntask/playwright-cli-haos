# Playwright Browser for Home Assistant

A Home Assistant app that bundles Microsoft's `playwright-cli` and Chromium, plus a custom integration that exposes browser automation to Home Assistant automations and the Device control API.

> **Early development:** this repository is a first runnable scaffold. Browser command results are exposed immediately; native browser lifecycle/console/network events and a polished session-management UI are still future work.

## Repository layout

- `playwright_browser/` — Home Assistant app package and Node.js API.
- `custom_components/playwright_browser/` — Home Assistant custom integration.

The app and integration are separate Home Assistant installations. Add the app repository to the app store, install the app, then copy `custom_components/playwright_browser` into your HA configuration's `custom_components` directory (or install it through HACS once a release is published). Restart Home Assistant and add the **Playwright Browser** integration.

Before publishing, replace `REPLACE_WITH_GITHUB_OWNER` in `repository.yaml`, `playwright_browser/config.yaml`, and the integration manifest with the lowercase GitHub owner. The included GitHub Actions workflow publishes architecture-specific GHCR images on `v*` tags; the app's image path must match the repository owner.

## Development

Requirements: Node.js 22+, npm, and Python 3.12+.

```sh
cd playwright_browser
npm ci
npm test
```

To run the API locally, install the CLI and Chromium, set a 32-character `PLAYWRIGHT_API_TOKEN`, then run `npm start`:

```sh
npm install --global @playwright/cli@0.1.24
npx playwright install chromium
PLAYWRIGHT_CLI_CONFIG="$PWD/cli.config.json" PLAYWRIGHT_API_TOKEN=dev-token-dev-token-dev-token-1234 npm start
```

Set the integration host to `http://localhost:8080` and the same token for local development. The app API listens on port `8080`; `/health` is unauthenticated for health checks, while `/api/v1/*` requires a bearer token. Configure a random 32+ character token in the app's options before starting it. On HAOS, use the app's internal DNS name (Supervisor app ID with underscores replaced by hyphens) rather than `localhost`.

## Security

Anyone able to call the command tool can control websites using the session's saved credentials. Do not expose the app API to the public internet. The CLI includes powerful capabilities such as JavaScript evaluation and page interaction; HA entity exposure and Assist tool availability should be configured deliberately. Session data and screenshots may contain sensitive information.

Commands are launched as an argument vector (not through a shell), and session names are validated. This is not a browser sandbox or a domain allowlist; review the app's network access and the sites your automations can reach.
