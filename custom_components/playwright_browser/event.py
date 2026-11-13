"""Command event entity."""

from __future__ import annotations

from homeassistant.components.event import EventEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN

EVENT_TYPES = [
    "command_started",
    "command_completed",
    "command_failed",
    "browser_connected",
    "browser_disconnected",
    "browser_context_closed",
    "page_opened",
    "popup_opened",
    "navigation",
    "frame_attached",
    "frame_detached",
    "dom_content_loaded",
    "page_load",
    "page_closed",
    "page_crash",
    "page_error",
    "web_error",
    "console_message",
    "network_request",
    "network_response",
    "network_request_finished",
    "network_request_failed",
    "dialog",
    "download",
    "file_chooser",
    "worker_created",
    "service_worker_created",
    "websocket_opened",
    "websocket_frame",
    "websocket_closed",
]


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
        self._last_instance: str | None = None

    def _handle_coordinator_update(self) -> None:
        """Emit all newly observed command events."""
        instance_id = self.coordinator.data.get("instance_id")
        if instance_id != self._last_instance:
            self._last_instance = instance_id
            self._last_seen = 0
        for event in self.coordinator.data.get("events", []):
            if event.get("id", 0) <= self._last_seen:
                continue
            self._last_seen = event["id"]
            event_type = event.get("type")
            if event_type in EVENT_TYPES:
                attributes = {
                    key: event[key]
                    for key in (
                        "timestamp",
                        "session",
                        "command",
                        "success",
                        "browser_type",
                        "url",
                        "opener_url",
                        "main_frame",
                        "level",
                        "message",
                        "line",
                        "column",
                        "method",
                        "resource_type",
                        "navigation",
                        "status",
                        "status_text",
                        "error",
                        "dialog_type",
                        "default_value",
                        "filename",
                        "multiple",
                        "direction",
                        "bytes",
                    )
                    if key in event
                }
                self._trigger_event(
                    event_type,
                    attributes,
                )
        super()._handle_coordinator_update()
