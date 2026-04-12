"""
server.py — FastAPI Push Notification Backend
=============================================

Entrypoint for the realtime push-notification service that powers the
Flutter chat app.  Start the server with:

    uvicorn backend.server:app --reload          # development
    uvicorn backend.server:app --host 0.0.0.0 --port 8000  # production

Required environment variables (set in .env or your hosting provider):
    GOOGLE_APPLICATION_CREDENTIALS  Path to Firebase service-account JSON
    FCM_PROJECT_ID                  Firebase project ID
"""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator

from backend.firebase import send_notification
from backend.models import token_store

# ---------------------------------------------------------------------------
# Bootstrap
# ---------------------------------------------------------------------------

load_dotenv()  # reads .env if present — safe no-op if file is absent

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Application lifecycle
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🚀  Push-notification backend starting up …")
    # Validate that required env-vars are present before accepting traffic
    missing = [
        var
        for var in ("GOOGLE_APPLICATION_CREDENTIALS", "FCM_PROJECT_ID")
        if not os.environ.get(var)
    ]
    if missing:
        logger.warning(
            "⚠️  Missing env vars: %s — FCM calls will fail until these are set.",
            ", ".join(missing),
        )
    yield
    logger.info("🛑  Push-notification backend shutting down …")


# ---------------------------------------------------------------------------
# App instance
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Push Notification Backend",
    description="Realtime FCM push-notification service for Flutter chat apps.",
    version="1.0.0",
    lifespan=lifespan,
)

# Allow Flutter (or any web client) to call the API during development.
# Tighten allow_origins in production to your actual domain(s).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Global error handler — turns unhandled exceptions into clean JSON
# ---------------------------------------------------------------------------


@app.exception_handler(Exception)
async def global_exception_handler(_request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled exception: %s", exc)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"success": False, "detail": "Internal server error."},
    )


# ---------------------------------------------------------------------------
# Pydantic request / response schemas
# ---------------------------------------------------------------------------


class SaveTokenRequest(BaseModel):
    user_id: str = Field(..., min_length=1, description="Unique user identifier")
    token: str = Field(..., min_length=10, description="FCM registration token")

    @field_validator("user_id", "token")
    @classmethod
    def strip_whitespace(cls, v: str) -> str:
        return v.strip()


class SaveTokenResponse(BaseModel):
    success: bool
    message: str
    user_id: str
    total_tokens: int


class SendNotificationRequest(BaseModel):
    user_id: str = Field(..., min_length=1, description="Target user identifier")
    title: str = Field(..., min_length=1, max_length=200, description="Notification title")
    body: str = Field(..., min_length=1, max_length=1000, description="Notification body")
    data: Optional[Dict[str, str]] = Field(
        default=None,
        description="Optional key-value payload delivered to the app",
    )

    @field_validator("user_id", "title", "body")
    @classmethod
    def strip_whitespace(cls, v: str) -> str:
        return v.strip()


class NotificationResult(BaseModel):
    token_preview: str
    status: str
    detail: Optional[str] = None


class SendNotificationResponse(BaseModel):
    success: bool
    message: str
    total_sent: int
    total_failed: int
    results: List[NotificationResult]


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.get("/", tags=["Health"])
async def health_check() -> Dict[str, Any]:
    """Simple health-check — confirms the server is alive."""
    return {
        "status": "ok",
        "service": "push-notification-backend",
        "registered_users": token_store.user_count(),
        "registered_tokens": token_store.token_count(),
    }


@app.post(
    "/save-token",
    response_model=SaveTokenResponse,
    status_code=status.HTTP_200_OK,
    tags=["Tokens"],
    summary="Register or refresh an FCM device token",
)
async def save_token(payload: SaveTokenRequest) -> SaveTokenResponse:
    """
    Called by the Flutter app after FCM generates (or rotates) a device token.
    Safe to call repeatedly — duplicate tokens are silently ignored.
    """
    token_store.save(payload.user_id, payload.token)
    total = len(token_store.get_tokens(payload.user_id))
    logger.info("Token saved — user=%s total_tokens=%d", payload.user_id, total)

    return SaveTokenResponse(
        success=True,
        message="Token saved successfully.",
        user_id=payload.user_id,
        total_tokens=total,
    )


@app.post(
    "/send-notification",
    response_model=SendNotificationResponse,
    status_code=status.HTTP_200_OK,
    tags=["Notifications"],
    summary="Send a push notification to a user's devices",
)
async def send_notification_endpoint(
    payload: SendNotificationRequest,
) -> SendNotificationResponse:
    """
    Sends *title* / *body* to **all** registered devices of *user_id*.
    Typically called by your chat backend whenever a new message arrives.
    """
    tokens = token_store.get_tokens(payload.user_id)
    if not tokens:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No registered tokens found for user '{payload.user_id}'.",
        )

    raw_results = await send_notification(
        tokens=tokens,
        title=payload.title,
        body=payload.body,
        data=payload.data,
    )

    results: List[NotificationResult] = [
        NotificationResult(
            token_preview=r["token"][:20] + "…",
            status=r["status"],
            detail=r.get("detail"),
        )
        for r in raw_results
    ]

    total_sent = sum(1 for r in raw_results if r["status"] == "success")
    total_failed = len(raw_results) - total_sent

    logger.info(
        "Notification sent — user=%s sent=%d failed=%d",
        payload.user_id,
        total_sent,
        total_failed,
    )

    return SendNotificationResponse(
        success=total_failed == 0,
        message=(
            f"Notification delivered to {total_sent}/{len(tokens)} device(s)."
        ),
        total_sent=total_sent,
        total_failed=total_failed,
        results=results,
    )
