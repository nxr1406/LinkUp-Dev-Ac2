import os
import json
import logging
from contextlib import asynccontextmanager

import firebase_admin
from firebase_admin import credentials, messaging, firestore
from fastapi import FastAPI, HTTPException, Header, Depends
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ─── Firebase Init ────────────────────────────────────────────────────────────

def init_firebase():
    """Initialize Firebase Admin SDK from env variable or file."""
    if firebase_admin._apps:
        return

    service_account_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON")
    if service_account_json:
        # Render.com: set the entire JSON as an env variable
        sa_dict = json.loads(service_account_json)
        cred = credentials.Certificate(sa_dict)
    else:
        # Local dev: use the file
        cred = credentials.Certificate("serviceAccountKey.json")

    firebase_admin.initialize_app(cred)
    logger.info("Firebase Admin SDK initialized.")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_firebase()
    yield


# ─── App ─────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="LinkUp Notification Backend",
    version="1.0.0",
    lifespan=lifespan,
)

# Internal API key — set this in Render env vars as INTERNAL_API_KEY
API_KEY = os.environ.get("INTERNAL_API_KEY", "changeme-set-in-render")


# ─── Auth ────────────────────────────────────────────────────────────────────

def verify_api_key(x_api_key: str = Header(...)):
    if x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")
    return x_api_key


# ─── Schemas ─────────────────────────────────────────────────────────────────

class RegisterTokenRequest(BaseModel):
    uid: str
    fcm_token: str


class SendNotificationRequest(BaseModel):
    receiver_uid: str
    sender_name: str
    message_text: str
    chat_id: str


class TokenResponse(BaseModel):
    success: bool
    message: str


# ─── Endpoints ───────────────────────────────────────────────────────────────

@app.get("/")
def health():
    return {"status": "ok", "service": "LinkUp Notification Backend"}


@app.post("/register-token", response_model=TokenResponse, dependencies=[Depends(verify_api_key)])
async def register_token(body: RegisterTokenRequest):
    """
    Flutter app calls this on login/startup to save the FCM token to Firestore.
    Firestore path: users/{uid}/fcmToken
    """
    try:
        db = firestore.client()
        db.collection("users").document(body.uid).update({
            "fcmToken": body.fcm_token
        })
        logger.info(f"Token registered for uid={body.uid}")
        return TokenResponse(success=True, message="Token registered.")
    except Exception as e:
        logger.error(f"register-token error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/send-notification", response_model=TokenResponse, dependencies=[Depends(verify_api_key)])
async def send_notification(body: SendNotificationRequest):
    """
    Flutter app calls this right after sendMessage() to push an FCM notification
    to the receiver. The backend fetches the receiver's FCM token from Firestore
    and sends the notification via Firebase Admin SDK.
    """
    try:
        db = firestore.client()
        user_ref = db.collection("users").document(body.receiver_uid)
        user_doc = user_ref.get()

        if not user_doc.exists:
            raise HTTPException(status_code=404, detail="Receiver not found.")

        user_data = user_doc.to_dict()
        fcm_token = user_data.get("fcmToken")

        if not fcm_token:
            logger.info(f"No FCM token for uid={body.receiver_uid}, skipping push.")
            return TokenResponse(success=True, message="No FCM token, skipped.")

        # Build FCM message
        message = messaging.Message(
            notification=messaging.Notification(
                title=body.sender_name,
                body=body.message_text,
            ),
            android=messaging.AndroidConfig(
                priority="high",
                notification=messaging.AndroidNotification(
                    channel_id="messages_channel",
                    color="#E91E8C",
                    sound="default",
                    click_action="FLUTTER_NOTIFICATION_CLICK",
                ),
            ),
            data={
                "chat_id": body.chat_id,
                "sender_name": body.sender_name,
                "type": "new_message",
            },
            token=fcm_token,
        )

        response = messaging.send(message)
        logger.info(f"FCM sent to uid={body.receiver_uid}, message_id={response}")
        return TokenResponse(success=True, message=f"Notification sent: {response}")

    except messaging.UnregisteredError:
        # Token is stale — remove it from Firestore
        db = firestore.client()
        db.collection("users").document(body.receiver_uid).update({"fcmToken": None})
        logger.warning(f"Stale token removed for uid={body.receiver_uid}")
        return TokenResponse(success=True, message="Stale token removed.")

    except Exception as e:
        logger.error(f"send-notification error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
