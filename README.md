![](docs/assets/icon.png)

# Playwright CLI for Home Assistant OS

Run [Microsoft Playwright CLI](https://github.com/microsoft/playwright-cli) from Home Assistant automations, scripts, and Assist.

## What this tool provides

- **Full CLI passthrough** — every `playwright-cli` command and option, including `-s=<session>`, `--json`, `--persistent`, `--profile`, `--config`, `--idle-timeout`, `run-code`, and `eval`.
- **Home Assistant actions** — run commands, read CLI artifacts, and copy screenshots to a private signed URL for notifications and dashboards.
- **Assist and LLM tools** — `playwright_cli__command` and `playwright_cli__events`.

Example:
```yaml
action: playwright_cli.run_command
data:
  command: -s=todomvc open https://demo.playwright.dev/todomvc
```

## Architecture
This tool exists in two parts, an app and an integration that work together:

**App:** Bundles `playwright-cli` and Chromium in a Docker image and exposes them via a REST API.

**Integration:** Connects to the app via the REST API and exposes it to Home Assistant actions and LLM tools.

## Install

[![Open your Home Assistant instance and open this repository in the Marketplace.](https://my.home-assistant.io/badges/marketplace_repository.svg)](https://my.home-assistant.io/redirect/marketplace_repository/?owner=syntask&repository=playwright-cli-haos&category=integration)
[![Open your Home Assistant instance and add this app repository.](https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg)](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2Fsyntask%2Fplaywright-cli-haos)

Requires Home Assistant 2026.11 or newer on Home Assistant OS or Home Assistant Supervised. Playwright CLI has two parts that are installed separately:

1. **Integration** — open the Marketplace button above (or go to **Settings → Marketplace**), add `https://github.com/syntask/playwright-cli-haos` as a custom repository if needed, and install **Playwright CLI**. Restart Home Assistant when prompted.
2. **App** — open the app repository button above (or go to **Settings → Apps → Install app**, open the ⋮ menu, and choose **Repositories**), add `https://github.com/syntask/playwright-cli-haos`, and install the **Playwright CLI** app.
3. Leave **API token** blank and start the app. Home Assistant should offer a discovered **Playwright CLI** integration; confirm it under **Settings → Devices & services**.

To install the integration manually instead, copy `custom_components/playwright_cli` into your Home Assistant `custom_components` directory and restart Home Assistant.

Full steps, including manual setup when discovery is unavailable, are in [docs/installation.md](docs/installation.md).

## Quick start

Open a page in a named session and read its accessibility snapshot:

```yaml
action:
  - action: playwright_cli.run_command
    data:
      command: -s=kitchen open https://example.com

  - action: playwright_cli.run_command
    response_variable: page
    data:
      command: -s=kitchen snapshot --json
```

Take a screenshot and show it in a notification:

```yaml
action:
  - action: playwright_cli.run_command
    data:
      command: -s=kitchen screenshot --filename=.playwright-cli/kitchen.png

  - action: playwright_cli.save_artifact
    data:
      path: .playwright-cli/kitchen.png
      destination: playwright/kitchen.png
    response_variable: saved

  - action: persistent_notification.create
    data:
      title: Playwright screenshot
      notification_id: playwright_kitchen
      message: "![Screenshot]({{ saved.url }})"
```

The action returns the CLI's `ok`, `stdout`, and `stderr` fields. Add `--json` when you want structured output to parse in an automation.

## Documentation

- [Installation](docs/installation.md) — Marketplace and app install, discovery, manual setup.
- [Usage](docs/usage.md) — sessions, persistent profiles, config, idle timeouts, paths, and examples.
- [Actions and LLM tools](docs/actions.md) — `run_command`, `get_artifact`, `save_artifact`, Assist examples, and the event bus.
- [App API](docs/api.md) — authenticated HTTP and WebSocket endpoints.
- [Events](docs/events.md) — what is captured, when, and why some sessions have no browser events.
- [Security](docs/security.md) — tokens, exposure, code execution, and artifact privacy.
- [Contributing](CONTRIBUTING.md) — local development, tests, image publishing, and release steps.

## Scope and limitations

This is a remote `playwright-cli` endpoint, not a full Playwright development environment.

- Headless Chromium only. Firefox, WebKit, Chrome, Edge, and headed mode are not installed.
- No shell. Pipes, redirects, `&&`, globs, variables, and background jobs are not available. Run one command per action.
- Sessions are owned by the CLI and end when the app restarts. Persistent profiles keep data on disk, but sessions are not reopened automatically.
- `localhost` means the app container. Use `homeassistant`, `supervisor`, or LAN hostnames to reach other services.
- Commands time out after about 120 seconds. Output is capped at 4 MiB per command.
- Artifacts are limited to `.playwright-cli/` and 20 MiB each.
- This is `playwright-cli`, not `playwright test`. `run-code` covers ad-hoc Playwright scripts; there is no test runner.

Early development: HAOS and Supervised installations are the supported targets. The integration and app are versioned separately and are currently at `0.1.0`.

## Security

Anyone who can call the action or LLM tool can control websites with the browser's saved credentials. `run-code` and `eval` execute arbitrary code inside the app container. Keep the API on the internal Home Assistant network, and configure Assist tool exposure deliberately. See [docs/security.md](docs/security.md).

## License

This project is MIT licensed. The app image bundles Microsoft Playwright CLI (Apache-2.0) and Chromium (BSD-3-Clause and third-party licenses); the complete notices ship with the image. See [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Playwright is a trademark of Microsoft Corporation, Chromium and Google are trademarks of Google LLC, and Home Assistant is a trademark of the Open Home Foundation. This project is not affiliated with, sponsored by, or endorsed by any of them.
