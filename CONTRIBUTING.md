# Contributing

This repository contains two installable pieces:

- `playwright_cli/` — the Home Assistant app. It packages `playwright-cli`, Chromium, and a small Node.js HTTP API.
- `custom_components/playwright_cli/` — the companion integration. It registers Home Assistant actions, LLM tools, discovery handling, and the private artifact view.

The design goal is a thin command-layer port of `playwright-cli`, not a higher-level browser abstraction. Commands are passed through as complete CLI lines. The app does not add session flags, rewrite output, or maintain its own session registry.

## Local development

Requirements: Node.js 22+, npm, Docker (optional), and Python 3.12+ for integration checks.

```sh
cd playwright_cli
npm ci
npm test
```

Run the API locally:

```sh
npm install --global @playwright/cli@0.1.24
npx playwright install chromium

export PLAYWRIGHT_DATA_DIR="$(mktemp -d)"
export PLAYWRIGHT_API_TOKEN=dev-token-dev-token-dev-token-1234
npm start
```

`PLAYWRIGHT_DATA_DIR` keeps generated tokens, the default CLI config, browser profiles, and artifacts out of your home directory. If it is unset, the app uses `$HOME`, matching the container where `HOME=/data`.

Point the integration at `http://localhost:8080` with the same token. The API listens on port `8080`; `/health` is unauthenticated, while `/api/v1/*` requires a bearer token.

On two shells, check the command path directly:

```sh
curl -s http://localhost:8080/health
curl -s -X POST http://localhost:8080/api/v1/command \
  -H "Authorization: Bearer $PLAYWRIGHT_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"command":"-s=dev open data:text/html,<h1>hello</h1>"}'
curl -s -X POST http://localhost:8080/api/v1/command \
  -H "Authorization: Bearer $PLAYWRIGHT_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"command":"-s=dev snapshot --json"}'
```

The default CLI config is installed at `$PLAYWRIGHT_DATA_DIR/.playwright/cli.config.json` on first start when the file does not exist. It enables Chromium with the container-safe launch flags and a 30-minute idle timeout. Delete the file to regenerate it.

## Integration checks

There is no Python test suite yet. At minimum, compile-check the integration:

```sh
python -m compileall custom_components/playwright_cli
```

Validate JSON and YAML files before committing:

```sh
python -m json.tool hacs.json >/dev/null
python -m json.tool custom_components/playwright_cli/manifest.json >/dev/null
python -m json.tool custom_components/playwright_cli/translations/en.json >/dev/null
```

## Code guidelines

- Keep the command path thin. Public callers send one `command` string. Do not reintroduce a `session` field, split arguments, automatic `--persistent`, or automatic `--json`.
- Never invoke a shell. `command-line.js` tokenizes quotes and escapes, then `command.js` calls `execFile` with an argument vector.
- Session names are Playwright's business. Callers use `-s=name` or `PLAYWRIGHT_CLI_SESSION`.
- The default config is a starting point, not a policy layer. Users can override it with `--config` or edit the file.
- Browser events are best effort. They require a persistent profile so the app can read `DevToolsActivePort` and connect over loopback CDP.
- Do not add fake entities or devices. The integration exists for actions, LLM tools, discovery, and the artifact view.
- LLM tools are exposed through the dedicated `playwright_cli` API in `llm_api.py`. Keep tool names prefixed with `playwright_cli__`.
- Artifacts must stay private. Do not write them into Home Assistant's `www` directory.

## Validation workflows

GitHub Actions runs two workflows:

- `.github/workflows/validate.yml` runs HACS validation, hassfest, the app tests, and JSON/compile checks on every push, pull request, and nightly schedule.
- `.github/workflows/publish.yml` builds and pushes the `amd64` and `aarch64` images when a `v*` tag is pushed, or when started manually with a version.

Standard GitHub-hosted runners are free for this public repository.

## Building the image

```sh
docker build -f playwright_cli/Dockerfile -t playwright-cli-haos:local .
```

Smoke-test the CLI and default config inside the image:

```sh
docker run --rm -v "$(mktemp -d):/data" playwright-cli-haos:local sh -c '
  node src/server.js &
  sleep 2
  playwright-cli -s=smoke open "data:text/html,<h1>smoke</h1>" --json
  playwright-cli -s=smoke snapshot --json
  playwright-cli -s=smoke close --json
'
```

## Publishing

Images are published by `.github/workflows/publish.yml` when a `v*` tag is pushed. The workflow builds `amd64` and `aarch64` with the repository's `GITHUB_TOKEN`, so no personal access token is needed. It can also be started manually from the Actions tab with a version number.

To build and push manually instead:

```sh
docker login ghcr.io --username syntask
docker buildx build --platform linux/amd64 -f playwright_cli/Dockerfile \
  -t ghcr.io/syntask/playwright-cli-haos-amd64:latest \
  -t ghcr.io/syntask/playwright-cli-haos-amd64:0.2.0 \
  --push .
docker buildx build --platform linux/arm64 -f playwright_cli/Dockerfile \
  -t ghcr.io/syntask/playwright-cli-haos-aarch64:latest \
  -t ghcr.io/syntask/playwright-cli-haos-aarch64:0.2.0 \
  --push .
```

Manual pushes need a GitHub token with package write access. After the first publish, make both GHCR packages public so Home Assistant can pull them without credentials.

When releasing:

1. Bump `playwright_cli/config.yaml` version.
2. Bump `custom_components/playwright_cli/manifest.json` version.
3. Bump `playwright_cli/package.json` version and run `npm install --package-lock-only` in `playwright_cli`.
4. Commit, tag with the matching `v<version>`, and push the tag.
5. Wait for the publish workflow to finish and make any new packages public.
6. Publish a full GitHub release from the tag; a tag alone is not enough.
7. Update the changelog or release notes.

## Licensing

The project source is MIT licensed in `LICENSE`. The app image bundles Microsoft Playwright (Apache-2.0), Chromium (BSD-3-Clause and third-party licenses), `ws` (MIT), and ffmpeg (LGPL). `THIRD_PARTY_NOTICES.md` summarizes them, and the Dockerfile copies the full upstream texts into `/usr/share/licenses/playwright-cli/`. Do not remove that directory or `/usr/share/doc/` from the image.

## Documentation

User-facing docs live in `docs/` and are linked from `README.md`. The app listing description is `playwright_cli/DOCS.md`. The Marketplace manifest is `hacs.json`; its filename is retained for Marketplace compatibility. Keep these in sync with the public action and API shape.

- `docs/installation.md` — install order and discovery.
- `docs/usage.md` — CLI behavior, sessions, config, and paths.
- `docs/actions.md` — Home Assistant actions, LLM tools, and examples.
- `docs/api.md` — HTTP and WebSocket API.
- `docs/events.md` — event capture and its limitations.
- `docs/security.md` — exposure, tokens, and isolation.

## Security expectations

`run-code` and `eval` are arbitrary code execution inside the app container. The browser runs as root with `--no-sandbox` because it is already inside a container. Do not expose the API to the public internet. Do not add host filesystem mounts without reviewing the impact on command and file access.
