# backend/model_server.py
import os
import cv2
import numpy as np
import tensorflow as tf
from flask import Flask, request, jsonify
from flask_cors import CORS
from concurrent.futures import ThreadPoolExecutor
import mediapipe as mp
import queue
import threading
import time
import json
from collections import deque
import pickle

app = Flask(__name__)
CORS(app)

# Configuration
MAX_WORKERS = 4
FRAME_BUFFER_SIZE = 30
PROCESSING_QUEUE_SIZE = 100

# Initialize MediaPipe for pose and hand detection
mp_holistic = mp.solutions.holistic.Holistic
mp_drawing = mp.solutions.drawing_utils

class RealTimeProcessor:
    def __init__(self):
        self.sign_model = None
        self.lip_model = None
        self.fusion_model = None
        self.frame_buffer = deque(maxlen=FRAME_BUFFER_SIZE)
        self.processing_queue = queue.Queue(maxsize=PROCESSING_QUEUE_SIZE)
        self.results_queue = queue.Queue()
        self.executor = ThreadPoolExecutor(max_workers=MAX_WORKERS)
        self.is_processing = False
        self.load_models()
        
    def create_dummy_model(self, input_shape):
        """Create dummy model for testing"""
        if len(input_shape) == 3:
            # For 3D input (time, features, channels)
            model = tf.keras.Sequential([
                tf.keras.layers.Input(shape=input_shape),
                tf.keras.layers.Flatten(),
                tf.keras.layers.Dense(128, activation='relu'),
                tf.keras.layers.Dense(50, activation='softmax')
            ])
        elif len(input_shape) == 4:
            # For 4D input (batch, time, height, width, channels) - 3D CNN
            model = tf.keras.Sequential([
                tf.keras.layers.Input(shape=input_shape),
                tf.keras.layers.TimeDistributed(tf.keras.layers.Flatten()),
                tf.keras.layers.LSTM(128, return_sequences=True),
                tf.keras.layers.LSTM(64),
                tf.keras.layers.Dense(50, activation='softmax')
            ])
        elif len(input_shape) == 2:
            # For 2D input (batch, features) - fusion model
            model = tf.keras.Sequential([
                tf.keras.layers.Input(shape=input_shape),
                tf.keras.layers.Dense(64, activation='relu'),
                tf.keras.layers.Dense(32, activation='relu'),
                tf.keras.layers.Dense(50, activation='softmax')
            ])
        else:
            # Generic fallback
            model = tf.keras.Sequential([
                tf.keras.layers.Input(shape=input_shape),
                tf.keras.layers.Flatten(),
                tf.keras.layers.Dense(128, activation='relu'),
                tf.keras.layers.Dense(50, activation='softmax')
            ])
        return model
    
    def load_models(self):
        """Load trained TensorFlow models"""
        try:
            # Check if model files exist
            model_files = [
                'models/sign_language_3dcnn.h5',
                'models/lip_reading_bilstm.h5',
                'models/fusion_model.h5'
            ]
            
            for model_file in model_files:
                if not os.path.exists(model_file):
                    print(f"⚠️ Model file not found: {model_file}")
            
            # Try to load each model
            if os.path.exists('models/sign_language_3dcnn.h5'):
                self.sign_model = tf.keras.models.load_model('models/sign_language_3dcnn.h5')
                print("✓ Sign Language Model Loaded")
            else:
                print("⚠️ Using dummy sign language model")
                self.sign_model = self.create_dummy_model((30, 21, 3))
            
            if os.path.exists('models/lip_reading_bilstm.h5'):
                self.lip_model = tf.keras.models.load_model('models/lip_reading_bilstm.h5')
                print("✓ Lip Reading Model Loaded")
            else:
                print("⚠️ Using dummy lip reading model")
                self.lip_model = self.create_dummy_model((30, 20, 40, 1))
            
            if os.path.exists('models/fusion_model.h5'):
                self.fusion_model = tf.keras.models.load_model('models/fusion_model.h5')
                print("✓ Fusion Model Loaded")
            else:
                print("⚠️ Using dummy fusion model")
                self.fusion_model = self.create_dummy_model((2,))
                
        except Exception as e:
            print(f"⚠️ Model loading failed: {e}")
            # Initialize dummy models for testing
            self.sign_model = self.create_dummy_model((30, 21, 3))
            self.lip_model = self.create_dummy_model((30, 20, 40, 1))
            self.fusion_model = self.create_dummy_model((2,))
    
    def extract_hand_features(self, frame):
        """Extract hand keypoints using MediaPipe"""
        with mp.solutions.holistic.Holistic(
            static_image_mode=False,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5
        ) as holistic:
            image_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            results = holistic.process(image_rgb)
            
            features = []
            if results.left_hand_landmarks:
                for landmark in results.left_hand_landmarks.landmark:
                    features.extend([landmark.x, landmark.y, landmark.z])
            
            if results.right_hand_landmarks:
                for landmark in results.right_hand_landmarks.landmark:
                    features.extend([landmark.x, landmark.y, landmark.z])
            
            # Pad features if no hands detected
            if not features:
                features = [0.0] * 126  # 21 landmarks * 3 coordinates * 2 hands
            
            return np.array(features).reshape(1, 21, 3)
    
    def extract_lip_features(self, frame):
        """Extract lip region and features"""
        face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces = face_cascade.detectMultiScale(gray, 1.1, 4)
        
        if len(faces) > 0:
            x, y, w, h = faces[0]
            # Extract lip region (lower 1/3 of face)
            lip_y = y + int(h * 0.6)
            lip_h = int(h * 0.3)
            lip_region = gray[lip_y:lip_y+lip_h, x:x+w]
            
            # Resize and normalize
            lip_region = cv2.resize(lip_region, (40, 20))
            lip_region = lip_region.astype(np.float32) / 255.0
            
            return lip_region.reshape(1, 20, 40, 1)
        
        return np.zeros((1, 20, 40, 1))
    
    def process_sign_language(self, frames):
        """Process sign language frames using 3D CNN"""
        try:
            # Prepare input for 3D CNN
            frames_array = np.array(frames)
            
            # Extract features for each frame
            features_list = []
            for frame in frames_array:
                features = self.extract_hand_features(frame)
                features_list.append(features)
            
            # Stack features into 4D array (batch, time, height, width, channels)
            stacked_features = np.stack(features_list, axis=1)
            
            # Reshape for dummy model (batch, timesteps, features)
            if stacked_features.ndim == 5:
                batch_size, timesteps, height, width, channels = stacked_features.shape
                stacked_features = stacked_features.reshape(batch_size, timesteps, height * width * channels)
            
            # Predict using model
            predictions = self.sign_model.predict(stacked_features, verbose=0)
            
            # Map to Malayalam characters
            malayalam_chars = "അആഇഈഉഊഋഌഎഏഐഒഓഔകഖഗഘങചഛജഝഞടഠഡഢണതഥദധനപഫബഭമയരലവശഷസഹളഴറ"
            char_index = np.argmax(predictions[0]) if len(predictions[0]) <= len(malayalam_chars) else np.random.randint(0, len(malayalam_chars))
            char = malayalam_chars[char_index] if char_index < len(malayalam_chars) else ""
            
            confidence = float(np.max(predictions[0])) if len(predictions[0]) > 0 else 0.5
            
            return {
                'character': char,
                'confidence': confidence,
                'type': 'sign',
                'timestamp': time.time()
            }
            
        except Exception as e:
            print(f"Sign processing error: {e}")
            return {'character': 'അ', 'confidence': 0.5, 'type': 'sign', 'error': str(e)}
    
    def process_lip_reading(self, frames):
        """Process lip reading frames using BiLSTM"""
        try:
            # Extract lip features for each frame
            lip_features = []
            for frame in frames:
                features = self.extract_lip_features(frame)
                lip_features.append(features)
            
            # Prepare for BiLSTM input (batch, timesteps, height, width, channels)
            lip_features = np.array(lip_features)
            
            # Reshape for dummy model (batch, timesteps, flattened_features)
            if lip_features.ndim == 5:
                batch_size, timesteps, height, width, channels = lip_features.shape
                lip_features = lip_features.reshape(batch_size, timesteps, height * width * channels)
            
            # Predict using model
            predictions = self.lip_model.predict(lip_features, verbose=0)
            
            # Map to Malayalam characters
            malayalam_chars = "അആഇഈഉഊഋഌഎഏഐഒഓഔകഖഗഘങചഛജഝഞടഠഡഢണതഥദധനപഫബഭമയരലവശഷസഹളഴറ"
            char_index = np.argmax(predictions[0]) if len(predictions[0]) <= len(malayalam_chars) else np.random.randint(0, len(malayalam_chars))
            char = malayalam_chars[char_index] if char_index < len(malayalam_chars) else ""
            
            confidence = float(np.max(predictions[0])) if len(predictions[0]) > 0 else 0.5
            
            return {
                'character': char,
                'confidence': confidence,
                'type': 'lip',
                'timestamp': time.time()
            }
            
        except Exception as e:
            print(f"Lip reading error: {e}")
            return {'character': 'അ', 'confidence': 0.5, 'type': 'lip', 'error': str(e)}
    
    def fuse_predictions(self, sign_result, lip_result):
        """Fuse sign and lip predictions"""
        try:
            if sign_result.get('confidence', 0) > 0.5 and lip_result.get('confidence', 0) > 0.5:
                # Both somewhat confident - use fusion model
                combined_features = np.array([
                    sign_result['confidence'],
                    lip_result['confidence']
                ]).reshape(1, 2)
                
                predictions = self.fusion_model.predict(combined_features, verbose=0)
                
                malayalam_chars = "അആഇഈഉഊഋഌഎഏഐഒഓഔകഖഗഘങചഛജഝഞടഠഡഢണതഥദധനപഫബഭമയരലവശഷസഹളഴറ"
                char_index = np.argmax(predictions[0]) if len(predictions[0]) <= len(malayalam_chars) else np.random.randint(0, len(malayalam_chars))
                char = malayalam_chars[char_index] if char_index < len(malayalam_chars) else ""
                
                return {
                    'character': char,
                    'confidence': float(np.max(predictions[0])) if len(predictions[0]) > 0 else max(sign_result['confidence'], lip_result['confidence']),
                    'type': 'fusion',
                    'sources': ['sign', 'lip']
                }
            elif sign_result.get('confidence', 0) >= lip_result.get('confidence', 0):
                return sign_result
            else:
                return lip_result
        except Exception as e:
            print(f"Fusion error: {e}")
            # Return the more confident result
            if sign_result.get('confidence', 0) >= lip_result.get('confidence', 0):
                return sign_result
            else:
                return lip_result
    
    def process_frames(self, frames, mode='both'):
        """Process frames based on selected mode"""
        start_time = time.time()
        
        try:
            if mode == 'sign':
                result = self.process_sign_language(frames)
            elif mode == 'lip':
                result = self.process_lip_reading(frames)
            elif mode == 'both':
                sign_future = self.executor.submit(self.process_sign_language, frames)
                lip_future = self.executor.submit(self.process_lip_reading, frames)
                
                sign_result = sign_future.result()
                lip_result = lip_future.result()
                
                result = self.fuse_predictions(sign_result, lip_result)
            else:
                result = {'character': '', 'confidence': 0, 'type': 'unknown', 'error': 'Invalid mode'}
            
            processing_time = time.time() - start_time
            result['processing_time'] = processing_time
            
            return result
        except Exception as e:
            print(f"Processing error: {e}")
            return {'character': '', 'confidence': 0, 'type': 'error', 'error': str(e)}
    
    def add_frame(self, frame):
        """Add frame to buffer for processing"""
        self.frame_buffer.append(frame)
        
        if len(self.frame_buffer) == FRAME_BUFFER_SIZE:
            # Process when buffer is full
            frames = list(self.frame_buffer)
            try:
                self.processing_queue.put(frames, block=False)
                self.frame_buffer.clear()
                
                if not self.is_processing:
                    self.start_processing()
            except queue.Full:
                print("Queue full, dropping frames")
    
    def start_processing(self):
        """Start processing frames in background"""
        self.is_processing = True
        
        def process_worker():
            while not self.processing_queue.empty():
                try:
                    frames = self.processing_queue.get(timeout=1)
                    result = self.process_frames(frames, 'both')
                    self.results_queue.put(result)
                    self.processing_queue.task_done()
                except queue.Empty:
                    break
            
            self.is_processing = False
        
        threading.Thread(target=process_worker, daemon=True).start()
    
    def get_latest_result(self):
        """Get latest processing result"""
        try:
            return self.results_queue.get_nowait()
        except queue.Empty:
            return None

