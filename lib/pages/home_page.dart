import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:network_info_plus/network_info_plus.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:wakelock_plus/wakelock_plus.dart';
import '../camera/camera_controller.dart';
import '../server/http_server.dart';

class HomePage extends StatefulWidget {
  const HomePage({super.key});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> with WidgetsBindingObserver {
  final AppCameraController _cameraCtrl = AppCameraController();
  final LanHttpServer _httpServer = LanHttpServer();
  final NetworkInfo _networkInfo = NetworkInfo();

  bool _serverRunning = false;
  bool _loading = false;
  String _localIp = 'Detecting...';
  String? _errorMsg;
  Timer? _ipRefreshTimer;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _refreshIp();
    // Refresh IP every 10s in case network changes
    _ipRefreshTimer = Timer.periodic(
      const Duration(seconds: 10),
      (_) => _refreshIp(),
    );
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _ipRefreshTimer?.cancel();
    _stopServer();
    _cameraCtrl.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused && _serverRunning) {
      // Keep running in background; wakelock prevents sleep
    }
  }

  Future<void> _refreshIp() async {
    try {
      final ip = await _networkInfo.getWifiIP();
      if (mounted) {
        setState(() => _localIp = ip ?? 'Not connected');
        if (_serverRunning) {
          _httpServer.updateState(
            cameraOn: _serverRunning,
            localIp: _localIp,
          );
        }
      }
    } catch (_) {
      if (mounted) setState(() => _localIp = 'Unavailable');
    }
  }

  Future<bool> _requestPermissions() async {
    final camera = await Permission.camera.request();
    return camera.isGranted;
  }

  Future<void> _startServer() async {
    setState(() {
      _loading = true;
      _errorMsg = null;
    });

    final granted = await _requestPermissions();
    if (!granted) {
      setState(() {
        _loading = false;
        _errorMsg = 'Camera permission denied.';
      });
      return;
    }

    await _refreshIp();
    await _cameraCtrl.startCamera();

    if (_cameraCtrl.errorMessage != null) {
      setState(() {
        _loading = false;
        _errorMsg = _cameraCtrl.errorMessage;
      });
      return;
    }

    try {
      await _httpServer.start(
        frameStream: _cameraCtrl.frameStream,
        cameraOn: true,
        localIp: _localIp,
      );
      await WakelockPlus.enable();
      setState(() {
        _serverRunning = true;
        _loading = false;
      });
    } catch (e) {
      await _cameraCtrl.stopCamera();
      setState(() {
        _loading = false;
        _errorMsg = 'Failed to start server: $e';
      });
    }
  }

  Future<void> _stopServer() async {
    setState(() => _loading = true);
    await _cameraCtrl.stopCamera();
    await _httpServer.stop();
    await WakelockPlus.disable();
    setState(() {
      _serverRunning = false;
      _loading = false;
    });
  }

  void _copyUrl(String url) {
    Clipboard.setData(ClipboardData(text: url));
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          'Copied: $url',
          style: const TextStyle(fontFamily: 'monospace', fontSize: 12),
        ),
        backgroundColor: const Color(0xFF0D0D0D),
        duration: const Duration(seconds: 2),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final baseUrl = 'http://$_localIp:${LanHttpServer.port}';

    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: Column(
          children: [
            _buildHeader(),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _buildStatusCard(),
                    const SizedBox(height: 20),
                    _buildToggleButton(),
                    if (_errorMsg != null) ...[
                      const SizedBox(height: 16),
                      _buildErrorCard(),
                    ],
                    if (_serverRunning) ...[
                      const SizedBox(height: 24),
                      _buildEndpointsCard(baseUrl),
                    ],
                    const SizedBox(height: 24),
                    _buildInstructions(),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: Color(0xFF1A1A1A))),
      ),
      child: Row(
        children: [
          const Text(
            'LAN IP CAMERA',
            style: TextStyle(
              color: Color(0xFFFF2D78),
              fontSize: 12,
              letterSpacing: 4,
              fontWeight: FontWeight.w600,
            ),
          ),
          const Spacer(),
          if (_serverRunning)
            Row(
              children: [
                Container(
                  width: 8,
                  height: 8,
                  decoration: const BoxDecoration(
                    color: Color(0xFF00FF88),
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 8),
                const Text(
                  'LIVE',
                  style: TextStyle(
                    color: Color(0xFF00FF88),
                    fontSize: 10,
                    letterSpacing: 2,
                  ),
                ),
              ],
            ),
        ],
      ),
    );
  }

  Widget _buildStatusCard() {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        border: Border.all(color: const Color(0xFF1A1A1A)),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Column(
        children: [
          _statusRow('STATUS', _serverRunning ? 'ONLINE' : 'OFFLINE',
              valueColor: _serverRunning
                  ? const Color(0xFF00FF88)
                  : const Color(0xFF666666)),
          const SizedBox(height: 12),
          _statusRow('IP ADDRESS', _localIp),
          const SizedBox(height: 12),
          _statusRow('PORT', '${LanHttpServer.port}'),
          const SizedBox(height: 12),
          _statusRow('PROTOCOL', 'MJPEG / HTTP'),
        ],
      ),
    );
  }

  Widget _statusRow(String label, String value, {Color? valueColor}) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: const TextStyle(
            color: Color(0xFF444444),
            fontSize: 11,
            letterSpacing: 2,
          ),
        ),
        Text(
          value,
          style: TextStyle(
            color: valueColor ?? Colors.white,
            fontSize: 12,
            letterSpacing: 1,
            fontFamily: 'monospace',
          ),
        ),
      ],
    );
  }

  Widget _buildToggleButton() {
    return SizedBox(
      width: double.infinity,
      height: 56,
      child: GestureDetector(
        onTap: _loading
            ? null
            : (_serverRunning ? _stopServer : _startServer),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 300),
          decoration: BoxDecoration(
            border: Border.all(
              color: _serverRunning
                  ? const Color(0xFF00FF88)
                  : const Color(0xFFFF2D78),
              width: 1,
            ),
            borderRadius: BorderRadius.circular(4),
            color: _serverRunning
                ? const Color(0xFF00FF88).withOpacity(0.08)
                : const Color(0xFFFF2D78).withOpacity(0.08),
          ),
          child: Center(
            child: _loading
                ? SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(
                      strokeWidth: 1.5,
                      color: _serverRunning
                          ? const Color(0xFF00FF88)
                          : const Color(0xFFFF2D78),
                    ),
                  )
                : Text(
                    _serverRunning ? '⏹  STOP CAMERA' : '▶  START CAMERA',
                    style: TextStyle(
                      color: _serverRunning
                          ? const Color(0xFF00FF88)
                          : const Color(0xFFFF2D78),
                      fontSize: 13,
                      letterSpacing: 3,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
          ),
        ),
      ),
    );
  }

  Widget _buildErrorCard() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        border: Border.all(color: const Color(0xFFFF2D78).withOpacity(0.4)),
        borderRadius: BorderRadius.circular(4),
        color: const Color(0xFFFF2D78).withOpacity(0.05),
      ),
      child: Row(
        children: [
          const Text('⚠', style: TextStyle(color: Color(0xFFFF2D78))),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              _errorMsg!,
              style: const TextStyle(
                color: Color(0xFFFF2D78),
                fontSize: 12,
                letterSpacing: 0.5,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildEndpointsCard(String baseUrl) {
    final endpoints = [
      ('STATUS', '$baseUrl/', 'System status page'),
      ('VIEWER', '$baseUrl/view', 'Live stream viewer'),
      ('STREAM', '$baseUrl/stream', 'Raw MJPEG stream'),
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'ENDPOINTS',
          style: TextStyle(
            color: Color(0xFF444444),
            fontSize: 10,
            letterSpacing: 3,
          ),
        ),
        const SizedBox(height: 12),
        ...endpoints.map(
          (e) => Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: _buildEndpointTile(e.$1, e.$2, e.$3),
          ),
        ),
      ],
    );
  }

  Widget _buildEndpointTile(String label, String url, String desc) {
    return GestureDetector(
      onTap: () => _copyUrl(url),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          border: Border.all(color: const Color(0xFF1A1A1A)),
          borderRadius: BorderRadius.circular(4),
        ),
        child: Row(
          children: [
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: const TextStyle(
                    color: Color(0xFFFF2D78),
                    fontSize: 9,
                    letterSpacing: 2,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  url,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 11,
                    fontFamily: 'monospace',
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  desc,
                  style: const TextStyle(
                    color: Color(0xFF444444),
                    fontSize: 10,
                  ),
                ),
              ],
            ),
            const Spacer(),
            const Icon(Icons.copy, color: Color(0xFF333333), size: 16),
          ],
        ),
      ),
    );
  }

  Widget _buildInstructions() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        border: Border.all(color: const Color(0xFF1A1A1A)),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'HOW TO USE',
            style: TextStyle(
              color: Color(0xFF444444),
              fontSize: 10,
              letterSpacing: 3,
            ),
          ),
          const SizedBox(height: 12),
          ...[
            '1. Connect both devices to the same WiFi or hotspot.',
            '2. Tap START CAMERA on this device.',
            '3. On another device, open a browser.',
            '4. Navigate to http://<IP>:8080/view',
            '5. Live stream will appear in the browser.',
          ].map(
            (t) => Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text(
                t,
                style: const TextStyle(
                  color: Color(0xFF555555),
                  fontSize: 12,
                  height: 1.5,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
