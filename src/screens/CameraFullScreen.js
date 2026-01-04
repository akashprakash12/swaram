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
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { IconButton } from 'react-native-paper';
import { 
  CameraView,
  useCameraPermissions,
  useMicrophonePermissions,
  Camera,
} from 'expo-camera';
import colors from '../constants/colors';

const { width, height } = Dimensions.get('window');

// Hand connections for drawing (MediaPipe format)
const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],        // Thumb
  [0, 5], [5, 6], [6, 7], [7, 8],        // Index finger
  [0, 9], [9, 10], [10, 11], [11, 12],   // Middle finger
  [0, 13], [13, 14], [14, 15], [15, 16], // Ring finger
  [0, 17], [17, 18], [18, 19], [19, 20]  // Pinky
];

// Detection Overlay Component
// Updated DetectionOverlay component - FIXED VERSION
const DetectionOverlay = ({ detectionData, mode, isTranslating, translationText }) => {
  // Early returns for different states
  if (!isTranslating) {
    return (
      <View style={styles.waitingOverlay}>
        <Text style={styles.waitingText}>Ready for Detection</Text>
        <Text style={styles.waitingSubtext}>
          {mode === 'sign' ? 'Show your hands in the frame' :
           mode === 'lip' ? 'Face the camera clearly' :
           'Show hands or face for detection'}
        </Text>
        <View style={styles.guideCircle} />
        <Text style={styles.guideText}>Place here</Text>
      </View>
    );
  }

  // Debug logging
  console.log('DetectionOverlay received data:', {
    hasDetection: !!detectionData,
    handLandmarks: detectionData?.handLandmarks?.length || 0,
    lipLandmarks: detectionData?.lipLandmarks?.length || 0,
    mode: mode
  });

  // If no detection data yet
  if (!detectionData) {
    return (
      <View style={styles.processingOverlay}>
        <ActivityIndicator size="large" color="#FFFFFF" />
        <Text style={styles.processingText}>Processing frame...</Text>
      </View>
    );
  }

  // Main rendering for detection
  return (
    <View style={styles.detectionOverlay} pointerEvents="none">
      {/* Render hand landmarks */}
      {detectionData.handLandmarks && detectionData.handLandmarks.length > 0 && 
       (mode === 'sign' || mode === 'both') && (
        <HandLandmarks 
          landmarks={detectionData.handLandmarks} 
          connections={detectionData.handConnections || HAND_CONNECTIONS}
        />
      )}
      
      {/* Render lip landmarks */}
      {detectionData.lipLandmarks && detectionData.lipLandmarks.length > 0 && 
       (mode === 'lip' || mode === 'both') && (
        <LipLandmarks 
          landmarks={detectionData.lipLandmarks} 
          lipIndices={detectionData.lipIndices}
        />
      )}
      
      {/* Render hand bounding box */}
      {detectionData.handBoundingBox && (mode === 'sign' || mode === 'both') && (
        <BoundingBox 
          box={detectionData.handBoundingBox}
          label={`✋ Hand${detectionData.handCount > 1 ? 's' : ''}`}
          color="#FF5722"
        />
      )}
      
      {/* Render lip bounding box */}
      {detectionData.lipBoundingBox && (mode === 'lip' || mode === 'both') && (
        <BoundingBox 
          box={detectionData.lipBoundingBox}
          label="👄 Lips"
          color="#2196F3"
        />
      )}
      
      {/* Center guide */}
      <View style={styles.centerGuide}>
        <View style={styles.guideCircleLarge} />
        <Text style={styles.guideInstruction}>
          Place hand here for best detection
        </Text>
      </View>
      
      {/* Detection info panel */}
      <DetectionInfo 
        detectionData={detectionData}
        translationText={translationText}
        mode={mode}
      />
    </View>
  );
};

