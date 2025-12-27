// src/services/CameraService.js
import { Camera } from 'expo-camera';
import * as FileSystem from 'expo-file-system';

class CameraService {
  constructor() {
    this.camera = null;
    this.isStreaming = false;
    this.frameInterval = null;
    this.frameRate = 15; // Reduced for better performance
    this.frameCount = 0;
    this.frameBuffer = [];
    this.bufferSize = 10;
    this.processingQueue = [];
  }

  async initialize() {
    const { status } = await Camera.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      throw new Error('Camera permission not granted');
    }
    return true;
  }

  setCameraRef(ref) {
    this.camera = ref;
  }

  async captureFrame() {
    if (!this.camera) return null;

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

    this.isStreaming = true;
    this.frameRate = frameRate;
    const interval = 1000 / frameRate;

    this.frameInterval = setInterval(async () => {
      if (this.camera) {
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
}

// Singleton instance
const cameraService = new CameraService();
export default cameraService;