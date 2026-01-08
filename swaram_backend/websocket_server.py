# backend/websocket_server.py
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
import threading
from collections import deque
import os
import tensorflow as tf
from gtts import gTTS
import io

class DetectionProcessor:
    def __init__(self):
        # Initialize MediaPipe Holistic once and reuse it
        self.mp_holistic = mp.solutions.holistic
        self.mp_drawing = mp.solutions.drawing_utils
        self.holistic = self.mp_holistic.Holistic(
            min_detection_confidence=0.3,  # Lowered for better detection
            min_tracking_confidence=0.3,   # Lowered for better tracking
            model_complexity=1  # Use more complex model for better accuracy
        )
        
        self.mp_drawing = mp.solutions.drawing_utils
        self.hand_connections = [
            [0, 1], [1, 2], [2, 3], [3, 4],  # Thumb
            [0, 5], [5, 6], [6, 7], [7, 8],  # Index
            [0, 9], [9, 10], [10, 11], [11, 12],  # Middle
            [0, 13], [13, 14], [14, 15], [15, 16],  # Ring
            [0, 17], [17, 18], [18, 19], [19, 20]  # Pinky
        ]
        self.lip_indices = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185]
        self.executor = ThreadPoolExecutor(max_workers=4)
        
        # Frame buffers for sequence processing
        self.sign_frame_buffer = deque(maxlen=30)  # For 3D CNN
        self.lip_frame_buffer = deque(maxlen=30)   # For BiLSTM
        self.last_prediction_time = 0
        self.prediction_interval = 1.0  # Predict every 1 second
        
        # Load models
        self.sign_model = None
        self.lip_model = None
        self.fusion_model = None
        self.load_models()
        
        # Labels for predictions
        self.sign_labels = [
            "നമസ്കാരം", "നന്ദി", "സഹായം", "ആശുപത്രി", "വീട്", 
            "എന്ത്", "എവിടെ", "എപ്പോൾ", "ആരാണ്", "എന്താണ്",
            "ശരി", "തെറ്റ്", "വരൂ", "പോകൂ", "കാണൂ",
            "കേൾക്കൂ", "പറയൂ", "എഴുതൂ", "വായിക്കൂ", "ഭക്ഷണം"
        ]
        self.lip_labels = [
            "ഹലോ", "സ്വാഗതം", "നന്ദി", "സഹായം", "എന്ത്", 
            "എവിടെ", "എപ്പോൾ", "ആരാണ്", "എന്താണ്", "ശരി"
        ]
        
    def extract_keypoints(self, results):
        """Extract 258 keypoints: Pose (33*4), Left Hand (21*3), Right Hand (21*3)"""
        # Pose (33 points * 4 dims [x,y,z,visibility])
        if results.pose_landmarks:
            pose = np.array([[res.x, res.y, res.z, res.visibility] for res in results.pose_landmarks.landmark]).flatten()
        else:
            pose = np.zeros(33 * 4)

        # Left Hand (21 points * 3 dims)
        if results.left_hand_landmarks:
            lh = np.array([[res.x, res.y, res.z] for res in results.left_hand_landmarks.landmark]).flatten()
        else:
            lh = np.zeros(21 * 3)

        # Right Hand (21 points * 3 dims)
        if results.right_hand_landmarks:
            rh = np.array([[res.x, res.y, res.z] for res in results.right_hand_landmarks.landmark]).flatten()
        else:
            rh = np.zeros(21 * 3)

        return np.concatenate([pose, lh, rh])
        
    def load_models(self):
        """Load the correct models: 3D CNN for sign language, BiLSTM for lip reading"""
        try:
            # Try to load TensorFlow
            try:
                import tensorflow as tf
                tf_version = tf.__version__
                print(f"✓ TensorFlow {tf_version} available")
            except ImportError:
                print("⚠️ TensorFlow not available - using dummy predictions")
                return

            # Load 3D CNN for sign language
            sign_model_path = 'models/sign_language_3dcnn.h5'
            if os.path.exists(sign_model_path):
                try:
                    self.sign_model = tf.keras.models.load_model(sign_model_path, compile=False)
                    print("✓ Sign Language 3D CNN Model Loaded")
                    print(f"Model input shape: {self.sign_model.input_shape}")
                    print(f"Model output shape: {self.sign_model.output_shape}")
                    
                    # Load actions from the training data
                    actions_path = 'test/augmented_data_new'
                    if os.path.exists(actions_path):
                        self.sign_labels = sorted(os.listdir(actions_path))
                        print(f"✓ Loaded {len(self.sign_labels)} sign actions: {self.sign_labels}")
                    else:
                        self.sign_labels = [
                            "നമസ്കാരം", "നന്ദി", "സഹായം", "ആശുപത്രി", "വീട്", 
                            "എന്ത്", "എവിടെ", "എപ്പോൾ", "ആരാണ്", "എന്താണ്",
                            "ശരി", "തെറ്റ്", "വരൂ", "പോകൂ", "കാണൂ",
                            "കേൾക്കൂ", "പറയൂ", "എഴുതൂ", "വായിക്കൂ", "ഭക്ഷണം"
                        ]
                        print("⚠️ Using fallback Malayalam sign labels")
                        
                except Exception as e:
                    print(f"Failed to load 3D CNN model: {e}")
                    print("Falling back to BiLSTM model...")
                    self.load_bilstm_fallback()
            else:
                print(f"⚠️ 3D CNN model '{sign_model_path}' not found - using BiLSTM fallback")
                self.load_bilstm_fallback()

            # Load BiLSTM for lip reading
            lip_model_path = 'models/lip_reading_bilstm.h5'
            if os.path.exists(lip_model_path):
                try:
                    self.lip_model = tf.keras.models.load_model(lip_model_path, compile=False)
                    print("✓ Lip Reading BiLSTM Model Loaded")
                    self.lip_labels = [
                        "ഹലോ", "സ്വാഗതം", "നന്ദി", "സഹായം", "എന്ത്", 
                        "എവിടെ", "എപ്പോൾ", "ആരാണ്", "എന്താണ്", "ശരി"
                    ]
                except Exception as e:
                    print(f"Failed to load lip reading model: {e}")
                    self.lip_model = None
            else:
                print(f"⚠️ Lip reading model '{lip_model_path}' not found")
                self.lip_model = None

        except Exception as e:
            print(f"Error loading models: {e}")
            traceback.print_exc()
    
    def load_bilstm_fallback(self):
        """Load BiLSTM model as fallback for sign language"""
        try:
            if os.path.exists('models/action.h5'):
                custom_objects = {
                    'LSTM': tf.keras.layers.LSTM,
                    'Dense': tf.keras.layers.Dense,
                    'Sequential': tf.keras.Sequential
                }
                self.sign_model = tf.keras.models.load_model('models/action.h5', custom_objects=custom_objects, compile=False)
                print("✓ BiLSTM Sign Language Model Loaded (fallback)")
                self.sign_labels = [
                    "നമസ്കാരം", "നന്ദി", "സഹായം", "ആശുപത്രി", "വീട്",
                    "എന്ത്", "എവിടെ", "എപ്പോൾ", "ആരാണ്", "എന്താണ്",
                    "ശരി", "തെറ്റ്", "വരൂ", "പോകൂ", "കാണൂ",
                    "കേൾക്കൂ", "പറയൂ", "എഴുതൂ", "വായിക്കൂ", "ഭക്ഷണം"
                ]
            else:
                print("⚠️ No sign language model found")
                self.sign_model = None
        except Exception as e:
            print(f"Failed to load BiLSTM fallback: {e}")
            self.sign_model = None

        except Exception as e:
            print(f"Error loading models: {e}")
            traceback.print_exc()
    
    def create_compatible_model(self):
        """Create a new BiLSTM model compatible with current TensorFlow version"""
        from tensorflow.keras.models import Sequential
        from tensorflow.keras.layers import LSTM, Dense, Dropout, BatchNormalization
        
        model = Sequential()
        
        # Input shape: (30, 258) - 30 frames, 258 keypoints
        model.add(LSTM(64, return_sequences=True, activation='relu', input_shape=(30, 258)))
        model.add(BatchNormalization())
        model.add(Dropout(0.2))
        
        model.add(LSTM(128, return_sequences=True, activation='relu'))
        model.add(BatchNormalization())
        model.add(Dropout(0.2))
        
        model.add(LSTM(64, return_sequences=False, activation='relu'))
        model.add(BatchNormalization())
        model.add(Dropout(0.2))
        
        # Output layer for 20 Malayalam signs
        model.add(Dense(64, activation='relu'))
        model.add(Dense(20, activation='softmax'))
        
        model.compile(
            optimizer='adam',
            loss='categorical_crossentropy',
            metrics=['accuracy']
        )
        
        return model
    
    def predict_sign_language(self, frame_sequence):
        """Predict sign language using 3D CNN or BiLSTM fallback"""
        if len(frame_sequence) < 10:
            return {
                'text': 'കീപോയിന്റുകൾ ലഭ്യമല്ല',
                'confidence': 0.1,
                'type': 'sign'
            }

        try:
            # Try 3D CNN first if available
            if self.sign_model and hasattr(self.sign_model, 'input_shape') and len(self.sign_model.input_shape) == 5:
                # 3D CNN model - expects (batch, frames, height, width, channels)
                return self.predict_with_3dcnn(frame_sequence)
            elif self.sign_model:
                # BiLSTM model - use keypoints
                return self.predict_with_bilstm(frame_sequence)
            else:
                return {
                    'text': 'മോഡൽ ലഭ്യമല്ല',
                    'confidence': 0.1,
                    'type': 'sign'
                }
        except Exception as e:
            print(f"Sign language prediction error: {e}")
            traceback.print_exc()
            return {
                'text': 'പ്രവചനം പരാജയപ്പെട്ടു',
                'confidence': 0.1,
                'type': 'sign'
            }
    
    def predict_with_3dcnn(self, frame_sequence):
        """Predict using 3D CNN model"""
        try:
            # Resize frames to expected input size (64x64)
            processed_frames = []
            for frame in frame_sequence[-30:]:  # Take last 30 frames
                resized = cv2.resize(frame, (64, 64))
                processed_frames.append(resized)
            
            if len(processed_frames) < 30:
                # Pad with the last frame if needed
                while len(processed_frames) < 30:
                    processed_frames.insert(0, processed_frames[0].copy())
            
            # Convert to numpy array and normalize
            frames_array = np.array(processed_frames, dtype=np.float32) / 255.0
            frames_array = np.expand_dims(frames_array, axis=0)  # Add batch dimension
            
            # Predict
            prediction = self.sign_model.predict(frames_array, verbose=0)[0]
            predicted_idx = np.argmax(prediction)
            confidence = float(prediction[predicted_idx])
            
            if confidence > 0.5 and predicted_idx < len(self.sign_labels):
                return {
                    'text': self.sign_labels[predicted_idx],
                    'confidence': confidence,
                    'type': 'sign'
                }
            else:
                return {
                    'text': 'അവ്യക്തമായ സംജ്ഞ',
                    'confidence': confidence,
                    'type': 'sign'
                }
                
        except Exception as e:
            print(f"3D CNN prediction error: {e}")
            return {
                'text': '3D CNN പ്രവചനം പരാജയപ്പെട്ടു',
                'confidence': 0.1,
                'type': 'sign'
            }
    
    def predict_with_bilstm(self, frame_sequence):
        """Predict using BiLSTM model with keypoints"""
        try:
            # Extract keypoints for each frame
            keypoints_sequence = []
            for frame in frame_sequence[-30:]:
                rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                results = self.holistic.process(rgb_frame)
                keypoints = self.extract_keypoints(results)
                keypoints_sequence.append(keypoints)

            if len(keypoints_sequence) < 30:
                return {
                    'text': 'കീപോയിന്റുകൾ ലഭ്യമല്ല',
                    'confidence': 0.1,
                    'type': 'sign'
                }

            # Convert to numpy array and predict
            keypoints_sequence = np.array(keypoints_sequence)
            res = self.sign_model.predict(np.expand_dims(keypoints_sequence, axis=0), verbose=0)[0]
            predicted_class = np.argmax(res)
            confidence = float(res[predicted_class])
            
            if confidence > 0.5:
                predicted_action = self.sign_labels[predicted_class] if predicted_class < len(self.sign_labels) else 'Unknown'
                return {
                    'text': predicted_action,
                    'confidence': confidence,
                    'type': 'sign'
                }
            else:
                return {
                    'text': 'അവ്യക്തമായ സംജ്ഞ',
                    'confidence': confidence,
                    'type': 'sign'
                }

        except Exception as e:
            print(f"BiLSTM prediction error: {e}")
            return {
                'text': 'BiLSTM പ്രവചനം പരാജയപ്പെട്ടു',
                'confidence': 0.1,
                'type': 'sign'
            }
    def predict_lip_reading(self, landmark_sequence):
        """Predict lip reading using BiLSTM model with lip landmarks sequence"""
        if not self.lip_model or len(landmark_sequence) < 10:
            # Return dummy prediction for testing
            return {
                'text': 'ലിപ് ലഭ്യമല്ല',
                'confidence': 0.5,
                'type': 'lip'
            }

        try:
            # Process lip landmarks for BiLSTM input
            lip_sequence = []
            for landmarks in landmark_sequence[-30:]:  # Take last 30 frames
                # Extract lip landmarks (x, y, z for each point)
                lip_features = []
                for lm in landmarks:
                    lip_features.extend([lm['x'], lm['y'], lm.get('z', 0)])
                lip_sequence.append(lip_features)

            if len(lip_sequence) == 0:
                return {
                    'text': 'ലിപ് ലാൻഡ്മാർക്കുകൾ കണ്ടെത്തിയില്ല',
                    'confidence': 0.1,
                    'type': 'lip'
                }

            # Convert to numpy array and reshape for BiLSTM input
            lip_sequence = np.array(lip_sequence)
            lip_sequence = lip_sequence.reshape(1, lip_sequence.shape[0], lip_sequence.shape[1])

            # Make prediction
            prediction = self.lip_model.predict(lip_sequence, verbose=0)[0]
            predicted_idx = np.argmax(prediction)
            confidence = float(prediction[predicted_idx])

            # Only return prediction if confidence is above threshold
            if confidence > 0.7:  # Lower threshold for lip reading
                return {
                    'text': self.lip_labels[predicted_idx] if predicted_idx < len(self.lip_labels) else 'Unknown',
                    'confidence': confidence,
                    'type': 'lip'
                }
            else:
                return {
                    'text': 'അവ്യക്തമായ ലിപ് മൂവ്മെന്റ്',
                    'confidence': confidence,
                    'type': 'lip'
                }

        except Exception as e:
            print(f"Lip reading prediction error: {e}")
            traceback.print_exc()
            return {
                'text': 'ലിപ് ലഭ്യമല്ല',
                'confidence': 0.1,
                'type': 'lip'
            }
    
    def extract_detection_data(self, frame, mode):
        """Extract hand and lip landmarks from frame"""
        detection_data = {
            'handLandmarks': [],
            'lipLandmarks': [],
            'handConnections': self.hand_connections,
            'handBoundingBox': None,
            'lipBoundingBox': None,
            'handCount': 0,
            'lipDetected': False,
            'confidence': 0,
            'timestamp': time.time()
        }
        
        try:
            # Use the pre-initialized holistic instance
            image_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            results = self.holistic.process(image_rgb)
            
            # Extract hand landmarks
            hand_landmarks_list = []
            if mode in ['sign', 'both']:
                if results.left_hand_landmarks:
                    hand_landmarks_list.append(results.left_hand_landmarks)
                    detection_data['handCount'] += 1
                if results.right_hand_landmarks:
                    hand_landmarks_list.append(results.right_hand_landmarks)
                    detection_data['handCount'] += 1
            
            for hand_landmarks in hand_landmarks_list:
                for landmark in hand_landmarks.landmark:
                    detection_data['handLandmarks'].append({
                        'x': landmark.x,
                        'y': landmark.y,
                        'z': landmark.z
                    })
            
            # Extract lip landmarks
            if mode in ['lip', 'both'] and results.face_landmarks:
                detection_data['lipDetected'] = True
                for idx in self.lip_indices:
                    if idx < len(results.face_landmarks.landmark):
                        landmark = results.face_landmarks.landmark[idx]
                        detection_data['lipLandmarks'].append({
                            'x': landmark.x,
                            'y': landmark.y,
                            'z': landmark.z
                        })
                
                # Calculate bounding boxes
                if detection_data['handLandmarks']:
                    xs = [lm['x'] for lm in detection_data['handLandmarks']]
                    ys = [lm['y'] for lm in detection_data['handLandmarks']]
                    if xs and ys:
                        detection_data['handBoundingBox'] = {
                            'x': min(xs),
                            'y': min(ys),
                            'width': max(xs) - min(xs),
                            'height': max(ys) - min(ys)
                        }
                        detection_data['confidence'] = 0.8
                
                if detection_data['lipLandmarks']:
                    xs = [lm['x'] for lm in detection_data['lipLandmarks']]
                    ys = [lm['y'] for lm in detection_data['lipLandmarks']]
                    if xs and ys:
                        detection_data['lipBoundingBox'] = {
                            'x': min(xs),
                            'y': min(ys),
                            'width': max(xs) - min(xs),
                            'height': max(ys) - min(ys)
                        }
                        detection_data['confidence'] = max(detection_data['confidence'], 0.7)
                
                # Calculate overall confidence
                if detection_data['handCount'] > 0 or detection_data['lipDetected']:
                    detection_data['confidence'] = max(detection_data['confidence'], 0.6)
                    
        except Exception as e:
            print(f"Detection extraction error: {e}")
            traceback.print_exc()
        
        return detection_data
    
    def process_frame_and_predict(self, frame, mode):
        """Process frame, accumulate in buffers, and predict when ready"""
        # Extract detection data
        detection_data = self.extract_detection_data(frame, mode)
        
        # Accumulate frames for prediction
        prediction = None
        current_time = time.time()
        
        if mode in ['sign', 'both'] and detection_data['handCount'] > 0:
            self.sign_frame_buffer.append(frame.copy())
            
            # Predict every prediction_interval seconds if buffer is full
            if (len(self.sign_frame_buffer) >= 10 and 
                current_time - self.last_prediction_time >= self.prediction_interval):
                prediction = self.predict_sign_language(list(self.sign_frame_buffer))
                if prediction:
                    self.last_prediction_time = current_time
        
        if mode in ['lip', 'both'] and detection_data['lipDetected']:
            self.lip_frame_buffer.append(detection_data['lipLandmarks'])
            
            # Predict for lip reading
            if (len(self.lip_frame_buffer) >= 10 and 
                current_time - self.last_prediction_time >= self.prediction_interval):
                lip_prediction = self.predict_lip_reading(list(self.lip_frame_buffer))
                if lip_prediction:
                    prediction = lip_prediction
                    self.last_prediction_time = current_time
        
        return detection_data, prediction
    
    def text_to_speech(self, text, lang='ml'):
        """Convert text to speech audio and return base64 encoded audio"""
        try:
            if not text or text.strip() == '':
                return None
            
            # Create TTS object
            tts = gTTS(text=text, lang=lang, slow=False)
            
            # Save to bytes buffer
            audio_buffer = io.BytesIO()
            tts.write_to_fp(audio_buffer)
            audio_buffer.seek(0)
            
            # Encode to base64
            audio_base64 = base64.b64encode(audio_buffer.getvalue()).decode('utf-8')
            
            return {
                'audio': audio_base64,
                'format': 'mp3',
                'text': text,
                'lang': lang
            }
        except Exception as e:
            print(f"TTS error: {e}")
            return None

