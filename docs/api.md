# App API

The app listens on port `8080` inside the Home Assistant app network. The port is not published on the host by default.

All routes except `/health` require:

```http
Authorization: Bearer <token>
```

The token is the app option, or `/data/api-token` when the option is blank.

## `GET /health`

Unauthenticated health check used by the Supervisor watchdog.

```json
{ "ok": true, "service": "playwright-ha-app" }
```

## `POST /api/v1/command`

Run one complete `playwright-cli` command line.

```http
POST /api/v1/command
Authorization: Bearer <token>
Content-Type: application/json

{ "command": "-s=kitchen open https://example.com" }
```

The body has exactly one meaningful field:

| Field | Type | Description |
| --- | --- | --- |
| `command` | string | Complete CLI line, including `-s=` and options. |

The app tokenizes quotes and escapes, then calls `playwright-cli` with an argument vector. No shell is used. The leading `playwright-cli` token is optional.

Success response:

```json
{
  "ok": true,
  "stdout": "{\"session\":\"kitchen\",\"pid\":123}",
  "stderr": "",
  "event": {
    "id": 12,
    "instance_id": "…",
    "timestamp": "2026-11-14T18:00:00.000Z",
    "type": "command_completed",
    "command": "-s=kitchen open https://example.com",
    "result": {
      "ok": true,
      "stdout": "{\"session\":\"kitchen\",\"pid\":123}",
      "stderr": ""
    }
  }
}
```

A CLI failure returns HTTP `502` with `ok: false` and the CLI's `stderr`:

```json
{
  "ok": false,
  "stdout": "",
  "stderr": "Error: ...",
  "code": 1,
  "event": { "type": "command_failed", "…": "…" }
}
```

Validation failures return HTTP `400`:

```json
{ "error": "Include the session in the command line, for example -s=kitchen open https://example.com" }
```

The `session` field was removed. Use `-s=<name>` in the command line.

The API adds no flags. Add `--json` yourself when you want structured CLI output.

Timeout: about 120 seconds. Output buffer: 4 MiB.

## `GET /api/v1/artifact`

Fetch a file from the app's `.playwright-cli/` directory as base64 JSON.

```http
GET /api/v1/artifact?path=.playwright-cli/kitchen.png
Authorization: Bearer <token>
```

Response:

```json
{
  "name": "kitchen.png",
  "content_type": "image/png",
  "bytes": 48213,
  "data_base64": "iVBORw0KGgo..."
}
```

Rules:

- `path` must be relative and resolve inside `/data/.playwright-cli`.
- Symlinks that escape the directory are rejected.
- Files larger than 20 MiB are rejected with HTTP `413`.
- Missing files return HTTP `404`.
- Paths outside the directory return HTTP `403`.

## `GET /api/v1/events`

Read paginated command and browser events.

```http
GET /api/v1/events?after=0&limit=100&instance_id=<uuid>
Authorization: Bearer <token>
```

Parameters:

| Parameter | Default | Description |
| --- | --- | --- |
| `after` | `0` | Return events with an id greater than this value. |
| `limit` | `100` | Page size from 1 to 200. |
| `instance_id` | none | If it does not match the current app instance, reading restarts at `after=0`. |

Response:

```json
{
  "events": [
    {
      "id": 12,
      "instance_id": "…",
      "timestamp": "2026-11-14T18:00:00.000Z",
      "type": "command_completed",
      "command": "-s=kitchen snapshot --json",
      "result": { "…": "…" }
    }
  ],
  "sequence": 12,
  "latest_sequence": 14,
  "instance_id": "…",
  "has_more": false
}
```

Use `sequence` as the next `after` value. Keep `instance_id` with the cursor; event ids reset when the app restarts.

The in-memory history holds the 200 most recent events.

## `GET /api/v1/events/ws`

Authenticated WebSocket stream of new events.

The server sends a ready frame:

```json
{ "type": "ready", "sequence": 12, "instance_id": "…" }
```

Then one frame per event:

```json
{
  "type": "playwright_event",
  "event": {
    "id": 13,
    "instance_id": "…",
    "timestamp": "2026-11-14T18:00:01.000Z",
    "type": "console_message",
    "session": "kitchen",
    "level": "log",
    "message": "loaded"
  }
}
```

Send the bearer token in the `Authorization` header; the WebSocket handshake rejects unauthenticated requests.

## Removed route

`GET /api/v1/sessions` was removed. Use the CLI:

```json
{ "command": "list --json" }
```

## Examples

```sh
TOKEN='...'
BASE='http://playwright-browser:8080'

curl -s "$BASE/health"

curl -s -X POST "$BASE/api/v1/command" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"command":"-s=kitchen open https://example.com --persistent"}'

curl -s -X POST "$BASE/api/v1/command" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"command":"-s=kitchen screenshot --filename=.playwright-cli/kitchen.png"}'

curl -s "$BASE/api/v1/artifact?path=.playwright-cli/kitchen.png" \
  -H "Authorization: Bearer $TOKEN"

curl -s "$BASE/api/v1/events?after=0&limit=20" \
  -H "Authorization: Bearer $TOKEN"
```
