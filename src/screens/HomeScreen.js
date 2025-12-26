
import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Animated,
  Switch,
  Alert,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context'; // Import from correct package
import { Card, IconButton, ProgressBar, Chip } from 'react-native-paper';
import colors from '../constants/colors';
import CameraFullScreen from './CameraFullScreen';

const { width, height } = Dimensions.get('window');

export default function HomeScreen({ navigation }) {
  // State management
  const [isRecording, setIsRecording] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationMode, setTranslationMode] = useState('sign'); // 'sign', 'lip', 'both'
  const [liveTranslation, setLiveTranslation] = useState('');
  const [translationHistory, setTranslationHistory] = useState([]);
  const [processingStats, setProcessingStats] = useState({
    latency: '0ms',
    accuracy: '0%',
    wordsProcessed: 0,
  });
  const [isLocalMode, setIsLocalMode] = useState(true); // Always true (no cloud)
  const [cameraActive, setCameraActive] = useState(true);
  const [showCameraFullScreen, setShowCameraFullScreen] = useState(false);
  
  // Animation refs
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const waveAnim = useRef(new Animated.Value(0)).current;
  const translateBtnScale = useRef(new Animated.Value(1)).current;

  // Real-time translation simulation (replace with actual model integration)
  useEffect(() => {
    if (isRecording) {
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

      // Simulate processing delay
      const processInterval = setInterval(() => {
        if (isTranslating) {
          // Simulate word-by-word translation
          const sampleWords = [
            'നമസ്കാരം',
            'എങ്ങനെയുണ്ട്',
            'ധന്യവാദങ്ങൾ',
            'സഹായം',
            'ഭക്ഷണം'
          ];
          const randomWord = sampleWords[Math.floor(Math.random() * sampleWords.length)];
          
          setLiveTranslation(prev => prev ? `${prev} ${randomWord}` : randomWord);
          
          // Update stats
          setProcessingStats(prev => ({
            latency: `${Math.floor(Math.random() * 50) + 20}ms`,
            accuracy: `${Math.floor(Math.random() * 20) + 80}%`,
            wordsProcessed: prev.wordsProcessed + 1,
          }));
          
          // Add to history
          setTranslationHistory(prev => [
            {
              id: Date.now().toString(),
              text: randomWord,
              mode: translationMode,
              timestamp: new Date().toLocaleTimeString(),
              confidence: Math.floor(Math.random() * 20) + 80,
            },
            ...prev.slice(0, 9) // Keep last 10 items
          ]);
        }
      }, 1500);

      return () => {
        clearInterval(processInterval);
        pulseAnim.stopAnimation();
      };
    }
  }, [isRecording, isTranslating, translationMode]);

  const handleStartTranslation = () => {
    if (!cameraActive) {
      Alert.alert('Camera Required', 'Please enable camera for translation');
      return;
    }

    setIsRecording(true);
    setIsTranslating(true);
    
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
  };

  const handleStopTranslation = () => {
    setIsRecording(false);
    setIsTranslating(false);
    pulseAnim.stopAnimation();
  };

  const handleClearTranslation = () => {
    setLiveTranslation('');
    setTranslationHistory([]);
    setProcessingStats({
      latency: '0ms',
      accuracy: '0%',
      wordsProcessed: 0,
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
  };

  const renderModeChip = (mode, label) => (
    <TouchableOpacity
      onPress={() => handleModeChange(mode)}
      disabled={isRecording}
    >
      <Chip
        mode="outlined"
        selected={translationMode === mode}
        style={[
          styles.modeChip,
          translationMode === mode && styles.modeChipActive
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

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar backgroundColor="#FFFFFF" barStyle="dark-content" />
      
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.appName}>SWARAM</Text>
          <Text style={styles.appTagline}>Local AI Sign Language Translator</Text>
        </View>
        <View style={styles.headerRight}>
          <IconButton
            icon="cog"
            size={24}
            onPress={() => navigation.navigate('Settings')}
          />
          <View style={styles.localBadge}>
            <Text style={styles.localBadgeText}>LOCAL AI</Text>
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
          <TouchableOpacity 
            style={styles.cameraPlaceholder}
            onPress={() => setShowCameraFullScreen(true)}
            activeOpacity={0.8}
          >
            {cameraActive ? (
              <>
                <Animated.View 
                  style={[
                    styles.cameraActiveIndicator,
                    { transform: [{ scale: pulseAnim }] }
                  ]} 
                />
                <Text style={styles.cameraText}>
                  {translationMode === 'sign' ? '📸 Sign Language Camera Active' :
                   translationMode === 'lip' ? '👄 Lip Reading Camera Active' :
                   '📸👄 Dual Camera Active'}
                </Text>
                
                {/* Processing Wave Animation */}
                {isTranslating && (
                  <Animated.View 
                    style={[
                      styles.processingWave,
                      {
                        transform: [{
                          translateY: waveAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0, -20]
                          })
                        }]
                      }
                    ]}
                  />
                )}
              </>
            ) : (
              <>
                <Text style={styles.cameraEnableText}>Enable Camera</Text>
                <Text style={styles.cameraHint}>Tap to open full screen</Text>
              </>
            )}
          </TouchableOpacity>
          
          {/* Mode Selection */}
          <View style={styles.modeContainer}>
            <Text style={styles.modeLabel}>Translation Mode:</Text>
            <View style={styles.modeChips}>
              {renderModeChip('sign', 'Sign Language Only')}
              {renderModeChip('lip', 'Lip Reading Only')}
              {renderModeChip('both', 'Hybrid (Sign + Lip)')}
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
                  {isRecording 
                    ? 'Processing sign/lip movements...' 
                    : 'Press START to begin translation'}
                </Text>
              )}
              
              {/* Model Processing Indicator */}
              {isTranslating && (
                <View style={styles.modelIndicator}>
                  <Text style={styles.modelText}>
                    🔬 TensorFlow • 3D-CNN • BiLSTM
                  </Text>
                  <ProgressBar 
                    progress={0.7} 
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
              isRecording ? styles.stopButton : styles.startButton
            ]}
            onPress={isRecording ? handleStopTranslation : handleStartTranslation}
            activeOpacity={0.9}
          >
            <Text style={styles.mainButtonText}>
              {isRecording ? '⏸ STOP TRANSLATION' : '▶ START TRANSLATION'}
            </Text>
            <Text style={styles.mainButtonSubtext}>
              {isRecording 
                ? 'Real-time processing active' 
                : 'Word-by-word local processing'}
            </Text>
          </TouchableOpacity>
        </Animated.View>

        {/* Performance Stats */}
        <Card style={styles.statsCard}>
          <Card.Content>
            <Text style={styles.statsTitle}>📊 LOCAL PROCESSING STATS</Text>
            <View style={styles.statsGrid}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{processingStats.latency}</Text>
                <Text style={styles.statLabel}>Latency</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{processingStats.accuracy}</Text>
                <Text style={styles.statLabel}>Accuracy</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{processingStats.wordsProcessed}</Text>
                <Text style={styles.statLabel}>Words Processed</Text>
              </View>
            </View>
            <View style={styles.noCloudContainer}>
              <IconButton icon="cloud-off" size={20} color={colors.success} />
              <Text style={styles.noCloudText}>
                No cloud dependency • All processing on-device
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
          <Text style={styles.infoTitle}>ℹ️ HOW IT WORKS</Text>
          <View style={styles.infoGrid}>
            <View style={styles.infoItem}>
              <Text style={styles.infoIcon}>🤟</Text>
              <Text style={styles.infoItemTitle}>Sign Detection</Text>
              <Text style={styles.infoItemText}>
                3D CNN processes hand gestures frame-by-frame
              </Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoIcon}>👄</Text>
              <Text style={styles.infoItemTitle}>Lip Reading</Text>
              <Text style={styles.infoItemText}>
                BiLSTM analyzes lip movements for phoneme recognition
              </Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoIcon}>⚡</Text>
              <Text style={styles.infoItemTitle}>Local Processing</Text>
              <Text style={styles.infoItemText}>
                TensorFlow Lite runs entirely on-device, no internet needed
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
            isLocalMode ? styles.statusDotActive : styles.statusDotInactive
          ]} />
          <Text style={styles.statusText}>Local AI Active</Text>
        </View>
        <View style={styles.statusDivider} />
        <View style={styles.statusItem}>
          <Text style={styles.statusText}>
            {isRecording ? '🔄 Processing' : '✅ Ready'}
          </Text>
        </View>
        <View style={styles.statusDivider} />
        <View style={styles.statusItem}>
          <Text style={styles.statusText}>
            Models: TensorFlow + 3D-CNN + BiLSTM
          </Text>
        </View>
      </View>

      {/* Camera Full Screen Modal */}
      <CameraFullScreen
        visible={showCameraFullScreen}
        onClose={() => setShowCameraFullScreen(false)}
        translationMode={translationMode}
        isTranslating={isTranslating}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFF',
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
    backgroundColor: `${colors.success}20`,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    marginLeft: 10,
  },
  localBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: colors.success,
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
  },
  cameraEnableText: {
    color: colors.primary,
    fontWeight: 'bold',
    fontSize: 18,
  },
  cameraHint: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 8,
  },
  processingWave: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 40,
    backgroundColor: `${colors.primary}30`,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
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
  noCloudContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: `${colors.success}10`,
    padding: 12,
    borderRadius: 12,
    marginTop: 10,
  },
  noCloudText: {
    fontSize: 12,
    color: colors.success,
    fontWeight: '500',
    marginLeft: 5,
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
  statusDotActive: {
    backgroundColor: colors.success,
  },
  statusDotInactive: {
    backgroundColor: colors.textSecondary,
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
});
