"""Command event entity."""

from __future__ import annotations

from homeassistant.components.event import EventEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN

EVENT_TYPES = ["command_started", "command_completed", "command_failed"]


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    """Set up the command event entity."""
    coordinator = hass.data[DOMAIN][entry.entry_id]["coordinator"]
    async_add_entities([PlaywrightCommandEvent(coordinator, entry)])


class PlaywrightCommandEvent(CoordinatorEntity, EventEntity):
    """Expose recently executed CLI commands as Home Assistant event entity events."""

    _attr_has_entity_name = True
    _attr_name = "Command event"
    _attr_event_types = EVENT_TYPES

    def __init__(self, coordinator, entry: ConfigEntry) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = f"{entry.entry_id}_command_event"
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, entry.entry_id)}, name="Playwright Browser"
        )
        self._last_seen = 0

    def _handle_coordinator_update(self) -> None:
        """Emit all newly observed command events."""
        for event in self.coordinator.data.get("events", []):
            if event.get("id", 0) <= self._last_seen:
                continue
            self._last_seen = event["id"]
            event_type = event.get("type")
            if event_type in EVENT_TYPES:
                self._trigger_event(
                    event_type,
                    {
                        "session": event.get("session"),
                        "command": event.get("command"),
                        "success": event_type == "command_completed",
                    },
                )
        super()._handle_coordinator_update()
