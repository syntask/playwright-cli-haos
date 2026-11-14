"""Playwright CLI integration."""

from __future__ import annotations

import base64
import binascii
import re
from datetime import timedelta
from pathlib import Path, PurePosixPath
from urllib.parse import quote

from aiohttp import web

from homeassistant.components.http import HomeAssistantView
from homeassistant.components.http.auth import async_sign_path
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import CONF_HOST
from homeassistant.core import HomeAssistant, ServiceCall, SupportsResponse
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import device_registry as dr, entity_registry as er
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.typing import ConfigType

from .api import PlaywrightApi, PlaywrightApiError
from .const import (
    CONF_API_TOKEN,
    DOMAIN,
    SERVICE_GET_ARTIFACT,
    SERVICE_RUN_COMMAND,
    SERVICE_SAVE_ARTIFACT,
)

type PlaywrightConfigEntry = ConfigEntry[PlaywrightApi]
LEGACY_PLATFORMS = frozenset({"camera", "event", "sensor"})
ARTIFACT_DIRECTORY = ".playwright_cli/artifacts"
ARTIFACT_URL = "/api/playwright_cli/artifact"
SIGNED_URL_LIFETIME = timedelta(days=30)
MAX_ARTIFACT_BYTES = 20 * 1024 * 1024
DESTINATION_PART = re.compile(r"[A-Za-z0-9_-][A-Za-z0-9._-]*")


class PlaywrightArtifactView(HomeAssistantView):
    """Serve saved artifacts through authenticated or signed URLs."""

    url = f"{ARTIFACT_URL}/{{path:.*}}"
    name = "api:playwright_cli:artifact"
    requires_auth = True

    def __init__(self, hass: HomeAssistant) -> None:
        """Initialize the view."""
        self._hass = hass

    async def get(self, request: web.Request, path: str) -> web.StreamResponse:
        """Return a saved artifact."""
        del request
        target = await self._hass.async_add_executor_job(self._resolve, path)
        return web.FileResponse(target)

    def _resolve(self, path: str) -> Path:
        """Resolve an artifact path inside the private artifact directory."""
        root = Path(self._hass.config.path(ARTIFACT_DIRECTORY)).resolve()
        target = (root / path).resolve()
        if not target.is_relative_to(root) or not target.is_file():
            raise web.HTTPNotFound
        return target


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Register the private artifact view."""
    del config
    hass.http.register_view(PlaywrightArtifactView(hass))
    return True


def _async_remove_legacy_registry_entries(
    hass: HomeAssistant, entry: PlaywrightConfigEntry
) -> None:
    """Remove entities and devices created by earlier versions."""
    entity_registry = er.async_get(hass)
    for entity in er.async_entries_for_config_entry(entity_registry, entry.entry_id):
        if entity.domain in LEGACY_PLATFORMS:
            entity_registry.async_remove(entity.entity_id)

    device_registry = dr.async_get(hass)
    for device in dr.async_entries_for_config_entry(device_registry, entry.entry_id):
        if any(identifier[0] == DOMAIN for identifier in device.identifiers):
            device_registry.async_remove_device(device.id)


def _validate_destination(destination: object) -> str:
    """Validate a relative path for the private artifact store."""
    if not isinstance(destination, str):
        raise HomeAssistantError("destination must be a relative path")
    destination = destination.strip()
    if not destination or len(destination) > 512 or "\\" in destination:
        raise HomeAssistantError("destination must be a relative path")
    path = PurePosixPath(destination)
    if (
        path.is_absolute()
        or any(part in ("", ".", "..") for part in destination.split("/"))
        or any(DESTINATION_PART.fullmatch(part) is None for part in path.parts)
    ):
        raise HomeAssistantError(
            "destination must be a relative path with letters, numbers, dots, dashes, and underscores"
        )
    return str(path)


def _write_private_artifact(config_dir: str, destination: str, data: bytes) -> None:
    """Write an artifact into the private artifact directory."""
    root = (Path(config_dir) / ARTIFACT_DIRECTORY).resolve()
    target = (root / destination).resolve()
    if not target.is_relative_to(root):
        raise ValueError("destination is outside the artifact directory")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)


async def async_setup_entry(hass: HomeAssistant, entry: PlaywrightConfigEntry) -> None:
    """Set up a configured app connection."""
    api = PlaywrightApi(
        async_get_clientsession(hass), entry.data[CONF_HOST], entry.data[CONF_API_TOKEN]
    )
    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = {"api": api}
    _async_remove_legacy_registry_entries(hass, entry)

    async def run_command(call: ServiceCall) -> dict:
        if "session" in call.data:
            raise HomeAssistantError(
                "Include the session in command with -s=<name>, for example "
                "-s=kitchen open https://example.com"
            )
        command = call.data.get("command")
        if not command:
            raise HomeAssistantError("command is required")
        try:
            result = await api.command(command)
        except PlaywrightApiError as err:
            raise HomeAssistantError(str(err)) from err
        hass.bus.async_fire(
            f"{DOMAIN}_command",
            {
                "command": command,
                "success": result.get("ok", False),
            },
        )
        return result

    async def get_artifact(call: ServiceCall) -> dict:
        try:
            return await api.artifact(call.data["path"])
        except PlaywrightApiError as err:
            raise HomeAssistantError(str(err)) from err

    async def save_artifact(call: ServiceCall) -> dict:
        destination = _validate_destination(call.data.get("destination"))
        try:
            artifact = await api.artifact(call.data["path"])
            data = base64.b64decode(artifact["data_base64"], validate=True)
        except PlaywrightApiError as err:
            raise HomeAssistantError(str(err)) from err
        except (KeyError, TypeError, ValueError, binascii.Error) as err:
            raise HomeAssistantError("The app returned an invalid artifact") from err
        if len(data) > MAX_ARTIFACT_BYTES:
            raise HomeAssistantError("Artifact exceeds 20 MiB")
        try:
            await hass.async_add_executor_job(
                _write_private_artifact, hass.config.config_dir, destination, data
            )
        except (OSError, ValueError) as err:
            raise HomeAssistantError(f"Could not save the artifact: {err}") from err
        signed_url = async_sign_path(
            hass,
            f"{ARTIFACT_URL}/{quote(destination, safe='/')}",
            SIGNED_URL_LIFETIME,
        )
        return {
            "url": signed_url,
            "destination": destination,
            "bytes": len(data),
            "content_type": artifact.get("content_type"),
            "expires_in": int(SIGNED_URL_LIFETIME.total_seconds()),
        }

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
    hass.services.async_register(
        DOMAIN,
        SERVICE_SAVE_ARTIFACT,
        save_artifact,
        supports_response=SupportsResponse.OPTIONAL,
    )


async def async_unload_entry(hass: HomeAssistant, entry: PlaywrightConfigEntry) -> bool:
    """Unload a config entry."""
    hass.services.async_remove(DOMAIN, SERVICE_RUN_COMMAND)
    hass.services.async_remove(DOMAIN, SERVICE_GET_ARTIFACT)
    hass.services.async_remove(DOMAIN, SERVICE_SAVE_ARTIFACT)
    hass.data.get(DOMAIN, {}).pop(entry.entry_id, None)
    return True
