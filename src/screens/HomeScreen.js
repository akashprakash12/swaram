// src/screens/HomeScreen.js - FIXED SIMPLIFIED VERSION
import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Animated,
  Alert,
  StatusBar,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card, Chip } from "react-native-paper";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";

// Services
import WebSocketService from "../services/WebSocketService";
import CameraService from "../services/CameraService";

// Components
import CameraFullScreen from "./CameraFullScreen";

const { width } = Dimensions.get("window");

export default function HomeScreen({ navigation }) {
  // State
  const [isRecording, setIsRecording] = useState(false);
  const [translationMode, setTranslationMode] = useState("both");
  const [liveTranslation, setLiveTranslation] = useState("");
  const [translationHistory, setTranslationHistory] = useState([]);
  const [processingStats, setProcessingStats] = useState({
    latency: "0ms",
    confidence: "0%",
    framesSent: 0,
    handCount: 0,
  });
  const [showCameraFullScreen, setShowCameraFullScreen] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [serverIp, setServerIp] = useState("192.168.73.170");
  const [connectionStatus, setConnectionStatus] = useState("disconnected");
  const [cameraPermission, setCameraPermission] = useState(null);
  const [detectionData, setDetectionData] = useState(null);

  // Refs
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const frameCountRef = useRef(0);

  // Initialize
  useEffect(() => {
    initializeApp();

    return () => {
      cleanup();
    };
  }, []);

  const initializeApp = async () => {
    try {
      // Check camera permission
      const hasPermission = await CameraService.checkPermission();
      setCameraPermission(hasPermission);

      // Setup WebSocket callbacks
      setupWebSocketCallbacks();

      // Connect to server
      connectToServer();
    } catch (error) {
      console.error("Initialization error:", error);
      Alert.alert("Error", "Failed to initialize app");
    }
  };

  const setupWebSocketCallbacks = () => {
    WebSocketService.setOnConnected((url) => {
      console.log("Connected to:", url);

      setIsConnected(true);
      setConnectionStatus("connected");

      if (typeof url === "string") {
        setServerIp(url.replace("ws://", "").replace(":8765", ""));
      } else {
        console.warn("WebSocket connected but URL is undefined");
      }
    });

    WebSocketService.setOnDisconnected(() => {
      setIsConnected(false);
      setConnectionStatus("disconnected");
      if (isRecording) {
        stopTranslation();
        Alert.alert("Disconnected", "Lost connection to server");
      }
    });

    WebSocketService.setOnConnecting(() => {
      setIsConnecting(true);
      setConnectionStatus("connecting");
    });

    WebSocketService.setOnError((error) => {
      console.error("WebSocket error:", error);
      Alert.alert("Connection Error", error);
    });

    WebSocketService.setOnDetection((data) => {
      if (data.detection) {
        setDetectionData(data.detection);
        setProcessingStats((prev) => ({
          ...prev,
          handCount: data.detection.handCount || 0,
          confidence: `${Math.round((data.detection.confidence || 0) * 100)}%`,
        }));
      }
    });

    WebSocketService.setOnTranslation((data) => {
      if (data.data?.text) {
        const text = data.data.text;
        setLiveTranslation((prev) => prev + " " + text);

        // Add to history
        setTranslationHistory((prev) => [
          {
            id: Date.now().toString(),
            text: text,
            confidence: Math.round((data.data.confidence || 0) * 100),
            timestamp: new Date().toLocaleTimeString(),
          },
          ...prev.slice(0, 9),
        ]);

        // Update stats
        frameCountRef.current++;
        setProcessingStats((prev) => ({
          ...prev,
          framesSent: frameCountRef.current,
          confidence: `${Math.round((data.data.confidence || 0) * 100)}%`,
        }));
      }
    });

    WebSocketService.setOnStatus((data) => {
      console.log("Status:", data.message);
    });

    WebSocketService.setOnWelcome((data) => {
      console.log("Server welcome:", data.message);
    });
  };

  const connectToServer = () => {
    setIsConnecting(true);

    WebSocketService.connect(`ws://${serverIp}:8765`)
      .then(() => {
        console.log("Connection successful");
      })
      .catch((error) => {
        console.error("Connection failed:", error);
        Alert.alert(
          "Connection Failed",
          `Could not connect to ${serverIp}:8765\n\nMake sure the server is running.`,
          [
            { text: "Retry", onPress: connectToServer },
            { text: "Change IP", onPress: showIpDialog },
          ]
        );
      })
      .finally(() => {
        setIsConnecting(false);
      });
  };

  const showIpDialog = () => {
    Alert.prompt(
      "Server IP",
      "Enter server IP address:",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Connect",
          onPress: (ip) => {
            if (ip) {
              setServerIp(ip);
              setTimeout(connectToServer, 500);
            }
          },
        },
      ],
      "plain-text",
      serverIp
    );
  };

  const startTranslation = () => {
    if (!isConnected) {
      Alert.alert("Not Connected", "Please connect to server first");
      return;
    }

    if (!cameraPermission) {
      Alert.alert("Camera Required", "Please enable camera permission");
      return;
    }

    setIsRecording(true);
    frameCountRef.current = 0;

    // Start pulse animation
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

    // Start streaming
    CameraService.startStreaming(
      () => {
        // Frame sent callback
        frameCountRef.current++;
        setProcessingStats((prev) => ({
          ...prev,
          framesSent: frameCountRef.current,
        }));
      },
      5,
      translationMode
    );

    // Send control command
    WebSocketService.sendControl("start");
  };

  const stopTranslation = () => {
    setIsRecording(false);
    CameraService.stopStreaming();
    WebSocketService.sendControl("stop");
    pulseAnim.stopAnimation();
  };

  const handleToggleTranslation = () => {
    if (isRecording) {
      stopTranslation();
    } else {
      startTranslation();
    }
  };

  const handleClearTranslation = () => {
    setLiveTranslation("");
    setTranslationHistory([]);
    setDetectionData(null);
    frameCountRef.current = 0;
    setProcessingStats({
      latency: "0ms",
      confidence: "0%",
      framesSent: 0,
      handCount: 0,
    });
  };

  const handleModeChange = (mode) => {
    if (isRecording) {
      Alert.alert("Stop First", "Stop translation before changing mode");
      return;
    }
    setTranslationMode(mode);
    WebSocketService.changeMode(mode);
  };

  const handleOpenCamera = () => {
    if (!isConnected) {
      Alert.alert("Not Connected", "Connect to server first");
      return;
    }
    setShowCameraFullScreen(true);
  };

  const cleanup = () => {
    WebSocketService.disconnect();
    CameraService.stopStreaming();
  };

  const getStatusColor = () => {
    switch (connectionStatus) {
      case "connected":
        return "#4CAF50";
      case "connecting":
        return "#FF9800";
      case "disconnected":
        return "#F44336";
      default:
        return "#9E9E9E";
    }
  };

  const getStatusText = () => {
    switch (connectionStatus) {
      case "connected":
        return "Connected";
      case "connecting":
        return "Connecting...";
      case "disconnected":
        return "Disconnected";
      default:
        return "Unknown";
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="#FFFFFF" barStyle="dark-content" />

      {/* Connection Status */}
      <View
        style={[styles.statusBar, { backgroundColor: `${getStatusColor()}20` }]}
      >
        <View style={styles.statusContent}>
          {isConnecting ? (
            <ActivityIndicator size="small" color={getStatusColor()} />
          ) : (
            <View
              style={[styles.statusDot, { backgroundColor: getStatusColor() }]}
            />
          )}
          <Text style={styles.statusText}>
            {getStatusText()} • {serverIp}
          </Text>
          <TouchableOpacity onPress={showIpDialog} style={styles.changeIpBtn}>
            <Text style={styles.changeIpText}>Change IP</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>SWARAM</Text>
          <Text style={styles.subtitle}>Sign Language Translator</Text>
        </View>
        <TouchableOpacity onPress={() => navigation.navigate("Settings")}>
          <Icon name="cog" size={28} color="#333" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView}>
        {/* Camera Section */}
        <View style={styles.cameraSection}>
          <TouchableOpacity
            style={styles.cameraCard}
            onPress={handleOpenCamera}
            disabled={!isConnected || isConnecting}
          >
            <View style={styles.cameraContent}>
              {isRecording && (
                <Animated.View
                  style={[
                    styles.recordingDot,
                    { transform: [{ scale: pulseAnim }] },
                  ]}
                />
              )}

              <Icon
                name={cameraPermission ? "camera" : "camera-off"}
                size={40}
                color={cameraPermission ? "#4CAF50" : "#F44336"}
              />

              <Text style={styles.cameraTitle}>
                {isRecording ? "Recording..." : "Camera Ready"}
              </Text>

              <Text style={styles.cameraSubtitle}>
                {isConnected ? "Tap to open camera" : "Connect to server"}
              </Text>
            </View>
          </TouchableOpacity>

          {/* Mode Selection */}
          <View style={styles.modeSection}>
            <Text style={styles.modeLabel}>Translation Mode:</Text>
            <View style={styles.modeButtons}>
              {["sign", "lip", "both"].map((mode) => (
                <TouchableOpacity
                  key={mode}
                  style={[
                    styles.modeButton,
                    translationMode === mode && styles.modeButtonActive,
                  ]}
                  onPress={() => handleModeChange(mode)}
                  disabled={isRecording || isConnecting}
                >
                  <Text
                    style={[
                      styles.modeButtonText,
                      translationMode === mode && styles.modeButtonTextActive,
                    ]}
                  >
                    {mode === "sign" ? "Sign" : mode === "lip" ? "Lip" : "Both"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* Translation Card */}
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Translation</Text>
              {liveTranslation ? (
                <TouchableOpacity onPress={handleClearTranslation}>
                  <Text style={styles.clearButton}>Clear</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            <View style={styles.translationArea}>
              {liveTranslation ? (
                <ScrollView style={styles.translationScroll}>
                  <Text style={styles.translationText}>{liveTranslation}</Text>
                </ScrollView>
              ) : (
                <Text style={styles.placeholder}>
                  {isRecording
                    ? "Processing..."
                    : "Translation will appear here"}
                </Text>
              )}
            </View>
          </Card.Content>
        </Card>

        {/* Control Button */}
        <TouchableOpacity
          style={[
            styles.controlButton,
            isRecording ? styles.stopButton : styles.startButton,
            (!isConnected || isConnecting) && styles.disabledButton,
          ]}
          onPress={handleToggleTranslation}
          disabled={!isConnected || isConnecting}
        >
          {isConnecting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.controlButtonText}>
              {isRecording ? "STOP TRANSLATION" : "START TRANSLATION"}
            </Text>
          )}
        </TouchableOpacity>

        {/* Stats Card */}
        <Card style={styles.card}>
          <Card.Content>
            <Text style={styles.cardTitle}>Statistics</Text>
            <View style={styles.statsGrid}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>
                  {processingStats.framesSent}
                </Text>
                <Text style={styles.statLabel}>Frames</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue}>
                  {processingStats.handCount}
                </Text>
                <Text style={styles.statLabel}>Hands</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue}>
                  {processingStats.confidence}
                </Text>
                <Text style={styles.statLabel}>Confidence</Text>
              </View>
            </View>
          </Card.Content>
        </Card>

        {/* History */}
        {translationHistory.length > 0 && (
          <Card style={styles.card}>
            <Card.Content>
              <Text style={styles.cardTitle}>Recent Translations</Text>
              <ScrollView style={styles.historyList}>
                {translationHistory.map((item) => (
                  <View key={item.id} style={styles.historyItem}>
                    <Text style={styles.historyText}>{item.text}</Text>
                    <View style={styles.historyMeta}>
                      <Text style={styles.historyMetaText}>
                        {item.confidence}% • {item.timestamp}
                      </Text>
                    </View>
                  </View>
                ))}
              </ScrollView>
            </Card.Content>
          </Card>
        )}
      </ScrollView>

      {/* Full Screen Camera */}
      <CameraFullScreen
        visible={showCameraFullScreen}
        onClose={() => {
          setShowCameraFullScreen(false);
          setDetectionData(null);
          if (isRecording) stopTranslation();
        }}
        translationMode={translationMode}
        isTranslating={isRecording}
        detectionData={detectionData}
        translationText={liveTranslation}
        onStartRecording={startTranslation}
        onStopRecording={stopTranslation}
        onCameraReady={(cameraRef) => {
          CameraService.setCameraRef(cameraRef);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F5F5",
  },
  statusBar: {
    paddingVertical: 10,
    paddingHorizontal: 15,
  },
  statusContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusText: {
    flex: 1,
    fontSize: 14,
    color: "#333",
  },
  changeIpBtn: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: "rgba(0,0,0,0.1)",
    borderRadius: 12,
  },
  changeIpText: {
    fontSize: 12,
    color: "#333",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    backgroundColor: "#FFFFFF",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#2196F3",
  },
  subtitle: {
    fontSize: 14,
    color: "#666",
    marginTop: 2,
  },
  scrollView: {
    flex: 1,
  },
  cameraSection: {
    padding: 20,
  },
  cameraCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 15,
    padding: 20,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cameraContent: {
    alignItems: "center",
  },
  recordingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#F44336",
    marginBottom: 10,
  },
  cameraTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
    marginTop: 10,
    marginBottom: 5,
  },
  cameraSubtitle: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
  },
  modeSection: {
    marginTop: 20,
  },
  modeLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 10,
  },
  modeButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  modeButton: {
    flex: 1,
    paddingVertical: 10,
    marginHorizontal: 5,
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#DDD",
    alignItems: "center",
  },
  modeButtonActive: {
    backgroundColor: "#2196F3",
    borderColor: "#2196F3",
  },
  modeButtonText: {
    fontSize: 14,
    color: "#666",
    fontWeight: "500",
  },
  modeButtonTextActive: {
    color: "#FFFFFF",
  },
  card: {
    marginHorizontal: 20,
    marginBottom: 15,
    backgroundColor: "#FFFFFF",
    borderRadius: 15,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
  },
  clearButton: {
    fontSize: 14,
    color: "#F44336",
    fontWeight: "500",
  },
  translationArea: {
    minHeight: 100,
  },
  translationScroll: {
    flex: 1,
  },
  translationText: {
    fontSize: 16,
    color: "#333",
    lineHeight: 24,
  },
  placeholder: {
    fontSize: 16,
    color: "#999",
    textAlign: "center",
    paddingVertical: 30,
  },
  controlButton: {
    marginHorizontal: 20,
    marginBottom: 20,
    paddingVertical: 16,
    borderRadius: 25,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
  },
  startButton: {
    backgroundColor: "#2196F3",
  },
  stopButton: {
    backgroundColor: "#F44336",
  },
  disabledButton: {
    backgroundColor: "#9E9E9E",
    opacity: 0.7,
  },
  controlButtonText: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  statsGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statItem: {
    alignItems: "center",
    flex: 1,
  },
  statValue: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#2196F3",
    marginBottom: 5,
  },
  statLabel: {
    fontSize: 12,
    color: "#666",
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: "#EEE",
  },
  historyList: {
    maxHeight: 200,
  },
  historyItem: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F5F5F5",
  },
  historyText: {
    fontSize: 16,
    color: "#333",
    marginBottom: 4,
  },
  historyMeta: {
    flexDirection: "row",
  },
  historyMetaText: {
    fontSize: 12,
    color: "#666",
  },
});
