# Playwright CLI app

This app bundles [Microsoft Playwright CLI](https://github.com/microsoft/playwright-cli) and Chromium, then exposes an authenticated command API to the companion Home Assistant integration.

It is a thin command-layer port: commands are complete `playwright-cli` lines. The app does not add session flags, force `--persistent`, add `--json`, or maintain its own session registry.

Full user documentation lives in the repository:

- [Installation](https://github.com/syntask/playwright-cli-haos/blob/main/docs/installation.md)
- [Usage](https://github.com/syntask/playwright-cli-haos/blob/main/docs/usage.md)
- [Actions and LLM tools](https://github.com/syntask/playwright-cli-haos/blob/main/docs/actions.md)
- [App API](https://github.com/syntask/playwright-cli-haos/blob/main/docs/api.md)
- [Events](https://github.com/syntask/playwright-cli-haos/blob/main/docs/events.md)
- [Security](https://github.com/syntask/playwright-cli-haos/blob/main/docs/security.md)

## Configuration

Leave **API token** blank to let the app generate a random token on first start. It is saved to `/data/api-token` with mode `0600`. To use an existing token, enter one of at least 32 characters.

The app sends a Supervisor discovery message on startup with its internal hostname, port, and token. Install the companion integration from the Marketplace first, then start the app. Home Assistant offers a discovered **Playwright CLI** entry to confirm. If the integration was installed after the app started, restart the app to resend discovery. The app retries discovery for a few minutes if Home Assistant is not ready.

The API listens on port `8080` inside the Home Assistant app network. The port is not published on the host by default.

## Default Playwright CLI config

On first start, the app writes `/data/.playwright/cli.config.json` if the file does not exist:

```json
{
  "browser": {
    "browserName": "chromium",
    "launchOptions": {
      "args": ["--no-sandbox", "--disable-dev-shm-usage", "--remote-debugging-port=0"]
    }
  },
  "timeouts": {
    "idle": 1800000
  }
}
```

`playwright-cli` loads it automatically because the app runs with `HOME=/data` and working directory `/data`. The default selects bundled Chromium, adds container-safe launch flags, and closes inactive sessions after 30 minutes.

You can edit the file, override it per command with `--config=/data/other.json`, or delete it to regenerate the default on the next start. On HAOS, use the **SSH & Web Terminal** app or an app container shell to reach `/data`.

## Usage

Run a command through the integration:

```yaml
action: playwright_cli.run_command
data:
  command: -s=kitchen open https://example.com
```

```yaml
action: playwright_cli.run_command
data:
  command: -s=kitchen snapshot --json
```

Sessions use Playwright's `-s=<name>` selector. Omit it for the default session. Sessions end when the app restarts. Add `--persistent` or `--profile=/data/...` to keep profile data across browser restarts.

Screenshots and other files are written under `/data/.playwright-cli/`. Use `playwright_cli.save_artifact` to copy one into Home Assistant's private artifact store and get a signed URL for notifications.

## API

- `GET /health` — unauthenticated health check.
- `POST /api/v1/command` — `{ "command": "-s=kitchen open https://example.com" }`.
- `GET /api/v1/events?after=<id>&limit=<n>&instance_id=<uuid>` — paginated command and browser events.
- `GET /api/v1/artifact?path=<relative-path>` — artifact bytes as base64 JSON.
- `GET /api/v1/events/ws` — authenticated event WebSocket.

All routes except `/health` require `Authorization: Bearer <token>`.

`command` is a complete CLI line. Quotes and backslash escapes are parsed, but no shell is used. `;`, `|`, `&&`, variables, globs, and redirection remain literal text. The leading `playwright-cli` is optional.

## Events

Command events are always emitted: started, completed, and failed.

Browser events are best effort. The app polls for open sessions every three seconds and attaches a loopback CDP observer to sessions with a persistent profile. Console, network, navigation, dialog, download, worker, and WebSocket metadata events are available only for sessions opened with `--persistent` or a `--profile` path inside `/data`. Ephemeral sessions produce no browser events. The first few seconds of a session may be missed while the observer attaches.

WebSocket frame payloads are not recorded; only direction and byte count are exposed. Event output may contain page text and URLs, so treat it as sensitive.

## Security

Anyone who can call the command action or LLM tool can control websites with the session's saved credentials. `eval` and `run-code` execute arbitrary code inside the app container. Do not expose the API to the public internet. Configure Assist tool exposure deliberately.

The browser runs as root with `--no-sandbox` inside the container. The app has no host filesystem mounts. Artifacts are stored privately and are not served through `www` or `/local`.

## Limitations

- Headless Chromium only. Firefox, WebKit, Chrome, Edge, and headed mode are not installed.
- No shell. Run one command per call.
- No host file mounts. `upload` only works with files already inside the container.
- Sessions end when the app restarts; persistent profiles keep data but are not reopened automatically.
- Commands time out after about 120 seconds and output is capped at 4 MiB.
- Artifacts are limited to `.playwright-cli/` and 20 MiB each.
- This is `playwright-cli`, not `playwright test`.
