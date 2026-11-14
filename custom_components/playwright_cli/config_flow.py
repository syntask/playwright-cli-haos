"""Config flow for Playwright CLI."""

from __future__ import annotations

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.const import CONF_HOST
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.selector import TextSelector, TextSelectorConfig, TextSelectorType
from homeassistant.helpers.service_info.hassio import HassioServiceInfo

from .api import PlaywrightApi, PlaywrightApiError
from .const import CONF_API_TOKEN, DEFAULT_HOST, DOMAIN


class PlaywrightCliConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Set up a connection to the app API."""

    VERSION = 1

    async def async_step_hassio(self, discovery_info: HassioServiceInfo):
        """Handle discovery from the installed app."""
        host_name = str(discovery_info.config.get("host", "")).strip()
        port = str(discovery_info.config.get("port", "8080")).strip() or "8080"
        token = str(discovery_info.config.get("token", "")).strip()
        if not host_name or not token:
            return self.async_abort(reason="invalid_discovery")

        host = host_name if "://" in host_name else f"http://{host_name}:{port}"
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured(
            updates={CONF_HOST: host.rstrip("/"), CONF_API_TOKEN: token}
        )
        try:
            await _validate_connection(self.hass, host, token)
        except PlaywrightApiError:
            return self.async_abort(reason="cannot_connect")

        self._discovered_data = {
            CONF_HOST: host.rstrip("/"),
            CONF_API_TOKEN: token,
        }
        self._set_confirm_only()
        return self.async_show_form(step_id="hassio_confirm")

    async def async_step_hassio_confirm(self, user_input: dict | None = None):
        """Confirm the discovered app."""
        if user_input is not None:
            return self.async_create_entry(
                title="Playwright CLI",
                data=self._discovered_data,
            )
        return self.async_show_form(step_id="hassio_confirm")

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
                    title="Playwright CLI", data={CONF_HOST: host, CONF_API_TOKEN: token}
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
