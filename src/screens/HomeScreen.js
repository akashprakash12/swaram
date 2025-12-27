// src/screens/HomeScreen.js
import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Animated,
  Alert,
  Linking,
  Platform,
  StatusBar,
  AppState,
  TextInput,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card, IconButton, ProgressBar, Chip } from 'react-native-paper';
import colors from '../constants/colors';
import CameraFullScreen from './CameraFullScreen';
import WebSocketService from '../services/WebSocketService';
import CameraService from '../services/CameraService';


const { width, height } = Dimensions.get('window');

export default function HomeScreen({ navigation }) {
  // State management
  const [isRecording, setIsRecording] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationMode, setTranslationMode] = useState('both');
  const [liveTranslation, setLiveTranslation] = useState('');
  const [translationHistory, setTranslationHistory] = useState([]);
  const [processingStats, setProcessingStats] = useState({
    latency: '0ms',
    accuracy: '0%',
    wordsProcessed: 0,
    fps: 0,
  });
  const [cameraActive, setCameraActive] = useState(true);
  const [showCameraFullScreen, setShowCameraFullScreen] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [serverIp, setServerIp] = useState('192.168.1.9'); // Default IP
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [lastError, setLastError] = useState('');
  const [cameraPermission, setCameraPermission] = useState(null);
  const [showPermissionDialog, setShowPermissionDialog] = useState(false);

  // Refs
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const translateBtnScale = useRef(new Animated.Value(1)).current;
  const translationBuffer = useRef('');
  const statsRef = useRef({
    startTime: 0,
    frameCount: 0,
    totalLatency: 0,
  });
  const reconnectTimeout = useRef(null);

  // Initialize services
  useEffect(() => {
    initializeServices();
    checkCameraPermission();
    
    // Set up WebSocket callbacks
    WebSocketService.setOnTranslation(handleTranslation);
    WebSocketService.setOnStats(handleStats);
    WebSocketService.setOnError(handleError);
    WebSocketService.setOnConnected(handleConnected);
    WebSocketService.setOnDisconnected(handleDisconnected);
    WebSocketService.setOnConnecting(handleConnecting);
    
    // Handle app state changes
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    
    return () => {
      subscription.remove();
      cleanupServices();
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
      }
    };
  }, []);

// In HomeScreen.js, update the checkCameraPermission function
const checkCameraPermission = async () => {
  try {
    console.log('Checking camera permission...');
    
    // First check if permission is already requested
    if (!CameraService.permissionRequested) {
      console.log('Permission not requested yet, requesting...');
      const granted = await CameraService.initialize();
      setCameraPermission(granted);
      setCameraActive(granted);
      
      if (!granted) {
        // Show custom permission request with explanation
        setTimeout(() => {
          setShowPermissionDialog(true);
        }, 1000);
      }
    } else {
      // Already requested, check current status
      const hasPermission = await CameraService.checkPermission();
      console.log('Permission status from check:', hasPermission);
      setCameraPermission(hasPermission);
      setCameraActive(hasPermission);
    }
  } catch (error) {
    console.error('Error checking permission:', error);
    setCameraPermission(false);
    setCameraActive(false);
  }
};
  const requestCameraPermission = async () => {
    try {
      const granted = await CameraService.initialize();
      setCameraPermission(granted);
      setCameraActive(granted);
      
      if (!granted) {
        // Show custom permission request with explanation
        setShowPermissionDialog(true);
      }
    } catch (error) {
      console.error('Permission request error:', error);
      setCameraPermission(false);
      setCameraActive(false);
    }
  };

