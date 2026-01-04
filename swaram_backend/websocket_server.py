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

class DetectionProcessor:
    def __init__(self):
        self.mp_holistic = mp.solutions.holistic
        self.mp_drawing = mp.solutions.drawing_utils
        self.hand_connections = [
            [0, 1], [1, 2], [2, 3], [3, 4],  # Thumb
            [0, 5], [5, 6], [6, 7], [7, 8],  # Index
            [0, 9], [9, 10], [10, 11], [11, 12],  # Middle
            [0, 13], [13, 14], [14, 15], [15, 16],  # Ring
            [0, 17], [17, 18], [18, 19], [19, 20]  # Pinky
        ]
        self.lip_indices = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185]
        self.executor = ThreadPoolExecutor(max_workers=2)
        
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
            with self.mp_holistic.Holistic(
                static_image_mode=False,
                min_detection_confidence=0.5,
                min_tracking_confidence=0.5
            ) as holistic:
                
                image_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                results = holistic.process(image_rgb)
                
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
            
            # Extract detection data in separate thread
            detection_data = await asyncio.get_event_loop().run_in_executor(
                self.detection_processor.executor,
                self.detection_processor.extract_detection_data,
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
            
            # For demo purposes, generate a mock translation
            if detection_data['confidence'] > 0.5:
                translation = await self.generate_mock_translation(detection_data, mode)
                if translation:
                    translation_response = {
                        'type': 'translation',
                        'data': translation,
                        'detection': detection_data,
                        'timestamp': time.time(),
                        'frame_id': data.get('frame_id', 'unknown')
                    }
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