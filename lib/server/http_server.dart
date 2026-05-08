import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

/// Lightweight HTTP server that exposes:
///   /          → status page (JSON + HTML)
///   /view      → MJPEG live stream viewer (HTML page)
///   /stream    → raw MJPEG multipart stream (used by /view img src)
class LanHttpServer {
  static const int port = 8080;

  HttpServer? _server;
  Stream<Uint8List>? _frameStream;
  bool _cameraOn = false;
  String _localIp = '0.0.0.0';

  bool get isRunning => _server != null;

  /// Starts the HTTP server and binds to all interfaces on [port].
  Future<void> start({
    required Stream<Uint8List> frameStream,
    required bool cameraOn,
    required String localIp,
  }) async {
    _frameStream = frameStream;
    _cameraOn = cameraOn;
    _localIp = localIp;

    _server = await HttpServer.bind(InternetAddress.anyIPv4, port);
    _server!.listen(_handleRequest);
  }

  /// Updates the server state (camera on/off flag, IP).
  void updateState({required bool cameraOn, required String localIp}) {
    _cameraOn = cameraOn;
    _localIp = localIp;
  }

  /// Stops the HTTP server.
  Future<void> stop() async {
    await _server?.close(force: true);
    _server = null;
  }

  void _handleRequest(HttpRequest request) {
    final path = request.uri.path;

    switch (path) {
      case '/':
        _serveStatus(request);
        break;
      case '/view':
        _serveViewerPage(request);
        break;
      case '/stream':
        _serveMjpegStream(request);
        break;
      default:
        _serve404(request);
    }
  }

  // ─── Route handlers ──────────────────────────────────────────────────────

  void _serveStatus(HttpRequest req) {
    req.response
      ..statusCode = HttpStatus.ok
      ..headers.contentType = ContentType.html
      ..write(_statusHtml())
      ..close();
  }

  void _serveViewerPage(HttpRequest req) {
    req.response
      ..statusCode = HttpStatus.ok
      ..headers.contentType = ContentType.html
      ..write(_viewerHtml())
      ..close();
  }

  Future<void> _serveMjpegStream(HttpRequest req) async {
    if (!_cameraOn || _frameStream == null) {
      req.response
        ..statusCode = HttpStatus.serviceUnavailable
        ..write('Camera is offline')
        ..close();
      return;
    }

    req.response.headers
      ..set('Content-Type', 'multipart/x-mixed-replace; boundary=frame')
      ..set('Cache-Control', 'no-cache')
      ..set('Connection', 'keep-alive')
      ..set('Access-Control-Allow-Origin', '*');

    req.response.statusCode = HttpStatus.ok;

    // Track if client disconnected
    bool clientDisconnected = false;
    req.response.done.then((_) => clientDisconnected = true).catchError((_) {
      clientDisconnected = true;
    });

    await for (final frame in _frameStream!) {
      if (clientDisconnected) break;

      try {
        req.response.add([
          ...'--frame\r\n'.codeUnits,
          ...'Content-Type: image/jpeg\r\n'.codeUnits,
          ...'Content-Length: ${frame.length}\r\n\r\n'.codeUnits,
          ...frame,
          ...'\r\n'.codeUnits,
        ]);
        await req.response.flush();
      } catch (_) {
        break;
      }
    }

    try {
      await req.response.close();
    } catch (_) {}
  }

  void _serve404(HttpRequest req) {
    req.response
      ..statusCode = HttpStatus.notFound
      ..write('404 - Not Found')
      ..close();
  }

  // ─── HTML templates ───────────────────────────────────────────────────────