const handleRequestCameraPermission = async () => {
  setShowPermissionDialog(false);
  const granted = await CameraService.requestPermissionWithExplanation();
  setCameraPermission(granted);
  setCameraActive(granted);
  
  if (granted) {
    Alert.alert(
      'Camera Enabled',
      'Camera permission granted. You can now use the full-screen camera.',
      [{ text: 'OK' }]
    );
  } else {
    // If permission still denied, show option to open settings
    Alert.alert(
      'Camera Permission Denied',
      'To use camera features, you need to enable camera permission in your device settings.',
      [
        { 
          text: 'Open Settings', 
          onPress: () => {
            if (Platform.OS === 'ios') {
              Linking.openURL('app-settings:');
            } else {
              Linking.openSettings();
            }
          }
        },
        { 
          text: 'Cancel', 
          style: 'cancel' 
        }
      ]
    );
  }
};
  const initializeServices = async () => {
    try {
      // Load saved server IP
      const savedIp = await loadServerIp();
      if (savedIp) {
        setServerIp(savedIp);
      }
      
      // Attempt connection
      await attemptConnection();
      
    } catch (error) {
      console.error('Initialization error:', error);
      setLastError(error.message);
    }
  };

  const loadServerIp = async () => {
    // TODO: Load from AsyncStorage
    return null;
  };

  const saveServerIp = async (ip) => {
    // TODO: Save to AsyncStorage
    setServerIp(ip);
  };

  const attemptConnection = async () => {
    if (isConnecting) return;
    
    setIsConnecting(true);
    setConnectionStatus('connecting');
    setLastError('');
    
    try {
      await WebSocketService.connect(`ws://${serverIp}:8765`);
    } catch (error) {
      console.error('Connection error:', error);
      setLastError(error.message);
      setConnectionStatus('disconnected');
      
      // Show error alert with retry option
      Alert.alert(
        'Connection Failed',
        `Could not connect to server at ${serverIp}:8765\n\nError: ${error.message}\n\nPlease check:\n1. Server is running\n2. Correct IP address\n3. Both devices on same WiFi`,
        [
          { 
            text: 'Retry', 
            onPress: () => {
              setTimeout(attemptConnection, 1000);
            }
          },
          { 
            text: 'Change IP', 
            onPress: showIpDialog 
          },
          { 
            text: 'Continue Offline', 
            style: 'cancel' 
          }
        ]
      );
    } finally {
      setIsConnecting(false);
    }
  };

  const handleConnecting = (url) => {
    console.log(`Connecting to: ${url}`);
    setConnectionStatus('connecting');
  };

  const handleConnected = (url) => {
    console.log(`Connected to: ${url}`);
    setIsConnected(true);
    setConnectionStatus('connected');
    setLastError('');
    
    Alert.alert('Connected', `Successfully connected to:\n${url}`);
  };

  const handleDisconnected = (code, reason) => {
    console.log(`Disconnected: ${code} - ${reason}`);
    setIsConnected(false);
    setConnectionStatus('disconnected');
    
    if (isRecording) {
      stopTranslation();
      Alert.alert(
        'Connection Lost',
        'Server connection lost. Translation stopped.',
        [{ text: 'OK' }]
      );
    }
    
    // Auto-reconnect after delay
    reconnectTimeout.current = setTimeout(() => {
      if (!isConnected) {
        console.log('Attempting auto-reconnect...');
        attemptConnection();
      }
    }, 5000);
  };

  const handleAppStateChange = (nextAppState) => {
    if (nextAppState === 'background') {
      CameraService.stopStreaming();
    } else if (nextAppState === 'active' && isRecording) {
      startStreaming();
    }
  };

  const handleTranslation = (data) => {
    if (data.character) {
      // Add character to buffer
      translationBuffer.current += data.character;
      
      // Update live translation
      setLiveTranslation(prev => prev + data.character);
      
      // Add to history
      const historyItem = {
        id: Date.now().toString(),
        text: data.character,
        mode: data.type,
        timestamp: new Date().toLocaleTimeString(),
        confidence: Math.round(data.confidence * 100),
        processingTime: data.processing_time?.toFixed(2) || '0.00',
      };
      
      setTranslationHistory(prev => [historyItem, ...prev.slice(0, 9)]);
      
      // Update stats
      setProcessingStats(prev => ({
        ...prev,
        accuracy: `${Math.round(data.confidence * 100)}%`,
        wordsProcessed: prev.wordsProcessed + 1,
      }));

      // Trigger processing animation
      setIsProcessing(true);
      setTimeout(() => setIsProcessing(false), 300);
    }
  };

  const handleStats = (stats) => {
    setProcessingStats(prev => ({
      ...prev,
      latency: `${Math.round(stats.latency * 1000)}ms`,
      fps: stats.fps,
    }));
  };

  const handleError = (error) => {
    console.error('WebSocket error:', error);
    setLastError(error);
  };

  const startStreaming = () => {
    if (!isConnected) {
      Alert.alert('Not Connected', 'Please connect to processing server first');
      return;
    }

    if (!cameraPermission) {
      Alert.alert(
        'Camera Permission Required',
        'Please enable camera permission to start translation.',
        [
          { text: 'Enable Camera', onPress: requestCameraPermission },
          { text: 'Cancel', style: 'cancel' }
        ]
      );
      return;
    }

    // Start pulse animation for recording indicator
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.2,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    ).start();

    statsRef.current = {
      startTime: Date.now(),
      frameCount: 0,
      totalLatency: 0,
    };

    CameraService.startStreaming(async (frameBase64) => {
      if (WebSocketService.isConnected) {
        WebSocketService.sendFrame(frameBase64, translationMode);
        statsRef.current.frameCount++;
        
        // Update FPS in stats
        const duration = (Date.now() - statsRef.current.startTime) / 1000;
        const currentFPS = statsRef.current.frameCount / duration;
        setProcessingStats(prev => ({
          ...prev,
          fps: Math.round(currentFPS),
        }));
      }
    }, 15);

    WebSocketService.sendControl('start');
  };

  const stopStreaming = () => {
    CameraService.stopStreaming();
    WebSocketService.sendControl('stop');
    pulseAnim.stopAnimation();
    
    // Calculate final stats
    const duration = (Date.now() - statsRef.current.startTime) / 1000;
    const avgFPS = statsRef.current.frameCount / duration;
    
    setProcessingStats(prev => ({
      ...prev,
      fps: Math.round(avgFPS),
    }));
  };

  const startTranslation = () => {
    if (!isConnected) {
      Alert.alert('Not Connected', 'Please wait for server connection');
      return;
    }

    if (!cameraPermission) {
      Alert.alert(
        'Camera Required',
        'Please enable camera permission for translation',
        [
          { text: 'Enable Camera', onPress: requestCameraPermission },
          { text: 'Cancel', style: 'cancel' }
        ]
      );
      return;
    }

    setIsRecording(true);
    setIsTranslating(true);
    setLiveTranslation('');
    translationBuffer.current = '';
    
    // Button press animation
    Animated.sequence([
      Animated.timing(translateBtnScale, {
        toValue: 0.95,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.spring(translateBtnScale, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
    ]).start();

    startStreaming();
  };

  const stopTranslation = () => {
    setIsRecording(false);
    setIsTranslating(false);
    stopStreaming();
  };

  const handleStartTranslation = () => {
    if (isRecording) {
      stopTranslation();
    } else {
      startTranslation();
    }
  };

  const handleClearTranslation = () => {
    setLiveTranslation('');
    setTranslationHistory([]);
    translationBuffer.current = '';
    setProcessingStats({
      latency: '0ms',
      accuracy: '0%',
      wordsProcessed: 0,
      fps: 0,
    });
  };

  const handleModeChange = (mode) => {
    if (isRecording) {
      Alert.alert(
        'Stop Recording First',
        'Please stop current translation before changing mode',
        [{ text: 'OK' }]
      );
      return;
    }
    
    setTranslationMode(mode);
    setLiveTranslation('');
    WebSocketService.changeMode(mode);
  };

  const showIpDialog = () => {
    Alert.prompt(
      'Change Server IP',
      'Enter the IP address of your server:',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Save', 
          onPress: (ip) => {
            if (ip && ip.trim()) {
              saveServerIp(ip.trim());
              setTimeout(attemptConnection, 500);
            }
          }
        }
      ],
      'plain-text',
      serverIp
    );
  };

  const cleanupServices = () => {
    WebSocketService.disconnect();
    CameraService.stopStreaming();
  };

  const renderModeChip = (mode, label) => (
    <TouchableOpacity
      onPress={() => handleModeChange(mode)}
      disabled={isRecording || isConnecting}
    >
      <Chip
        mode="outlined"
        selected={translationMode === mode}
        style={[
          styles.modeChip,
          translationMode === mode && styles.modeChipActive,
          (isRecording || isConnecting) && styles.disabledChip
        ]}
        textStyle={[
          styles.modeChipText,
          translationMode === mode && styles.modeChipTextActive
        ]}
      >
        {label}
      </Chip>
    </TouchableOpacity>
  );

  const handleFullScreenCamera = () => {
    if (!isConnected) {
      Alert.alert('Not Connected', 'Please connect to server first');
      return;
    }
    
    if (!cameraPermission) {
      requestCameraPermission();
      return;
    }
    
    setShowCameraFullScreen(true);
  };

  const getConnectionStatusColor = () => {
    switch (connectionStatus) {
      case 'connected': return colors.success;
      case 'connecting': return colors.warning;
      case 'disconnected': return colors.danger;
      default: return colors.textSecondary;
    }
  };

  const getConnectionStatusText = () => {
    switch (connectionStatus) {
      case 'connected': return 'Connected';
      case 'connecting': return 'Connecting...';
      case 'disconnected': return 'Disconnected';
      default: return 'Unknown';
    }
  };

  const getCameraPermissionText = () => {
    if (cameraPermission === null) return 'Checking...';
    if (cameraPermission === true) return 'Camera Enabled';
    return 'Camera Disabled';
  };

  const getCameraPermissionColor = () => {
    if (cameraPermission === null) return colors.textSecondary;
    if (cameraPermission === true) return colors.success;
    return colors.danger;
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar backgroundColor="#FFFFFF" barStyle="dark-content" />
      
      {/* Connection Status Bar */}
      <View style={[
        styles.connectionBar, 
        { backgroundColor: `${getConnectionStatusColor()}15` }
      ]}>
        <View style={styles.connectionStatus}>
          {isConnecting ? (
            <ActivityIndicator size="small" color={colors.warning} />
          ) : (
            <View style={[
              styles.connectionDot,
              { backgroundColor: getConnectionStatusColor() }
            ]} />
          )}
          <Text style={styles.connectionText}>
            {getConnectionStatusText()} to {serverIp}:8765
          </Text>
          <TouchableOpacity onPress={showIpDialog} style={styles.changeIpButton}>
            <Text style={styles.changeIpText}>Change IP</Text>
          </TouchableOpacity>
        </View>
        
        {lastError ? (
          <Text style={styles.errorText} numberOfLines={2}>
            Error: {lastError}
          </Text>
        ) : (
          <Text style={styles.connectionSubtext}>
            {isConnected 
              ? 'Real-time processing active' 
              : isConnecting
                ? 'Attempting to connect...'
                : 'Tap "Change IP" to update server address'}
          </Text>
        )}
      </View>
      
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.appName}>SWARAM</Text>
          <Text style={styles.appTagline}>Real-time Sign Language Translator</Text>
        </View>
        <View style={styles.headerRight}>
          <IconButton
            icon="cog"
            size={24}
            onPress={() => navigation.navigate('Settings')}
            disabled={isConnecting}
          />
          <View style={[
            styles.localBadge, 
            { backgroundColor: `${getConnectionStatusColor()}20` }
          ]}>
            <Text style={[
              styles.localBadgeText,
              { color: getConnectionStatusColor() }
            ]}>
              {connectionStatus.toUpperCase()}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView 
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Camera Preview Area */}
        <View style={styles.cameraSection}>
          {cameraPermission === false ? (
            <TouchableOpacity 
              style={[styles.cameraPlaceholder, styles.cameraPermissionPlaceholder]}
              onPress={requestCameraPermission}
              activeOpacity={0.8}
            >
              <Text style={styles.permissionIcon}>📷</Text>
              <Text style={styles.permissionTitle}>Camera Disabled</Text>
              <Text style={styles.permissionText}>
                Tap to enable camera for sign language translation
              </Text>
              <View style={styles.permissionButton}>
                <Text style={styles.permissionButtonText}>ENABLE CAMERA</Text>
              </View>
            </TouchableOpacity>
          ) : cameraPermission === null ? (
            <View style={[styles.cameraPlaceholder, styles.cameraCheckingPlaceholder]}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.checkingText}>Checking camera permission...</Text>
            </View>
          ) : (
            <TouchableOpacity 
              style={[
                styles.cameraPlaceholder,
                (!isConnected || isConnecting) && styles.cameraPlaceholderDisabled
              ]}
              onPress={handleFullScreenCamera}
              activeOpacity={0.8}
              disabled={!isConnected || isConnecting}
            >
              {cameraActive ? (
                <>
                  {isTranslating && (
                    <Animated.View 
                      style={[
                        styles.cameraActiveIndicator,
                        { transform: [{ scale: pulseAnim }] }
                      ]} 
                    />
                  )}
                  <Text style={styles.cameraText}>
                    {translationMode === 'sign' ? '🤟 Sign Language Mode' :
                     translationMode === 'lip' ? '👄 Lip Reading Mode' :
                     '🤟👄 Hybrid Mode'}
                  </Text>
                  
                  {/* Connection Status */}
                  <View style={styles.cameraStatus}>
                    <View style={styles.statusIndicator}>
                      <View style={[
                        styles.statusDot,
                        { backgroundColor: getConnectionStatusColor() }
                      ]} />
                      <Text style={styles.cameraStatusText}>
                        {getConnectionStatusText()}
                      </Text>
                    </View>
                    {isProcessing && (
                      <Text style={styles.processingText}>Processing...</Text>
                    )}
                  </View>
                  
                  {/* Instructions */}
                  <Text style={styles.cameraHint}>
                    {isTranslating 
                      ? 'Recording... Make clear signs/lip movements'
                      : 'Tap to open full-screen camera'}
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.cameraEnableText}>Camera Ready</Text>
                  <Text style={styles.cameraHint}>
                    {isConnected ? 'Tap to open full screen' : 'Connect to server first'}
                  </Text>
                </>
              )}
              
              {isConnecting && (
                <View style={styles.connectingOverlay}>
                  <ActivityIndicator size="large" color={colors.primary} />
                  <Text style={styles.connectingText}>Connecting to server...</Text>
                </View>
              )}
            </TouchableOpacity>
          )}
          
          {/* Mode Selection */}
          <View style={styles.modeContainer}>
            <Text style={styles.modeLabel}>Translation Mode:</Text>
            <View style={styles.modeChips}>
              {renderModeChip('sign', 'Sign Only')}
              {renderModeChip('lip', 'Lip Only')}
              {renderModeChip('both', 'Hybrid')}
            </View>
          </View>
        </View>

        {/* Live Translation Card */}
        <Card style={styles.liveCard}>
          <Card.Content>
            <View style={styles.liveCardHeader}>
              <Text style={styles.liveCardTitle}>
                {isTranslating ? '🔄 LIVE TRANSLATION' : '📝 TRANSLATION READY'}
              </Text>
              {liveTranslation ? (
                <TouchableOpacity onPress={handleClearTranslation}>
                  <Text style={styles.clearText}>Clear</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            
            <View style={styles.liveTranslationArea}>
              {liveTranslation ? (
                <ScrollView 
                  style={styles.liveTranslationScroll}
                  showsVerticalScrollIndicator={false}
                >
                  <Text style={styles.liveTranslationText}>
                    {liveTranslation}
                  </Text>
                </ScrollView>
              ) : (
                <Text style={styles.placeholderText}>
                  {!isConnected 
                    ? 'Connect to server to begin'
                    : cameraPermission === false
                    ? 'Enable camera permission to begin'
                    : isRecording 
                      ? 'Processing sign/lip movements...' 
                      : 'Press START to begin translation'}
                </Text>
              )}
              
              {/* Processing Indicator */}
              {isTranslating && (
                <View style={styles.modelIndicator}>
                  <Text style={styles.modelText}>
                    {isProcessing ? '🔬 Processing Frame...' : '⚡ Ready for next frame'}
                  </Text>
                  <ProgressBar 
                    progress={isProcessing ? 0.7 : 0} 
                    color={colors.primary}
                    style={styles.progressBar}
                  />
                </View>
              )}
            </View>
          </Card.Content>
        </Card>

        {/* Main Control Button */}
        <Animated.View style={{ transform: [{ scale: translateBtnScale }] }}>
          <TouchableOpacity
            style={[
              styles.mainButton,
              isRecording ? styles.stopButton : styles.startButton,
              (!isConnected || isConnecting || cameraPermission === false) && styles.disabledButton
            ]}
            onPress={handleStartTranslation}
            disabled={!isConnected || isConnecting || cameraPermission === false}
            activeOpacity={0.9}
          >
            {isConnecting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : cameraPermission === false ? (
              <>
                <Text style={styles.mainButtonText}>📷 ENABLE CAMERA</Text>
                <Text style={styles.mainButtonSubtext}>
                  Camera permission required to start translation
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.mainButtonText}>
                  {!isConnected 
                    ? '🔌 DISCONNECTED' 
                    : isRecording 
                      ? '⏸ STOP TRANSLATION' 
                      : '▶ START TRANSLATION'}
                </Text>
                <Text style={styles.mainButtonSubtext}>
                  {!isConnected
                    ? 'Server not connected'
                    : isRecording 
                      ? 'Real-time streaming to server' 
                      : 'Word-by-word server processing'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </Animated.View>

        {/* Performance Stats */}
        <Card style={styles.statsCard}>
          <Card.Content>
            <Text style={styles.statsTitle}>📊 REAL-TIME PROCESSING STATS</Text>
            <View style={styles.statsGrid}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{processingStats.latency}</Text>
                <Text style={styles.statLabel}>Latency</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{processingStats.fps}</Text>
                <Text style={styles.statLabel}>FPS</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{processingStats.wordsProcessed}</Text>
                <Text style={styles.statLabel}>Characters</Text>
              </View>
            </View>
            <View style={styles.serverContainer}>
              <IconButton 
                icon={isConnected ? "server" : "server-off"} 
                size={20} 
                color={isConnected ? colors.success : colors.danger} 
              />
              <Text style={[
                styles.serverText,
                isConnected ? styles.serverTextConnected : styles.serverTextDisconnected
              ]}>
                {isConnected 
                  ? `Connected to ${serverIp} • ${translationMode.toUpperCase()} Mode`
                  : 'Server offline • Check connection'}
              </Text>
            </View>
          </Card.Content>
        </Card>

        {/* Recent Translations */}
        {translationHistory.length > 0 && (
          <Card style={styles.historyCard}>
            <Card.Content>
              <Text style={styles.historyTitle}>📋 RECENT TRANSLATIONS</Text>
              <ScrollView 
                style={styles.historyList}
                showsVerticalScrollIndicator={false}
              >
                {translationHistory.map((item) => (
                  <View key={item.id} style={styles.historyItem}>
                    <View style={styles.historyItemLeft}>
                      <Text style={styles.historyText}>{item.text}</Text>
                      <View style={styles.historyMeta}>
                        <Text style={styles.historyMetaText}>
                          {item.mode === 'sign' ? '🤟' : item.mode === 'lip' ? '👄' : '🤟👄'} 
                          {' • '}{item.timestamp}
                          {' • '}{item.processingTime}s
                        </Text>
                      </View>
                    </View>
                    <View style={styles.confidenceBadge}>
                      <Text style={styles.confidenceText}>{item.confidence}%</Text>
                    </View>
                  </View>
                ))}
              </ScrollView>
            </Card.Content>
          </Card>
        )}

        {/* Info Section */}
        <View style={styles.infoSection}>
          <Text style={styles.infoTitle}>ℹ️ REAL-TIME PROCESSING</Text>
          <View style={styles.infoGrid}>
            <View style={styles.infoItem}>
              <Text style={styles.infoIcon}>🤟</Text>
              <Text style={styles.infoItemTitle}>Sign Detection</Text>
              <Text style={styles.infoItemText}>
                3D CNN processes hand gestures in real-time via WebSocket
              </Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoIcon}>👄</Text>
              <Text style={styles.infoItemTitle}>Lip Reading</Text>
              <Text style={styles.infoItemText}>
                BiLSTM analyzes lip movements with server-side processing
              </Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoIcon}>⚡</Text>
              <Text style={styles.infoItemTitle}>WebSocket Stream</Text>
              <Text style={styles.infoItemText}>
                15 FPS streaming to Python server for real-time analysis
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Bottom Status Bar */}
      <View style={styles.statusBar}>
        <View style={styles.statusItem}>
          <View style={[
            styles.statusDot, 
            { backgroundColor: getConnectionStatusColor() }
          ]} />
          <Text style={styles.statusText}>
            {getConnectionStatusText()}
          </Text>
        </View>
        <View style={styles.statusDivider} />
        <View style={styles.statusItem}>
          <Text style={styles.statusText}>
            {isRecording ? `🔄 ${processingStats.fps}FPS` : '✅ Ready'}
          </Text>
        </View>
        <View style={styles.statusDivider} />
        <View style={styles.statusItem}>
          <View style={[
            styles.statusDot, 
            { backgroundColor: getCameraPermissionColor() }
          ]} />
          <Text style={styles.statusText}>
            {getCameraPermissionText()}
          </Text>
        </View>
      </View>

      {/* Camera Full Screen Modal */}
      <CameraFullScreen
        visible={showCameraFullScreen}
        onClose={() => {
          setShowCameraFullScreen(false);
          if (isRecording) stopTranslation();
        }}
        translationMode={translationMode}
        isTranslating={isTranslating}
        hasCameraPermission={cameraPermission}
        onPermissionRequest={requestCameraPermission}
      />

      {/* Camera Permission Dialog */}
      <Modal
        visible={showPermissionDialog}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowPermissionDialog(false)}
      >
        <View style={styles.permissionModal}>
          <View style={styles.permissionDialog}>
            <Text style={styles.permissionDialogTitle}>Camera Access Needed</Text>
            <Text style={styles.permissionDialogText}>
              To provide sign language translation, this app needs access to your camera.
              {"\n\n"}
              Your video is processed locally on your device for maximum privacy.
            </Text>
            <View style={styles.permissionDialogButtons}>
              <TouchableOpacity 
                style={styles.permissionDialogButtonSecondary}
                onPress={() => setShowPermissionDialog(false)}
              >
                <Text style={styles.permissionDialogButtonTextSecondary}>Not Now</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.permissionDialogButtonPrimary}
                onPress={handleRequestCameraPermission}
              >
                <Text style={styles.permissionDialogButtonTextPrimary}>Allow Camera</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFF',
  },
  connectionBar: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#EAEFFF',
  },
  connectionStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  connectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  connectionText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
    flex: 1,
  },
  changeIpButton: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: `${colors.primary}15`,
    borderRadius: 12,
    marginLeft: 10,
  },
  changeIpText: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '500',
  },
  connectionSubtext: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  errorText: {
    fontSize: 11,
    color: colors.danger,
    fontStyle: 'italic',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EAEFFF',
  },
  appName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.primary,
  },
  appTagline: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  localBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    marginLeft: 10,
  },
  localBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 100,
  },
  cameraSection: {
    marginBottom: 20,
  },
  cameraPlaceholder: {
    height: 200,
    backgroundColor: `${colors.primary}15`,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: `${colors.primary}30`,
    borderStyle: 'dashed',
    marginBottom: 15,
    overflow: 'hidden',
    position: 'relative',
  },
  cameraPermissionPlaceholder: {
    backgroundColor: `${colors.warning}15`,
    borderColor: colors.warning,
    borderWidth: 2,
    borderStyle: 'solid',
  },
  cameraCheckingPlaceholder: {
    backgroundColor: `${colors.textSecondary}15`,
    borderColor: colors.textSecondary,
  },
  cameraPlaceholderDisabled: {
    opacity: 0.6,
  },
  permissionIcon: {
    fontSize: 40,
    marginBottom: 15,
    opacity: 0.7,
  },
  permissionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.warning,
    marginBottom: 8,
  },
  permissionText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  permissionButton: {
    backgroundColor: colors.warning,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 25,
  },
  permissionButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  checkingText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 15,
    textAlign: 'center',
  },
  cameraActiveIndicator: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.danger,
    marginBottom: 15,
  },
  cameraText: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: '500',
    textAlign: 'center',
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  cameraStatus: {
    marginTop: 10,
    alignItems: 'center',
  },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  cameraStatusText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  processingText: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '500',
  },
  cameraHint: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  cameraEnableText: {
    color: colors.primary,
    fontWeight: 'bold',
    fontSize: 18,
    marginBottom: 8,
  },
  connectingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  connectingText: {
    fontSize: 14,
    color: colors.primary,
    marginTop: 10,
    fontWeight: '500',
  },
  modeContainer: {
    marginTop: 10,
  },
  modeLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 10,
  },
  modeChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  modeChip: {
    backgroundColor: '#FFFFFF',
    borderColor: `${colors.primary}50`,
  },
  modeChipActive: {
    backgroundColor: `${colors.primary}15`,
    borderColor: colors.primary,
  },
  modeChipText: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  modeChipTextActive: {
    color: colors.primary,
    fontWeight: 'bold',
  },
  disabledChip: {
    opacity: 0.5,
  },
  liveCard: {
    marginBottom: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    elevation: 3,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
  },
  liveCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  liveCardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.primary,
  },
  clearText: {
    fontSize: 14,
    color: colors.danger,
    fontWeight: '500',
  },
  liveTranslationArea: {
    minHeight: 120,
    maxHeight: 200,
  },
  liveTranslationScroll: {
    flex: 1,
  },
  liveTranslationText: {
    fontSize: 20,
    color: colors.textPrimary,
    lineHeight: 28,
    textAlign: 'center',
  },
  placeholderText: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: 40,
  },
  modelIndicator: {
    marginTop: 15,
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: '#EAEFFF',
  },
  modelText: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 5,
  },
  progressBar: {
    height: 4,
    borderRadius: 2,
  },
  mainButton: {
    paddingVertical: 20,
    paddingHorizontal: 30,
    borderRadius: 25,
    alignItems: 'center',
    marginBottom: 20,
    elevation: 5,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
  },
  startButton: {
    backgroundColor: colors.primary,
  },
  stopButton: {
    backgroundColor: colors.danger,
  },
  disabledButton: {
    backgroundColor: colors.textSecondary,
    opacity: 0.7,
  },
  mainButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 5,
  },
  mainButtonSubtext: {
    fontSize: 12,
    color: '#FFFFFF',
    opacity: 0.9,
  },
  statsCard: {
    marginBottom: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
  },
  statsTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: 15,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.primary,
    marginBottom: 5,
  },
  statLabel: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#EAEFFF',
  },
  serverContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: `${colors.primary}10`,
    padding: 12,
    borderRadius: 12,
    marginTop: 10,
  },
  serverText: {
    fontSize: 12,
    fontWeight: '500',
    marginLeft: 5,
  },
  serverTextConnected: {
    color: colors.success,
  },
  serverTextDisconnected: {
    color: colors.danger,
  },
  historyCard: {
    marginBottom: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
  },
  historyTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: 15,
  },
  historyList: {
    maxHeight: 200,
  },
  historyItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  historyItemLeft: {
    flex: 1,
  },
  historyText: {
    fontSize: 16,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  historyMeta: {
    flexDirection: 'row',
  },
  historyMetaText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  confidenceBadge: {
    backgroundColor: `${colors.success}20`,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  confidenceText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: colors.success,
  },
  infoSection: {
    marginTop: 10,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: 15,
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  infoItem: {
    width: '30%',
    backgroundColor: '#FFFFFF',
    padding: 15,
    borderRadius: 15,
    alignItems: 'center',
    marginBottom: 10,
  },
  infoIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  infoItemTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: colors.primary,
    marginBottom: 5,
    textAlign: 'center',
  },
  infoItemText: {
    fontSize: 10,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 14,
  },
  statusBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#EAEFFF',
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  statusItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusText: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  statusDivider: {
    width: 1,
    height: 20,
    backgroundColor: '#EAEFFF',
    marginHorizontal: 15,
  },
  permissionModal: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  permissionDialog: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 25,
    width: '100%',
    maxWidth: 400,
  },
  permissionDialogTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: 15,
    textAlign: 'center',
  },
  permissionDialogText: {
    fontSize: 16,
    color: colors.textSecondary,
    lineHeight: 22,
    marginBottom: 25,
    textAlign: 'center',
  },
  permissionDialogButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  permissionDialogButtonSecondary: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.textSecondary,
    alignItems: 'center',
  },
  permissionDialogButtonTextSecondary: {
    color: colors.textSecondary,
    fontWeight: '600',
    fontSize: 16,
  },
  permissionDialogButtonPrimary: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  permissionDialogButtonTextPrimary: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 16,
  },
});