class WebSocketServer:
    def __init__(self):
        self.detection_processor = DetectionProcessor()
        self.connections = set()
        self.frame_rate = 30
        self.max_frame_size = 1024 * 1024
        
    async def handle_connection(self, websocket, path=None):
        """Handle WebSocket connection"""
        try:
            client_ip = websocket.remote_address[0]
            client_port = websocket.remote_address[1]
            client_id = f"{client_ip}:{client_port}"
        except:
            client_id = f"client_{id(websocket)}"
        
        print(f"New connection from {client_id}")
        self.connections.add(websocket)
        
        try:
            welcome_msg = {
                'type': 'welcome',
                'message': 'Connected to Sign Language Detection Server',
                'timestamp': time.time(),
                'supported_modes': ['sign', 'lip', 'both'],
                'server_version': '1.0.0',
                'detection_features': ['hand_landmarks', 'lip_landmarks', 'bounding_boxes']
            }
            await websocket.send(json.dumps(welcome_msg))
            
            async for message in websocket:
                try:
                    data = json.loads(message)
                    await self.process_client_message(websocket, client_id, data)
                    
                except json.JSONDecodeError as e:
                    error_msg = {
                        'type': 'error',
                        'message': f'Invalid JSON: {str(e)}',
                        'timestamp': time.time()
                    }
                    await websocket.send(json.dumps(error_msg))
                    
                except Exception as e:
                    print(f"Error processing message from {client_id}: {e}")
                    traceback.print_exc()
                    
                    error_msg = {
                        'type': 'error',
                        'message': f'Processing error: {str(e)}',
                        'timestamp': time.time()
                    }
                    await websocket.send(json.dumps(error_msg))
                    
        except websockets.exceptions.ConnectionClosed as e:
            print(f"Connection closed for {client_id}: {e}")
        except Exception as e:
            print(f"Unexpected error for {client_id}: {e}")
            traceback.print_exc()
        finally:
            if websocket in self.connections:
                self.connections.remove(websocket)
            print(f"Connection removed for {client_id}. Remaining: {len(self.connections)}")
    
    async def process_client_message(self, websocket, client_id, data):
        """Process incoming client message"""
        message_type = data.get('type')
        
        if message_type == 'ping':
            await websocket.send(json.dumps({
                'type': 'pong',
                'timestamp': time.time(),
                'client_timestamp': data.get('timestamp')
            }))
            
        elif message_type == 'handshake':
            # Client is initiating handshake
            await websocket.send(json.dumps({
                'type': 'handshake_ack',
                'message': 'Handshake received',
                'timestamp': time.time(),
                'client_info': data
            }))
            
        elif message_type == 'handshake_ack':
            # Client is acknowledging our handshake
            print(f"Client {client_id} acknowledged handshake")
            await websocket.send(json.dumps({
                'type': 'status',
                'message': 'Handshake completed successfully',
                'timestamp': time.time()
            }))
            
        elif message_type == 'frame':
            await self.process_frame(websocket, client_id, data)
            
        elif message_type == 'mode':
            await self.change_mode(websocket, client_id, data)
            
        elif message_type == 'control':
            await self.handle_control(websocket, client_id, data)
            
        else:
            print(f"Unknown message type from {client_id}: {message_type}")
            await websocket.send(json.dumps({
                'type': 'error',
                'message': f'Unknown message type: {message_type}',
                'timestamp': time.time()
            }))
    
    async def process_frame(self, websocket, client_id, data):
        """Process incoming frame with detection"""
        try:
            frame_data = data.get('frame')
            if not frame_data:
                await websocket.send(json.dumps({
                    'type': 'error',
                    'message': 'No frame data provided',
                    'timestamp': time.time()
                }))
                return
            
            if len(frame_data) > self.max_frame_size:
                await websocket.send(json.dumps({
                    'type': 'error',
                    'message': f'Frame too large: {len(frame_data)} bytes',
                    'timestamp': time.time()
                }))
                return
            
            try:
                # Handle base64 data that might include data URL prefix
                if frame_data.startswith('data:image'):
                    frame_data = frame_data.split(',')[1]
                
                frame_bytes = base64.b64decode(frame_data)
                nparr = np.frombuffer(frame_bytes, np.uint8)
                frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                
                if frame is None:
                    raise ValueError("Failed to decode image")
                    
            except Exception as e:
                await websocket.send(json.dumps({
                    'type': 'error',
                    'message': f'Frame decoding failed: {str(e)}',
                    'timestamp': time.time()
                }))
                return
            
            mode = data.get('mode', 'both')
            valid_modes = ['sign', 'lip', 'both']
            if mode not in valid_modes:
                mode = 'both'
            
            # Process frame and predict in separate thread
            detection_data, prediction = await asyncio.get_event_loop().run_in_executor(
                self.detection_processor.executor,
                self.detection_processor.process_frame_and_predict,
                frame, mode
            )
            
            # Send detection data
            detection_response = {
                'type': 'detection',
                'detection': detection_data,
                'timestamp': time.time(),
                'frame_id': data.get('frame_id', 'unknown'),
                'mode': mode
            }
            await websocket.send(json.dumps(detection_response))
            
            # Send prediction if available
            if prediction:
                # Generate TTS audio
                print(f"Generating TTS for prediction: {prediction}")
                tts_audio = await asyncio.get_event_loop().run_in_executor(
                    self.detection_processor.executor,
                    self.detection_processor.text_to_speech,
                    prediction['text']
                )
                print(f"TTS generated: {tts_audio is not None}")
                
                translation_response = {
                    'type': 'translation',
                    'data': prediction,
                    'audio': tts_audio,
                    'detection': detection_data,
                    'timestamp': time.time(),
                    'frame_id': data.get('frame_id', 'unknown')
                }
                print(f"Sending translation response: {prediction['text']}")
                await websocket.send(json.dumps(translation_response))
            
            # Send stats
            stats = {
                'type': 'stats',
                'fps': self.frame_rate,
                'hand_count': detection_data['handCount'],
                'lip_detected': detection_data['lipDetected'],
                'confidence': detection_data['confidence'],
                'timestamp': time.time()
            }
            await websocket.send(json.dumps(stats))
            
        except Exception as e:
            print(f"Frame processing error for {client_id}: {e}")
            traceback.print_exc()
            
            error_response = {
                'type': 'error',
                'message': f'Frame processing error: {str(e)}',
                'timestamp': time.time()
            }
            await websocket.send(json.dumps(error_response))
    
    async def generate_mock_translation(self, detection_data, mode):
        """Generate mock translation for demo purposes"""
        malayalam_chars = "അആഇഈഉഊഋഌഎഏഐഒഓഔകഖഗഘങചഛജഝഞടഠഡഢണതഥദധനപഫബഭമയരലവശഷസഹളഴറ"
        
        # Simple logic based on detection
        if mode == 'sign' and detection_data['handCount'] > 0:
            char_index = min(detection_data['handCount'] - 1, len(malayalam_chars) - 1)
        elif mode == 'lip' and detection_data['lipDetected']:
            char_index = len(malayalam_chars) // 2
        elif mode == 'both' and (detection_data['handCount'] > 0 or detection_data['lipDetected']):
            char_index = min(detection_data['handCount'] + (1 if detection_data['lipDetected'] else 0), 
                           len(malayalam_chars) - 1)
        else:
            return None
        
        char = malayalam_chars[char_index] if char_index < len(malayalam_chars) else "അ"
        
        return {
            'character': char,
            'confidence': detection_data['confidence'],
            'type': mode,
            'timestamp': time.time(),
            'processing_time': 0.1
        }
    
    async def change_mode(self, websocket, client_id, data):
        """Change processing mode"""
        mode = data.get('mode', 'both')
        valid_modes = ['sign', 'lip', 'both']
        
        if mode not in valid_modes:
            mode = 'both'
        
        response = {
            'type': 'mode_changed',
            'mode': mode,
            'timestamp': time.time(),
            'message': f'Processing mode changed to {mode}'
        }
        await websocket.send(json.dumps(response))
        print(f"Client {client_id} changed mode to {mode}")
    
    async def handle_control(self, websocket, client_id, data):
        """Handle control commands"""
        command = data.get('command', '').lower()
        
        if command == 'start':
            response = {
                'type': 'control_response',
                'command': 'start',
                'status': 'started',
                'timestamp': time.time(),
                'message': 'Detection started'
            }
        elif command == 'stop':
            response = {
                'type': 'control_response',
                'command': 'stop',
                'status': 'stopped',
                'timestamp': time.time(),
                'message': 'Detection stopped'
            }
        elif command == 'pause':
            response = {
                'type': 'control_response',
                'command': 'pause',
                'status': 'paused',
                'timestamp': time.time(),
                'message': 'Detection paused'
            }
        elif command == 'resume':
            response = {
                'type': 'control_response',
                'command': 'resume',
                'status': 'resumed',
                'timestamp': time.time(),
                'message': 'Detection resumed'
            }
        else:
            response = {
                'type': 'error',
                'message': f'Unknown command: {command}',
                'timestamp': time.time()
            }
        
        await websocket.send(json.dumps(response))
        print(f"Client {client_id} sent control command: {command}")
    
    async def broadcast(self, message):
        """Broadcast message to all connections"""
        if self.connections:
            disconnected = []
            for connection in self.connections:
                try:
                    await connection.send(message)
                except:
                    disconnected.append(connection)
            
            for connection in disconnected:
                self.connections.remove(connection)
    
    async def health_check(self):
        """Periodic health check"""
        while True:
            await asyncio.sleep(30)
            health_msg = {
                'type': 'health',
                'timestamp': time.time(),
                'connections': len(self.connections),
                'status': 'healthy',
                'detection_active': True
            }
            await self.broadcast(json.dumps(health_msg))
    
    async def start(self, host='0.0.0.0', port=8765):
        """Start WebSocket server"""
        print("=" * 60)
        print("Sign Language Detection Server")
        print(f"WebSocket Server starting on {host}:{port}")
        print("=" * 60)
        print("Features:")
        print("  • Real-time hand landmark detection")
        print("  • Lip movement tracking")
        print("  • Bounding box visualization")
        print("  • Confidence scoring")
        print("=" * 60)
        print("Waiting for connections...")
        
        health_task = asyncio.create_task(self.health_check())
        
        async with websockets.serve(self.handle_connection, host, port):
            print(f"✓ Server started successfully on {host}:{port}")
            print("Press Ctrl+C to stop")
            await asyncio.Future()
        
        health_task.cancel()

def run_server():
    server = WebSocketServer()
    
    try:
        print("Starting WebSocket server...")
        asyncio.run(server.start(host='0.0.0.0', port=8765))
    except KeyboardInterrupt:
        print("\nServer stopped by user")
    except Exception as e:
        print(f"Server error: {e}")
        traceback.print_exc()

if __name__ == '__main__':
    run_server()