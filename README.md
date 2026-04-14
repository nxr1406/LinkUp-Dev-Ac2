# LinkUp — Notification Backend (FastAPI + FCM)

Render.com-এ deploy করার জন্য FastAPI backend।

---

## ফাইল স্ট্রাকচার

```
linkup-notification-backend/     ← এই ফোল্ডারটি GitHub-এ push করো
  main.py                        ← FastAPI app
  requirements.txt
  render.yaml

Flutter app-এ replace করো:
  lib/main.dart                  ← main.dart (এই ফোল্ডার থেকে নাও)
  lib/services/notification_service.dart
  lib/services/chat_service.dart
```

---

## ধাপ ১ — pubspec.yaml-এ নতুন packages যোগ করো

```yaml
dependencies:
  firebase_messaging: ^15.1.3   # ← যোগ করো
  http: ^1.2.2                  # ← যোগ করো
  # বাকি সব আগের মতো থাকবে
```

তারপর:
```bash
flutter pub get
```

---

## ধাপ ২ — AndroidManifest.xml-এ FCM permission যোগ করো

`android/app/src/main/AndroidManifest.xml` ফাইলে `<application>` ট্যাগের আগে যোগ করো:

```xml
<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>
<uses-permission android:name="android.permission.INTERNET"/>
```

`<application>` ট্যাগের ভেতরে যোগ করো:

```xml
<!-- FCM default channel -->
<meta-data
    android:name="com.google.firebase.messaging.default_notification_channel_id"
    android:value="messages_channel" />

<!-- FCM default icon -->
<meta-data
    android:name="com.google.firebase.messaging.default_notification_icon"
    android:resource="@mipmap/ic_launcher" />

<!-- FCM default color -->
<meta-data
    android:name="com.google.firebase.messaging.default_notification_color"
    android:resource="@color/notification_color" />
```

`android/app/src/main/res/values/colors.xml` ফাইলে যোগ করো:
```xml
<color name="notification_color">#E91E8C</color>
```

---

## ধাপ ৩ — Render.com-এ Deploy

### ৩.১ GitHub Repository তৈরি করো
`linkup-notification-backend/` ফোল্ডারটি একটি নতুন GitHub repo-তে push করো।

### ৩.২ Render-এ Web Service তৈরি করো
1. [render.com](https://render.com) → **New** → **Web Service**
2. GitHub repo সংযুক্ত করো
3. Settings:
   - **Environment**: Python
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`

### ৩.৩ Environment Variables সেট করো
Render Dashboard → **Environment** ট্যাবে:

| Key | Value |
|-----|-------|
| `FIREBASE_SERVICE_ACCOUNT_JSON` | `linkup-c22fa-firebase-adminsdk-fbsvc-3993609a2d.json` ফাইলের সম্পূর্ণ JSON কনটেন্ট (এক লাইনে paste করো) |
| `INTERNAL_API_KEY` | যেকোনো শক্তিশালী random string, যেমন: `lk_9f2xK8mPqR3wZ7nT` |

> ⚠️ **সতর্কতা**: `serviceAccountKey.json` ফাইলটি কখনো GitHub-এ push করবে না।

---

## ধাপ ৪ — Flutter App-এ Backend URL ও API Key বসাও

`lib/services/notification_service.dart` ফাইলে এই দুটো লাইন আপডেট করো:

```dart
static const String _backendUrl =
    'https://linkup-notification-backend.onrender.com'; // ← তোমার Render URL
static const String _apiKey = 'lk_9f2xK8mPqR3wZ7nT'; // ← তোমার INTERNAL_API_KEY
```

---

## ধাপ ৫ — chat_screen.dart-এ sendMessage call আপডেট করো

`chat_screen.dart`-এ যেখানে `sendMessage()` call করা হয়, সেখানে `senderName` parameter যোগ করো:

```dart
await _chatService.sendMessage(
  senderId: widget.currentUid,
  receiverId: widget.otherUser!.uid,
  text: _msgCtrl.text,
  senderName: myDisplayName,   // ← এটা যোগ করো (me.displayName)
  // ...
);
```

---

## কীভাবে কাজ করে

```
User A message পাঠায়
  ↓
Flutter: ChatService.sendMessage()
  ↓
Firestore-এ message save হয়  +  NotificationService.sendMessageNotification() [fire-and-forget]
  ↓
FastAPI Backend (/send-notification)
  ↓
Firestore থেকে User B-এর fcmToken নেয়
  ↓
Firebase Admin SDK → FCM → User B-এর ডিভাইস
  ↓
User B background/killed app থাকলেও notification দেখায়
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Health check |
| POST | `/register-token` | FCM token save করো |
| POST | `/send-notification` | Push notification পাঠাও |

সব POST request-এ header দিতে হবে: `x-api-key: YOUR_KEY`
