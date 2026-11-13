"""Config flow for Playwright Browser."""

from __future__ import annotations

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.const import CONF_HOST
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.selector import TextSelector, TextSelectorConfig, TextSelectorType

from .api import PlaywrightApi, PlaywrightApiError
from .const import CONF_API_TOKEN, DEFAULT_HOST, DOMAIN


class PlaywrightBrowserConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Set up a connection to the app API."""

    VERSION = 1

    async def async_step_user(self, user_input: dict | None = None):
        errors: dict[str, str] = {}
        if user_input is not None:
            host = user_input[CONF_HOST].rstrip("/")
            token = user_input[CONF_API_TOKEN]
            try:
                await _validate_connection(self.hass, host, token)
            except PlaywrightApiError:
                errors["base"] = "cannot_connect"
            else:
                await self.async_set_unique_id(DOMAIN)
                self._abort_if_unique_id_configured()
                return self.async_create_entry(
                    title="Playwright Browser", data={CONF_HOST: host, CONF_API_TOKEN: token}
                )

        schema = vol.Schema(
            {
                vol.Required(CONF_HOST, default=DEFAULT_HOST): str,
                vol.Required(CONF_API_TOKEN): TextSelector(
                    TextSelectorConfig(type=TextSelectorType.PASSWORD)
                ),
            }
        )
        return self.async_show_form(step_id="user", data_schema=schema, errors=errors)


async def _validate_connection(hass: HomeAssistant, host: str, token: str) -> None:
    """Check that the configured app is reachable and authenticated."""
    api = PlaywrightApi(async_get_clientsession(hass), host, token)
    await api.events()
