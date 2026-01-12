// src/services/WebSocketService.js - FIXED VERSION
import { Platform } from "react-native";

class WebSocketService {
  constructor() {
    this.ws = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.messageQueue = [];
    this.callbacks = {
      onTranslation: null,
      onStats: null,
      onError: null,
      onConnected: null,
      onDisconnected: null,
      onConnecting: null,
      onDetection: null,
      onControlResponse: null,
      onHealth: null,
      onStatus: null,
      onWelcome: null,
    };
    this.connectionTimeout = 10000; // 10 seconds
    this.handshakeCompleted = false;
    this.currentUrl = null;
  }

  // Get local IP automatically
  getLocalIP() {
    // This is a placeholder - in a real app, you'd use a network discovery method
    // For now, return common local IPs
    return [
      "192.168.1.100",
      "192.168.0.100",
      "10.0.2.2", // Android emulator
      "192.168.73.170", // Current machine IP
    ];
  }

  async connect(customUrl = null) {
    this.disconnect();
    this.handshakeCompleted = false;

    let urlsToTry = [];

    if (customUrl) {
      urlsToTry = [customUrl];
    } else {
      // Try common URLs
      urlsToTry = [
        "ws://192.168.73.170:8765", // Your actual IP
        "ws://10.0.2.2:8765", // Android emulator
        "ws://localhost:8765", // iOS simulator
      ];
      // Add auto-detected IPs
      const localIPs = this.getLocalIP();
      urlsToTry = [...localIPs.map((ip) => `ws://${ip}:8765`), ...urlsToTry];
    }

    console.log("Trying URLs:", urlsToTry);

    // Filter out invalid URLs
    urlsToTry = urlsToTry.filter((url) => url && typeof url === "string");

    if (urlsToTry.length === 0) {
      return Promise.reject(new Error("No valid URLs to try"));
    }

    return new Promise((resolve, reject) => {
      let currentIndex = 0;

      const tryNextUrl = async () => {
        if (currentIndex >= urlsToTry.length) {
          reject(new Error("Failed to connect to any server"));
          return;
        }

        const url = urlsToTry[currentIndex];
        currentIndex++;

        console.log(`Attempting connection to: ${url}`);

        try {
          await this.attemptConnection(url);
          this.currentUrl = url;
          resolve(url);
        } catch (error) {
          console.log(`Failed to connect to ${url}: ${error.message}`);

          // Try next URL
          setTimeout(tryNextUrl, 1000);
        }
      };

      tryNextUrl();
    });
  }

