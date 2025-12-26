
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
  SafeAreaView,
} from 'react-native';
import { IconButton } from 'react-native-paper';
import colors from '../constants/colors';

const { width, height } = Dimensions.get('window');

export default function CameraFullScreen({ 
  visible, 
  onClose, 
  translationMode = 'sign',
  isTranslating = false 
}) {
  const [isRecording, setIsRecording] = useState(false);
  const [flashMode, setFlashMode] = useState('off');
  const [cameraType, setCameraType] = useState('front');
  const [zoomLevel, setZoomLevel] = useState(0);
  
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      // Fade in animation
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
      
      StatusBar.setHidden(true);
    } else {
      StatusBar.setHidden(false);
    }
    
    return () => {
      StatusBar.setHidden(false);
    };
  }, [visible]);

  useEffect(() => {
    if (isRecording) {
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
      pulseAnim.stopAnimation();
    }
  }, [isRecording]);

  const handleToggleRecording = () => {
    setIsRecording(!isRecording);
  };

  const handleToggleFlash = () => {
    setFlashMode(prev => prev === 'off' ? 'on' : 'off');
  };

  const handleToggleCamera = () => {
    setCameraType(prev => prev === 'front' ? 'back' : 'front');
  };

  const handleZoomIn = () => {
    setZoomLevel(prev => Math.min(prev + 0.1, 1));
  };

  const handleZoomOut = () => {
    setZoomLevel(prev => Math.max(prev - 0.1, 0));
  };

  const getModeText = () => {
    switch(translationMode) {
      case 'sign': return 'Sign Language Mode';
      case 'lip': return 'Lip Reading Mode';
      case 'both': return 'Hybrid Mode (Sign + Lip)';
      default: return 'Camera Mode';
    }
  };

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
                <Text style={styles.recordingText}>REC</Text>
              </Animated.View>
            )}
          </View>
        </View>

        {/* Camera Preview Area */}
        <View style={styles.cameraPreview}>
          {/* Simulated Camera View */}
          <View style={styles.cameraView}>
            {/* Grid Overlay */}
            <View style={styles.gridOverlay}>
              <View style={styles.gridLineHorizontal} />
              <View style={styles.gridLineVertical} />
              <View style={styles.focusBox} />
            </View>
            
            {/* Zoom Indicator */}
            {zoomLevel > 0 && (
              <View style={styles.zoomIndicator}>
                <Text style={styles.zoomText}>Zoom: {Math.round(zoomLevel * 100)}%</Text>
              </View>
            )}
            
            {/* Mode Indicator */}
            <View style={styles.modeIndicator}>
              <Text style={styles.modeIndicatorText}>
                {translationMode === 'sign' ? '🤟' : 
                 translationMode === 'lip' ? '👄' : '🤟👄'}
              </Text>
              <Text style={styles.modeIndicatorLabel}>{getModeText()}</Text>
            </View>
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
            >
              <Text style={styles.controlButtonIcon}>⚡</Text>
              <Text style={styles.controlButtonText}>
                {flashMode === 'on' ? 'ON' : 'OFF'}
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.controlButton}
              onPress={handleZoomOut}
              disabled={zoomLevel === 0}
            >
              <Text style={styles.controlButtonIcon}>🔍﹣</Text>
              <Text style={styles.controlButtonText}>Zoom Out</Text>
            </TouchableOpacity>
          </View>

          {/* Center Recording Button */}
          <TouchableOpacity
            style={[
              styles.recordingButton,
              isRecording && styles.recordingButtonActive
            ]}
            onPress={handleToggleRecording}
          >
            <View style={styles.recordingButtonInner}>
              {isRecording ? (
                <Text style={styles.recordingButtonIcon}>⏸</Text>
              ) : (
                <Text style={styles.recordingButtonIcon}>▶</Text>
              )}
            </View>
          </TouchableOpacity>

          {/* Right Controls */}
          <View style={styles.controlGroup}>
            <TouchableOpacity 
              style={styles.controlButton}
              onPress={handleZoomIn}
              disabled={zoomLevel === 1}
            >
              <Text style={styles.controlButtonIcon}>🔍﹢</Text>
              <Text style={styles.controlButtonText}>Zoom In</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.controlButton}
              onPress={handleToggleCamera}
            >
              <Text style={styles.controlButtonIcon}>🔄</Text>
              <Text style={styles.controlButtonText}>
                {cameraType === 'front' ? 'Front' : 'Back'}
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
            <Text style={styles.infoText}>No Cloud</Text>
          </View>
        </View>

        {/* Camera Stats Overlay */}
        <View style={styles.statsOverlay}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>60 FPS</Text>
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
              {cameraType === 'front' ? 'Front' : 'Rear'}
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
    paddingVertical: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  closeButton: {
    margin: 0,
  },
  modeBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: 15,
    paddingVertical: 6,
    borderRadius: 20,
    marginLeft: 10,
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
    paddingVertical: 4,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  recordingText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: 'bold',
  },
  cameraPreview: {
    flex: 1,
    backgroundColor: '#111111',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraView: {
    width: width,
    height: height * 0.7,
    backgroundColor: '#222222',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  gridOverlay: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridLineHorizontal: {
    position: 'absolute',
    width: '80%',
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  gridLineVertical: {
    position: 'absolute',
    width: 1,
    height: '80%',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  focusBox: {
    width: 100,
    height: 100,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    borderRadius: 10,
    position: 'absolute',
  },
  zoomIndicator: {
    position: 'absolute',
    top: 20,
    right: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
  },
  zoomText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
  },
  modeIndicator: {
    position: 'absolute',
    bottom: 30,
    alignItems: 'center',
  },
  modeIndicatorText: {
    fontSize: 40,
    marginBottom: 5,
  },
  modeIndicatorLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 15,
    paddingVertical: 5,
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
    padding: 12,
    marginVertical: 5,
  },
  controlButtonActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 20,
  },
  controlButtonIcon: {
    fontSize: 24,
    color: '#FFFFFF',
    marginBottom: 5,
  },
  controlButtonText: {
    color: '#FFFFFF',
    fontSize: 10,
    opacity: 0.8,
  },
  recordingButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  recordingButtonActive: {
    backgroundColor: colors.error,
    borderColor: colors.error,
  },
  recordingButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordingButtonIcon: {
    fontSize: 28,
    color: '#000000',
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
  },
  infoText: {
    color: '#FFFFFF',
    fontSize: 12,
    opacity: 0.8,
  },
  infoDivider: {
    width: 1,
    height: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  statsOverlay: {
    position: 'absolute',
    top: 80,
    left: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 15,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  statItem: {
    alignItems: 'center',
    paddingHorizontal: 10,
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
    height: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
});
