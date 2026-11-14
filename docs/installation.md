# Installation

Playwright Browser has two parts that are installed separately:

- the **integration** in Home Assistant;
- the **app** in the Home Assistant app store.

Install the integration first so Home Assistant can confirm discovery when the app starts.

Supported target: Home Assistant OS or Home Assistant Supervised. This release does not support a plain Home Assistant Container installation because the app store, Supervisor discovery, and internal app networking are required.

## 1. Install the integration

### HACS

1. Open HACS.
2. Go to **Integrations**.
3. Open the menu and choose **Custom repositories**.
4. Add `https://github.com/syntask/playwright-ha-app` with category **Integration**.
5. Search for **Playwright Browser** and install it.
6. Restart Home Assistant.

### Manual

Copy `custom_components/playwright_browser` into your Home Assistant configuration's `custom_components` directory, then restart Home Assistant.

## 2. Install the app

1. Open **Settings → Apps → App store**.
2. Open the menu and choose **Repositories**.
3. Add `https://github.com/syntask/playwright-ha-app`.
4. Find **Playwright Browser** and install it.
5. Leave **API token** blank. The app generates one on first start and saves it to `/data/api-token`.
6. Start the app.

The image is published for `amd64` and `aarch64`.

## 3. Confirm discovery

When the app starts, it sends a Supervisor discovery message with its internal hostname, port, and token. Home Assistant shows a discovered **Playwright Browser** entry.

1. Open **Settings → Devices & services**.
2. Find the discovered **Playwright Browser** card.
3. Choose **Configure**, then submit the confirmation form.

The integration checks the app connection before creating the entry.

If the integration is already configured, discovery updates its stored host and token instead of creating a second entry.

## Manual setup

Use manual setup only when discovery is unavailable.

1. Open **Settings → Devices & services → Add integration**.
2. Search for **Playwright Browser**.
3. Enter the app URL and API token.

The URL is the app's internal Supervisor hostname on port `8080`:

```text
http://<app-id>:8080
```

Supervisor DNS replaces underscores with hyphens. A repository app uses its folder name, so the default is:

```text
http://playwright-browser:8080
```

A local app has a `local_` prefix, so its hostname is:

```text
http://local-playwright-browser:8080
```

If the app comes from a custom repository, the app ID may include the repository prefix. You can read the exact hostname from the app's log or from the Supervisor app info.

The token is the value in the app's **API token** option, or `/data/api-token` inside the app when the option is blank.

### Resend discovery

The app retries discovery for a few minutes after startup. If Home Assistant was not ready, or you installed the integration after starting the app, restart the app.

## Updating

- Update the integration through HACS, or replace the custom component directory, then restart Home Assistant.
- Update the app through the app store and restart it.

The integration and app are versioned separately. Keep the image tag in `playwright_browser/config.yaml` aligned with the published image tags.

## Uninstalling

Removing the app with its data deletes `/data`, including generated tokens, browser profiles, and CLI artifacts.

Removing the integration removes its config entry, actions, LLM tools, and private artifact view. Saved artifacts under `/config/.playwright_browser/artifacts` remain until you delete them.
