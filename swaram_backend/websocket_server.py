#!/usr/bin/env python3
"""
WebSocket server for real-time sign language and lip reading detection
Using MediaPipe Tasks API (compatible with MediaPipe 0.10.31+)
"""
import asyncio
import websockets
import json
import cv2
import numpy as np
import base64
import time
import traceback
import mediapipe as mp
from concurrent.futures import ThreadPoolExecutor
from collections import deque
import os
from pathlib import Path
import tensorflow as tf
from gtts import gTTS
import io
from typing import Dict, List, Optional, Tuple
import random
from mediapipe.tasks import python as mp_tasks
from mediapipe.tasks.python import vision

print("MediaPipe version:", mp.__version__)

class DetectionProcessor:
    def __init__(self):
        # Get base directory
        self.BASE_DIR = Path(__file__).parent
        
        print("Initializing MediaPipe with version", mp.__version__)
        
        # Initialize MediaPipe using Tasks API (same as test1.py)
        try:
            # Hand landmarker setup
            MP_MODEL = self.BASE_DIR / "models" / "hand_landmarker.task"
            
            if MP_MODEL.exists():
                base_options = mp_tasks.BaseOptions(model_asset_path=str(MP_MODEL))
                hand_options = vision.HandLandmarkerOptions(
                    base_options=base_options,
                    num_hands=2,
                    running_mode=vision.RunningMode.IMAGE
                )
                self.hand_detector = vision.HandLandmarker.create_from_options(hand_options)
                print("✅ Hand landmarker initialized")
            else:
                print(f"⚠️ Hand landmarker model not found: {MP_MODEL}")
                print("Creating dummy hand detector")
                self.hand_detector = None
                
        except Exception as e:
            print(f"❌ Error initializing hand detector: {e}")
            print("Creating dummy hand detector")
            self.hand_detector = None
        
        # Hand connections
        self.hand_connections = [
            [0, 1], [1, 2], [2, 3], [3, 4],        # Thumb
            [0, 5], [5, 6], [6, 7], [7, 8],        # Index finger
            [0, 9], [9, 10], [10, 11], [11, 12],   # Middle finger
            [0, 13], [13, 14], [14, 15], [15, 16], # Ring finger
            [0, 17], [17, 18], [18, 19], [19, 20]  # Pinky
        ]
        
        # Lip landmarks indices
        self.lip_indices = [
            61, 146, 91, 181, 84, 17, 314, 405, 321, 375,
            291, 409, 270, 269, 267, 0, 37, 39, 40, 185
        ]
        
        # Thread pool
        self.executor = ThreadPoolExecutor(max_workers=4)
        
        # Frame buffers
        self.sequence = []
        self.predictions = []
        self.detected_words = []
        self.last_hand_time = time.time()
        self.last_action = None
        self.action_cooldown = 0
        self.current_action = "Ready..."
        
        # Load models
        self.sign_model = None
        self.sign_labels = []
        self.load_models()
        
        print("✅ Detection processor initialized")
    
    def load_models(self):
        """Load sign language model and labels"""
        try:
            # Get model path
            model_path = self.BASE_DIR / "models" / "action.h5"
            data_dir = self.BASE_DIR / "models" / "augmented_data_new"
            
            # Load labels from your actual directory
            if data_dir.exists():
                self.sign_labels = sorted([d for d in os.listdir(data_dir) 
                                         if os.path.isdir(data_dir / d)])
                print(f"✅ Loaded {len(self.sign_labels)} sign labels:")
                for i, label in enumerate(self.sign_labels):
                    print(f"  {i+1}. {label}")
            else:
                # Your actual labels from what you showed
                self.sign_labels = ["Bad", "Food", "happy", "Hello", "loud", "quiet", "Sorry"]
                print("⚠️ Using default English labels")
            
            if not model_path.exists():
                print(f"⚠️ Model file not found: {model_path}")
                print("Creating dummy model for testing")
                self.create_dummy_model()
                return
            
            print(f"📦 Loading model from: {model_path}")
            
            try:
                # Try to load with TensorFlow
                self.sign_model = tf.keras.models.load_model(
                    str(model_path), 
                    compile=False
                )
                print("✅ Sign language model loaded")
                
                # Print model summary
                print("\n📊 Model Summary:")
                print(f"  Input shape: {self.sign_model.input_shape}")
                print(f"  Output shape: {self.sign_model.output_shape}")
                print(f"  Number of classes: {len(self.sign_labels)}")
                
            except Exception as e:
                print(f"❌ Error loading model: {e}")
                print("Creating dummy model for testing")
                self.create_dummy_model()
                
        except Exception as e:
            print(f"❌ Error loading models: {e}")
            self.sign_labels = ["Bad", "Food", "happy", "Hello", "loud", "quiet", "Sorry"]
            self.create_dummy_model()
    
    def create_dummy_model(self):
        """Create dummy model"""
        print("Creating dummy model...")
        
        class DummyModel:
            def __init__(self, labels):
                self.sign_labels = labels
            
            def predict(self, X, verbose=0):
                batch_size = X.shape[0]
                num_classes = len(self.sign_labels)
                # Generate random predictions
                predictions = np.random.rand(batch_size, num_classes)
                # Normalize to sum to 1 (softmax-like)
                predictions = predictions / predictions.sum(axis=1, keepdims=True)
                return predictions
        
        self.sign_model = DummyModel(self.sign_labels)
        print("✅ Dummy model created")
    
    def extract_keypoints(self, result):
        """Extract keypoints from hand detection result (same as test1.py)"""
        lh = np.zeros(63)
        rh = np.zeros(63)

        if result.hand_landmarks:
            for idx, hand in enumerate(result.hand_landmarks):
                points = np.array([[lm.x, lm.y, lm.z] for lm in hand]).flatten()
                if idx == 0:
                    lh = points
                elif idx == 1:
                    rh = points

        return np.concatenate([lh, rh])
    
    def process_frame(self, frame: np.ndarray, mode: str = "both") -> Dict:
        """Process a frame and extract detection data"""
        detection_data = {
            'handLandmarks': [],
            'lipLandmarks': [],
            'handConnections': self.hand_connections,
            'handBoundingBox': None,
            'lipBoundingBox': None,
            'handCount': 0,
            'lipDetected': False,
            'confidence': 0.0,
            'timestamp': time.time()
        }
        
        try:
            # Convert BGR to RGB
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            
            # Process hands using MediaPipe Tasks API
            if mode in ['sign', 'both'] and self.hand_detector:
                # Create MediaPipe Image
                mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
                
                # Detect hands
                result = self.hand_detector.detect(mp_image)
                hands_present = result.hand_landmarks is not None
                
                if hands_present:
                    detection_data['handCount'] = len(result.hand_landmarks)
                    self.last_hand_time = time.time()
                    
                    # Extract landmarks
                    for hand in result.hand_landmarks:
                        for lm in hand:
                            detection_data['handLandmarks'].append({
                                'x': float(lm.x),
                                'y': float(lm.y),
                                'z': float(lm.z)
                            })
                    
                    # Calculate bounding box
                    if detection_data['handLandmarks']:
                        xs = [lm['x'] for lm in detection_data['handLandmarks']]
                        ys = [lm['y'] for lm in detection_data['handLandmarks']]
                        
                        detection_data['handBoundingBox'] = {
                            'x': float(min(xs)),
                            'y': float(min(ys)),
                            'width': float(max(xs) - min(xs)),
                            'height': float(max(ys) - min(ys))
                        }
                        detection_data['confidence'] = max(detection_data['confidence'], 0.7)
                        
                        # Extract keypoints for prediction
                        keypoints = self.extract_keypoints(result)
                        self.sequence.append(keypoints)
                        self.sequence = self.sequence[-30:]  # Keep last 30 frames
            
            # For lips, we'll skip for now since face_mesh isn't working
            # but we'll keep the structure
            
        except Exception as e:
            print(f"Frame processing error: {e}")
            traceback.print_exc()
        
        return detection_data
    
    def predict_sign_language(self) -> Optional[Dict]:
        """Predict sign language from sequence buffer (same as test1.py)"""
        if len(self.sequence) < 30:
            return None
        
        try:
            # Make prediction
            res = self.sign_model.predict(
                np.expand_dims(self.sequence, axis=0),
                verbose=0
            )[0]

            pred = np.argmax(res)
            confidence = res[pred]

            self.predictions.append(pred)
            self.predictions = self.predictions[-10:]

            if self.predictions.count(pred) >= 5 and confidence > 0.85:
                action = self.sign_labels[pred] if pred < len(self.sign_labels) else f"Label_{pred}"

                if action != self.last_action or self.action_cooldown == 0:
                    self.detected_words.append(action)
                    self.current_action = action
                    self.last_action = action
                    self.action_cooldown = 20
                    
                    print(f"📝 Detected: {action} (confidence: {confidence:.2%})")
                    
                    return {
                        'text': action,
                        'confidence': float(confidence),
                        'type': 'sign',
                        'timestamp': time.time(),
                        'detected_words': self.detected_words[-5:]  # Last 5 words
                    }
            
            # For dummy model, simulate detection
            if hasattr(self.sign_model, '__class__') and self.sign_model.__class__.__name__ == 'DummyModel':
                current_time = time.time()
                if current_time - self.last_hand_time < 5.0 and random.random() > 0.7:  # 30% chance when hands are detected
                    action = random.choice(self.sign_labels)
                    self.detected_words.append(action)
                    
                    if len(self.detected_words) > 10:
                        self.detected_words = self.detected_words[-10:]
                    
                    print(f"🤖 Dummy detection: {action}")
                    
                    return {
                        'text': action,
                        'confidence': 0.85,
                        'type': 'sign',
                        'timestamp': current_time,
                        'detected_words': self.detected_words[-5:]
                    }
        
        except Exception as e:
            print(f"Prediction error: {e}")
        
        return None
    
    def text_to_speech(self, text: str, lang: str = 'en') -> Optional[Dict]:
        """Convert text to speech"""
        if not text:
            return None
        
        try:
            tts = gTTS(text=text, lang=lang, slow=False)
            audio_buffer = io.BytesIO()
            tts.write_to_fp(audio_buffer)
            audio_buffer.seek(0)
            
            audio_base64 = base64.b64encode(audio_buffer.read()).decode('utf-8')
            
            return {
                'audio': audio_base64,
                'format': 'mp3',
                'text': text,
                'lang': lang,
                'timestamp': time.time()
            }
        
        except Exception as e:
            print(f"TTS error: {e}")
            return None
    
    def process_and_predict(self, frame_base64: str, mode: str = "both") -> Tuple[Dict, Optional[Dict]]:
        """Process frame and make prediction"""
        try:
            # Decode frame
            frame_data = base64.b64decode(frame_base64)
            nparr = np.frombuffer(frame_data, np.uint8)
            frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            
            if frame is None:
                print("❌ Failed to decode frame")
                return {}, None
            
            # Process frame
            detection_data = self.process_frame(frame, mode)
            
            # Make prediction if we have hands
            prediction = None
            if mode in ['sign', 'both'] and detection_data['handCount'] > 0:
                prediction = self.predict_sign_language()
            
            # Check for no hands timeout (same as test1.py)
            current_time = time.time()
            if detection_data['handCount'] == 0:
                if current_time - self.last_hand_time > 2.0 and self.detected_words:
                    # Speak accumulated words
                    sentence = " ".join(self.detected_words)
                    print(f"🎤 Speaking: {sentence}")
                    self.detected_words.clear()
                    self.current_action = "Speaking..."
            
            if self.action_cooldown > 0:
                self.action_cooldown -= 1
            
            return detection_data, prediction
        
        except Exception as e:
            print(f"Process error: {e}")
            traceback.print_exc()
            return {}, None


