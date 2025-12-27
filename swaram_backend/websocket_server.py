# backend/websocket_server.py
import asyncio
import websockets
import json
import cv2
import numpy as np
import base64
import time
import traceback
from model_server import RealTimeProcessor

class WebSocketServer:
    def __init__(self):
        self.processor = RealTimeProcessor()
        self.connections = set()
        self.frame_rate = 30
        self.max_frame_size = 1024 * 1024  # 1MB max frame size
        
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
            # Send welcome message
            welcome_msg = {
                'type': 'welcome',
                'message': 'Connected to Malayalam Sign Language & Lip Reading Server',
                'timestamp': time.time(),
                'supported_modes': ['sign', 'lip', 'both'],
                'server_version': '1.0.0'
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
            # Respond to ping
            await websocket.send(json.dumps({
                'type': 'pong',
                'timestamp': time.time(),
                'client_timestamp': data.get('timestamp')
            }))
            
        elif message_type == 'handshake':
            # Acknowledge handshake
            await websocket.send(json.dumps({
                'type': 'handshake_ack',
                'message': 'Handshake received',
                'timestamp': time.time(),
                'client_info': data
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
        """Process incoming frame"""
        try:
            # Validate frame data
            frame_data = data.get('frame')
            if not frame_data:
                await websocket.send(json.dumps({
                    'type': 'error',
                    'message': 'No frame data provided',
                    'timestamp': time.time()
                }))
                return
            
            # Check frame size
            if len(frame_data) > self.max_frame_size:
                await websocket.send(json.dumps({
                    'type': 'error',
                    'message': f'Frame too large: {len(frame_data)} bytes (max: {self.max_frame_size})',
                    'timestamp': time.time()
                }))
                return
            
            # Decode base64 frame
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
            
            # Get processing mode
            mode = data.get('mode', 'both')
            valid_modes = ['sign', 'lip', 'both']
            if mode not in valid_modes:
                mode = 'both'
            
            # Add frame to processor
            self.processor.add_frame(frame)
            
            # Get latest result
            result = self.processor.get_latest_result()
            
            if result:
                # Send result back
                response = {
                    'type': 'translation',
                    'data': result,
                    'timestamp': time.time(),
                    'frame_id': data.get('frame_id', 'unknown')
                }
                await websocket.send(json.dumps(response))
                
                # Send stats
                stats = {
                    'type': 'stats',
                    'fps': self.frame_rate,
                    'queue_size': self.processor.processing_queue.qsize(),
                    'buffer_fill': len(self.processor.frame_buffer),
                    'latency': result.get('processing_time', 0),
                    'timestamp': time.time()
                }
                await websocket.send(json.dumps(stats))
            else:
                # Frame queued but not processed yet
                await websocket.send(json.dumps({
                    'type': 'status',
                    'message': 'Frame queued for processing',
                    'queue_position': self.processor.processing_queue.qsize(),
                    'buffer_fill': len(self.processor.frame_buffer),
                    'timestamp': time.time()
                }))
                
        except Exception as e:
            print(f"Frame processing error for {client_id}: {e}")
            traceback.print_exc()
            
            error_response = {
                'type': 'error',
                'message': f'Frame processing error: {str(e)}',
                'timestamp': time.time()
            }
            await websocket.send(json.dumps(error_response))
    
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
                'message': 'Processing started'
            }
        elif command == 'stop':
            response = {
                'type': 'control_response',
                'command': 'stop',
                'status': 'stopped',
                'timestamp': time.time(),
                'message': 'Processing stopped'
            }
        elif command == 'pause':
            response = {
                'type': 'control_response',
                'command': 'pause',
                'status': 'paused',
                'timestamp': time.time(),
                'message': 'Processing paused'
            }
        elif command == 'resume':
            response = {
                'type': 'control_response',
                'command': 'resume',
                'status': 'resumed',
                'timestamp': time.time(),
                'message': 'Processing resumed'
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
            
            # Remove disconnected clients
            for connection in disconnected:
                self.connections.remove(connection)
    
    async def health_check(self):
        """Periodic health check"""
        while True:
            await asyncio.sleep(30)  # Every 30 seconds
            health_msg = {
                'type': 'health',
                'timestamp': time.time(),
                'connections': len(self.connections),
                'queue_size': self.processor.processing_queue.qsize(),
                'status': 'healthy'
            }
            await self.broadcast(json.dumps(health_msg))
    
    async def start(self, host='0.0.0.0', port=8765):
        """Start WebSocket server"""
        print("=" * 60)
        print("Malayalam Sign Language & Lip Reading Server")
        print(f"WebSocket Server starting on {host}:{port}")
        print("=" * 60)
        print(f"TensorFlow Version: {self.processor.sign_model.__class__.__name__}")
        print(f"Frame Buffer Size: {self.processor.frame_buffer.maxlen}")
        print(f"Processing Queue Size: {self.processor.processing_queue.maxsize}")
        print("=" * 60)
        print("Waiting for connections...")
        
        # Start health check task
        health_task = asyncio.create_task(self.health_check())
        
        # Start WebSocket server
        async with websockets.serve(self.handle_connection, host, port):
            print(f"✓ Server started successfully on {host}:{port}")
            print("Press Ctrl+C to stop")
            await asyncio.Future()  # Run forever
        
        # Cancel health task when server stops
        health_task.cancel()

# Simplified server runner
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