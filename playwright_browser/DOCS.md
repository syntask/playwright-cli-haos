# Playwright Browser app

## Configuration

Set **API token** in the app configuration to a random value of at least 32 characters. The app exits rather than starting its API if the token is missing or too short. Keep this token private; it grants control over the browser sessions.

The API listens on port `8080` inside the Home Assistant app network. The port is intentionally not published on the host by default. In the companion integration's setup form, enter `http://<app-id>:8080` and the same token. The Supervisor's internal DNS hostname is the app ID with underscores replaced by hyphens; for a custom app repository, the app ID also includes that repository's prefix. Find the exact ID in the app's Supervisor details.

Browser profiles and the named-session registry are saved under the app's `/data` directory. Every `open` command adds `--persistent` unless already specified. Sessions opened through the API are reopened from their saved profiles when the app starts. Deleting/reinstalling the app with its data removed also removes those profiles.

## API

- `GET /health` — unauthenticated container health check.
- `GET /api/v1/sessions` — Playwright CLI session list.
- `GET /api/v1/events?after=<id>&limit=<n>&instance_id=<uuid>` — paginated command and browser lifecycle/page events. Pass back both `sequence` and `instance_id` to continue reading across app restarts.
- `GET /api/v1/artifact?path=<relative-path>` — retrieve a CLI artifact as base64 JSON.
- `POST /api/v1/command` — run a CLI command with JSON `{ "session": "default", "command": "open", "arguments": ["https://example.com"] }`.
- `GET /api/v1/events/ws` — authenticated WebSocket command event stream.

All API routes except `/health` require `Authorization: Bearer <token>`. Requests invoke `playwright-cli` without a shell. The HA integration contributes command and event tools to the **Device control** API, registers the `playwright_browser.run_command` and `playwright_browser.get_artifact` actions, creates a status device for each active session, and exposes a browser event entity.

Example automation action:

```yaml
action: playwright_browser.run_command
response_variable: cli_result
data:
  session: kitchen
  command: open
  arguments:
    - https://example.com
```

The optional `cli_result` response variable contains the CLI's `ok`, `stdout`, and `stderr` fields. For screenshot retrieval, read the generated `.playwright-cli/...` path from `stdout`, then call `playwright_browser.get_artifact` with that path and a response variable.

## Event coverage

The app discovers active sessions every few seconds, then attaches a loopback-only CDP observer to Chromium. It emits Playwright page/context lifecycle, frame, console/web-error, request/response, navigation, popup, dialog, download, file-chooser, worker, and WebSocket events. WebSocket event payloads are not recorded; only direction and byte count are exposed. Command-started, command-completed, and command-failed events are emitted immediately. New session discovery may take up to a few seconds; once attached, browser events are streamed immediately. Event output may contain page text and URLs, so treat it as sensitive. The debugging endpoint is bound to the container's loopback interface and is not exposed through the app API.

Screenshots and other CLI output files under `.playwright-cli/` can be fetched through the authenticated artifact endpoint or the `playwright_browser.get_artifact` response service. The API rejects paths outside that directory and files larger than 20 MiB.
