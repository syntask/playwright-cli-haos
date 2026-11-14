# Security

Playwright CLI controls a real browser and can execute arbitrary code. Treat access to the action, LLM tools, and API token as equivalent to shell access inside the app container.

## Trust boundaries

- Home Assistant controls who can call the action and which conversation agents can use the LLM tools.
- The app API requires a bearer token for every route except `/health`.
- The browser runs inside the app container as root with `--no-sandbox`. The sandbox flag is safe only because the process is already containerized. Do not run the same image outside a container as an untrusted user.
- The app has no host filesystem mounts. It cannot read Home Assistant's `/config`, `/share`, or `/media` unless you add a mount.
- Chromium's debug port is bound to `127.0.0.1` inside the container. The app API does not expose CDP.

## Tokens

Leave the app's **API token** option blank to generate a random token on first start. The token is stored in `/data/api-token` with mode `0600`.

A configured token must be at least 32 characters.

Discovery sends the token to the Supervisor over the internal Supervisor API. Discovery is not sent to the public network. If you configure the integration manually, copy the token and keep it out of dashboards, logs, and source control.

Rotating the token:

1. Set a new value in the app options, or delete `/data/api-token` to generate a new one on restart.
2. Restart the app.
3. Update the integration through discovery or by reconfiguring the entry.

## Network exposure

Do not publish port `8080` to the internet. The app is designed to be reached through the Home Assistant app network at `http://<app-id>:8080`.

The app can reach any network the container can reach. `localhost` means the container; `homeassistant`, `supervisor`, and LAN hostnames are reachable. Use Home Assistant's network controls and your firewall if you need to restrict where the browser can connect.

## Arbitrary code execution

These commands execute code in the app container:

- `eval`
- `run-code`
- `upload` of files already present in the container

They are not sandboxed beyond the container itself. Only expose the command tool to conversation agents and users you would trust with a shell in that container.

## Artifacts

CLI artifacts are written under `/data/.playwright-cli` inside the app.

- `get_artifact` returns base64 bytes over the authenticated API. It does not create a URL.
- `save_artifact` copies a file into `/config/.playwright_cli/artifacts` and returns a signed Home Assistant URL.
- Signed URLs are valid for 30 days or until Home Assistant restarts.
- Artifacts are not placed in `www` or served through `/local`.
- Destination paths must be relative and use only letters, numbers, dots, dashes, and underscores.

Screenshots, PDFs, traces, videos, and saved storage state can contain credentials, personal data, or page content. Delete artifacts you no longer need.

## Browser data

Persistent profiles store cookies, local storage, IndexedDB, cache, and history under `/data`. Anyone who can run commands in the same session can use those credentials.

Use separate sessions for separate trust levels:

```text
-s=banking
-s=public
```

Use `delete-data` to wipe a session profile:

```yaml
action: playwright_cli.run_command
data:
  command: -s=banking delete-data
```

Removing the app with its data deletes everything under `/data`.

## LLM tools

The command tool is marked destructive and open-world. Conversation agent access should be deliberate:

- Only select the Playwright CLI API for conversation agents you trust.
- Do not expose it to agents that accept untrusted input.
- Prefer narrow, named sessions for automations.
- Remember that page content is untrusted. A page can display instructions designed to manipulate an LLM. Do not let the model treat page text as trusted instructions.
- Review tool calls and their results when experimenting.

## Reporting issues

Report security issues privately to the maintainer rather than opening a public issue with exploit details.