  String _statusHtml() => '''
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>LAN IP Camera - Status</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: #000;
    color: #fff;
    font-family: 'Courier New', monospace;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .card {
    border: 1px solid #FF2D78;
    padding: 40px;
    max-width: 420px;
    width: 90%;
    border-radius: 4px;
  }
  .title {
    font-size: 11px;
    letter-spacing: 4px;
    color: #FF2D78;
    text-transform: uppercase;
    margin-bottom: 32px;
  }
  .row { display: flex; justify-content: space-between; margin-bottom: 16px; }
  .label { color: #666; font-size: 13px; }
  .value { font-size: 13px; }
  .status-on { color: #00FF88; }
  .status-off { color: #FF2D78; }
  .divider { border: none; border-top: 1px solid #1a1a1a; margin: 24px 0; }
  .link {
    display: block;
    color: #FF2D78;
    text-decoration: none;
    font-size: 12px;
    letter-spacing: 1px;
    margin-top: 8px;
    transition: color 0.2s;
  }
  .link:hover { color: #fff; }
  .dot {
    display: inline-block;
    width: 8px; height: 8px;
    border-radius: 50%;
    margin-right: 8px;
    animation: ${_cameraOn ? 'pulse 1.4s infinite' : 'none'};
    background: ${_cameraOn ? '#00FF88' : '#FF2D78'};
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }
</style>
</head>
<body>
<div class="card">
  <div class="title">LAN IP Camera System</div>
  <div class="row">
    <span class="label">CAMERA</span>
    <span class="value ${_cameraOn ? 'status-on' : 'status-off'}">
      <span class="dot"></span>${_cameraOn ? 'ONLINE' : 'OFFLINE'}
    </span>
  </div>
  <div class="row">
    <span class="label">IP ADDRESS</span>
    <span class="value">$_localIp</span>
  </div>
  <div class="row">
    <span class="label">PORT</span>
    <span class="value">$port</span>
  </div>
  <hr class="divider">
  <div class="label" style="margin-bottom:12px;font-size:11px;letter-spacing:2px;">ENDPOINTS</div>
  <a class="link" href="/view">▶  /view — Live Stream Viewer</a>
  <a class="link" href="/stream">◉  /stream — Raw MJPEG Stream</a>
</div>
</body>
</html>
''';

  String _viewerHtml() => '''
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>LAN IP Camera - Live View</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: #000;
    color: #fff;
    font-family: 'Courier New', monospace;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 20px;
    border-bottom: 1px solid #1a1a1a;
  }
  .brand { font-size: 11px; letter-spacing: 4px; color: #FF2D78; }
  .indicator {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    letter-spacing: 2px;
    color: ${_cameraOn ? '#00FF88' : '#FF2D78'};
  }
  .dot {
    width: 8px; height: 8px;
    border-radius: 50%;
    background: currentColor;
    animation: ${_cameraOn ? 'pulse 1.4s infinite' : 'none'};
  }
  .viewer {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }
  .stream-wrapper {
    position: relative;
    width: 100%;
    max-width: 800px;
    border: 1px solid #1a1a1a;
    border-radius: 4px;
    overflow: hidden;
    background: #0a0a0a;
    aspect-ratio: 4/3;
  }
  .stream-wrapper img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
  }
  .offline-msg {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: #333;
  }
  .offline-icon { font-size: 48px; }
  .offline-text { font-size: 11px; letter-spacing: 3px; }
  footer {
    padding: 12px 20px;
    border-top: 1px solid #1a1a1a;
    font-size: 10px;
    color: #333;
    letter-spacing: 1px;
    display: flex;
    justify-content: space-between;
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.2; }
  }
</style>
</head>
<body>
<header>
  <span class="brand">LAN IP CAMERA</span>
  <div class="indicator">
    <div class="dot"></div>
    ${_cameraOn ? 'LIVE' : 'OFFLINE'}
  </div>
</header>

<div class="viewer">
  <div class="stream-wrapper">
    ${_cameraOn ? '<img src="/stream" alt="Live Stream">' : '''
    <div class="offline-msg">
      <div class="offline-icon">◎</div>
      <div class="offline-text">CAMERA OFFLINE</div>
    </div>'''}
  </div>
</div>

<footer>
  <span>$_localIp:$port</span>
  <span>MJPEG STREAM</span>
</footer>
</body>
</html>
''';
}
