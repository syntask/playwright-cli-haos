# Actions and LLM tools

The integration registers three actions and two LLM tools. It does not create entities or devices.

## `playwright_cli.run_command`

Run one complete `playwright-cli` command line.

| Field | Required | Description |
| --- | --- | --- |
| `command` | yes | Full CLI line, including optional `-s=<session>` and options. |

```yaml
action: playwright_cli.run_command
data:
  command: -s=kitchen open https://example.com
```

Supports `response_variable`:

```yaml
action: playwright_cli.run_command
response_variable: result
data:
  command: -s=kitchen snapshot --json
```

The response is the app's command result:

```yaml
ok: true
stdout: '{"snapshot": [...]}'
stderr: ''
event:
  id: 42
  type: command_completed
  command: -s=kitchen snapshot --json
  timestamp: '2026-11-14T18:00:00.000Z'
```

A failed command returns `ok: false`, the CLI's `stderr`, and an HTTP-style error result. The action raises a Home Assistant error when the app cannot be reached or rejects the request shape.

The integration also fires a `playwright_cli_command` event on the Home Assistant event bus:

```yaml
event_type: playwright_cli_command
data:
  command: -s=kitchen snapshot --json
  success: true
```

## `playwright_cli.get_artifact`

Read a file from the app's `.playwright-cli/` directory and return its bytes as base64.

| Field | Required | Description |
| --- | --- | --- |
| `path` | yes | Relative path reported by the CLI, for example `.playwright-cli/page.png`. |

```yaml
action: playwright_cli.get_artifact
response_variable: artifact
data:
  path: .playwright-cli/kitchen.png
```

The response contains `name`, `content_type`, `bytes`, and `data_base64`. This action only supports a response; it does not return a URL.

The app rejects paths outside `.playwright-cli` and files larger than 20 MiB.

## `playwright_cli.save_artifact`

Copy an app artifact into Home Assistant's private artifact store and return a signed URL.

| Field | Required | Description |
| --- | --- | --- |
| `path` | yes | Source path inside `.playwright-cli/`. |
| `destination` | yes | Relative path in the private store, for example `playwright/kitchen.png`. |

```yaml
action: playwright_cli.save_artifact
response_variable: saved
data:
  path: .playwright-cli/kitchen.png
  destination: playwright/kitchen.png
```

The response looks like:

```yaml
url: /api/playwright_cli/artifact/playwright/kitchen.png?authSig=...
destination: playwright/kitchen.png
bytes: 48213
content_type: image/png
expires_in: 2592000
```

The URL requires Home Assistant authentication unless it is used with its signature. It works in persistent notifications, dashboards, and other Home Assistant surfaces that can fetch a Home Assistant URL.

The signed URL is valid for 30 days or until Home Assistant restarts. Artifacts are stored under `/config/.playwright_cli/artifacts`, not in `www` or `/local`.

Destinations must be relative and may only contain letters, numbers, dots, dashes, and underscores.

### Screenshot notification

```yaml
action:
  - action: playwright_cli.run_command
    data:
      command: -s=kitchen open https://demo.playwright.dev/todomvc

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
      message: >-
        TodoMVC loaded.

        ![TodoMVC]({{ saved.url }})
```

## LLM tools

The integration contributes tools to the Assist **Device control** API. They are not exposed through the admin LLM API.

### `playwright_cli__command`

Runs a complete CLI line. The tool has one parameter:

| Parameter | Type | Description |
| --- | --- | --- |
| `command` | string | Complete CLI line, for example `-s=kitchen open https://example.com`. |

The tool prompt tells the model to use terminal syntax, include `-s=` for named sessions, add `--json` for structured output, and avoid shell constructs.

Example model inputs:

```text
-s=weather open https://example.com/weather
-s=weather snapshot --json
-s=weather click e7
```

### `playwright_cli__events`

Reads command and browser events observed by the app.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| `after` | integer | `0` | Return events with an id greater than this value. |
| `limit` | integer | `20` | Maximum events to return, capped at 100 by the tool. |
| `instance_id` | string | none | Pass the previous response's `instance_id` to continue across an app restart. |

The response includes `events`, `sequence`, `latest_sequence`, `instance_id`, and `has_more`. Pass back `sequence` as `after` and `instance_id` as `instance_id` to read newer events.

Browser events are best effort and only exist for sessions with a persistent profile. See [Events](events.md).

## Assist configuration

Tool availability is controlled by Home Assistant's Assist configuration. If you do not want an assistant to control a browser, do not expose these tools to that assistant. The command tool is marked destructive and open-world because it can change pages and contact external sites.
