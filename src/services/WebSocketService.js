// src/services/WebSocketService.js - UPDATED VERSION
import { Platform } from 'react-native';

const SERVER_CONFIG = {
  development: {
    wsUrls: [
      'ws://192.168.207.170:8765',  // Current network IP
      'ws://10.0.2.2:8765',        // Android emulator
      'ws://localhost:8765',       // Localhost
      'ws://192.168.83.170:8765',  // Previous network
      'ws://192.168.196.170:8765', // Previous network
    ],
    apiUrl: 'http://localhost:5000',
  },
  production: {
    wsUrls: ['wss://your-server.com/ws'],
    apiUrl: 'https://your-server.com/api',
  },
};

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
      onDetection: null,
      onControlResponse: null,
      onHealth: null,
      onStatus: null,
    };
    this.connectionTimeout = 5000;
    this.handshakeCompleted = false;
  }

  async connect(customUrl = null) {
    this.disconnect();
    this.handshakeCompleted = false;
    
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
          
          // DON'T send handshake immediately - wait for server's welcome
          // The server will send 'welcome' message first
          
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
          this.handshakeCompleted = false;
          
          if (this.callbacks.onDisconnected) {
            this.callbacks.onDisconnected(event.code, event.reason);
          }
          
          if (event.code !== 1000) {
            this.attemptReconnection();
          }
          
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
    // Only send frames if handshake is completed
    if (!this.handshakeCompleted) {
      console.log('Waiting for handshake completion before sending frames');
      return false;
    }
    
    const message = {
      type: 'frame',
      frame: frameBase64,
      mode: mode,
      timestamp: Date.now(),
      platform: Platform.OS,
      frame_id: Date.now().toString(36) + Math.random().toString(36).substr(2),
    };
    
    return this.sendMessage(message);
  }

  sendMessage(message) {
    if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(message));
        console.log(`Sent message type: ${message.type}`);
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

  handleIncomingMessage(data) {
    if (!data || !data.type) {
      console.warn('Received message without type:', data);
      return;
    }
    
    console.log(`Received message type: ${data.type}`);
    
    switch (data.type) {
      case 'welcome':
        console.log('✓ Server connected:', data.message);
        console.log('Features:', data.features || 'Unknown');
        
        // Server sent welcome, now we send handshake
        this.sendClientHandshake();
        break;
        
      case 'handshake_ack':
        console.log('✓ Handshake acknowledged by server');
        this.handshakeCompleted = true;
        
        if (this.callbacks.onStatus) {
          this.callbacks.onStatus({
            type: 'status',
            message: 'Handshake completed, ready to send frames',
            timestamp: Date.now()
          });
        }
        break;
        
      case 'detection':
        console.log('Detection received:', {
          hands: data.detection?.handCount || 0,
          lips: data.detection?.lipDetected || false,
          confidence: data.detection?.confidence || 0,
          gesture: data.detection?.gesture || 'unknown'
        });
        
        if (this.callbacks.onDetection) {
          this.callbacks.onDetection(data);
        }
        break;
        
      case 'translation':
        console.log('Translation received:', data.data?.character);
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
        
      case 'control_response':
        console.log('Control response:', data.command, data.status);
        if (this.callbacks.onControlResponse) {
          this.callbacks.onControlResponse(data);
        }
        break;

      case 'health':
        console.log('Server health check:', data.status);
        if (this.callbacks.onHealth) {
          this.callbacks.onHealth(data);
        }
        break;

      case 'status':
        console.log('Server status:', data.message);
        if (this.callbacks.onStatus) {
          this.callbacks.onStatus(data);
        }
        break;

      case 'pong':
        console.log('Pong received from server');
        break;

      default:
        console.log('Unknown message type:', data.type, data);
    }
  }

  // Send client handshake to server (after receiving welcome)
  sendClientHandshake() {
    const handshake = {
      type: 'handshake',
      client: 'react-native-app',
      platform: Platform.OS,
      version: '1.0.0',
      timestamp: Date.now(),
    };
    
    console.log('Sending client handshake to server...');
    this.sendMessage(handshake);
  }

  // REMOVED sendHandshakeAck() - Server sends handshake_ack, we receive it

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
    
    return this.sendMessage(message);
  }

  sendControl(command) {
    const validCommands = ['start', 'stop', 'pause', 'resume'];
    if (!validCommands.includes(command)) {
      console.error('Invalid command:', command);
      return false;
    }
    
    const message = {
      type: 'control',
      command: command,
      timestamp: Date.now(),
    };
    
    return this.sendMessage(message);
  }

  ping() {
    const message = {
      type: 'ping',
      timestamp: Date.now(),
    };
    
    return this.sendMessage(message);
  }

  disconnect() {
    if (this.ws) {
      this.messageQueue = [];
      
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.close(1000, 'Client disconnected');
      }
      
      this.ws = null;
      this.isConnected = false;
      this.handshakeCompleted = false;
      console.log('WebSocket disconnected by client');
    }
  }

  getConnectionStatus() {
    if (!this.ws) return 'disconnected';
    
    switch (this.ws.readyState) {
      case WebSocket.CONNECTING:
        return 'connecting';
      case WebSocket.OPEN:
        return this.handshakeCompleted ? 'connected' : 'handshaking';
      case WebSocket.CLOSING:
        return 'closing';
      case WebSocket.CLOSED:
        return 'disconnected';
      default:
        return 'unknown';
    }
  }

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

const webSocketService = new WebSocketService();
export default webSocketService;