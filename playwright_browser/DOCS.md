# Playwright Browser app

## Configuration

Set **API token** in the app configuration to a random value of at least 32 characters. The app exits rather than starting its API if the token is missing or too short. Keep this token private; it grants control over the browser sessions.

The API listens on port `8080` inside the Home Assistant app network. The port is intentionally not published on the host by default. In the companion integration's setup form, enter `http://<app-id>:8080` and the same token. The Supervisor's internal DNS hostname is the app ID with underscores replaced by hyphens; for a custom app repository, the app ID also includes that repository's prefix. Find the exact ID in the app's Supervisor details.

Browser profiles and the named-session registry are saved under the app's `/data` directory. Every `open` command adds `--persistent` unless already specified. Sessions opened through the API are reopened from their saved profiles when the app starts. Deleting/reinstalling the app with its data removed also removes those profiles.

## API

- `GET /health` — unauthenticated container health check.
- `GET /api/v1/sessions` — Playwright CLI session list.
- `GET /api/v1/events?after=<id>` — recent command events.
- `POST /api/v1/command` — run a CLI command with JSON `{ "session": "default", "command": "open", "arguments": ["https://example.com"] }`.
- `GET /api/v1/events/ws` — authenticated WebSocket command event stream.

All API routes except `/health` require `Authorization: Bearer <token>`. Requests invoke `playwright-cli` without a shell. The HA integration contributes `playwright_browser__command` to the **Device control** API, registers the `playwright_browser.run_command` action, and exposes a command event entity.

Example automation action:

```yaml
action: playwright_browser.run_command
data:
  session: kitchen
  command: open
  arguments:
    - https://example.com
```

## Event coverage

The initial implementation emits command-started, command-completed, and command-failed events with bounded command output. It does **not yet** stream spontaneous browser `console`, request, response, dialog, or navigation events; those remain accessible through the relevant Playwright CLI commands and are a follow-up integration feature.
