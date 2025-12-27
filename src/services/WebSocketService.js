// src/services/WebSocketService.js
import { Platform } from 'react-native';

// Server Configuration
const SERVER_CONFIG = {
  development: {
    // Try these addresses in order
    wsUrls: [
      'ws://10.0.2.2:8765',        // Android Emulator
      'ws://localhost:8765', 
      'ws://192.168.1.9:8765',      // iOS Simulator
      'ws://192.168.1.9:8765',   // Your LAN IP - UPDATE THIS
      'ws://192.168.1.9:8765',   // Alternative LAN IP
    ],
    apiUrl: 'http://localhost:5000',
  },
  production: {
    wsUrls: ['wss://your-server.com/ws'],
    apiUrl: 'https://your-server.com/api',
  },
};

// Get current environment
const ENV = __DEV__ ? 'development' : 'production';
const CONFIG = SERVER_CONFIG[ENV];

class WebSocketService {
  constructor() {
    this.ws = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.messageQueue = [];
    this.currentUrlIndex = 0;
    this.callbacks = {
      onTranslation: null,
      onStats: null,
      onError: null,
      onConnected: null,
      onDisconnected: null,
      onConnecting: null,
    };
    this.connectionTimeout = 5000; // 5 seconds
  }

  async connect(customUrl = null) {
    // Cancel any existing connection
    this.disconnect();
    
    const urlsToTry = customUrl ? [customUrl] : CONFIG.wsUrls;
    
    return new Promise(async (resolve, reject) => {
      for (let i = 0; i < urlsToTry.length; i++) {
        const url = urlsToTry[i];
        
        try {
          console.log(`Attempting WebSocket connection to: ${url}`);
          
          if (this.callbacks.onConnecting) {
            this.callbacks.onConnecting(url);
          }
          
          const connected = await this.attemptSingleConnection(url);
          
          if (connected) {
            this.currentUrlIndex = i;
            console.log(`✓ Successfully connected to: ${url}`);
            resolve();
            return;
          }
        } catch (error) {
          console.log(`✗ Failed to connect to ${url}:`, error.message);
          
          if (i === urlsToTry.length - 1) {
            // Last URL failed
            reject(new Error(`Failed to connect to any server. Last error: ${error.message}`));
          }
        }
      }
      
      reject(new Error('No server URLs available'));
    });
  }