// New helper components
const HandLandmarks = ({ landmarks, connections }) => {
  if (!landmarks || landmarks.length === 0) return null;
  
  const hands = [];
  const landmarksPerHand = 21;
  
  // Group landmarks by hand
  for (let i = 0; i < landmarks.length; i += landmarksPerHand) {
    const handLandmarks = landmarks.slice(i, i + landmarksPerHand);
    if (handLandmarks.length === landmarksPerHand) {
      hands.push(handLandmarks);
    }
  }
  
  return (
    <>
      {/* Render connection lines */}
      {connections && hands.map((hand, handIndex) => (
        connections.map(([start, end]) => {
          if (start < hand.length && end < hand.length) {
            const startPt = hand[start];
            const endPt = hand[end];
            
            if (!startPt || !endPt) return null;
            
            const dx = endPt.x - startPt.x;
            const dy = endPt.y - startPt.y;
            const distance = Math.sqrt(dx * dx + dy * dy) * 100; // percentage
            const angle = Math.atan2(dy, dx) * (180 / Math.PI);
            
            return (
              <View
                key={`hand-${handIndex}-conn-${start}-${end}`}
                style={[
                  styles.connectionLine,
                  {
                    left: `${startPt.x * 100}%`,
                    top: `${startPt.y * 100}%`,
                    width: distance,
                    height: 2,
                    transform: [
                      { rotate: `${angle}deg` },
                      { translateX: -distance / 2 }
                    ],
                    backgroundColor: handIndex === 0 ? 'rgba(255, 87, 34, 0.6)' : 'rgba(76, 175, 80, 0.6)',
                  },
                ]}
              />
            );
          }
          return null;
        })
      ))}
      
      {/* Render landmark points */}
      {hands.map((hand, handIndex) => (
        hand.map((landmark, index) => (
          <View
            key={`hand-${handIndex}-point-${index}`}
            style={[
              styles.landmarkPoint,
              {
                left: `${landmark.x * 100}%`,
                top: `${landmark.y * 100}%`,
                backgroundColor: handIndex === 0 ? '#FF5722' : '#4CAF50',
                width: 6,
                height: 6,
                borderRadius: 3,
              }
            ]}
          />
        ))
      ))}
    </>
  );
};

const LipLandmarks = ({ landmarks }) => {
  if (!landmarks || landmarks.length === 0) return null;
  
  return (
    <>
      {/* Render lip landmark points */}
      {landmarks.map((landmark, index) => (
        <View
          key={`lip-point-${index}`}
          style={[
            styles.landmarkPoint,
            {
              left: `${landmark.x * 100}%`,
              top: `${landmark.y * 100}%`,
              backgroundColor: '#2196F3',
              width: 4,
              height: 4,
              borderRadius: 2,
            }
          ]}
        />
      ))}
      
      {/* Draw lip outline */}
      {landmarks.length > 5 && (
        <PolyLine
          points={landmarks}
          color="rgba(33, 150, 243, 0.6)"
          strokeWidth={2}
        />
      )}
    </>
  );
};

const BoundingBox = ({ box, label, color }) => {
  if (!box) return null;
  
  return (
    <View
      style={[
        styles.boundingBox,
        {
          left: `${box.x * 100}%`,
          top: `${box.y * 100}%`,
          width: `${box.width * 100}%`,
          height: `${box.height * 100}%`,
          borderColor: color,
          borderWidth: 2,
        }
      ]}
    >
      <View style={[styles.boundingBoxLabel, { backgroundColor: color }]}>
        <Text style={styles.boundingBoxLabelText}>{label}</Text>
      </View>
    </View>
  );
};

