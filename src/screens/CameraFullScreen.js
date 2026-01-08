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
import WebSocketService from '../services/WebSocketService';

const { width, height } = Dimensions.get('window');

// Hand connections for drawing (MediaPipe format)
const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],        // Thumb
  [0, 5], [5, 6], [6, 7], [7, 8],        // Index finger
  [0, 9], [9, 10], [10, 11], [11, 12],   // Middle finger
  [0, 13], [13, 14], [14, 15], [15, 16], // Ring finger
  [0, 17], [17, 18], [18, 19], [19, 20]  // Pinky
];

// Camera Controls Component
const CameraControls = ({ 
  facing, flash, zoom, torch, 
  onToggleFacing, onToggleFlash, onToggleTorch, onAdjustZoom 
}) => {
  return (
    <View style={styles.cameraControlsContainer}>
      {/* Top Controls */}
      <View style={styles.topControls}>
        <TouchableOpacity 
          style={styles.controlButton}
          onPress={onToggleFlash}
        >
          <Text style={styles.controlIcon}>
            {flash === 'off' ? '⚡' : flash === 'on' ? '⚡' : '🔄'}
          </Text>
          <Text style={styles.controlLabel}>
            {flash === 'off' ? 'Flash Off' : flash === 'on' ? 'Flash On' : 'Auto'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.controlButton}
          onPress={onToggleTorch}
        >
          <Text style={styles.controlIcon}>
            {torch ? '🔦' : '💡'}
          </Text>
          <Text style={styles.controlLabel}>
            {torch ? 'Torch On' : 'Torch Off'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Bottom Controls */}
      <View style={styles.bottomControls}>
        <TouchableOpacity 
          style={styles.controlButton}
          onPress={() => onAdjustZoom('out')}
        >
          <Text style={styles.controlIcon}>🔍-</Text>
          <Text style={styles.controlLabel}>Zoom Out</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.controlButton}
          onPress={onToggleFacing}
        >
          <Text style={styles.controlIcon}>📷</Text>
          <Text style={styles.controlLabel}>
            {facing === 'front' ? 'Front' : 'Back'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.controlButton}
          onPress={() => onAdjustZoom('in')}
        >
          <Text style={styles.controlIcon}>🔍+</Text>
          <Text style={styles.controlLabel}>Zoom In</Text>
        </TouchableOpacity>
      </View>

      {/* Zoom Indicator */}
      <View style={styles.zoomIndicator}>
        <Text style={styles.zoomText}>Zoom: {Math.round(zoom * 100)}%</Text>
      </View>
    </View>
  );
};

