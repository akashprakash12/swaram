# backend/detection_server.py
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

class RealTimeDetector:
    def __init__(self):
        # Initialize MediaPipe
        self.mp_hands = mp.solutions.hands
        self.mp_face_mesh = mp.solutions.face_mesh
        self.mp_drawing = mp.solutions.drawing_utils
        self.mp_drawing_styles = mp.solutions.drawing_styles
        
        # Hand detection
        self.hands = self.mp_hands.Hands(
            static_image_mode=False,
            max_num_hands=2,
            min_detection_confidence=0.5,  # Lowered for better detection
            min_tracking_confidence=0.3    # Lowered for better tracking
        )
        
        # Face mesh for lip detection
        self.face_mesh = self.mp_face_mesh.FaceMesh(
            static_image_mode=False,
            max_num_faces=1,
            min_detection_confidence=0.3,  # Lowered for better detection
            min_tracking_confidence=0.3    # Lowered for better tracking
        )
        
        self.executor = ThreadPoolExecutor(max_workers=4)
        self.last_detection = None
        self.detection_lock = threading.Lock()
        
        # Hand connections for drawing
        self.hand_connections = [
            [0, 1], [1, 2], [2, 3], [3, 4],        # Thumb
            [0, 5], [5, 6], [6, 7], [7, 8],        # Index finger
            [0, 9], [9, 10], [10, 11], [11, 12],   # Middle finger
            [0, 13], [13, 14], [14, 15], [15, 16], # Ring finger
            [0, 17], [17, 18], [18, 19], [19, 20]  # Pinky
        ]
        
        # Lip indices (MediaPipe face mesh landmarks)
        self.lip_indices = [
            61, 146, 91, 181, 84, 17, 314, 405, 321, 375,  # Outer lips
            291, 409, 270, 269, 267, 0, 37, 39, 40, 185,    # Inner lips
            78, 95, 88, 178, 87, 14, 317, 402, 318, 324,    # More lip points
            308, 415, 310, 311, 312, 13, 82, 81, 80, 191
        ]
        
    def process_frame(self, frame, mode='both'):
        """Process a single frame for hand and lip detection"""
        detection_data = {
            'handLandmarks': [],
            'lipLandmarks': [],
            'handConnections': self.hand_connections,
            'handBoundingBox': None,
            'lipBoundingBox': None,
            'handCount': 0,
            'lipDetected': False,
            'confidence': 0,
            'timestamp': time.time(),
            'gesture': 'unknown'
        }
        
        try:
            # Preprocess image for better detection
            # Resize if too large (maintain aspect ratio)
            height, width = frame.shape[:2]
            if width > 640:
                aspect_ratio = height / width
                new_width = 640
                new_height = int(new_width * aspect_ratio)
                frame = cv2.resize(frame, (new_width, new_height), interpolation=cv2.INTER_LINEAR)
            
            # Enhance contrast slightly
            lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB)
            clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8,8))
            lab[:, :, 0] = clahe.apply(lab[:, :, 0])
            frame = cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)
            
            # Convert BGR to RGB
            image_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            image_rgb.flags.writeable = False
            
            # Process hands
            if mode in ['sign', 'both']:
                hand_results = self.hands.process(image_rgb)
                
                if hand_results.multi_hand_landmarks:
                    detection_data['handCount'] = len(hand_results.multi_hand_landmarks)
                    
                    for hand_landmarks in hand_results.multi_hand_landmarks:
                        # Get individual hand landmarks
                        for idx, landmark in enumerate(hand_landmarks.landmark):
                            detection_data['handLandmarks'].append({
                                'x': landmark.x,
                                'y': landmark.y,
                                'z': landmark.z,
                                'visibility': landmark.visibility if hasattr(landmark, 'visibility') else 1.0
                            })
                        
                        # Calculate bounding box for this hand
                        if detection_data['handLandmarks']:
                            xs = [lm['x'] for lm in detection_data['handLandmarks'][-21:]]
                            ys = [lm['y'] for lm in detection_data['handLandmarks'][-21:]]
                            
                            if xs and ys:
                                padding = 0.05
                                x_min = max(0.0, min(xs) - padding)
                                y_min = max(0.0, min(ys) - padding)
                                x_max = min(1.0, max(xs) + padding)
                                y_max = min(1.0, max(ys) + padding)
                                
                                if detection_data['handBoundingBox'] is None:
                                    detection_data['handBoundingBox'] = {
                                        'x': x_min,
                                        'y': y_min,
                                        'width': x_max - x_min,
                                        'height': y_max - y_min
                                    }
                        
                        # Try to recognize simple gestures
                        detection_data['gesture'] = self.recognize_gesture(hand_landmarks)
                        detection_data['confidence'] = 0.8
            
            # Process lips
            if mode in ['lip', 'both']:
                face_results = self.face_mesh.process(image_rgb)
                
                if face_results.multi_face_landmarks:
                    detection_data['lipDetected'] = True
                    
                    for face_landmarks in face_results.multi_face_landmarks:
                        # Extract lip landmarks
                        for idx in self.lip_indices:
                            if idx < len(face_landmarks.landmark):
                                landmark = face_landmarks.landmark[idx]
                                detection_data['lipLandmarks'].append({
                                    'x': landmark.x,
                                    'y': landmark.y,
                                    'z': landmark.z
                                })
                        
                        # Calculate lip bounding box
                        if detection_data['lipLandmarks']:
                            xs = [lm['x'] for lm in detection_data['lipLandmarks']]
                            ys = [lm['y'] for lm in detection_data['lipLandmarks']]
                            
                            if xs and ys:
                                padding = 0.02
                                x_min = max(0.0, min(xs) - padding)
                                y_min = max(0.0, min(ys) - padding)
                                x_max = min(1.0, max(xs) + padding)
                                y_max = min(1.0, max(ys) + padding)
                                
                                detection_data['lipBoundingBox'] = {
                                    'x': x_min,
                                    'y': y_min,
                                    'width': x_max - x_min,
                                    'height': y_max - y_min
                                }
                                detection_data['confidence'] = max(detection_data['confidence'], 0.7)
            
            # Calculate overall confidence
            if detection_data['handCount'] > 0 or detection_data['lipDetected']:
                detection_data['confidence'] = max(detection_data['confidence'], 0.6)
                
        except Exception as e:
            print(f"Detection error: {e}")
            traceback.print_exc()
        
        finally:
            image_rgb.flags.writeable = True
        
        return detection_data
    
    def recognize_gesture(self, hand_landmarks):
        """Recognize basic hand gestures"""
        try:
            # Get key points
            thumb_tip = hand_landmarks.landmark[4]
            index_tip = hand_landmarks.landmark[8]
            middle_tip = hand_landmarks.landmark[12]
            ring_tip = hand_landmarks.landmark[16]
            pinky_tip = hand_landmarks.landmark[20]
            wrist = hand_landmarks.landmark[0]
            
            # Calculate distances
            def distance(p1, p2):
                return ((p1.x - p2.x)**2 + (p1.y - p2.y)**2) ** 0.5
            
            # Check for open hand (all fingers extended)
            thumb_extended = thumb_tip.y < hand_landmarks.landmark[3].y
            index_extended = index_tip.y < hand_landmarks.landmark[6].y
            middle_extended = middle_tip.y < hand_landmarks.landmark[10].y
            ring_extended = ring_tip.y < hand_landmarks.landmark[14].y
            pinky_extended = pinky_tip.y < hand_landmarks.landmark[18].y
            
            if all([thumb_extended, index_extended, middle_extended, ring_extended, pinky_extended]):
                return "open_hand"
            
            # Check for fist (all fingers closed)
            thumb_closed = thumb_tip.y > hand_landmarks.landmark[3].y
            index_closed = index_tip.y > hand_landmarks.landmark[6].y
            middle_closed = middle_tip.y > hand_landmarks.landmark[10].y
            ring_closed = ring_tip.y > hand_landmarks.landmark[14].y
            pinky_closed = pinky_tip.y > hand_landmarks.landmark[18].y
            
            if all([thumb_closed, index_closed, middle_closed, ring_closed, pinky_closed]):
                return "fist"
            
            # Check for victory sign (index and middle extended, others closed)
            if index_extended and middle_extended and not ring_extended and not pinky_extended:
                return "victory"
            
            # Check for thumbs up
            if thumb_extended and not index_extended and not middle_extended and not ring_extended and not pinky_extended:
                return "thumbs_up"
            
            # Check for pointing
            if index_extended and not middle_extended and not ring_extended and not pinky_extended:
                return "pointing"
                
        except Exception as e:
            print(f"Gesture recognition error: {e}")
        
        return "unknown"
    
    def draw_detection_on_frame(self, frame, detection_data):
        """Draw detection landmarks and boxes on frame for debugging"""
        try:
            h, w, _ = frame.shape
            
            # Draw hand landmarks
            if detection_data['handLandmarks']:
                for landmark in detection_data['handLandmarks']:
                    x = int(landmark['x'] * w)
                    y = int(landmark['y'] * h)
                    cv2.circle(frame, (x, y), 4, (0, 255, 0), -1)
                
                # Draw hand connections
                for connection in detection_data['handConnections']:
                    if connection[0] < len(detection_data['handLandmarks']) and connection[1] < len(detection_data['handLandmarks']):
                        start = detection_data['handLandmarks'][connection[0]]
                        end = detection_data['handLandmarks'][connection[1]]
                        start_pt = (int(start['x'] * w), int(start['y'] * h))
                        end_pt = (int(end['x'] * w), int(end['y'] * h))
                        cv2.line(frame, start_pt, end_pt, (0, 255, 255), 2)
                
                # Draw hand bounding box
                if detection_data['handBoundingBox']:
                    bbox = detection_data['handBoundingBox']
                    x1 = int(bbox['x'] * w)
                    y1 = int(bbox['y'] * h)
                    x2 = int((bbox['x'] + bbox['width']) * w)
                    y2 = int((bbox['y'] + bbox['height']) * h)
                    cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
                    
                    # Add gesture label
                    cv2.putText(frame, f"Gesture: {detection_data['gesture']}", 
                               (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)
            
            # Draw lip landmarks
            if detection_data['lipLandmarks']:
                for landmark in detection_data['lipLandmarks']:
                    x = int(landmark['x'] * w)
                    y = int(landmark['y'] * h)
                    cv2.circle(frame, (x, y), 2, (255, 0, 0), -1)
                
                # Draw lip bounding box
                if detection_data['lipBoundingBox']:
                    bbox = detection_data['lipBoundingBox']
                    x1 = int(bbox['x'] * w)
                    y1 = int(bbox['y'] * h)
                    x2 = int((bbox['x'] + bbox['width']) * w)
                    y2 = int((bbox['y'] + bbox['height']) * h)
                    cv2.rectangle(frame, (x1, y1), (x2, y2), (255, 0, 0), 2)
            
            # Add detection info
            info_text = f"Hands: {detection_data['handCount']} | Lips: {detection_data['lipDetected']} | Conf: {detection_data['confidence']:.2f}"
            cv2.putText(frame, info_text, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
            
        except Exception as e:
            print(f"Drawing error: {e}")
        
        return frame

class DetectionServer:
    def __init__(self):
        self.detector = RealTimeDetector()
        self.connections = set()
        self.frame_counter = 0
        self.start_time = time.time()
        
    async def handle_connection(self, websocket, path=None):
        """Handle WebSocket connection"""
        client_id = f"client_{id(websocket)}"
        print(f"New connection from {client_id}")
        self.connections.add(websocket)
        
        try:
            # Send welcome message
            welcome_msg = {
                'type': 'welcome',
                'message': 'Connected to Real-Time Hand & Lip Detection Server',
                'timestamp': time.time(),
                'features': ['hand_detection', 'lip_detection', 'gesture_recognition']
            }
            await websocket.send(json.dumps(welcome_msg))
            
            async for message in websocket:
                try:
                    data = json.loads(message)
                    await self.process_message(websocket, client_id, data)
                    
                except json.JSONDecodeError:
                    await websocket.send(json.dumps({
                        'type': 'error',
                        'message': 'Invalid JSON',
                        'timestamp': time.time()
                    }))
                    
                except Exception as e:
                    print(f"Error: {e}")
                    traceback.print_exc()
                    
        except websockets.exceptions.ConnectionClosed:
            print(f"Connection closed: {client_id}")
        except Exception as e:
            print(f"Unexpected error: {e}")
            traceback.print_exc()
        finally:
            self.connections.remove(websocket)
            print(f"Disconnected: {client_id}")
    
    async def process_message(self, websocket, client_id, data):
        """Process incoming messages"""
        msg_type = data.get('type')
        
        if msg_type == 'ping':
            await websocket.send(json.dumps({
                'type': 'pong',
                'timestamp': time.time()
            }))
            
        elif msg_type == 'frame':
            await self.process_frame(websocket, client_id, data)
            
        elif msg_type == 'mode':
            await self.change_mode(websocket, client_id, data)
            
        else:
            await websocket.send(json.dumps({
                'type': 'error',
                'message': f'Unknown message type: {msg_type}',
                'timestamp': time.time()
            }))
    
    async def process_frame(self, websocket, client_id, data):
        """Process a frame from client"""
        try:
            # Get frame data
            frame_b64 = data.get('frame')
            mode = data.get('mode', 'both')
            
            if not frame_b64:
                raise ValueError("No frame data")
            
            # Decode frame
            frame_bytes = base64.b64decode(frame_b64)
            nparr = np.frombuffer(frame_bytes, np.uint8)
            frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            
            if frame is None:
                raise ValueError("Failed to decode frame")
            
            # Process frame for detection
            detection_data = await asyncio.get_event_loop().run_in_executor(
                self.detector.executor,
                self.detector.process_frame,
                frame, mode
            )
            
            # Send detection data back to client
            response = {
                'type': 'detection',
                'detection': detection_data,
                'timestamp': time.time(),
                'frame_id': data.get('frame_id', 'unknown'),
                'mode': mode
            }
            
            # Generate translation based on detection
            if detection_data['handCount'] > 0 or detection_data['lipDetected']:
                translation = await self.generate_translation(detection_data, mode)
                if translation:
                    response['translation'] = translation
            
            await websocket.send(json.dumps(response))
            
            # Calculate and send FPS
            self.frame_counter += 1
            elapsed = time.time() - self.start_time
            if elapsed > 1.0:
                fps = self.frame_counter / elapsed
                await websocket.send(json.dumps({
                    'type': 'stats',
                    'fps': fps,
                    'timestamp': time.time()
                }))
                self.frame_counter = 0
                self.start_time = time.time()
            
            # Debug: Save frame with detection overlay
            if self.frame_counter % 30 == 0:  # Every 30 frames
                debug_frame = self.detector.draw_detection_on_frame(frame.copy(), detection_data)
                cv2.imwrite(f'debug_frame_{int(time.time())}.jpg', debug_frame)
                
        except Exception as e:
            print(f"Frame processing error: {e}")
            traceback.print_exc()
            await websocket.send(json.dumps({
                'type': 'error',
                'message': str(e),
                'timestamp': time.time()
            }))
    
    async def generate_translation(self, detection_data, mode):
        """Generate translation based on detection"""
        # Malayalam alphabet for translation
        malayalam_chars = list("അആഇഈഉഊഋഌഎഏഐഒഓഔകഖഗഘങചഛജഝഞടഠഡഢണതഥദധനപഫബഭമയരലവശഷസഹളഴറ")
        
        # Map gestures to characters
        gesture_to_char = {
            "open_hand": "അ",
            "fist": "ക",
            "victory": "മ",
            "thumbs_up": "ത",
            "pointing": "പ",
            "unknown": "ഇ"
        }
        
        char = gesture_to_char.get(detection_data['gesture'], "അ")
        
        # If lip detected, add a different character
        if detection_data['lipDetected'] and mode in ['lip', 'both']:
            char = "ല"  # Different character for lip detection
        
        return {
            'character': char,
            'confidence': detection_data['confidence'],
            'type': mode,
            'gesture': detection_data['gesture'],
            'timestamp': time.time()
        }
    
    async def change_mode(self, websocket, client_id, data):
        """Change detection mode"""
        mode = data.get('mode', 'both')
        response = {
            'type': 'mode_changed',
            'mode': mode,
            'timestamp': time.time()
        }
        await websocket.send(json.dumps(response))
        print(f"Client {client_id} changed mode to {mode}")
    
    async def start(self, host='0.0.0.0', port=8765):
        """Start the WebSocket server"""
        print("=" * 60)
        print("REAL-TIME HAND & LIP DETECTION SERVER")
        print("=" * 60)
        print(f"Starting server on {host}:{port}")
        print(f"MediaPipe initialized: ✓")
        print(f"Hand detection: ✓ (max 2 hands)")
        print(f"Lip detection: ✓")
        print(f"Gesture recognition: ✓")
        print("=" * 60)
        
        async with websockets.serve(self.handle_connection, host, port):
            print("Server started successfully! Waiting for connections...")
            print("Press Ctrl+C to stop")
            await asyncio.Future()  # Run forever

def main():
    server = DetectionServer()
    
    try:
        asyncio.run(server.start())
    except KeyboardInterrupt:
        print("\nServer stopped by user")
    except Exception as e:
        print(f"Server error: {e}")
        traceback.print_exc()

if __name__ == '__main__':
    main()