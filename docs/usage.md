# Usage

`playwright_cli.run_command` sends one complete `playwright-cli` command line to the app:

```yaml
action: playwright_cli.run_command
data:
  command: -s=kitchen open https://example.com
```

There is no separate session field, `--persistent` is not added for you, and `--json` is not added for you. The app tokenizes the line, then runs `playwright-cli` with that argument vector. Nothing is sent through a shell.

## Command syntax

Use the same syntax as a terminal:

```text
[-s=<session>] <command> [arguments] [options]
```

Examples:

```yaml
command: -s=kitchen open https://example.com
command: -s=kitchen snapshot
command: -s=kitchen click e3
command: -s=kitchen fill e2 "hello world"
command: -s=kitchen screenshot --filename=.playwright-cli/kitchen.png
command: -s=kitchen close
command: list --json
command: --help
```

A leading `playwright-cli` is removed if present, so copy-pasted commands like this also work:

```yaml
command: playwright-cli -s=kitchen snapshot
```

Write the command on one line. A YAML literal block (`|`) adds a trailing newline, and the app rejects newlines in the command.

### Quotes and escapes

Single and double quotes are parsed. Backslash escapes a character inside double quotes or outside quotes.

```yaml
command: fill e2 "hello world"
command: type "say \"hello\""
command: fill e2 'it costs $5'
```

### No shell

There is no shell, so these do not work:

- pipes: `|`
- redirects: `>`, `>>`, `<`
- command chaining: `&&`, `;`
- command substitution: `$(...)`, backticks
- environment expansion: `$HOME`
- globs: `*.png`
- background jobs: `&`

The characters are passed to `playwright-cli` as literal text. Run one command per action.

## Sessions

Sessions are Playwright's named browser sessions. Use `-s=<name>`:

```yaml
command: -s=kitchen open https://example.com
command: -s=office snapshot
```

Omit `-s` to use the CLI's default session. Session names are validated by `playwright-cli`; the app does not rewrite them.

If you used an earlier build with a separate `session` field, move it into the command line:

```yaml
# before
data:
  session: kitchen
  command: open https://example.com

# after
data:
  command: -s=kitchen open https://example.com
```

Sessions live inside the app container and end when the app restarts. Listing sessions:

```yaml
action: playwright_cli.run_command
response_variable: sessions
data:
  command: list --json
```

## Persistent profiles

Pass `--persistent` on `open` to keep cookies, local storage, IndexedDB, and cache on disk:

```yaml
command: -s=kitchen open https://example.com --persistent
```

Use `--profile` for a specific directory:

```yaml
command: -s=kitchen open https://example.com --profile=/data/profiles/kitchen
```

For browser events, the profile must be inside `/data`. Profile data survives an app restart, but sessions do not reopen automatically. After a restart, run `open` again with the same session and profile options. Wipe a session's data with:

```yaml
command: -s=kitchen delete-data
```

Sessions without `--persistent` or `--profile` use an ephemeral profile and produce no browser events.

## Default configuration

On first start, the app writes:

```text
/data/.playwright/cli.config.json
```

The file configures Chromium for the container:

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

`playwright-cli` loads this file automatically because the app runs with `HOME=/data` and working directory `/data`. Commands do not inject `--config`.

You can:

- edit `/data/.playwright/cli.config.json` directly;
- pass `--config=/data/other.json` on a command to use another file; fields omitted from that file are inherited from the default;
- delete the file to have the app recreate the default on the next start.

On Home Assistant OS, reach the app's `/data` directory through the **SSH & Web Terminal** app or an app container shell. There is no in-app configuration editor.

The default launches bundled Chromium. Without it, `playwright-cli` tries the Chrome channel, which is not installed in the image.

## Idle timeout

The default config closes a headless session after 30 minutes without a command:

```json
{ "timeouts": { "idle": 1800000 } }
```

Override it per `open` with `--idle-timeout=<milliseconds>`:

```yaml
command: -s=kitchen open https://example.com --idle-timeout=300000
```

Use `--idle-timeout=0` to disable the idle timeout for that session.

There is no hard maximum lifetime. A session that keeps receiving commands stays open until it is closed, the idle timeout expires, or the app restarts.

## Structured output

Add `--json` when an automation or LLM needs parseable output:

```yaml
action: playwright_cli.run_command
response_variable: page
data:
  command: -s=kitchen snapshot --json
```

The action returns:

```yaml
ok: true
stdout: '{"snapshot": [...]}'
stderr: ''
```

Without `--json`, output is the CLI's normal text. The app does not parse or reformat it.

## Common tasks

### Read a page and click an element

```yaml
action:
  - action: playwright_cli.run_command
    data:
      command: -s=kitchen open https://demo.playwright.dev/todomvc

  - action: playwright_cli.run_command
    response_variable: page
    data:
      command: -s=kitchen snapshot --json

  - action: playwright_cli.run_command
    data:
      command: -s=kitchen fill e2 "Buy milk"

  - action: playwright_cli.run_command
    data:
      command: -s=kitchen press Enter
```

Element refs such as `e2` come from the latest `snapshot`.

### Screenshot

```yaml
command: -s=kitchen screenshot --filename=.playwright-cli/kitchen.png
```

The CLI prints the file path. Save it to a private Home Assistant URL with `playwright_cli.save_artifact`; see [Actions and LLM tools](actions.md).

### PDF

```yaml
command: -s=kitchen pdf --filename=.playwright-cli/kitchen.pdf
```

### Console and network

```yaml
command: -s=kitchen console
command: -s=kitchen requests
command: -s=kitchen request 1
```

These work for every session, including ephemeral ones.

### Cookies and storage

```yaml
command: -s=kitchen cookie-list --json
command: -s=kitchen localstorage-list --json
```

### JavaScript evaluation and arbitrary Playwright code

```yaml
command: -s=kitchen eval "document.title"
command: -s=kitchen run-code "async page => await page.title()"
```

`eval` and `run-code` are powerful. They execute code inside the app container.

### Device emulation and mobile pages

```yaml
command: -s=kitchen open https://example.com --device="iPhone 15"
command: -s=kitchen open https://example.com --mobile
```

## Paths and storage

The app's working directory and `HOME` are `/data`.

- CLI artifacts: `/data/.playwright-cli/`
- Default config: `/data/.playwright/cli.config.json`
- Browser profiles: under `/data`
- API token: `/data/api-token`
- Uploaded files: must already exist inside the container

The app does not mount Home Assistant's `/config`, `/share`, or `/media`. `upload <file>` only works with a path that exists inside the app container. Saving a screenshot into `/config` is not available; use `save_artifact` to copy it out.

Artifact paths exposed to the integration are relative to `/data` and must resolve inside `/data/.playwright-cli`.

## Networking

`localhost` and `127.0.0.1` refer to the app container, not the Home Assistant host or your workstation.

Use Home Assistant's internal hostnames, for example:

```yaml
command: -s=kitchen open http://homeassistant:8123
command: -s=kitchen open http://supervisor
```

LAN addresses and public sites work if the app can reach them.

## Differences from a local terminal

- Output is returned as `stdout`/`stderr`; there is no interactive terminal.
- `--headed`, the `show` dashboard, `pause`, and `step` are not useful without a display.
- Chrome, Edge, Firefox, and WebKit channels are not installed; bundled Chromium is.
- Host files, host browser profiles, and browser extensions are not available.
- One command runs per action, with an approximately 120-second timeout and a 4 MiB output cap.
- Sessions end when the app restarts. Persistent profile data remains.
- Browser events require a persistent profile; see [Events](events.md).

For `playwright-cli` command details, run:

```yaml
action: playwright_cli.run_command
data:
  command: --help
```

or for one command:

```yaml
command: --help open
```

or see the upstream [playwright-cli documentation](https://github.com/microsoft/playwright-cli).
