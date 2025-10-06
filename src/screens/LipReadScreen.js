import React, { useState, useEffect, useRef } from "react";
import { 
  View, 
  Text, 
  StyleSheet, 
  Alert, 
  ActivityIndicator, 
  ScrollView, 
  TouchableOpacity,
  StatusBar 
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Speech from "expo-speech";
import { getLipText } from "../services/apiService";
import { Ionicons } from '@expo/vector-icons';
import CustomHeader from "../components/CustomHeader";

export default function LipReadScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef(null);
  const [capturedText, setCapturedText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [facing, setFacing] = useState("front");
  const [isRealTimeMode, setIsRealTimeMode] = useState(false);
  const [frameCount, setFrameCount] = useState(0);
  const [conversation, setConversation] = useState([]);
  
  // Refs for intervals and state management
  const processingInterval = useRef(null);
  const lastProcessedTime = useRef(0);

  useEffect(() => {
    if (!permission) {
      requestPermission();
    }
    
    // Cleanup on unmount
    return () => {
      if (processingInterval.current) {
        clearInterval(processingInterval.current);
      }
    };
  }, [permission]);

  // Process single frame from video
  const processVideoFrame = async () => {
    if (!cameraRef.current || isProcessing) return;

    const now = Date.now();
    // Only process every 2 seconds to avoid overload
    if (now - lastProcessedTime.current < 2000) return;

    setIsProcessing(true);
    lastProcessedTime.current = now;

    try {
      // Capture frame without showing preview
      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.5, // Lower quality for faster processing
        skipProcessing: true // Faster capture
      });

      if (photo.base64) {
        const result = await getLipText(photo.base64, true);
        
        if (result && !result.includes("പിശക്")) {
          setCapturedText(result);
          setFrameCount(prev => prev + 1);
          
          // Add to conversation history
          setConversation(prev => [
            ...prev.slice(-9), // Keep last 10 items
            { text: result, timestamp: new Date().toLocaleTimeString(), type: 'detected' }
          ]);
        }
      }
    } catch (error) {
      console.error("Frame processing error:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const startRealTimeProcessing = () => {
    if (processingInterval.current) {
      clearInterval(processingInterval.current);
    }

    setConversation([]);
    setFrameCount(0);
    setIsRealTimeMode(true);
    
    // Process frames every 2.5 seconds
    processingInterval.current = setInterval(processVideoFrame, 2500);
    
    // Process first frame immediately
    setTimeout(processVideoFrame, 500);
  };

  const stopRealTimeProcessing = () => {
    if (processingInterval.current) {
      clearInterval(processingInterval.current);
      processingInterval.current = null;
    }
    setIsRealTimeMode(false);
    setCapturedText("Real-time processing stopped");
  };

  const speakCurrentText = () => {
    if (capturedText && !capturedText.includes("പിശക്")) {
      Speech.speak(capturedText, { 
        language: "ml-IN",
        rate: 0.8 
      });
    }
  };

  const captureSingleImage = async () => {
    if (!cameraRef.current) return;

    setIsProcessing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.8
      });

      if (photo.base64) {
        const result = await getLipText(photo.base64, false);
        setCapturedText(result);
        
        // Add to conversation
        setConversation(prev => [
          ...prev,
          { text: result, timestamp: new Date().toLocaleTimeString(), type: 'captured' }
        ]);

        if (result && !result.includes("പിശക്")) {
          Speech.speak(result, { language: "ml-IN", rate: 0.8 });
        }
      }
    } catch (error) {
      console.error("Single capture error:", error);
      Alert.alert("Error", "Failed to capture image");
    } finally {
      setIsProcessing(false);
    }
  };

  const clearConversation = () => {
    setConversation([]);
    setCapturedText("");
    setFrameCount(0);
  };

  if (!permission) {
    return (
      <View style={styles.container}>
        <CustomHeader title="Lip Reading" showBack={true} />
        <View style={styles.centerContent}>
          <Text style={styles.loadingText}>Requesting camera permission...</Text>
        </View>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <CustomHeader title="Lip Reading" showBack={true} />
        <View style={styles.centerContent}>
          <Text style={styles.message}>Camera permission is required</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={requestPermission}>
            <Text style={styles.primaryButtonText}>Grant Permission</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CustomHeader title="Lip Reading" showBack={true} />
      
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Camera View */}
        <View style={styles.cameraContainer}>
          <CameraView
            style={styles.camera}
            facing={facing}
            ref={cameraRef}
            ratio="16:9"
          />
          <View style={styles.cameraOverlay}>
            <Text style={styles.cameraHint}>
              Position your face clearly in the frame
            </Text>
          </View>
        </View>
        
        {/* Control Buttons */}
        <View style={styles.controlsContainer}>
          {/* Top Row */}
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => setFacing(facing === "front" ? "back" : "front")}
            >
              <Ionicons name="camera-reverse" size={24} color="#FFFFFF" />
              <Text style={styles.iconButtonText}>Flip</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[
                styles.primaryButton,
                isProcessing && styles.buttonDisabled
              ]}
              onPress={captureSingleImage} 
              disabled={isProcessing}
            >
              <Ionicons name="camera" size={20} color="#FFFFFF" />
              <Text style={styles.primaryButtonText}>Single Capture</Text>
            </TouchableOpacity>
          </View>

          {/* Bottom Row */}
          <View style={styles.buttonRow}>
            {!isRealTimeMode ? (
              <TouchableOpacity 
                style={styles.secondaryButton}
                onPress={startRealTimeProcessing} 
              >
                <Ionicons name="videocam" size={20} color="#FFFFFF" />
                <Text style={styles.secondaryButtonText}>Start Real-time</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity 
                style={styles.stopButton}
                onPress={stopRealTimeProcessing} 
              >
                <Ionicons name="stop-circle" size={20} color="#FFFFFF" />
                <Text style={styles.stopButtonText}>Stop Real-time</Text>
              </TouchableOpacity>
            )}
            
            <TouchableOpacity 
              style={[
                styles.iconButton,
                (!capturedText || capturedText.includes("പിശക്")) && styles.buttonDisabled
              ]}
              onPress={speakCurrentText} 
              disabled={!capturedText || capturedText.includes("പിശക്")}
            >
              <Ionicons name="volume-high" size={24} color="#FFFFFF" />
              <Text style={styles.iconButtonText}>Speak</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Status */}
        <View style={styles.statusContainer}>
          <View style={styles.statusRow}>
            <View style={styles.statusItem}>
              <Text style={styles.statusLabel}>Mode</Text>
              <Text style={styles.statusValue}>
                {isRealTimeMode ? "Real-time 🎥" : "Single Capture 📷"}
              </Text>
            </View>
            {isRealTimeMode && (
              <View style={styles.statusItem}>
                <Text style={styles.statusLabel}>Frames</Text>
                <Text style={styles.statusValue}>{frameCount}</Text>
              </View>
            )}
          </View>
          
          {isProcessing && (
            <View style={styles.processing}>
              <ActivityIndicator size="small" color="#8F13FC" />
              <Text style={styles.processingText}>Analyzing lip movement...</Text>
            </View>
          )}
        </View>

        {/* Current Detection */}
        {capturedText ? (
          <View style={styles.currentResult}>
            <View style={styles.resultHeader}>
              <Text style={styles.resultTitle}>Detected Text</Text>
              <TouchableOpacity onPress={clearConversation}>
                <Ionicons name="trash-outline" size={20} color="#8F13FC" />
              </TouchableOpacity>
            </View>
            <Text style={styles.output}>{capturedText}</Text>
          </View>
        ) : (
          <View style={styles.placeholderContainer}>
            <Ionicons name="chatbubble-outline" size={40} color="#666" />
            <Text style={styles.placeholder}>
              {isRealTimeMode 
                ? "Real-time processing started. Speak to see text..." 
                : "Press buttons to start lip reading"}
            </Text>
          </View>
        )}

        {/* Conversation History */}
        {conversation.length > 0 && (
          <View style={styles.conversationContainer}>
            <View style={styles.conversationHeader}>
              <Text style={styles.conversationTitle}>Conversation History</Text>
              <Text style={styles.conversationCount}>({conversation.length})</Text>
            </View>
            <ScrollView 
              style={styles.conversationList}
              showsVerticalScrollIndicator={false}
            >
              {conversation.slice().reverse().map((item, index) => (
                <View 
                  key={conversation.length - index - 1} 
                  style={[
                    styles.conversationItem,
                    item.type === 'detected' ? styles.detectedItem : styles.capturedItem
                  ]}
                >
                  <View style={styles.conversationContent}>
                    <Text style={styles.conversationText}>{item.text}</Text>
                    <View style={styles.conversationMeta}>
                      <Text style={styles.conversationTime}>{item.timestamp}</Text>
                      <Text style={styles.conversationType}>
                        {item.type === 'detected' ? '🎥 Real-time' : '📷 Capture'}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: "#191A1F",
  },
  content: {
    flex: 1,
    padding: 20,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  cameraContainer: {
    marginBottom: 20,
    position: 'relative',
  },
  camera: { 
    width: "100%", 
    height: 250,
    borderRadius: 16,
    overflow: 'hidden',
  },
  cameraOverlay: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    right: 10,
    alignItems: 'center',
  },
  cameraHint: {
    color: '#FFFFFF',
    fontSize: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  controlsContainer: {
    marginBottom: 20,
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
    gap: 12,
  },
  primaryButton: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#8F13FC',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#8F13FC',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'rgba(143, 19, 252, 0.2)',
    borderWidth: 2,
    borderColor: '#8F13FC',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  secondaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  stopButton: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#FF3B30',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  stopButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    minWidth: 80,
  },
  iconButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    marginTop: 4,
    fontWeight: '500',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  statusContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statusItem: {
    alignItems: 'center',
  },
  statusLabel: {
    fontSize: 12,
    color: '#CCCCCC',
    marginBottom: 4,
  },
  statusValue: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  processing: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  processingText: {
    marginLeft: 8,
    color: '#8F13FC',
    fontSize: 14,
    fontWeight: '500',
  },
  currentResult: {
    backgroundColor: 'rgba(143, 19, 252, 0.1)',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#8F13FC',
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  resultTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#8F13FC',
  },
  output: { 
    fontSize: 20, 
    fontWeight: 'bold', 
    textAlign: 'center',
    color: '#FFFFFF',
    lineHeight: 28,
  },
  placeholderContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  placeholder: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginTop: 12,
    fontStyle: 'italic',
    lineHeight: 22,
  },
  conversationContainer: {
    marginBottom: 20,
  },
  conversationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  conversationTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  conversationCount: {
    fontSize: 14,
    color: '#8F13FC',
    fontWeight: '600',
  },
  conversationList: {
    maxHeight: 200,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 12,
  },
  conversationItem: {
    marginBottom: 8,
    borderRadius: 8,
    overflow: 'hidden',
  },
  detectedItem: {
    backgroundColor: 'rgba(143, 19, 252, 0.15)',
    borderLeftWidth: 4,
    borderLeftColor: '#8F13FC',
  },
  capturedItem: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderLeftWidth: 4,
    borderLeftColor: '#34C759',
  },
  conversationContent: {
    padding: 12,
  },
  conversationText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '500',
    marginBottom: 4,
  },
  conversationMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  conversationTime: {
    fontSize: 12,
    color: '#CCCCCC',
  },
  conversationType: {
    fontSize: 11,
    color: '#8F13FC',
    fontWeight: '500',
  },
  message: {
    fontSize: 18,
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 20,
  },
  loadingText: {
    fontSize: 16,
    color: '#CCCCCC',
    textAlign: 'center',
  },
});