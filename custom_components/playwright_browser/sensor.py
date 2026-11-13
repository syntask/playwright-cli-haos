"""Diagnostic entities for the Playwright app connection."""

from __future__ import annotations

from homeassistant.components.sensor import SensorEntity, SensorEntityDescription
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
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
    session_entities: dict[str, PlaywrightSessionSensor] = {}
    async_add_entities([PlaywrightSessionsSensor(coordinator, entry)])

    @callback
    def add_session_entities() -> None:
        """Add a status entity and device for each discovered browser session."""
        new_entities = []
        for session in coordinator.data.get("sessions", []):
            name = session.get("name")
            if not name or name in session_entities:
                continue
            entity = PlaywrightSessionSensor(coordinator, entry, name)
            session_entities[name] = entity
            new_entities.append(entity)
        if new_entities:
            async_add_entities(new_entities)

    add_session_entities()
    entry.async_on_unload(coordinator.async_add_listener(add_session_entities))


class PlaywrightSessionsSensor(CoordinatorEntity, SensorEntity):
    """Expose active session count and names for diagnostics."""

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
    def native_value(self) -> int:
        """Return the number of active browser sessions."""
        return len(self.coordinator.data.get("sessions", []))

    @property
    def extra_state_attributes(self) -> dict:
        """Expose the full session listing for diagnostics."""
        return {"sessions": self.coordinator.data.get("sessions", [])}


class PlaywrightSessionSensor(CoordinatorEntity, SensorEntity):
    """Represent one named browser session as its own HA device."""

    _attr_has_entity_name = True
    _attr_name = "Status"
    _attr_icon = "mdi:web-check"

    def __init__(self, coordinator, entry: ConfigEntry, session_name: str) -> None:
        super().__init__(coordinator)
        self._session_name = session_name
        self._last_url = self._find_latest_url(coordinator.data.get("events", []))
        self._attr_unique_id = f"{entry.entry_id}_session_{session_name}"
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, f"{entry.entry_id}_{session_name}")},
            via_device=(DOMAIN, entry.entry_id),
            name=f"Browser session {session_name}",
            manufacturer="Microsoft Playwright",
            model="Persistent browser session",
        )

    @property
    def native_value(self) -> str:
        """Return the current session lifecycle state."""
        return "open" if self._session_info and self._session_info.get("status") == "open" else "closed"

    @property
    def _session_info(self) -> dict | None:
        """Find this session in the most recent CLI listing."""
        return next(
            (
                session
                for session in self.coordinator.data.get("sessions", [])
                if session.get("name") == self._session_name
            ),
            None,
        )

    @property
    def extra_state_attributes(self) -> dict:
        """Expose browser mode and most recently observed page URL."""
        info = self._session_info or {}
        return {
            "session": self._session_name,
            "browser_type": info.get("browserType"),
            "persistent": info.get("persistent"),
            "headed": info.get("headed"),
            "attached": info.get("attached"),
            "url": self._last_url,
        }

    def _handle_coordinator_update(self) -> None:
        """Retain the latest URL across incremental event polls."""
        self._last_url = self._find_latest_url(self.coordinator.data.get("events", [])) or self._last_url
        super()._handle_coordinator_update()

    def _find_latest_url(self, events: list[dict]) -> str | None:
        """Return the latest navigation URL for this session."""
        return next(
            (
                event.get("url")
                for event in reversed(events)
                if event.get("session") == self._session_name
                and event.get("type") in {"navigation", "page_opened"}
                and event.get("url")
            ),
            None,
        )
