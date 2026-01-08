// src/services/CameraService.js - UPDATED
import { Camera } from 'expo-camera';
import * as FileSystem from 'expo-file-system';
import { Alert, Platform, Linking } from 'react-native';
import WebSocketService from './WebSocketService';

class CameraService {
  constructor() {
    this.camera = null;
    this.isStreaming = false;
    this.frameInterval = null;
    this.frameRate = 15;
    this.frameCount = 0;
    this.frameBuffer = [];
    this.bufferSize = 10;
    this.processingQueue = [];
    this.hasPermission = null;
    this.permissionRequested = false;
    this.streamingMode = 'both';
    this.lastFrameTime = 0;
    this.frameIntervalMs = 1000 / this.frameRate;
    this.isProcessing = false;
  }

  async initialize() {
    try {
      console.log('Requesting camera permission...');
      
      // First check current permission status
      const existingPermission = await Camera.getCameraPermissionsAsync();
      
      if (existingPermission.status === 'granted') {
        console.log('✓ Camera permission already granted');
        this.hasPermission = true;
        this.permissionRequested = true;
        return true;
      }
      
      // Request camera permissions
      const { status, canAskAgain, granted } = await Camera.requestCameraPermissionsAsync();
      
      console.log('Camera permission status:', { status, canAskAgain, granted });
      
      this.hasPermission = status === 'granted';
      this.permissionRequested = true;
      
      if (status === 'granted') {
        console.log('✓ Camera permission granted');
        return true;
      } else if (status === 'undetermined') {
        console.log('Camera permission undetermined');
        return false;
      } else if (status === 'denied') {
        console.log('✗ Camera permission denied');
        
        // Check if we can ask again
        if (!canAskAgain) {
          this.showPermissionAlert();
        }
        return false;
      }
      
      return false;
    } catch (error) {
      console.error('Camera permission error:', error);
      return false;
    }
  }

  setCameraRef(ref) {
    this.camera = ref;
  }

  async captureFrame() {
    // Check permission first
    if (this.hasPermission === null) {
      const hasPerm = await this.checkPermission();
      if (!hasPerm) {
        console.warn('No camera permission to capture frame');
        return null;
      }
    } else if (!this.hasPermission) {
      console.warn('Camera permission denied');
      return null;
    }

    if (!this.camera) {
      console.warn('Camera reference not set');
      return null;
    }

    try {
      // Capture photo as base64
      const photo = await this.camera.takePictureAsync({
        quality: 0.5, // Lower quality for faster transmission
        base64: true,
        exif: false,
        skipProcessing: true, // Skip processing for speed
      });

      if (!photo.base64) {
        console.warn('No base64 data in photo');
        return null;
      }

      console.log(`Captured frame (${photo.base64.length} bytes)`);
      return photo.base64;
    } catch (error) {
      console.error('Error capturing frame:', error);
      return null;
    }
  }