class WebSocketServer:
    def __init__(self, host: str = "0.0.0.0", port: int = 8765):
        self.host = host
        self.port = port
        self.detection_processor = DetectionProcessor()
        self.connections = set()
        self.clients = {}  # Store client info
    
    async def handle_connection(self, websocket):
        """Handle WebSocket connection"""
        client_id = id(websocket)
        print(f"📱 New connection (ID: {client_id})")
        
        self.connections.add(websocket)
        self.clients[client_id] = {
            'mode': 'both',
            'connected_at': time.time()
        }
        
        try:
            # Send welcome message
            welcome_msg = {
                'type': 'welcome',
                'message': 'SWARAM Server Connected',
                'timestamp': time.time(),
                'status': 'ready',
                'server_ip': '192.168.73.170',
                'server_port': 8765,
                'labels': self.detection_processor.sign_labels
            }
            await websocket.send(json.dumps(welcome_msg))
            print(f"📤 Sent welcome to client {client_id}")
            
            # Handle messages
            async for message in websocket:
                try:
                    data = json.loads(message)
                    await self.process_message(websocket, client_id, data)
                except json.JSONDecodeError as e:
                    print(f"❌ JSON decode error: {e}")
                    await websocket.send(json.dumps({
                        'type': 'error',
                        'message': 'Invalid JSON',
                        'timestamp': time.time()
                    }))
                except Exception as e:
                    print(f"❌ Message processing error: {e}")
        
        except websockets.exceptions.ConnectionClosed as e:
            print(f"📴 Connection closed (ID: {client_id}): {e.code} - {e.reason}")
        except Exception as e:
            print(f"❌ Connection error (ID: {client_id}): {e}")
            traceback.print_exc()
        finally:
            self.connections.remove(websocket)
            if client_id in self.clients:
                del self.clients[client_id]
            print(f"👋 Connection removed (ID: {client_id})")
    
    async def process_message(self, websocket, client_id, data):
        """Process message from client"""
        msg_type = data.get('type')
        
        if msg_type == 'ping':
            await websocket.send(json.dumps({
                'type': 'pong',
                'timestamp': time.time()
            }))
        
        elif msg_type == 'handshake':
            # Reply to client handshake
            client_info = data.get('client', 'unknown')
            platform = data.get('platform', 'unknown')
            
            await websocket.send(json.dumps({
                'type': 'handshake_ack',
                'message': f'Handshake acknowledged for {client_info}',
                'server': 'swaram-backend',
                'version': '1.0',
                'timestamp': time.time(),
                'status': 'ok',
                'labels': self.detection_processor.sign_labels
            }))
            print(f"🤝 Handshake completed for client {client_id}")

        elif msg_type == 'mode':
            # Client requests to change detection mode
            mode = data.get('mode', 'both')
            if mode in ['sign', 'lip', 'both']:
                self.clients[client_id]['mode'] = mode
                await websocket.send(json.dumps({
                    'type': 'mode_ack',
                    'mode': mode,
                    'timestamp': time.time(),
                    'status': 'ok'
                }))
                print(f"🔄 Client {client_id} switched to {mode} mode")
            else:
                await websocket.send(json.dumps({
                    'type': 'error',
                    'message': f'Invalid mode: {mode}',
                    'timestamp': time.time()
                }))

        elif msg_type == 'frame':
            await self.process_frame(websocket, client_id, data)
        
        elif msg_type == 'control':
            command = data.get('command', '')
            if command == 'start':
                # Reset sequence buffers (same as test1.py)
                self.detection_processor.sequence = []
                self.detection_processor.predictions = []
                self.detection_processor.detected_words = []
                self.detection_processor.current_action = "Ready..."
                self.detection_processor.last_action = None
                self.detection_processor.action_cooldown = 0
                
                response = {
                    'type': 'control_response',
                    'command': command,
                    'status': 'started',
                    'timestamp': time.time(),
                    'message': 'Translation started'
                }
            elif command == 'stop':
                response = {
                    'type': 'control_response',
                    'command': command,
                    'status': 'stopped',
                    'timestamp': time.time(),
                    'message': 'Translation stopped'
                }
            else:
                response = {
                    'type': 'control_response',
                    'command': command,
                    'status': 'unknown',
                    'timestamp': time.time(),
                    'message': f'Unknown command: {command}'
                }
            
            await websocket.send(json.dumps(response))
            print(f"🎮 Control command: {command} from client {client_id}")
        
        else:
            await websocket.send(json.dumps({
                'type': 'error',
                'message': f'Unknown message type: {msg_type}',
                'timestamp': time.time()
            }))
    
    async def process_frame(self, websocket, client_id, data):
        """Process frame from client"""
        try:
            frame_base64 = data.get('frame')
            mode = data.get('mode', self.clients[client_id].get('mode', 'both'))
            
            if not frame_base64:
                print(f"⚠️ No frame data from client {client_id}")
                return
            
            # Log frame info
            frame_id = data.get('frame_id', 'unknown')
            frame_size = len(frame_base64)
            
            # Process frame
            loop = asyncio.get_event_loop()
            detection_data, prediction = await loop.run_in_executor(
                self.detection_processor.executor,
                self.detection_processor.process_and_predict,
                frame_base64, mode
            )
            
            # Send detection data
            detection_msg = {
                'type': 'detection',
                'detection': detection_data,
                'frame_id': frame_id,
                'timestamp': time.time()
            }
            await websocket.send(json.dumps(detection_msg))
            
            # Send prediction if available
            if prediction:
                print(f"📝 Prediction for client {client_id}: {prediction['text']} ({prediction['confidence']:.2%})")
                
                # Generate TTS audio
                tts_audio = await loop.run_in_executor(
                    self.detection_processor.executor,
                    self.detection_processor.text_to_speech,
                    prediction['text'], 'en'
                )
                
                translation_msg = {
                    'type': 'translation',
                    'data': prediction,
                    'audio': tts_audio,
                    'timestamp': time.time()
                }
                await websocket.send(json.dumps(translation_msg))
            
            # Send stats
            stats_msg = {
                'type': 'stats',
                'stats': {
                    'hand_count': detection_data.get('handCount', 0),
                    'confidence': detection_data.get('confidence', 0),
                    'frame_size': frame_size,
                    'total_words': len(self.detection_processor.detected_words),
                    'current_action': self.detection_processor.current_action
                },
                'timestamp': time.time()
            }
            await websocket.send(json.dumps(stats_msg))
            
            # Send periodic status
            if random.random() < 0.1:  # 10% chance
                await websocket.send(json.dumps({
                    'type': 'status',
                    'message': f'Processing: {detection_data.get("handCount", 0)} hands, {self.detection_processor.current_action}',
                    'timestamp': time.time()
                }))
        
        except Exception as e:
            print(f"❌ Frame processing error for client {client_id}: {e}")
            traceback.print_exc()
            
            # Send error to client
            await websocket.send(json.dumps({
                'type': 'error',
                'message': f'Frame processing error: {str(e)}',
                'timestamp': time.time()
            }))
    
    async def start(self):
        """Start server"""
        print("=" * 60)
        print("SWARAM WebSocket Server")
        print(f"Starting on {self.host}:{self.port}")
        print("=" * 60)
        
        # Print server info
        print(f"📡 Server URL: ws://{self.host}:{self.port}")
        print(f"📱 Connect from mobile using: ws://192.168.73.170:8765")
        print(f"📊 Loaded {len(self.detection_processor.sign_labels)} sign language labels")
        print("=" * 60)
        
        # Start server - FIXED: Pass the method directly
        async with websockets.serve(self.handle_connection, self.host, self.port):
            print(f"✅ Server running!")
            print("👁️  Waiting for connections...")
            print("Press Ctrl+C to stop")
            await asyncio.Future()  # Run forever


async def main():
    server = WebSocketServer()
    await server.start()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n🛑 Server stopped by user")
    except Exception as e:
        print(f"❌ Server error: {e}")
        traceback.print_exc()