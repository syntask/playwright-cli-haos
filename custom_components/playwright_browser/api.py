"""Client for the Playwright app's authenticated HTTP API."""

from __future__ import annotations

from typing import Any

from aiohttp import ClientError, ClientSession, ClientTimeout


class PlaywrightApiError(Exception):
    """Raised when the app API cannot complete a request."""


class PlaywrightApi:
    """Small async API client, sharing Home Assistant's aiohttp session."""

    def __init__(self, session: ClientSession, host: str, token: str) -> None:
        self._session = session
        self._base_url = host.rstrip("/")
        self._headers = {"Authorization": f"Bearer {token}"}

    async def _request(self, method: str, path: str, **kwargs: Any) -> dict[str, Any]:
        try:
            async with self._session.request(
                method,
                f"{self._base_url}{path}",
                headers=self._headers,
                timeout=ClientTimeout(total=130),
                **kwargs,
            ) as response:
                payload = await response.json(content_type=None)
                if response.status >= 400:
                    raise PlaywrightApiError(payload.get("error", payload.get("stderr", "App API request failed")))
                return payload
        except (ClientError, TimeoutError, ValueError) as err:
            raise PlaywrightApiError(str(err)) from err

    async def command(
        self, session: str, command: str, arguments: list[str] | None = None
    ) -> dict[str, Any]:
        return await self._request(
            "POST",
            "/api/v1/command",
            json={"session": session, "command": command, "arguments": arguments or []},
        )

    async def sessions(self) -> dict[str, Any]:
        return await self._request("GET", "/api/v1/sessions")

    async def events(self, after: int = 0) -> dict[str, Any]:
        return await self._request("GET", f"/api/v1/events?after={after}")

    async def health(self) -> dict[str, Any]:
        return await self._request("GET", "/health")
