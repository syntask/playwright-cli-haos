# Events

The app exposes two kinds of events:

1. **Command events** for every `run_command` call.
2. **Browser events** observed from Chromium through loopback CDP.

Command events always work. Browser events are best effort and only exist for sessions with a persistent profile.

## Command events

Every command emits:

- `command_started` before the CLI runs;
- `command_completed` when it succeeds;
- `command_failed` when it fails.

Command events contain the complete command line, the result, and a timestamp. They do not require a browser session and work for `list`, `--help`, `--version`, ephemeral sessions, and failed commands.

Read them with the `playwright_browser__events` LLM tool or `GET /api/v1/events`.

## Browser events

After startup, the app polls `playwright-cli list --json` every three seconds. For each open session with a persistent profile, it reads `DevToolsActivePort` from the profile directory and connects to Chromium over `127.0.0.1`.

It then emits Playwright page and context events:

- page opened, closed, crashed
- browser connected, disconnected, context closed
- console messages and page errors
- web errors
- network requests, responses, failures, and finished requests
- navigations, frames attached/detached, DOM content loaded, load
- dialogs and file choosers
- downloads
- popups
- workers and service workers
- WebSocket opened, frame sent/received, and closed

WebSocket frame events contain only direction and byte count. Payloads are not recorded.

Event output may contain page text, URLs, and query strings. Treat it as sensitive.

## Why some sessions have no browser events

An ephemeral Playwright session does not report a profile directory. Without a profile directory, the app cannot find the Chromium DevTools port and cannot attach an observer.

To get browser events, open the session with `--persistent` or `--profile`:

```yaml
action: playwright_browser.run_command
data:
  command: -s=kitchen open https://example.com --persistent
```

`--profile` must point inside the app's data directory, for example:

```yaml
command: -s=kitchen open https://example.com --profile=/data/profiles/kitchen
```

Profiles outside `/data` are ignored for event capture.

Without a persistent profile, use CLI commands to inspect the page:

```yaml
command: -s=kitchen console
command: -s=kitchen requests
command: -s=kitchen snapshot --json
```

These commands always work and return output directly.

## Best-effort behavior

Browser events have these limitations:

- **Attach delay** — the poll runs every three seconds. Events emitted before the observer attaches, including events during the initial `open`, are missed.
- **Persistent profiles only** — ephemeral sessions never produce browser events.
- **Restart** — sessions end when the app restarts, so browser event capture stops too. Reopen the session to resume.
- **Reconnect** — if Chromium disconnects, the next poll tries to attach again while the session remains open.
- **Warnings** — the app logs a warning at most once every 30 seconds when a persistent session cannot be attached. Ephemeral sessions are skipped without a warning.
- **Isolation** — the CDP endpoint is bound to loopback inside the app container and is not exposed through the app API.

Events are not a substitute for command output. If you need a reliable value, read the result of the command that produced it.

## Reading events

### LLM tool

```text
playwright_browser__events with {"after": 0, "limit": 20}
```

Then continue with the returned cursor:

```text
playwright_browser__events with {"after": 12, "limit": 20, "instance_id": "…"}
```

### HTTP

```http
GET /api/v1/events?after=0&limit=20&instance_id=<uuid>
Authorization: Bearer <token>
```

Response fields:

- `events` — page of events.
- `sequence` — pass as the next `after`.
- `latest_sequence` — newest event id currently stored.
- `instance_id` — pass back with the cursor.
- `has_more` — whether more events are available now.

The app keeps the 200 most recent events in memory. Event ids reset when the app restarts; the `instance_id` tells a reader that its cursor is stale.

### WebSocket

```text
GET /api/v1/events/ws
Authorization: Bearer <token>
```

The socket sends a `ready` frame, then `playwright_event` frames as events occur.

## Automation example

```yaml
action:
  - action: playwright_browser.run_command
    data:
      command: -s=kitchen open https://example.com --persistent

  - delay: "00:00:05"

  - action: playwright_browser.run_command
    response_variable: events
    data:
      command: -s=kitchen console
```

For an event-driven flow, call `playwright_browser__events` with the cursor from the previous call.