const PolyLine = ({ points, color, strokeWidth }) => {
  if (points.length < 2) return null;
  
  const pathData = points.map((point, index) => {
    const x = point.x * 100;
    const y = point.y * 100;
    return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ');
  
  // Close the path
  pathData += ` L ${points[0].x * 100} ${points[0].y * 100}`;
  
  // Since React Native doesn't have SVG support without libraries,
  // we'll use individual line segments
  return (
    <>
      {points.map((point, index) => {
        const nextPoint = points[(index + 1) % points.length];
        if (!nextPoint) return null;
        
        const dx = nextPoint.x - point.x;
        const dy = nextPoint.y - point.y;
        const distance = Math.sqrt(dx * dx + dy * dy) * 100;
        const angle = Math.atan2(dy, dx) * (180 / Math.PI);
        
        return (
          <View
            key={`line-${index}`}
            style={[
              styles.connectionLine,
              {
                left: `${point.x * 100}%`,
                top: `${point.y * 100}%`,
                width: distance,
                height: strokeWidth || 2,
                transform: [
                  { rotate: `${angle}deg` },
                  { translateX: -distance / 2 }
                ],
                backgroundColor: color,
              },
            ]}
          />
        );
      })}
    </>
  );
};

const DetectionInfo = ({ detectionData, translationText, mode }) => {
  return (
    <View style={styles.detectionInfoContainer}>
      {/* Detection Status */}
      <View style={styles.detectionStatus}>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Mode:</Text>
          <Text style={styles.statusText}>
            {mode === 'sign' ? 'Sign Language' :
             mode === 'lip' ? 'Lip Reading' : 'Hybrid'}
          </Text>
        </View>
        
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Hands:</Text>
          <Text style={styles.statusText}>
            {detectionData.handCount || 0} detected
          </Text>
        </View>
        
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Lips:</Text>
          <Text style={styles.statusText}>
            {detectionData.lipDetected ? 'Detected' : 'Not detected'}
          </Text>
        </View>
      </View>
      
      {/* Confidence Meter */}
      <View style={styles.confidenceContainer}>
        <Text style={styles.confidenceLabel}>Detection Confidence</Text>
        <View style={styles.confidenceBar}>
          <View 
            style={[
              styles.confidenceFill,
              { 
                width: `${(detectionData.confidence || 0) * 100}%`,
                backgroundColor: (detectionData.confidence || 0) > 0.7 ? '#4CAF50' : 
                               (detectionData.confidence || 0) > 0.4 ? '#FFC107' : '#F44336'
              }
            ]} 
          />
        </View>
        <Text style={styles.confidencePercentage}>
          {Math.round((detectionData.confidence || 0) * 100)}%
        </Text>
      </View>
      
      {/* Translation Result */}
      {translationText && (
        <View style={styles.translationResult}>
          <Text style={styles.translationLabel}>Translated:</Text>
          <Text style={styles.translationText}>{translationText}</Text>
        </View>
      )}
    </View>
  );
};
// Main CameraFullScreen Component
export default function CameraFullScreen({ 
  visible, 
  onClose, 
  translationMode = 'sign',
  isTranslating = false,
  detectionData = null,
  onStartRecording = () => {},
  onStopRecording = () => {},
  translationText = '',
  onCameraReady = () => {} 
}) {
  const [isRecording, setIsRecording] = useState(false);
  const [flashMode, setFlashMode] = useState('off');
  const [cameraType, setCameraType] = useState('front');
  const [zoom, setZoom] = useState(0);
  const [hasPermission, setHasPermission] = useState(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const cameraRef = useRef(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const recordingTime = useRef(0);
  const recordingInterval = useRef(null);
  const processingAnim = useRef(new Animated.Value(0)).current;

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [microphonePermission, requestMicrophonePermission] = useMicrophonePermissions();

  useEffect(() => {
    if (visible) {
      // Request permissions if needed
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
      // Clean up
      if (recordingInterval.current) {
        clearInterval(recordingInterval.current);
        recordingInterval.current = null;
      }
      
      if (isRecording) {
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

      // Pulse animation for recording indicator
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

  useEffect(() => {
    if (isTranslating) {
      // Processing animation
      Animated.loop(
        Animated.sequence([
          Animated.timing(processingAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(processingAnim, {
            toValue: 0,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      processingAnim.stopAnimation();
    }
  }, [isTranslating]);

  useEffect(() => {
    if (cameraPermission && microphonePermission) {
      const granted = cameraPermission.granted && microphonePermission.granted;
      setHasPermission(granted);
    }
  }, [cameraPermission, microphonePermission]);

  const handleStartRecording = () => {
    setIsRecording(true);
    setIsProcessing(true);
    onStartRecording();
  };

  const handleStopRecording = () => {
    setIsRecording(false);
    setIsProcessing(false);
    onStopRecording();
  };

  const handleToggleRecording = () => {
    if (!isRecording) {
      handleStartRecording();
    } else {
      handleStopRecording();
    }
  };

  const handleToggleFlash = () => {
    setFlashMode(prev => prev === 'off' ? 'on' : 'off');
  };

  const handleToggleCamera = () => {
    setCameraType(prev => prev === 'front' ? 'back' : 'front');
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
    return flashMode === 'on' ? '⚡️' : '⚡️';
  };

  const getFlashText = () => {
    return flashMode === 'on' ? 'ON' : 'OFF';
  };

  const getCameraTypeText = () => {
    return cameraType === 'front' ? 'Front' : 'Back';
  };

  const CameraComponent = CameraView || Camera;

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      statusBarTranslucent
      hardwareAccelerated
      onRequestClose={onClose}
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
            
            {isProcessing && !isRecording && (
              <View style={styles.processingIndicator}>
                <ActivityIndicator size="small" color="#FFFFFF" />
                <Text style={styles.processingText}>Processing...</Text>
              </View>
            )}
          </View>
        </View>

        {/* Camera Preview Area */}

<View style={styles.cameraPreview}>
  {hasPermission === true ? (
    <View style={styles.cameraContainer}>
      <CameraComponent
           ref={(ref) => {
      cameraRef.current = ref;
      // Pass camera ref to parent (HomeScreen)
      if (ref && onCameraReady) {
        onCameraReady(ref);
      }
    }}
        style={StyleSheet.absoluteFill}
        facing={cameraType}
        flashMode={flashMode}
        zoom={zoom}
        onCameraReady={() => {
          console.log('✓ Camera is ready');
          setCameraReady(true);
        }}
        onError={(error) => {
          console.error('Camera error:', error);
          setCameraReady(false);
        }}
        mode="video"
        videoQuality="1080p"
      />
      
      {/* Overlay components */}
      <DetectionOverlay 
        detectionData={detectionData}
        mode={translationMode}
        isTranslating={isTranslating}
        translationText={translationText}
      />
      
      {/* Grid Overlay */}
      <View style={styles.gridOverlay}>
        <View style={styles.gridLineHorizontal} />
        <View style={styles.gridLineVertical} />
        <View style={styles.focusBox} />
      </View>
      
      {/* Mode Indicator */}
      <View style={styles.modeIndicator}>
        <Text style={styles.modeIndicatorIcon}>{getModeIcon()}</Text>
        <Text style={styles.modeIndicatorLabel}>{getModeText()}</Text>
      </View>
      
      {/* Zoom Indicator */}
      {zoom > 0 && (
        <View style={styles.zoomIndicator}>
          <Text style={styles.zoomText}>{Math.round(zoom * 100)}%</Text>
        </View>
      )}
    </View>
  ) : hasPermission === false ? (
    <View style={styles.permissionOverlay}>
      <Text style={styles.permissionTitle}>Camera Permission Required</Text>
      <Text style={styles.permissionText}>
        Please enable camera and microphone access in your device settings.
      </Text>
      <TouchableOpacity 
        style={styles.permissionButton}
        onPress={requestCameraPermission}
      >
        <Text style={styles.permissionButtonText}>Grant Permission</Text>
      </TouchableOpacity>
    </View>
  ) : (
    <View style={styles.permissionOverlay}>
      <ActivityIndicator size="large" color="#FFFFFF" />
      <Text style={styles.permissionTitle}>Requesting Permissions...</Text>
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
            <Text style={styles.infoIcon}>🤟</Text>
            <Text style={styles.infoText}>Real-time</Text>
          </View>
          <View style={styles.infoDivider} />
          <View style={styles.infoItem}>
            <Text style={styles.infoIcon}>⚡</Text>
            <Text style={styles.infoText}>Live Detection</Text>
          </View>
          <View style={styles.infoDivider} />
          <View style={styles.infoItem}>
            <Text style={styles.infoIcon}>🎯</Text>
            <Text style={styles.infoText}>Accurate</Text>
          </View>
        </View>

        {/* Detection Stats Overlay */}
        {detectionData && isTranslating && (
          <View style={styles.statsOverlay}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {detectionData.handCount || 0}
              </Text>
              <Text style={styles.statLabel}>Hands</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {detectionData.lipDetected ? 'Yes' : 'No'}
              </Text>
              <Text style={styles.statLabel}>Lips</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {detectionData.confidence ? `${Math.round(detectionData.confidence * 100)}%` : '0%'}
              </Text>
              <Text style={styles.statLabel}>Confidence</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {detectionData.gesture ? '✓' : '✗'}
              </Text>
              <Text style={styles.statLabel}>Gesture</Text>
            </View>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Add to styles in CameraFullScreen.js
cameraContainer: {
  flex: 1,
  position: 'relative',
},
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
  processingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
  },
  processingText: {
    color: '#FFFFFF',
    fontSize: 11,
    marginLeft: 6,
  },
  cameraPreview: {
    flex: 1,
    backgroundColor: '#000000',
    position: 'relative',
  },
  camera: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },


  // Add these to the styles object
detectionOverlay: {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  pointerEvents: 'none',
  zIndex: 10,
},
landmarkPoint: {
  position: 'absolute',
  zIndex: 11,
},
connectionLine: {
  position: 'absolute',
  zIndex: 10,
  transformOrigin: 'left center',
},
boundingBox: {
  position: 'absolute',
  zIndex: 9,
  borderRadius: 4,
},
boundingBoxLabel: {
  position: 'absolute',
  top: -25,
  left: 5,
  paddingHorizontal: 8,
  paddingVertical: 4,
  borderRadius: 10,
},
boundingBoxLabelText: {
  color: '#FFFFFF',
  fontSize: 11,
  fontWeight: 'bold',
},
detectionInfoContainer: {
  position: 'absolute',
  top: 20,
  left: 20,
  right: 20,
  backgroundColor: 'rgba(0, 0, 0, 0.8)',
  borderRadius: 15,
  padding: 15,
  zIndex: 20,
},
detectionStatus: {
  marginBottom: 15,
},
statusRow: {
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 8,
},
statusLabel: {
  color: '#FFFFFF',
  fontSize: 14,
  fontWeight: '600',
},
statusText: {
  color: '#FFFFFF',
  fontSize: 14,
},
confidenceContainer: {
  marginBottom: 15,
},
confidenceLabel: {
  color: '#FFFFFF',
  fontSize: 12,
  marginBottom: 6,
},
confidenceBar: {
  height: 8,
  backgroundColor: 'rgba(255, 255, 255, 0.2)',
  borderRadius: 4,
  overflow: 'hidden',
  marginBottom: 6,
},
confidenceFill: {
  height: '100%',
  borderRadius: 4,
},
confidencePercentage: {
  color: '#FFFFFF',
  fontSize: 12,
  fontWeight: 'bold',
  textAlign: 'right',
},
translationResult: {
  borderTopWidth: 1,
  borderTopColor: 'rgba(255, 255, 255, 0.2)',
  paddingTop: 10,
},
translationLabel: {
  color: '#FFFFFF',
  fontSize: 12,
  marginBottom: 5,
},
translationText: {
  color: '#4CAF50',
  fontSize: 18,
  fontWeight: 'bold',
},
centerGuide: {
  position: 'absolute',
  top: '50%',
  left: '50%',
  marginLeft: -75,
  marginTop: -75,
  width: 150,
  height: 150,
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 5,
},
guideCircleLarge: {
  width: 120,
  height: 120,
  borderRadius: 60,
  borderWidth: 2,
  borderColor: 'rgba(255, 255, 255, 0.2)',
  borderStyle: 'dashed',
},
guideInstruction: {
  position: 'absolute',
  bottom: -30,
  color: 'rgba(255, 255, 255, 0.7)',
  fontSize: 12,
  textAlign: 'center',
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
    marginBottom: 20,
  },
  permissionButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
  },
  permissionButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 16,
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