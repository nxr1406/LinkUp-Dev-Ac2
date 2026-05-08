# 📷 LAN IP Camera

A lightweight Flutter Android app that turns your phone into a **local IP camera**. Stream live video over WiFi/Hotspot — no internet required.

---

## Features

- 📡 MJPEG live streaming over local network
- 🌐 Built-in HTTP server (`dart:io` — no extra packages)
- 🔗 Access stream from any browser on the same network
- 📴 Zero internet dependency — works fully offline on LAN/Hotspot
- 🔋 Wake lock keeps screen/server alive while streaming
- 🖤 AMOLED dark UI

---

## Endpoints

| Path | Description |
|------|-------------|
| `http://<IP>:8080/` | Status page |
| `http://<IP>:8080/view` | **Live stream viewer** (open on any browser) |
| `http://<IP>:8080/stream` | Raw MJPEG stream (for VLC, ffmpeg, etc.) |

---

## How to Use

1. Connect both devices to the **same WiFi or mobile hotspot**
2. Open the app → tap **START CAMERA**
3. Note the IP shown (e.g. `192.168.1.5`)
4. On any other device, open a browser → go to `http://192.168.1.5:8080/view`
5. Live video stream appears instantly

---

## Project Structure

```
lib/
 ├── main.dart
 ├── camera/
 │    └── camera_controller.dart   # Camera init + MJPEG frame stream
 ├── server/
 │    └── http_server.dart         # HTTP server + MJPEG broadcast
 └── pages/
      └── home_page.dart           # Main UI / control panel

android/
 └── app/src/main/AndroidManifest.xml

.github/
 └── workflows/
      └── android-apk.yml          # CI/CD: auto-builds release APK
```

---

## Build Locally

```bash
flutter pub get
flutter build apk --release
# APK → build/app/outputs/flutter-apk/app-release.apk
```

---

## GitHub Actions CI/CD

Every push to `main` automatically:
1. Sets up Flutter 3.27 on Ubuntu
2. Runs `flutter pub get`
3. Builds `app-release.apk`
4. Uploads APK as a downloadable artifact (retained 30 days)

Trigger manually from: **GitHub → Actions → Build Release APK → Run workflow**

---

## Dependencies

| Package | Purpose |
|---------|---------|
| `camera` | Camera access + image stream |
| `network_info_plus` | Get local WiFi IP address |
| `permission_handler` | Runtime camera permission |
| `wakelock_plus` | Keep screen on during streaming |

---

## Notes

- Streaming uses **MJPEG** (JPEG frame sequence over HTTP multipart)
- Resolution set to `medium` for low-end device compatibility
- No Firebase, no cloud, no authentication
