import 'dart:async';
import 'package:camera/camera.dart';
import 'package:flutter/foundation.dart';

/// Manages camera lifecycle and provides MJPEG frame stream.
class AppCameraController extends ChangeNotifier {
  CameraController? _controller;
  List<CameraDescription> _cameras = [];

  bool _isInitialized = false;
  bool _isStreaming = false;
  String? _errorMessage;

  // Stream of raw JPEG bytes for MJPEG server
  final StreamController<Uint8List> _frameStreamController =
      StreamController<Uint8List>.broadcast();

  Stream<Uint8List> get frameStream => _frameStreamController.stream;
  bool get isInitialized => _isInitialized;
  bool get isStreaming => _isStreaming;
  String? get errorMessage => _errorMessage;
  CameraController? get controller => _controller;

  /// Initializes back camera and starts image stream.
  Future<void> startCamera() async {
    try {
      _errorMessage = null;
      _cameras = await availableCameras();

      if (_cameras.isEmpty) {
        _errorMessage = 'No cameras found on this device.';
        notifyListeners();
        return;
      }

      // Prefer back camera
      CameraDescription selectedCamera = _cameras.first;
      for (final cam in _cameras) {
        if (cam.lensDirection == CameraLensDirection.back) {
          selectedCamera = cam;
          break;
        }
      }

      _controller = CameraController(
        selectedCamera,
        ResolutionPreset.medium, // balance quality vs CPU on low-end devices
        enableAudio: false,
        imageFormatGroup: ImageFormatGroup.jpeg,
      );

      await _controller!.initialize();
      _isInitialized = true;
      notifyListeners();

      // Start image stream for MJPEG broadcasting
      await _controller!.startImageStream(_onImageAvailable);
      _isStreaming = true;
      notifyListeners();
    } on CameraException catch (e) {
      _errorMessage = 'Camera error: ${e.description}';
      _isInitialized = false;
      notifyListeners();
    } catch (e) {
      _errorMessage = 'Unexpected error: $e';
      _isInitialized = false;
      notifyListeners();
    }
  }

  /// Stops image stream and releases camera resources.
  Future<void> stopCamera() async {
    try {
      if (_controller != null) {
        if (_controller!.value.isStreamingImages) {
          await _controller!.stopImageStream();
        }
        await _controller!.dispose();
        _controller = null;
      }
    } catch (_) {}

    _isInitialized = false;
    _isStreaming = false;
    notifyListeners();
  }

  void _onImageAvailable(CameraImage image) {
    if (_frameStreamController.isClosed) return;

    // CameraImage in JPEG group gives planes[0] as raw JPEG bytes
    if (image.format.group == ImageFormatGroup.jpeg) {
      final bytes = image.planes[0].bytes;
      if (!_frameStreamController.isClosed) {
        _frameStreamController.add(bytes);
      }
    } else {
      // YUV420 fallback: only emit every ~6th frame to reduce CPU on low-end
      // devices. Full conversion would require native code; skip for now.
      // In production, use a platform channel for YUV→JPEG conversion.
    }
  }

  @override
  void dispose() {
    stopCamera();
    _frameStreamController.close();
    super.dispose();
  }
}
