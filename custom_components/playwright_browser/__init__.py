"""Playwright Browser integration."""

from __future__ import annotations

import logging

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import CONF_HOST, Platform
from homeassistant.core import HomeAssistant, ServiceCall, SupportsResponse
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .api import PlaywrightApi, PlaywrightApiError
from .const import (
    CONF_API_TOKEN,
    DOMAIN,
    SCAN_INTERVAL,
    SERVICE_GET_ARTIFACT,
    SERVICE_RUN_COMMAND,
)

_LOGGER = logging.getLogger(__name__)
type PlaywrightConfigEntry = ConfigEntry[PlaywrightApi]


async def async_setup_entry(hass: HomeAssistant, entry: PlaywrightConfigEntry) -> bool:
    """Set up a configured app connection."""
    api = PlaywrightApi(
        async_get_clientsession(hass), entry.data[CONF_HOST], entry.data[CONF_API_TOKEN]
    )

    last_event_sequence = 0
    last_event_instance: str | None = None

    async def async_update_data() -> dict:
        nonlocal last_event_sequence, last_event_instance
        try:
            sessions = await api.sessions()
            event_data = await api.events(
                last_event_sequence,
                limit=200,
                instance_id=last_event_instance,
            )
            last_event_sequence = event_data.get("sequence", last_event_sequence)
            last_event_instance = event_data.get("instance_id", last_event_instance)
            return {
                "sessions": sessions.get("sessions", []),
                "events": event_data.get("events", []),
                "sequence": event_data.get("sequence", 0),
                "instance_id": last_event_instance,
            }
        except PlaywrightApiError as err:
            raise UpdateFailed(str(err)) from err

    coordinator = DataUpdateCoordinator(
        hass,
        _LOGGER,
        name="Playwright Browser",
        update_method=async_update_data,
        update_interval=SCAN_INTERVAL,
    )
    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = {"api": api, "coordinator": coordinator}
    await coordinator.async_config_entry_first_refresh()
    await hass.config_entries.async_forward_entry_setups(entry, [Platform.SENSOR, Platform.EVENT])

    async def run_command(call: ServiceCall) -> dict:
        try:
            result = await api.command(
                call.data.get("session", "default"),
                call.data["command"],
                call.data.get("arguments", []),
            )
        except PlaywrightApiError as err:
            raise HomeAssistantError(str(err)) from err
        hass.bus.async_fire(
            f"{DOMAIN}_command",
            {
                "session": call.data.get("session", "default"),
                "command": call.data["command"],
                "success": result.get("ok", False),
            },
        )
        await coordinator.async_request_refresh()
        return result

    async def get_artifact(call: ServiceCall) -> dict:
        try:
            return await api.artifact(call.data["path"])
        except PlaywrightApiError as err:
            raise HomeAssistantError(str(err)) from err

    hass.services.async_register(
        DOMAIN,
        SERVICE_RUN_COMMAND,
        run_command,
        supports_response=SupportsResponse.OPTIONAL,
    )
    hass.services.async_register(
        DOMAIN,
        SERVICE_GET_ARTIFACT,
        get_artifact,
        supports_response=SupportsResponse.ONLY,
    )
    return True


async def async_unload_entry(hass: HomeAssistant, entry: PlaywrightConfigEntry) -> bool:
    """Unload a config entry."""
    unloaded = await hass.config_entries.async_unload_platforms(entry, [Platform.SENSOR, Platform.EVENT])
    if unloaded:
        hass.services.async_remove(DOMAIN, SERVICE_RUN_COMMAND)
        hass.services.async_remove(DOMAIN, SERVICE_GET_ARTIFACT)
        hass.data[DOMAIN].pop(entry.entry_id)
    return unloaded