  // UPDATED: Optimized frame capture for streaming with better error handling
  async captureFrameForStream() {
    try {
      // Check if camera is available and ready
      if (!this.camera) {
        console.warn('Camera reference not available');
        return null;
      }

      if (!this.hasPermission) {
        console.warn('No camera permission');
        return null;
      }

      // Check if camera is mounted (basic check)
      if (typeof this.camera.takePictureAsync !== 'function') {
        console.warn('Camera does not have takePictureAsync method. Available methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(this.camera)));
        return null;
      }

      // Use takePictureAsync with settings optimized for mobile devices
      console.log('Attempting to capture photo with camera:', !!this.camera);
      const photo = await this.camera.takePictureAsync({
        quality: 0.3, // Lower quality for faster processing
        base64: true,
        exif: false,
      });
      console.log('Photo captured:', { hasPhoto: !!photo, hasBase64: !!(photo && photo.base64), base64Length: photo?.base64?.length });

      if (!photo || !photo.base64) {
        console.warn('Failed to get base64 data from photo - photo object:', photo);
        return null;
      }

      return photo.base64;
    } catch (error) {
      // Log error details but don't spam console
      if (this.frameCount % 30 === 0) {
        console.error('Stream capture error:', {
          message: error.message,
          name: error.name,
          cameraAvailable: !!this.camera,
          hasPermission: this.hasPermission,
          error: error
        });
      }
      return null;
    }
  }

  // UPDATED: Start streaming that actually sends frames
  startStreaming(onFrameCallback, frameRate = 10, mode = 'both') {
    if (this.isStreaming) {
      console.log('Already streaming');
      return;
    }

    // Check permission
    if (this.hasPermission === false) {
      console.warn('Cannot start streaming - no camera permission');
      return;
    }

    // Check camera availability
    if (!this.camera) {
      console.warn('Cannot start streaming - camera not available');
      return;
    }

    // Check WebSocket connection
    if (!WebSocketService.isConnected) {
      console.warn('WebSocket not connected, cannot stream');
      return;
    }

    this.isStreaming = true;
    this.frameRate = frameRate;
    this.streamingMode = mode;
    this.frameIntervalMs = 1000 / frameRate;
    this.lastFrameTime = Date.now();
    this.frameCount = 0;

    console.log(`Starting streaming at ${frameRate} FPS, mode: ${mode}`);

    // Start frame capture loop
    this.frameInterval = setInterval(async () => {
      if (!this.isStreaming || !this.camera || !this.hasPermission) {
        return;
      }

      // Throttle if we're processing too fast
      const now = Date.now();
      const timeSinceLastFrame = now - this.lastFrameTime;
      
      if (timeSinceLastFrame < this.frameIntervalMs) {
        return; // Skip this frame to maintain frame rate
      }

      this.lastFrameTime = now;
      this.frameCount++;

      try {
        // Capture frame
        const frameBase64 = await this.captureFrameForStream();
        
        if (frameBase64 && WebSocketService.isConnected) {
          // Send frame to WebSocket server
          WebSocketService.sendFrame(frameBase64, this.streamingMode);
          
          // Callback for UI updates
          if (onFrameCallback) {
            onFrameCallback(frameBase64);
          }

          // Log every 30 frames
          if (this.frameCount % 30 === 0) {
            console.log(`Sent ${this.frameCount} frames to server`);
          }
        } else if (!frameBase64) {
          // Log failure but don't spam
          if (this.frameCount % 30 === 0) {
            console.log('Failed to capture frame - camera may not be ready');
          }
        } else if (!WebSocketService.isConnected) {
          console.log('WebSocket disconnected, stopping stream');
          this.stopStreaming();
        }
      } catch (error) {
        console.error('Error in streaming loop:', error);
      }
    }, this.frameIntervalMs);

    console.log('Streaming started successfully');
  }

  stopStreaming() {
    if (this.frameInterval) {
      clearInterval(this.frameInterval);
      this.frameInterval = null;
    }
    
    this.isStreaming = false;
    this.frameCount = 0;
    
    console.log('Streaming stopped');
  }

  async checkPermission() {
    try {
      const { status, canAskAgain } = await Camera.getCameraPermissionsAsync();
      console.log('Checking camera permission:', { status, canAskAgain });
      
      this.hasPermission = status === 'granted';
      return this.hasPermission;
    } catch (error) {
      console.error('Error checking camera permission:', error);
      return false;
    }
  }

  showPermissionAlert() {
    Alert.alert(
      'Camera Permission Required',
      'Camera access is required for sign language translation. Please enable camera permissions in your device settings.',
      [
        { 
          text: 'Open Settings', 
          onPress: () => this.openAppSettings() 
        },
        { 
          text: 'Cancel', 
          style: 'cancel' 
        }
      ]
    );
  }

  async openAppSettings() {
    try {
      if (Platform.OS === 'ios') {
        await Linking.openURL('app-settings:');
      } else {
        await Linking.openSettings();
      }
    } catch (error) {
      console.error('Error opening settings:', error);
      Alert.alert(
        'Open Settings',
        'Please open your device settings manually and enable camera permission for this app.',
        [{ text: 'OK' }]
      );
    }
  }

  async requestPermissionWithExplanation() {
    try {
      return new Promise((resolve) => {
        Alert.alert(
          'Enable Camera',
          'This app needs camera access to:\n• Capture sign language gestures\n• Read lip movements\n• Provide real-time translation\n\nYour video is processed locally for privacy.',
          [
            {
              text: 'Allow Camera',
              onPress: async () => {
                const granted = await this.initialize();
                resolve(granted);
              }
            },
            {
              text: 'Not Now',
              style: 'cancel',
              onPress: () => resolve(false)
            }
          ]
        );
      });
    } catch (error) {
      console.error('Permission explanation error:', error);
      return false;
    }
  }

  // Getter methods
  getPermissionStatus() {
    return this.hasPermission;
  }

  isPermissionRequested() {
    return this.permissionRequested;
  }

  isStreamingActive() {
    return this.isStreaming;
  }

  getFrameCount() {
    return this.frameCount;
  }
}

const cameraService = new CameraService();
export default cameraService;