// Detection Overlay Component
// Updated DetectionOverlay component - FIXED VERSION
const DetectionOverlay = ({ detectionData, mode, isTranslating, translationText }) => {
  // Debug logging
  console.log('DetectionOverlay received data:', {
    hasDetection: !!detectionData,
    handLandmarks: detectionData?.handLandmarks?.length || 0,
    lipLandmarks: detectionData?.lipLandmarks?.length || 0,
    mode: mode,
    isTranslating: isTranslating
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
  const [hasPermission, setHasPermission] = useState(null);
  const [cameraReady, setCameraReady] = useState(false);
  const cameraRef = useRef(null);

  // Camera controls state
  const [facing, setFacing] = useState('front');
  const [flash, setFlash] = useState('off');
  const [zoom, setZoom] = useState(0);
  const [torch, setTorch] = useState(false);

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  useEffect(() => {
    if (visible && !cameraPermission?.granted) {
      requestCameraPermission();
    }
  }, [visible, cameraPermission]);

  useEffect(() => {
    setHasPermission(cameraPermission?.granted || false);
  }, [cameraPermission]);

  // Cleanup streaming interval when component unmounts or visibility changes
  useEffect(() => {
    return () => {
      if (cameraRef.current && cameraRef.current.streamingInterval) {
        clearInterval(cameraRef.current.streamingInterval);
        console.log('Cleaned up streaming interval');
      }
    };
  }, []);

  // Camera control functions
  const toggleCameraFacing = () => {
    setFacing(current => (current === 'back' ? 'front' : 'back'));
  };

  const toggleFlash = () => {
    setFlash(current => {
      if (current === 'off') return 'on';
      if (current === 'on') return 'auto';
      return 'off';
    });
  };

  const toggleTorch = () => {
    setTorch(current => !current);
  };

  const adjustZoom = (direction) => {
    setZoom(current => {
      if (direction === 'in' && current < 1) {
        return Math.min(1, current + 0.1);
      } else if (direction === 'out' && current > 0) {
        return Math.max(0, current - 0.1);
      }
      return current;
    });
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      statusBarTranslucent
      hardwareAccelerated
      onRequestClose={onClose}
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: 'black' }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 20 }}>
          <TouchableOpacity onPress={onClose}>
            <Text style={{ color: 'white', fontSize: 18 }}>✕</Text>
          </TouchableOpacity>
          <Text style={{ color: 'white', fontSize: 16 }}>
            {translationMode === 'sign' ? 'Sign Language' :
             translationMode === 'lip' ? 'Lip Reading' : 'Hybrid'} Mode
          </Text>
          <View style={{ width: 20 }} />
        </View>

        {/* Camera Preview Area */}
        {hasPermission === true ? (
          <View style={{ flex: 1 }}>
            <CameraView
              ref={(ref) => {
                cameraRef.current = ref;
                if (ref && onCameraReady) {
                  onCameraReady(ref);
                }
              }}
              style={{ flex: 1 }}
              facing={facing}
              flash={flash}
              zoom={zoom}
              enableTorch={torch}
              onCameraReady={() => {
                console.log('✓ Camera is ready');
                setCameraReady(true);
                
                // Start streaming for real-time detection overlay
                // Check if WebSocket is connected and camera is available
                setTimeout(() => {
                  if (cameraRef.current && WebSocketService && WebSocketService.isConnected) {
                    console.log('Starting preview streaming for real-time detection');
                    
                    // Start streaming directly with camera ref
                    const startDirectStreaming = () => {
                      if (!cameraRef.current) {
                        console.log('Camera ref not available for streaming');
                        return;
                      }

                      console.log('Camera ref available, starting direct streaming');
                      
                      const frameInterval = setInterval(async () => {
                        try {
                          if (!cameraRef.current || !WebSocketService.isConnected) {
                            console.log('Stopping streaming - camera or websocket not available');
                            clearInterval(frameInterval);
                            return;
                          }

                          const photo = await cameraRef.current.takePictureAsync({
                            quality: 0.3,
                            base64: true,
                            exif: false,
                          });

                          if (photo && photo.base64) {
                            WebSocketService.sendFrame(photo.base64, translationMode);
                            // Log every 10 frames to avoid spam
                            if (Math.random() < 0.1) console.log('Frame sent successfully');
                          } else {
                            console.warn('Failed to capture photo in direct streaming');
                          }
                        } catch (error) {
                          console.error('Error in direct streaming:', error);
                        }
                      }, 500); // 2 FPS for testing

                      // Store interval for cleanup
                      cameraRef.current.streamingInterval = frameInterval;
                    };

                    startDirectStreaming();
                  } else {
                    console.log('Cannot start streaming - WebSocket not connected or camera not available', {
                      cameraRef: !!cameraRef.current,
                      webSocket: !!WebSocketService,
                      isConnected: WebSocketService?.isConnected
                    });
                  }
                }, 5000); // Wait 5 seconds for camera to be fully ready
              }}
              onError={(error) => {
                console.error('Camera error:', error);
                setCameraReady(false);
              }}
            />

            {/* Detection Overlay */}
            <DetectionOverlay 
              detectionData={detectionData}
              mode={translationMode}
              isTranslating={isTranslating}
              translationText={translationText}
            />

            {/* Camera Controls Overlay */}
            <CameraControls 
              facing={facing}
              flash={flash}
              zoom={zoom}
              torch={torch}
              onToggleFacing={toggleCameraFacing}
              onToggleFlash={toggleFlash}
              onToggleTorch={toggleTorch}
              onAdjustZoom={adjustZoom}
            />
          </View>
        ) : hasPermission === false ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <Text style={{ color: 'white', fontSize: 18, textAlign: 'center' }}>
              Camera Permission Required
            </Text>
            <TouchableOpacity
              onPress={requestCameraPermission}
              style={{ marginTop: 20, padding: 15, backgroundColor: 'blue', borderRadius: 5 }}
            >
              <Text style={{ color: 'white' }}>Grant Permission</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <Text style={{ color: 'white', fontSize: 16 }}>Loading camera...</Text>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  waitingOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  waitingText: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
  },
  waitingSubtext: {
    color: 'white',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 30,
  },
  guideCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: 'white',
    borderStyle: 'dashed',
    marginBottom: 10,
  },
  guideText: {
    color: 'white',
    fontSize: 14,
    textAlign: 'center',
  },
  processingOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  processingText: {
    color: 'white',
    fontSize: 18,
    marginTop: 10,
  },
  detectionOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  centerGuide: {
    position: 'absolute',
    top: '40%',
    left: '50%',
    transform: [{ translateX: -50 }, { translateY: -50 }],
    alignItems: 'center',
  },
  guideCircleLarge: {
    width: 150,
    height: 150,
    borderRadius: 75,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    borderStyle: 'dashed',
  },
  guideInstruction: {
    color: 'white',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 10,
  },
  detectionInfoContainer: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    borderRadius: 10,
    padding: 15,
  },
  detectionStatus: {
    marginBottom: 15,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  statusLabel: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  statusText: {
    color: 'white',
    fontSize: 14,
  },
  confidenceContainer: {
    marginBottom: 15,
  },
  confidenceLabel: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  confidenceBar: {
    height: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  confidenceFill: {
    height: '100%',
    borderRadius: 4,
  },
  confidencePercentage: {
    color: 'white',
    fontSize: 12,
    textAlign: 'right',
    marginTop: 2,
  },
  translationResult: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.3)',
    paddingTop: 10,
  },
  translationLabel: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  translationText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  connectionLine: {
    position: 'absolute',
    backgroundColor: 'rgba(255, 87, 34, 0.6)',
  },
  landmarkPoint: {
    position: 'absolute',
    borderRadius: 3,
  },
  boundingBox: {
    position: 'absolute',
    borderWidth: 2,
    borderStyle: 'solid',
  },
  boundingBoxLabel: {
    position: 'absolute',
    top: -25,
    left: 0,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  boundingBoxLabelText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  cameraControlsContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: 'box-none',
  },
  topControls: {
    position: 'absolute',
    top: 120,
    right: 20,
    flexDirection: 'column',
    gap: 10,
  },
  bottomControls: {
    position: 'absolute',
    bottom: 120,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  controlButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 25,
    padding: 12,
    alignItems: 'center',
    minWidth: 60,
    minHeight: 60,
    justifyContent: 'center',
  },
  controlIcon: {
    fontSize: 20,
    color: 'white',
    textAlign: 'center',
  },
  controlLabel: {
    fontSize: 10,
    color: 'white',
    textAlign: 'center',
    marginTop: 2,
  },
  zoomIndicator: {
    position: 'absolute',
    top: 120,
    left: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 15,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  zoomText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
});