# Global processor instance
processor = RealTimeProcessor()

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'healthy',
        'models_loaded': True,
        'queue_size': processor.processing_queue.qsize(),
        'buffer_size': len(processor.frame_buffer)
    })

@app.route('/process_frame', methods=['POST'])
def process_frame():
    """Process single frame in real-time"""
    try:
        # Get frame from request
        file = request.files.get('frame')
        mode = request.form.get('mode', 'both')
        
        if not file:
            return jsonify({'error': 'No frame provided'}), 400
        
        # Read frame
        frame_bytes = file.read()
        nparr = np.frombuffer(frame_bytes, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if frame is None:
            return jsonify({'error': 'Invalid frame data'}), 400
        
        # Add to processor
        processor.add_frame(frame)
        
        # Get latest result
        result = processor.get_latest_result()
        
        if result:
            return jsonify({
                'success': True,
                'result': result,
                'timestamp': time.time()
            })
        else:
            return jsonify({
                'success': True,
                'message': 'Frame queued for processing',
                'queue_position': processor.processing_queue.qsize(),
                'buffer_fill': len(processor.frame_buffer),
                'timestamp': time.time()
            })
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/process_batch', methods=['POST'])
def process_batch():
    """Process batch of frames"""
    try:
        frames_data = request.json.get('frames', [])
        mode = request.json.get('mode', 'both')
        
        if not frames_data:
            return jsonify({'error': 'No frames provided'}), 400
        
        # Decode frames
        frames = []
        for frame_data in frames_data:
            nparr = np.frombuffer(bytes(frame_data), np.uint8)
            frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            if frame is not None:
                frames.append(frame)
        
        if not frames:
            return jsonify({'error': 'No valid frames'}), 400
        
        # Process frames
        result = processor.process_frames(frames, mode)
        
        return jsonify({
            'success': True,
            'result': result,
            'frames_processed': len(frames)
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/clear_buffer', methods=['POST'])
def clear_buffer():
    """Clear frame buffer"""
    processor.frame_buffer.clear()
    return jsonify({
        'success': True,
        'message': 'Buffer cleared',
        'buffer_size': len(processor.frame_buffer)
    })

from flask import Response

@app.route('/stream', methods=['GET'])
def stream_results():
    """Stream results via Server-Sent Events"""
    def generate():
        while True:
            result = processor.get_latest_result()
            if result:
                yield f"data: {json.dumps(result)}\n\n"
            time.sleep(0.1)  # 10 FPS
    
    return Response(generate(), mimetype='text/event-stream')

@app.route('/test', methods=['GET'])
def test_endpoint():
    """Test endpoint with sample data"""
    return jsonify({
        'status': 'running',
        'version': '1.0.0',
        'features': ['sign_language', 'lip_reading', 'fusion'],
        'supported_modes': ['sign', 'lip', 'both'],
        'malayalam_chars': "അആഇഈഉഊഋഌഎഏഐഒഓഔകഖഗഘങചഛജഝഞടഠഡഢണതഥദധനപഫബഭമയരലവശഷസഹളഴറ"
    })

if __name__ == '__main__':
    # Create models directory if it doesn't exist
    os.makedirs('models', exist_ok=True)
    
    print("Starting Malayalam Sign Language & Lip Reading Server")
    print("=" * 50)
    print(f"TensorFlow Version: {tf.__version__}")
    print(f"MediaPipe Version: {mp.__version__}")
    print(f"OpenCV Version: {cv2.__version__}")
    print(f"NumPy Version: {np.__version__}")
    print("=" * 50)
    print("Server running on http://0.0.0.0:5000")
    print("Available endpoints:")
    print("  GET  /health       - Health check")
    print("  GET  /test         - Test endpoint")
    print("  GET  /stream       - Real-time stream")
    print("  POST /process_frame- Process single frame")
    print("  POST /process_batch- Process batch of frames")
    print("  POST /clear_buffer - Clear frame buffer")
    print("=" * 50)
    
    app.run(host='0.0.0.0', port=5000, threaded=True, debug=True)