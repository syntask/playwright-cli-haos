"""Device control tools contributed by Playwright CLI."""

from __future__ import annotations

import probatio

from homeassistant.components import llm
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.llm import LLMContext

from .api import PlaywrightApi, PlaywrightApiError
from .const import DOMAIN


class PlaywrightCommandTool(llm.Tool):
    """Execute a playwright-cli command line exactly as written."""

    name = f"{DOMAIN}__command"
    title = "Run a Playwright CLI command"
    description = (
        "Run one playwright-cli command line, exactly like the terminal. Use normal CLI syntax, "
        "including the session selector and options: '-s=kitchen open https://example.com', "
        "'-s=kitchen snapshot --json', 'click e3', or 'fill e2 \"hello world\"'. Quotes are parsed, "
        "but no shell is used. Browser commands can change web pages and access external sites."
    )
    integration = DOMAIN
    annotations = llm.ToolAnnotations(
        read_only=False,
        destructive=True,
        idempotent=False,
        open_world=True,
    )
    parameters = probatio.Schema(
        {
            "command": str,
        }
    )

    async def async_call(
        self,
        hass: HomeAssistant,
        tool_input: llm.ToolInput,
        llm_context: LLMContext,
    ) -> llm.ToolResult:
        """Send a command line to the configured app."""
        del llm_context
        config_entries = hass.config_entries.async_entries(DOMAIN)
        if not config_entries:
            return llm.ToolResult(data={"error": "Playwright CLI is not configured"}, error=True)
        entry = config_entries[0]
        api: PlaywrightApi = hass.data[DOMAIN][entry.entry_id]["api"]
        command = tool_input.tool_args.get("command")
        if not command:
            return llm.ToolResult(data={"error": "command is required"}, error=True)
        try:
            result = await api.command(command)
        except PlaywrightApiError as err:
            return llm.ToolResult(data={"error": str(err)}, error=True)
        hass.bus.async_fire(
            f"{DOMAIN}_command",
            {
                "command": command,
                "success": result.get("ok", False),
            },
        )
        return llm.ToolResult(data=result)


class PlaywrightEventsTool(llm.Tool):
    """Read browser and command events observed by the app."""

    name = f"{DOMAIN}__events"
    title = "Read Playwright CLI events"
    description = (
        "Read recent Playwright CLI command results and browser page, console, network, dialog, "
        "download, worker, and WebSocket events. Pass back the returned instance_id and sequence "
        "to read newer events, including after an app restart."
    )
    integration = DOMAIN
    annotations = llm.ToolAnnotations(
        read_only=True,
        destructive=False,
        idempotent=True,
        open_world=True,
    )
    parameters = probatio.Schema(
        {
            probatio.Optional("after"): int,
            probatio.Optional("limit"): int,
            probatio.Optional("instance_id"): str,
        }
    )

    async def async_call(
        self,
        hass: HomeAssistant,
        tool_input: llm.ToolInput,
        llm_context: LLMContext,
    ) -> llm.ToolResult:
        """Return bounded event history from the app."""
        del llm_context
        config_entries = hass.config_entries.async_entries(DOMAIN)
        if not config_entries:
            return llm.ToolResult(data={"error": "Playwright CLI is not configured"}, error=True)
        entry = config_entries[0]
        api: PlaywrightApi = hass.data[DOMAIN][entry.entry_id]["api"]
        args = tool_input.tool_args
        try:
            return llm.ToolResult(
                data=await api.events(
                    max(0, args.get("after", 0)),
                    min(100, max(1, args.get("limit", 20))),
                    args.get("instance_id"),
                )
            )
        except PlaywrightApiError as err:
            return llm.ToolResult(data={"error": str(err)}, error=True)


@callback
def async_get_tools(
    hass: HomeAssistant, llm_context: LLMContext, api_id: str
) -> llm.LLMTools | None:
    """Contribute the command tool to Device control, not the admin API."""
    del hass, llm_context
    if api_id != "assist":
        return None
    return llm.LLMTools(
        tools=[PlaywrightCommandTool(), PlaywrightEventsTool()],
        prompt=(
            "Use playwright_cli__command with a complete playwright-cli command line, exactly "
            "as you would type it in a terminal. Include the session selector when you want a named "
            "session, for example '-s=kitchen open https://example.com', then '-s=kitchen snapshot'. "
            "Add --json to get structured output. Use '--help' to discover commands. Use "
            "playwright_cli__events to read command and browser events. Do not include a shell; "
            "pipes, redirects, and command chaining are not available. Do not assume a page action "
            "succeeded unless its result confirms it."
        ),
    )
