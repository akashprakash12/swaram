
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Animated,
  Modal,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { IconButton } from 'react-native-paper';
import { 
  CameraView,  // This is the new Camera component in newer versions
  useCameraPermissions,
  useMicrophonePermissions,
  Camera,  // Keep this for backward compatibility
  PermissionStatus 
} from 'expo-camera';
import colors from '../constants/colors';

const { width, height } = Dimensions.get('window');

// Fallback constants
const CAMERA_CONSTANTS = {
  FlashMode: {
    on: 'on',
    off: 'off',
    auto: 'auto',
    torch: 'torch'
  },
  Type: {
    front: 'front',
    back: 'back'
  },
  VideoQuality: {
    '2160p': '2160p',
    '1080p': '1080p',
    '720p': '720p',
    '480p': '480p',
    '4:3': '4:3'
  }
};

export default function CameraFullScreen({ 
  visible, 
  onClose, 
  translationMode = 'sign',
  isTranslating = false 
}) {
  const [isRecording, setIsRecording] = useState(false);
  const [flashMode, setFlashMode] = useState(CAMERA_CONSTANTS.FlashMode.off);
  const [cameraType, setCameraType] = useState(CAMERA_CONSTANTS.Type.front);
  const [zoom, setZoom] = useState(0);
  const [hasPermission, setHasPermission] = useState(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraConstants, setCameraConstants] = useState(CAMERA_CONSTANTS);
  
  const cameraRef = useRef(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const recordingTime = useRef(0);
  const recordingInterval = useRef(null);

  // Use the new hooks for permissions
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [microphonePermission, requestMicrophonePermission] = useMicrophonePermissions();

  useEffect(() => {
    // Check permissions
    if (cameraPermission && microphonePermission) {
      const granted = cameraPermission.granted && microphonePermission.granted;
      console.log('Permissions:', { 
        camera: cameraPermission.granted, 
        microphone: microphonePermission.granted 
      });
      setHasPermission(granted);
    }
  }, [cameraPermission, microphonePermission]);

  useEffect(() => {
    if (visible) {
      // Request permissions if not already granted
      if (!cameraPermission?.granted) {
        requestCameraPermission();
      }
      if (!microphonePermission?.granted) {
        requestMicrophonePermission();
      }
      
      // Fade in animation
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
      
      StatusBar.setHidden(true);
    } else {
      StatusBar.setHidden(false);
      // Clean up recording interval
      if (recordingInterval.current) {
        clearInterval(recordingInterval.current);
        recordingInterval.current = null;
      }
      
      // Stop recording if active
      if (isRecording && cameraRef.current) {
        handleStopRecording();
      }
    }
    
    return () => {
      StatusBar.setHidden(false);
    };
  }, [visible]);

  useEffect(() => {
    if (isRecording) {
      // Start recording timer
      recordingTime.current = 0;
      recordingInterval.current = setInterval(() => {
        recordingTime.current += 1;
      }, 1000);

      // Pulse animation for recording
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      // Stop recording timer
      if (recordingInterval.current) {
        clearInterval(recordingInterval.current);
        recordingInterval.current = null;
      }
      pulseAnim.stopAnimation();
    }

    return () => {
      if (recordingInterval.current) {
        clearInterval(recordingInterval.current);
      }
    };
  }, [isRecording]);

  const handleStartRecording = async () => {
    if (!cameraRef.current || !cameraReady) {
      console.log('Camera not ready');
      return;
    }

    try {
      // Start recording
      console.log('Starting recording...');
      
      // Check which recording method is available
      if (cameraRef.current.recordAsync) {
        const videoRecordPromise = cameraRef.current.recordAsync({
          quality: '1080p',
          maxDuration: 300, // 5 minutes max
          mute: false,
        });

        setIsRecording(true);
        
        // Handle recording completion
        const video = await videoRecordPromise;
        console.log('Video recorded:', video.uri);
      } else {
        console.error('recordAsync method not available on cameraRef');
      }
      
    } catch (error) {
      console.error('Error recording video:', error);
      setIsRecording(false);
    }
  };

  const handleStopRecording = async () => {
    if (cameraRef.current && isRecording) {
      try {
        console.log('Stopping recording...');
        if (cameraRef.current.stopRecording) {
          await cameraRef.current.stopRecording();
          console.log('Recording stopped successfully');
        }
      } catch (error) {
        console.error('Error stopping recording:', error);
      } finally {
        setIsRecording(false);
      }
    }
  };

  const handleToggleRecording = async () => {
    if (!isRecording) {
      await handleStartRecording();
    } else {
      await handleStopRecording();
    }
  };

  const handleToggleFlash = () => {
    setFlashMode(prev => 
      prev === 'off' ? 'on' : 'off'
    );
  };

  const handleToggleCamera = () => {
    setCameraType(prev => 
      prev === 'front' ? 'back' : 'front'
    );
  };

  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev + 0.1, 1));
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev - 0.1, 0));
  };

  const formatRecordingTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getModeText = () => {
    switch(translationMode) {
      case 'sign': return 'Sign Language Mode';
      case 'lip': return 'Lip Reading Mode';
      case 'both': return 'Hybrid Mode';
      default: return 'Camera Mode';
    }
  };

  const getModeIcon = () => {
    switch(translationMode) {
      case 'sign': return '👐';
      case 'lip': return '🗣️';
      case 'both': return '🤝';
      default: return '📷';
    }
  };

  const getFlashIcon = () => {
    return flashMode === 'on' ? '⚡' : '⚡';
  };

  const getFlashText = () => {
    return flashMode === 'on' ? 'ON' : 'OFF';
  };

  const getCameraTypeText = () => {
    return cameraType === 'front' ? 'Front' : 'Back';
  };

  // Choose the correct Camera component
  // In newer versions of expo-camera, CameraView is the main component
  const CameraComponent = CameraView || Camera;

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      statusBarTranslucent
      hardwareAccelerated
    >
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <IconButton
              icon="close"
              size={28}
              iconColor="#FFFFFF"
              onPress={onClose}
              style={styles.closeButton}
            />
            <View style={styles.modeBadge}>
              <Text style={styles.modeIcon}>{getModeIcon()}</Text>
              <Text style={styles.modeText}>{getModeText()}</Text>
            </View>
          </View>
          
          <View style={styles.headerRight}>
            {isRecording && (
              <Animated.View 
                style={[
                  styles.recordingIndicator,
                  { transform: [{ scale: pulseAnim }] }
                ]}
              >
                <View style={styles.recordingDot} />
                <Text style={styles.recordingText}>
                  REC {formatRecordingTime(recordingTime.current)}
                </Text>
              </Animated.View>
            )}
          </View>
        </View>

        {/* Camera Preview Area */}
        <View style={styles.cameraPreview}>
          {hasPermission === true ? (
            <CameraComponent
              ref={cameraRef}
              style={styles.camera}
              facing={cameraType}
              flash={flashMode}
              zoom={zoom}
              onCameraReady={() => {
                console.log('Camera is ready');
                setCameraReady(true);
              }}
              onError={(error) => {
                console.error('Camera error:', error);
                setCameraReady(false);
              }}
              mode="video" // Set to video mode
              videoQuality="1080p"
            >
              {/* Grid Overlay */}
              <View style={styles.gridOverlay}>
                <View style={styles.gridLineHorizontal} />
                <View style={styles.gridLineVertical} />
                <View style={styles.focusBox} />
              </View>
              
              {/* Zoom Indicator */}
              {zoom > 0 && (
                <View style={styles.zoomIndicator}>
                  <Text style={styles.zoomText}>{Math.round(zoom * 100)}%</Text>
                </View>
              )}
              
              {/* Mode Indicator */}
              <View style={styles.modeIndicator}>
                <Text style={styles.modeIndicatorIcon}>{getModeIcon()}</Text>
                <Text style={styles.modeIndicatorLabel}>{getModeText()}</Text>
              </View>
              
              {/* Processing Overlay */}
              {isTranslating && (
                <View style={styles.processingOverlay}>
                  <Text style={styles.processingText}>
                    Processing {translationMode === 'sign' ? 'hand gestures' : 
                              translationMode === 'lip' ? 'lip movements' : 
                              'gestures & lip movements'}...
                  </Text>
                  <View style={styles.processingBar}>
                    <Animated.View 
                      style={[
                        styles.processingFill,
                        {
                          width: pulseAnim.interpolate({
                            inputRange: [1, 1.2],
                            outputRange: ['30%', '70%']
                          })
                        }
                      ]}
                    />
                  </View>
                </View>
              )}
            </CameraComponent>
          ) : hasPermission === false ? (
            <View style={styles.permissionOverlay}>
              <Text style={styles.permissionTitle}>Camera Permission Required</Text>
              <Text style={styles.permissionText}>
                Please enable camera and microphone access in your device settings to use this feature.
              </Text>
            </View>
          ) : (
            <View style={styles.permissionOverlay}>
              <Text style={styles.permissionTitle}>Requesting Camera Permission...</Text>
              <Text style={styles.permissionText}>
                Please allow camera and microphone access to use this feature.
              </Text>
            </View>
          )}
        </View>

        {/* Camera Controls */}
        <View style={styles.controlsContainer}>
          {/* Left Controls */}
          <View style={styles.controlGroup}>
            <TouchableOpacity 
              style={[
                styles.controlButton,
                flashMode === 'on' && styles.controlButtonActive
              ]}
              onPress={handleToggleFlash}
              disabled={!cameraReady || isRecording}
            >
              <View style={styles.controlIconContainer}>
                <Text style={styles.controlButtonIcon}>
                  {getFlashIcon()}
                </Text>
              </View>
              <Text style={styles.controlButtonText}>
                {getFlashText()}
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[
                styles.controlButton,
                zoom === 0 && styles.controlButtonDisabled
              ]}
              onPress={handleZoomOut}
              disabled={zoom === 0 || !cameraReady || isRecording}
            >
              <View style={styles.controlIconContainer}>
                <Text style={styles.controlButtonIcon}>-</Text>
              </View>
              <Text style={styles.controlButtonText}>Zoom Out</Text>
            </TouchableOpacity>
          </View>

          {/* Center Recording Button */}
          <TouchableOpacity
            style={[
              styles.recordingButton,
              isRecording && styles.recordingButtonActive,
              (!cameraReady || hasPermission !== true) && styles.controlButtonDisabled
            ]}
            onPress={handleToggleRecording}
            activeOpacity={0.8}
            disabled={!cameraReady || hasPermission !== true}
          >
            <View style={styles.recordingButtonInner}>
              {isRecording ? (
                <View style={styles.stopIcon} />
              ) : (
                <View style={styles.recordIcon} />
              )}
            </View>
          </TouchableOpacity>

          {/* Right Controls */}
          <View style={styles.controlGroup}>
            <TouchableOpacity 
              style={[
                styles.controlButton,
                zoom === 1 && styles.controlButtonDisabled
              ]}
              onPress={handleZoomIn}
              disabled={zoom === 1 || !cameraReady || isRecording}
            >
              <View style={styles.controlIconContainer}>
                <Text style={styles.controlButtonIcon}>+</Text>
              </View>
              <Text style={styles.controlButtonText}>Zoom In</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.controlButton}
              onPress={handleToggleCamera}
              disabled={!cameraReady || isRecording}
            >
              <View style={styles.controlIconContainer}>
                <Text style={styles.controlButtonIcon}>↻</Text>
              </View>
              <Text style={styles.controlButtonText}>
                {getCameraTypeText()}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Bottom Info Bar */}
        <View style={styles.infoBar}>
          <View style={styles.infoItem}>
            <Text style={styles.infoIcon}>📱</Text>
            <Text style={styles.infoText}>Local Processing</Text>
          </View>
          <View style={styles.infoDivider} />
          <View style={styles.infoItem}>
            <Text style={styles.infoIcon}>⚡</Text>
            <Text style={styles.infoText}>Low Latency</Text>
          </View>
          <View style={styles.infoDivider} />
          <View style={styles.infoItem}>
            <Text style={styles.infoIcon}>🔒</Text>
            <Text style={styles.infoText}>Privacy Safe</Text>
          </View>
        </View>

        {/* Camera Stats Overlay */}
        <View style={styles.statsOverlay}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>
              {cameraReady ? '60 FPS' : '--'}
            </Text>
            <Text style={styles.statLabel}>Frame Rate</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>1080p</Text>
            <Text style={styles.statLabel}>Resolution</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>
              {getCameraTypeText()}
            </Text>
            <Text style={styles.statLabel}>Camera</Text>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  closeButton: {
    margin: 0,
    marginRight: 10,
  },
  modeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  modeIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  modeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  recordingIndicator: {
    backgroundColor: colors.error,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
    flexDirection: 'row',
    alignItems: 'center',
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    marginRight: 6,
  },
  recordingText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: 'bold',
  },
  cameraPreview: {
    flex: 1,
    backgroundColor: '#000000',
  },
  camera: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridOverlay: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    pointerEvents: 'none',
  },
  gridLineHorizontal: {
    position: 'absolute',
    width: '80%',
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  gridLineVertical: {
    position: 'absolute',
    width: 1,
    height: '80%',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  focusBox: {
    width: 100,
    height: 100,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 10,
    position: 'absolute',
  },
  zoomIndicator: {
    position: 'absolute',
    top: 20,
    right: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  zoomText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  modeIndicator: {
    position: 'absolute',
    bottom: 30,
    alignItems: 'center',
  },
  modeIndicatorIcon: {
    fontSize: 36,
    marginBottom: 8,
  },
  modeIndicatorLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 15,
  },
  processingOverlay: {
    position: 'absolute',
    bottom: 150,
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 30,
  },
  processingText: {
    color: '#FFFFFF',
    fontSize: 14,
    marginBottom: 10,
    textAlign: 'center',
  },
  processingBar: {
    width: '100%',
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  processingFill: {
    height: '100%',
    backgroundColor: colors.primary,
  },
  permissionOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    padding: 30,
  },
  permissionTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
  },
  permissionText: {
    color: '#FFFFFF',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    opacity: 0.8,
  },
  controlsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 30,
    paddingVertical: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
  },
  controlGroup: {
    alignItems: 'center',
  },
  controlButton: {
    alignItems: 'center',
    padding: 8,
    marginVertical: 5,
    minWidth: 60,
  },
  controlButtonActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 15,
  },
  controlButtonDisabled: {
    opacity: 0.4,
  },
  controlIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 5,
  },
  controlButtonIcon: {
    fontSize: 18,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  controlButtonText: {
    color: '#FFFFFF',
    fontSize: 10,
    opacity: 0.8,
  },
  recordingButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  recordingButtonActive: {
    backgroundColor: colors.error,
    borderColor: colors.error,
  },
  recordingButtonInner: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.error,
  },
  stopIcon: {
    width: 20,
    height: 20,
    backgroundColor: '#000000',
    borderRadius: 2,
  },
  infoBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
  },
  infoIcon: {
    fontSize: 14,
    color: '#FFFFFF',
    marginRight: 6,
    opacity: 0.8,
  },
  infoText: {
    color: '#FFFFFF',
    fontSize: 12,
    opacity: 0.8,
  },
  infoDivider: {
    width: 1,
    height: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  statsOverlay: {
    position: 'absolute',
    top: 80,
    left: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 15,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  statItem: {
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  statValue: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  statLabel: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 10,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
});
