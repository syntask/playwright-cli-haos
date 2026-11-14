# Installation

Playwright CLI has two parts that are installed separately:

- the **integration** in Home Assistant;
- the **app** in the Home Assistant app store.

Install the integration first so Home Assistant can confirm discovery when the app starts.

Requires Home Assistant 2026.11 or newer. Supported target: Home Assistant OS or Home Assistant Supervised. This release does not support a plain Home Assistant Container installation because the app store, Supervisor discovery, and internal app networking are required.

## Quick install links

These My Home Assistant links open the right dialog in your instance:

- [Add the integration repository to the Marketplace](https://my.home-assistant.io/redirect/marketplace_repository/?owner=syntask&repository=playwright-cli-haos&category=integration)
- [Add the app repository to Home Assistant](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2Fsyntask%2Fplaywright-cli-haos)

## 1. Install the integration

### Marketplace

HACS is now built into Home Assistant as the **Marketplace** starting with Home Assistant 2026.11. Use the Marketplace instead of installing HACS separately.

1. Open **Settings → Marketplace**.
2. In the upper-right corner, select **Add from link**.
3. Enter `https://github.com/syntask/playwright-cli-haos` and select **Add**. If the Marketplace asks for a type, choose **Integration**. Adding a custom repository requires a GitHub connection.
4. Open the **Playwright CLI** repository and select **Install**.
5. Restart Home Assistant if the Marketplace asks you to.

### Manual

Copy `custom_components/playwright_cli` into your Home Assistant configuration's `custom_components` directory, then restart Home Assistant.

## 2. Install the app

1. Open **Settings → Apps** and select **Install app**.
2. In the upper-right corner, open the ⋮ menu and choose **Repositories**.
3. Add `https://github.com/syntask/playwright-cli-haos` and select **Add**.
4. Find **Playwright CLI** and install it.
5. Leave **API token** blank. The app generates one on first start and saves it to `/data/api-token`.
6. Start the app.

The image is published for `amd64` and `aarch64`.

## 3. Confirm discovery

When the app starts, it sends a Supervisor discovery message with its internal hostname, port, and token. Home Assistant shows a discovered **Playwright CLI** entry.

1. Open **Settings → Devices & services**.
2. Find the discovered **Playwright CLI** card.
3. Choose **Configure**, then submit the confirmation form.

The integration checks the app connection before creating the entry.

If the integration is already configured, discovery updates its stored host and token instead of creating a second entry.

## Manual setup

Use manual setup only when discovery is unavailable.

1. Open **Settings → Devices & services → Add integration**.
2. Search for **Playwright CLI**.
3. Enter the app URL and API token.

The URL is the app's internal Supervisor hostname on port `8080`:

```text
http://<app-id>:8080
```

Supervisor DNS replaces underscores with hyphens. A repository app uses its folder name, so the default is:

```text
http://playwright-cli:8080
```

A local app has a `local_` prefix, so its hostname is:

```text
http://local-playwright-cli:8080
```

If the app comes from a custom repository, the app ID may include the repository prefix. You can read the exact hostname from the app's log or from the Supervisor app info.

The token is the value in the app's **API token** option, or `/data/api-token` inside the app when the option is blank.

### Resend discovery

The app retries discovery for a few minutes after startup. If Home Assistant was not ready, or you installed the integration after starting the app, restart the app.

## Updating

- Update the integration through the Marketplace, or replace the custom component directory, then restart Home Assistant.
- Update the app through **Settings → Apps** and restart it.

The integration and app are versioned separately. Keep the image tag in `playwright_cli/config.yaml` aligned with the published image tags.

## Uninstalling

Removing the app with its data deletes `/data`, including generated tokens, browser profiles, and CLI artifacts.

Removing the integration removes its config entry, actions, LLM tools, and private artifact view. Saved artifacts under `/config/.playwright_cli/artifacts` remain until you delete them.
