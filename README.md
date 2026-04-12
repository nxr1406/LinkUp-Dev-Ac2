# 🔔 Push Notification Backend

A **lightweight, async FastAPI** service that delivers realtime push
notifications to Flutter chat apps via **Firebase Cloud Messaging (FCM) v1**.

---

## Folder Structure

```
project/
├── .env.example          ← copy to .env and fill in your credentials
└── backend/
    ├── __init__.py
    ├── server.py         ← FastAPI app & route definitions
    ├── firebase.py       ← FCM HTTP v1 integration
    ├── models.py         ← in-memory token registry
    └── requirements.txt
```

---

## ⚙️ Setup

### 1 — Clone / copy the project

```bash
cd project
```

### 2 — Create a virtual environment

```bash
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
```

### 3 — Install dependencies

```bash
pip install -r backend/requirements.txt
```

### 4 — Configure Firebase credentials

1. Open [Firebase Console](https://console.firebase.google.com) →
   **Project Settings** → **Service accounts** → **Generate new private key**.
2. Save the downloaded JSON file somewhere safe, e.g. `serviceAccountKey.json`.
3. Copy `.env.example` to `.env` and fill in:

```env
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/serviceAccountKey.json
FCM_PROJECT_ID=your-firebase-project-id
```

---

## 🚀 Run the Server

### Development (auto-reload)

```bash
uvicorn backend.server:app --reload --port 8000
```

### Production

```bash
uvicorn backend.server:app --host 0.0.0.0 --port 8000 --workers 4
```

Server will be live at **http://localhost:8000**

Interactive API docs: **http://localhost:8000/docs**

---

## 📡 API Reference

### `GET /`  — Health check

```bash
curl http://localhost:8000/
```

**Response**

```json
{
  "status": "ok",
  "service": "push-notification-backend",
  "registered_users": 3,
  "registered_tokens": 5
}
```

---

### `POST /save-token`  — Register a device token

Called by the Flutter app when FCM provides (or rotates) a device token.

**Request**

```bash
curl -X POST http://localhost:8000/save-token \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "user_123",
    "token": "eXaMpLeFcMtOkEn_abcdefghij1234567890"
  }'
```

**Response**

```json
{
  "success": true,
  "message": "Token saved successfully.",
  "user_id": "user_123",
  "total_tokens": 1
}
```

---

### `POST /send-notification`  — Push a notification

Triggered by your chat backend when a new message arrives.

**Request**

```bash
curl -X POST http://localhost:8000/send-notification \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "user_123",
    "title": "Alice",
    "body": "Hey, are you free tonight?",
    "data": {
      "chat_id": "chat_456",
      "sender_id": "user_789",
      "type": "new_message"
    }
  }'
```

**Response (all devices reached)**

```json
{
  "success": true,
  "message": "Notification delivered to 2/2 device(s).",
  "total_sent": 2,
  "total_failed": 0,
  "results": [
    { "token_preview": "eXaMpLeFcMtOkEn_ab…", "status": "success", "detail": null },
    { "token_preview": "aNOtHeRtOkEn_xyz123…", "status": "success", "detail": null }
  ]
}
```

---

## Flutter Integration Snippet

```dart
// 1. On app launch / token refresh — register the device
Future<void> registerFcmToken(String userId) async {
  final token = await FirebaseMessaging.instance.getToken();
  if (token == null) return;

  await http.post(
    Uri.parse('https://your-server.com/save-token'),
    headers: {'Content-Type': 'application/json'},
    body: jsonEncode({'user_id': userId, 'token': token}),
  );
}

// 2. When sending a chat message — trigger the push
Future<void> sendMessageNotification({
  required String recipientId,
  required String senderName,
  required String messageText,
  required String chatId,
}) async {
  await http.post(
    Uri.parse('https://your-server.com/send-notification'),
    headers: {'Content-Type': 'application/json'},
    body: jsonEncode({
      'user_id': recipientId,
      'title': senderName,
      'body': messageText,
      'data': {'chat_id': chatId, 'type': 'new_message'},
    }),
  );
}
```

---

## 📝 Notes

| Topic | Detail |
|---|---|
| Storage | In-memory only — tokens reset on server restart. Swap `TokenStore` for Redis / PostgreSQL for persistence. |
| Scalability | For multi-worker deployments replace the in-memory store with a shared cache (Redis recommended). |
| Token rotation | FCM silently rotates tokens. Re-call `/save-token` in `FirebaseMessaging.instance.onTokenRefresh`. |
| Security | Add bearer-token or API-key middleware before deploying publicly. |
