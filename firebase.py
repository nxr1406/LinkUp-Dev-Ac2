"""
firebase.py — Firebase Cloud Messaging (FCM) integration.

Uses the google-auth library to mint short-lived OAuth 2.0 bearer
tokens from a service-account JSON key file, then calls the FCM v1
HTTP API directly — no heavyweight Firebase Admin SDK required.

Environment variables expected
-------------------------------
GOOGLE_APPLICATION_CREDENTIALS
    Absolute path to your Firebase service-account JSON key file.
FCM_PROJECT_ID
    The Firebase project ID (visible in the Firebase console and in
    the service-account JSON as "project_id").
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from functools import lru_cache
from typing import Any, Dict, List, Optional

import httpx
from google.auth.transport.requests import Request
from google.oauth2 import service_account

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

FCM_SCOPES = ["https://www.googleapis.com/auth/firebase.messaging"]
FCM_ENDPOINT = (
    "https://fcm.googleapis.com/v1/projects/{project_id}/messages:send"
)


# ---------------------------------------------------------------------------
# Credential helpers
# ---------------------------------------------------------------------------


@lru_cache(maxsize=1)
# firebase.py এ _load_credentials() ফাংশনটা এভাবে বদলাও:
import json, os
from google.oauth2 import service_account

def _load_credentials():
    raw = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON", "")
    if not raw:
        raise EnvironmentError("FIREBASE_SERVICE_ACCOUNT_JSON not set")
    info = json.loads(raw)
    return service_account.Credentials.from_service_account_info(
        info, scopes=FCM_SCOPES
    )


def _get_access_token() -> str:
    """Return a fresh OAuth 2.0 bearer token, refreshing when expired."""
    creds = _load_credentials()
    if not creds.valid:
        creds.refresh(Request())
    return creds.token  # type: ignore[return-value]


def _project_id() -> str:
    project = os.environ.get("FCM_PROJECT_ID", "")
    if not project:
        # Fall back to reading from the service-account file
        key_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "")
        if key_path and os.path.isfile(key_path):
            with open(key_path) as f:
                project = json.load(f).get("project_id", "")
    if not project:
        raise EnvironmentError(
            "FCM_PROJECT_ID environment variable is not set and could not "
            "be inferred from the service-account file."
        )
    return project


# ---------------------------------------------------------------------------
# Core send helper
# ---------------------------------------------------------------------------


async def _send_one(
    client: httpx.AsyncClient,
    token: str,
    title: str,
    body: str,
    data: Optional[Dict[str, str]] = None,
) -> Dict[str, Any]:
    """Send a single FCM message; return a result dict."""
    payload: Dict[str, Any] = {
        "message": {
            "token": token,
            "notification": {"title": title, "body": body},
            "android": {
                "priority": "high",
                "notification": {"sound": "default"},
            },
            "apns": {
                "payload": {
                    "aps": {"sound": "default", "badge": 1}
                }
            },
        }
    }
    if data:
        payload["message"]["data"] = data

    url = FCM_ENDPOINT.format(project_id=_project_id())
    headers = {
        "Authorization": f"Bearer {_get_access_token()}",
        "Content-Type": "application/json",
    }

    try:
        resp = await client.post(url, json=payload, headers=headers, timeout=10)
        if resp.status_code == 200:
            return {"token": token, "status": "success", "message_id": resp.json().get("name")}
        else:
            error_detail = resp.json().get("error", {}).get("message", resp.text)
            logger.warning("FCM error for token %s: %s", token[:20], error_detail)
            return {"token": token, "status": "error", "detail": error_detail}
    except httpx.RequestError as exc:
        logger.error("Network error sending to %s: %s", token[:20], exc)
        return {"token": token, "status": "error", "detail": str(exc)}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def send_notification(
    tokens: List[str],
    title: str,
    body: str,
    data: Optional[Dict[str, str]] = None,
) -> List[Dict[str, Any]]:
    """
    Concurrently send *title*/*body* to every token in *tokens*.

    Parameters
    ----------
    tokens:
        List of FCM registration tokens.
    title:
        Notification title shown in the system tray.
    body:
        Notification body text.
    data:
        Optional key-value payload delivered to the app even when it is
        in the background (all values must be strings).

    Returns
    -------
    List of per-token result dicts with keys:
        ``token``, ``status`` ("success" | "error"), and either
        ``message_id`` or ``detail``.
    """
    if not tokens:
        return []

    async with httpx.AsyncClient() as client:
        tasks = [
            _send_one(client, token, title, body, data) for token in tokens
        ]
        results: List[Dict[str, Any]] = await asyncio.gather(*tasks)

    successes = sum(1 for r in results if r["status"] == "success")
    logger.info(
        "FCM batch complete — %d/%d succeeded.", successes, len(results)
    )
    return results
