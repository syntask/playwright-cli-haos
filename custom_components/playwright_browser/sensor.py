"""Diagnostic entities for the Playwright app connection."""

from __future__ import annotations

from homeassistant.components.sensor import SensorEntity, SensorEntityDescription
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN

DESCRIPTION = SensorEntityDescription(
    key="sessions",
    name="CLI sessions",
    icon="mdi:web",
)


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    """Set up diagnostic sensors."""
    coordinator = hass.data[DOMAIN][entry.entry_id]["coordinator"]
    async_add_entities([PlaywrightSessionsSensor(coordinator, entry)])


class PlaywrightSessionsSensor(CoordinatorEntity, SensorEntity):
    """Expose the last CLI session-list response for diagnostics."""

    entity_description = DESCRIPTION
    _attr_has_entity_name = True

    def __init__(self, coordinator, entry: ConfigEntry) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = f"{entry.entry_id}_sessions"
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, entry.entry_id)},
            name="Playwright Browser",
            manufacturer="Microsoft Playwright",
            model="playwright-cli",
        )

    @property
    def native_value(self) -> str:
        """Return the raw session-list output (CLI formats may vary by version)."""
        return str(self.coordinator.data.get("sessions", "unknown"))[:255]

    @property
    def extra_state_attributes(self) -> dict:
        """Expose the full session listing for diagnostics."""
        return {"sessions": self.coordinator.data.get("sessions", "")}
