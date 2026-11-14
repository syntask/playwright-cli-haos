![](docs/assets/icon.png)

# Playwright CLI for Home Assistant

Run [Microsoft Playwright CLI](https://github.com/microsoft/playwright-cli) from Home Assistant automations, scripts, and Assist. The app bundles `playwright-cli` and Chromium. The companion integration exposes a Home Assistant action and LLM tools. 

The Home Assistant action accepts standard Playwright CLI commands, for example:

```yaml
action: playwright_browser.run_command
data:
  command: -s=todomvc open https://demo.playwright.dev/todomvc
```

```yaml
action: playwright_browser.run_command
data:
  command: -s=todomvc snapshot --json
```

## What it provides

- **Full CLI passthrough** — every `playwright-cli` command and option, including `-s=<session>`, `--json`, `--persistent`, `--profile`, `--config`, `--idle-timeout`, `run-code`, and `eval`.
- **Home Assistant actions** — run commands, read CLI artifacts, and copy screenshots to a private signed URL for notifications and dashboards.
- **Assist and LLM tools** — `playwright_browser__command` and `playwright_browser__events`.

## Install

1. Add this repository to HACS as a custom integration and install **Playwright Browser**, or copy `custom_components/playwright_browser` into your Home Assistant `custom_components` directory.
2. Restart Home Assistant.
3. Add `https://github.com/syntask/playwright-ha-app` as an app repository and install the **Playwright Browser** app.
4. Start the app. Home Assistant should offer a discovered **Playwright Browser** integration; confirm it.

Full steps, including manual setup when discovery is unavailable, are in [docs/installation.md](docs/installation.md).

## Quick start

Open a page in a named session and read its accessibility snapshot:

```yaml
action:
  - action: playwright_browser.run_command
    data:
      command: -s=kitchen open https://example.com

  - action: playwright_browser.run_command
    response_variable: page
    data:
      command: -s=kitchen snapshot --json
```

Take a screenshot and show it in a notification:

```yaml
action:
  - action: playwright_browser.run_command
    data:
      command: -s=kitchen screenshot --filename=.playwright-cli/kitchen.png

  - action: playwright_browser.save_artifact
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

- [Installation](docs/installation.md) — integration and app install, discovery, manual setup.
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