  attemptConnection(url) {
    return new Promise((resolve, reject) => {
      // Validate URL
      if (!url || typeof url !== "string") {
        reject(new Error("Invalid URL provided"));
        return;
      }

      const timeoutId = setTimeout(() => {
        if (this.ws && this.ws.readyState !== WebSocket.OPEN) {
          this.ws.close();
          reject(new Error("Connection timeout"));
        }
      }, this.connectionTimeout);

      try {
        console.log(`Creating WebSocket to: ${url}`);
        this.ws = new WebSocket(url);

        this.ws.onopen = () => {
          console.log("WebSocket connected");
          clearTimeout(timeoutId);
          this.isConnected = true;
          this.reconnectAttempts = 0;

          if (this.callbacks.onConnected) {
            this.callbacks.onConnected(url);
          }

          // Wait for server welcome before considering connection complete
          console.log("Waiting for server welcome...");
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            this.handleIncomingMessage(data);
          } catch (error) {
            console.error("Error parsing message:", error, "Raw:", event.data);
          }
        };

        this.ws.onerror = (error) => {
          clearTimeout(timeoutId);
          console.error("WebSocket error:", error);

          if (this.callbacks.onError) {
            this.callbacks.onError("Connection error");
          }

          reject(new Error("WebSocket error"));
        };

        this.ws.onclose = (event) => {
          clearTimeout(timeoutId);
          console.log(`WebSocket closed: ${event.code} - ${event.reason}`);

          this.isConnected = false;
          this.handshakeCompleted = false;

          if (this.callbacks.onDisconnected) {
            this.callbacks.onDisconnected(event.code, event.reason);
          }

          // Auto-reconnect if not intentionally disconnected
          if (event.code !== 1000) {
            this.attemptReconnection();
          }
        };
      } catch (error) {
        clearTimeout(timeoutId);
        console.error("Failed to create WebSocket:", error);
        reject(error);
      }
    });
  }

  attemptReconnection() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log("Max reconnection attempts reached");
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);

    console.log(
      `Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`
    );

    setTimeout(() => {
      if (!this.isConnected && this.currentUrl) {
        console.log("Attempting reconnection...");
        this.connect(this.currentUrl).catch((error) => {
          console.error("Reconnection failed:", error);
        });
      }
    }, delay);
  }

  handleIncomingMessage(data) {
    if (!data || typeof data !== "object") {
      console.warn("Invalid message received:", data);
      return;
    }

    const type = data.type || "unknown";
    console.log(`Received ${type} message`);

    switch (type) {
      case "welcome":
        console.log("Server welcome:", data.message);
        if (this.callbacks.onWelcome) {
          this.callbacks.onWelcome(data);
        }
        // Send handshake after welcome
        this.sendHandshake();
        break;

      case "handshake_ack":
        console.log("Handshake acknowledged");
        this.handshakeCompleted = true;
        if (this.callbacks.onStatus) {
          this.callbacks.onStatus({
            type: "status",
            message: "Ready to send frames",
            timestamp: Date.now(),
          });
        }
        break;

      case "detection":
        if (this.callbacks.onDetection) {
          this.callbacks.onDetection(data);
        }
        break;

      case "translation":
        if (this.callbacks.onTranslation) {
          this.callbacks.onTranslation(data);
        }
        break;

      case "stats":
        if (this.callbacks.onStats) {
          this.callbacks.onStats(data);
        }
        break;

      case "error":
        console.error("Server error:", data.message);
        if (this.callbacks.onError) {
          this.callbacks.onError(data.message);
        }
        break;

      case "pong":
        // Ping response
        break;

      default:
        console.log(`Unknown message type: ${type}`, data);
    }
  }

  sendHandshake() {
    const handshake = {
      type: "handshake",
      client: "swaram-mobile",
      platform: Platform.OS,
      version: "1.0.0",
      timestamp: Date.now(),
    };

    this.sendMessage(handshake);
  }

  sendMessage(message) {
    if (
      !this.isConnected ||
      !this.ws ||
      this.ws.readyState !== WebSocket.OPEN
    ) {
      console.log("WebSocket not connected, queueing message");
      this.messageQueue.push(message);
      return false;
    }

    try {
      const jsonMessage = JSON.stringify(message);
      this.ws.send(jsonMessage);
      return true;
    } catch (error) {
      console.error("Error sending message:", error);
      this.messageQueue.push(message);
      return false;
    }
  }

  sendFrame(frameBase64, mode = "both") {
    if (!this.handshakeCompleted) {
      console.log("Waiting for handshake completion");
      return false;
    }

    const message = {
      type: "frame",
      frame: frameBase64,
      mode: mode,
      timestamp: Date.now(),
      frame_id: `frame_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`,
    };

    return this.sendMessage(message);
  }

  changeMode(mode) {
    const message = {
      type: "mode",
      mode: mode,
      timestamp: Date.now(),
    };

    return this.sendMessage(message);
  }

  sendControl(command) {
    const message = {
      type: "control",
      command: command,
      timestamp: Date.now(),
    };

    return this.sendMessage(message);
  }

  ping() {
    const message = {
      type: "ping",
      timestamp: Date.now(),
    };

    return this.sendMessage(message);
  }

  disconnect() {
    if (this.ws) {
      this.messageQueue = [];

      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.close(1000, "Client disconnecting");
      }

      this.ws = null;
      this.isConnected = false;
      this.handshakeCompleted = false;
      console.log("WebSocket disconnected");
    }
  }

  getConnectionStatus() {
    if (!this.ws) return "disconnected";

    switch (this.ws.readyState) {
      case WebSocket.CONNECTING:
        return "connecting";
      case WebSocket.OPEN:
        return this.handshakeCompleted ? "connected" : "handshaking";
      case WebSocket.CLOSING:
        return "closing";
      case WebSocket.CLOSED:
        return "disconnected";
      default:
        return "unknown";
    }
  }

  // Callback setters
  setOnTranslation(callback) {
    this.callbacks.onTranslation = callback;
  }

  setOnStats(callback) {
    this.callbacks.onStats = callback;
  }

  setOnError(callback) {
    this.callbacks.onError = callback;
  }

  setOnConnected(callback) {
    this.callbacks.onConnected = callback;
  }

  setOnDisconnected(callback) {
    this.callbacks.onDisconnected = callback;
  }

  setOnConnecting(callback) {
    this.callbacks.onConnecting = callback;
  }

  setOnDetection(callback) {
    this.callbacks.onDetection = callback;
  }

  setOnControlResponse(callback) {
    this.callbacks.onControlResponse = callback;
  }

  setOnHealth(callback) {
    this.callbacks.onHealth = callback;
  }

  setOnStatus(callback) {
    this.callbacks.onStatus = callback;
  }

  setOnWelcome(callback) {
    this.callbacks.onWelcome = callback;
  }
}

const webSocketService = new WebSocketService();
export default webSocketService;