  attemptSingleConnection(url) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        if (this.ws && this.ws.readyState !== WebSocket.OPEN) {
          this.ws.close();
          reject(new Error('Connection timeout'));
        }
      }, this.connectionTimeout);
      
      try {
        this.ws = new WebSocket(url);
        
        this.ws.onopen = () => {
          clearTimeout(timeoutId);
          console.log('WebSocket connection established');
          this.isConnected = true;
          this.reconnectAttempts = 0;
          
          // Send initial handshake
          this.sendHandshake();
          
          // Process queued messages
          this.processMessageQueue();
          
          if (this.callbacks.onConnected) {
            this.callbacks.onConnected(url);
          }
          resolve(true);
        };
        
        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            this.handleIncomingMessage(data);
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
          }
        };
        
        this.ws.onerror = (error) => {
          clearTimeout(timeoutId);
          console.error('WebSocket error:', error);
          
          // Extract readable error message
          let errorMessage = 'Connection error';
          if (error.message) {
            errorMessage = error.message;
          }
          
          if (this.callbacks.onError) {
            this.callbacks.onError(errorMessage);
          }
          reject(new Error(errorMessage));
        };
        
        this.ws.onclose = (event) => {
          clearTimeout(timeoutId);
          console.log(`WebSocket disconnected. Code: ${event.code}, Reason: ${event.reason}`);
          this.isConnected = false;
          
          if (this.callbacks.onDisconnected) {
            this.callbacks.onDisconnected(event.code, event.reason);
          }
          
          // Don't auto-reconnect if we intentionally closed
          if (event.code !== 1000) {
            this.attemptReconnection();
          }
          
          // If this was during connection attempt, reject the promise
          if (!this.isConnected) {
            reject(new Error('Connection closed'));
          }
        };
        
      } catch (error) {
        clearTimeout(timeoutId);
        console.error('Failed to create WebSocket:', error);
        reject(error);
      }
    });
  }
  
  sendHandshake() {
    const handshake = {
      type: 'handshake',
      client: 'react-native-app',
      platform: Platform.OS,
      version: '1.0.0',
      timestamp: Date.now(),
    };
    this.sendMessage(handshake);
  }

  attemptReconnection() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }
    
    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), 30000);
    
    console.log(`Attempting reconnection in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    setTimeout(() => {
      if (!this.isConnected) {
        this.connect().catch(error => {
          console.error('Reconnection failed:', error.message);
        });
      }
    }, delay);
  }

  sendFrame(frameBase64, mode = 'both') {
    const message = {
      type: 'frame',
      frame: frameBase64,
      mode: mode,
      timestamp: Date.now(),
      platform: Platform.OS,
      frame_id: Date.now().toString(36) + Math.random().toString(36).substr(2),
    };
    
    this.sendMessage(message);
  }

  sendMessage(message) {
    if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(message));
        return true;
      } catch (error) {
        console.error('Error sending WebSocket message:', error);
        this.messageQueue.push(message);
        return false;
      }
    } else {
      console.log('WebSocket not connected, queuing message');
      this.messageQueue.push(message);
      return false;
    }
  }

  processMessageQueue() {
    console.log(`Processing ${this.messageQueue.length} queued messages`);
    
    while (this.messageQueue.length > 0 && this.isConnected) {
      const message = this.messageQueue.shift();
      this.sendMessage(message);
    }
  }

// src/services/WebSocketService.js
// In the handleIncomingMessage method, add these cases:

handleIncomingMessage(data) {
  if (!data || !data.type) {
    console.warn('Received message without type:', data);
    return;
  }
  
  switch (data.type) {
    case 'welcome':
      console.log('Server welcome:', data.message);
      break;
      
    case 'pong':
      console.log('Server pong received');
      break;
      
    case 'translation':
      if (this.callbacks.onTranslation) {
        this.callbacks.onTranslation(data.data);
      }
      break;

    case 'stats':
      if (this.callbacks.onStats) {
        this.callbacks.onStats(data);
      }
      break;

    case 'error':
      console.error('Server error:', data.message);
      if (this.callbacks.onError) {
        this.callbacks.onError(data.message);
      }
      break;

    case 'mode_changed':
      console.log('Mode changed to:', data.mode);
      break;
      
    case 'handshake_ack':
      console.log('Handshake acknowledged by server');
      break;

    // NEW: Handle control_response
    case 'control_response':
      console.log('Control response:', data.command, data.status);
      if (this.callbacks.onControlResponse) {
        this.callbacks.onControlResponse(data);
      }
      break;

    // NEW: Handle health messages
    case 'health':
      console.log('Server health check:', data.status);
      if (this.callbacks.onHealth) {
        this.callbacks.onHealth(data);
      }
      break;

    // NEW: Handle status messages
    case 'status':
      console.log('Server status:', data.message);
      if (this.callbacks.onStatus) {
        this.callbacks.onStatus(data);
      }
      break;

    default:
      console.log('Unknown message type:', data.type, data);
  }
}

// Add new callback setter
setOnControlResponse(callback) {
  this.callbacks.onControlResponse = callback;
}

setOnHealth(callback) {
  this.callbacks.onHealth = callback;
}

setOnStatus(callback) {
  this.callbacks.onStatus = callback;
}
  changeMode(mode) {
    const validModes = ['sign', 'lip', 'both'];
    if (!validModes.includes(mode)) {
      console.error('Invalid mode:', mode);
      return;
    }
    
    const message = {
      type: 'mode',
      mode: mode,
      timestamp: Date.now(),
    };
    this.sendMessage(message);
  }

  sendControl(command) {
    const validCommands = ['start', 'stop', 'pause', 'resume'];
    if (!validCommands.includes(command)) {
      console.error('Invalid command:', command);
      return;
    }
    
    const message = {
      type: 'control',
      command: command,
      timestamp: Date.now(),
    };
    this.sendMessage(message);
  }

  ping() {
    const message = {
      type: 'ping',
      timestamp: Date.now(),
    };
    this.sendMessage(message);
  }

  disconnect() {
    if (this.ws) {
      // Clear any pending messages
      this.messageQueue = [];
      
      // Close connection gracefully
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.close(1000, 'Client disconnected');
      }
      
      this.ws = null;
      this.isConnected = false;
      console.log('WebSocket disconnected by client');
    }
  }

  getConnectionStatus() {
    if (!this.ws) return 'disconnected';
    
    switch (this.ws.readyState) {
      case WebSocket.CONNECTING:
        return 'connecting';
      case WebSocket.OPEN:
        return 'connected';
      case WebSocket.CLOSING:
        return 'closing';
      case WebSocket.CLOSED:
        return 'disconnected';
      default:
        return 'unknown';
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
}

// Singleton instance
const webSocketService = new WebSocketService();
export default webSocketService;