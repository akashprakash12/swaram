// src/services/CameraService.js - FIXED VERSION
import { Camera } from 'expo-camera';
import * as FileSystem from 'expo-file-system';
import { Alert, Platform, Linking } from 'react-native';
import WebSocketService from './WebSocketService';

class CameraService {
  constructor() {
    this.camera = null;
    this.isStreaming = false;
    this.frameInterval = null;
    this.frameRate = 10;
    this.frameCount = 0;
    this.hasPermission = null;
    this.permissionRequested = false;
    this.streamingMode = 'both';
    this.lastFrameTime = 0;
    this.isProcessing = false;
    this.frameQueue = [];
    this.maxQueueSize = 3;
  }

  async initialize() {
    try {
      console.log('Initializing camera service...');
      
      const { status } = await Camera.requestCameraPermissionsAsync();
      
      this.hasPermission = status === 'granted';
      this.permissionRequested = true;
      
      console.log('Camera permission status:', status);
      
      return this.hasPermission;
      
    } catch (error) {
      console.error('Camera permission error:', error);
      this.hasPermission = false;
      return false;
    }
  }

  setCameraRef(ref) {
    this.camera = ref;
    console.log('Camera ref set:', !!ref);
  }

  async captureFrame() {
    if (!this.hasPermission) {
      console.warn('No camera permission');
      return null;
    }

    if (!this.camera) {
      console.warn('Camera ref not set');
      return null;
    }

    try {
      const photo = await this.camera.takePictureAsync({
        quality: 0.3,
        base64: true,
        exif: false,
        skipProcessing: true,
      });

      console.log('Frame captured:', photo.base64 ? `${photo.base64.length} bytes` : 'no data');
      return photo.base64;
      
    } catch (error) {
      console.error('Error capturing frame:', error);
      return null;
    }
  }

  startStreaming(onFrameCallback, frameRate = 10, mode = 'both') {
    if (this.isStreaming) {
      console.log('Already streaming');
      return;
    }

    if (!this.hasPermission) {
      console.warn('No camera permission for streaming');
      return;
    }

    if (!this.camera) {
      console.warn('Camera not available for streaming');
      return;
    }

    if (!WebSocketService.isConnected) {
      console.warn('WebSocket not connected, cannot stream');
      return;
    }

    this.isStreaming = true;
    this.frameRate = frameRate;
    this.streamingMode = mode;
    this.frameCount = 0;
    this.isProcessing = false;

    console.log(`Starting streaming at ${frameRate} FPS, mode: ${mode}`);

    const frameIntervalMs = 1000 / frameRate;
    let lastFrameTime = Date.now();

    this.frameInterval = setInterval(async () => {
      if (!this.isStreaming || !this.camera || !this.hasPermission) {
        return;
      }

      const now = Date.now();
      if (now - lastFrameTime < frameIntervalMs) {
        return;
      }

      lastFrameTime = now;
      
      // Skip if already processing
      if (this.isProcessing || this.frameQueue.length >= this.maxQueueSize) {
        return;
      }

      this.isProcessing = true;

      try {
        const frameBase64 = await this.captureFrame();
        
        if (frameBase64 && WebSocketService.isConnected && WebSocketService.handshakeCompleted) {
          // Send frame
          const sent = WebSocketService.sendFrame(frameBase64, this.streamingMode);
          
          if (sent) {
            this.frameCount++;
            
            // Callback for UI
            if (onFrameCallback) {
              onFrameCallback(frameBase64);
            }

            // Log progress
            if (this.frameCount % 30 === 0) {
              console.log(`Sent ${this.frameCount} frames`);
            }
          }
        }
      } catch (error) {
        console.error('Streaming error:', error);
      } finally {
        this.isProcessing = false;
      }
    }, frameIntervalMs);

    console.log('Streaming started');
  }

  stopStreaming() {
    if (this.frameInterval) {
      clearInterval(this.frameInterval);
      this.frameInterval = null;
    }
    
    this.isStreaming = false;
    this.frameCount = 0;
    this.isProcessing = false;
    this.frameQueue = [];
    
    console.log('Streaming stopped');
  }

  async checkPermission() {
    try {
      const { status } = await Camera.getCameraPermissionsAsync();
      this.hasPermission = status === 'granted';
      return this.hasPermission;
    } catch (error) {
      console.error('Error checking permission:', error);
      return false;
    }
  }

  async requestPermissionWithExplanation() {
    try {
      return new Promise((resolve) => {
        Alert.alert(
          'Camera Access Needed',
          'This app needs camera access to translate sign language and lip movements.',
          [
            {
              text: 'Allow',
              onPress: async () => {
                const granted = await this.initialize();
                resolve(granted);
              }
            },
            {
              text: 'Deny',
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

  getPermissionStatus() {
    return this.hasPermission;
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