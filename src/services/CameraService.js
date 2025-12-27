
// src/services/CameraService.js
import { Camera } from 'expo-camera';
import * as FileSystem from 'expo-file-system';
import { Alert, Platform, Linking } from 'react-native';

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
          // Can't ask again, show alert to guide user to settings
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
      // Show custom explanation first
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
      const photo = await this.camera.takePictureAsync({
        quality: 0.5,
        base64: true,
        exif: false,
      });

      return photo.base64;
    } catch (error) {
      console.error('Error capturing frame:', error);
      return null;
    }
  }

  async captureHighQualityFrame() {
    if (!this.camera) return null;

    try {
      const photo = await this.camera.takePictureAsync({
        quality: 1,
        base64: true,
        exif: false,
      });

      return photo.base64;
    } catch (error) {
      console.error('Error capturing HQ frame:', error);
      return null;
    }
  }

  async processFrameForSignLanguage(frameBase64) {
    // Extract hand landmarks using TensorFlow.js
    // This is a placeholder - integrate with actual TFJS model
    return {
      landmarks: [],
      confidence: 0.8,
      timestamp: Date.now(),
    };
  }

  async processFrameForLipReading(frameBase64) {
    // Extract lip region and features
    // This is a placeholder - integrate with actual TFJS model
    return {
      lip_features: [],
      confidence: 0.7,
      timestamp: Date.now(),
    };
  }

  startStreaming(onFrameCallback, frameRate = 15) {
    if (this.isStreaming) return;

    // Check permission before streaming
    if (this.hasPermission === false) {
      console.warn('Cannot start streaming - no camera permission');
      return;
    }

    this.isStreaming = true;
    this.frameRate = frameRate;
    const interval = 1000 / frameRate;

    this.frameInterval = setInterval(async () => {
      if (this.camera && this.hasPermission) {
        const frameBase64 = await this.captureFrame();
        if (frameBase64 && onFrameCallback) {
          onFrameCallback(frameBase64);
        }
      }
    }, interval);
  }

  stopStreaming() {
    if (this.frameInterval) {
      clearInterval(this.frameInterval);
      this.frameInterval = null;
    }
    this.isStreaming = false;
  }

  async captureSequence(duration = 3000) {
    const frames = [];
    const interval = 1000 / this.frameRate;
    const framesCount = Math.floor(duration / interval);

    for (let i = 0; i < framesCount; i++) {
      const frame = await this.captureFrame();
      if (frame) {
        frames.push(frame);
      }
      await this.sleep(interval);
    }

    return frames;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async saveFramesToDisk(frames, folderName = 'sign_language_frames') {
    const folderPath = `${FileSystem.documentDirectory}${folderName}/`;
    await FileSystem.makeDirectoryAsync(folderPath, { intermediates: true });

    const savedPaths = [];
    for (let i = 0; i < frames.length; i++) {
      const filePath = `${folderPath}frame_${i}.jpg`;
      await FileSystem.writeAsStringAsync(filePath, frames[i], {
        encoding: FileSystem.EncodingType.Base64,
      });
      savedPaths.push(filePath);
    }

    return savedPaths;
  }

  async loadFramesFromDisk(folderName = 'sign_language_frames') {
    const folderPath = `${FileSystem.documentDirectory}${folderName}/`;
    const files = await FileSystem.readDirectoryAsync(folderPath);
    
    const frames = [];
    for (const file of files.sort()) {
      if (file.endsWith('.jpg')) {
        const filePath = `${folderPath}${file}`;
        const content = await FileSystem.readAsStringAsync(filePath, {
          encoding: FileSystem.EncodingType.Base64,
        });
        frames.push(content);
      }
    }

    return frames;
  }

  async clearFrames(folderName = 'sign_language_frames') {
    const folderPath = `${FileSystem.documentDirectory}${folderName}/`;
    try {
      await FileSystem.deleteAsync(folderPath);
      return true;
    } catch (error) {
      console.error('Error clearing frames:', error);
      return false;
    }
  }

  async optimizeFrame(frameBase64, quality = 0.5) {
    // This is a simplified version
    // In production, use a proper image compression library
    return frameBase64; // Placeholder
  }

  async extractFrameMetadata(frameBase64) {
    return {
      size: frameBase64.length,
      timestamp: Date.now(),
      format: 'jpg',
      quality: 'medium',
    };
  }

  // Getter methods for checking state
  getPermissionStatus() {
    return this.hasPermission;
  }

  isPermissionRequested() {
    return this.permissionRequested;
  }
}

// Singleton instance
const cameraService = new CameraService();
export default cameraService;
