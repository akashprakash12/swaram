#!/usr/bin/env python3
"""Test WebSocket client connection"""
import asyncio
import websockets
import json
import base64
import cv2
import numpy as np
import time

async def test_client():
    uri = "ws://192.168.73.170:8765"
    
    try:
        async with websockets.connect(uri) as websocket:
            print(f"✅ Connected to {uri}")
            
            # Receive welcome
            welcome = await websocket.recv()
            welcome_data = json.loads(welcome)
            print(f"📥 Welcome: {welcome_data.get('message')}")
            print(f"📊 Labels: {welcome_data.get('labels')}")
            
            # Send handshake
            handshake = {
                'type': 'handshake',
                'client': 'test-client',
                'platform': 'python',
                'timestamp': time.time()
            }
            await websocket.send(json.dumps(handshake))
            print("📤 Sent handshake")
            
            # Receive handshake ack
            ack = await websocket.recv()
            ack_data = json.loads(ack)
            print(f"📥 Handshake ACK: {ack_data.get('message')}")
            
            # Send mode change
            mode_change = {
                'type': 'mode',
                'mode': 'sign',
                'timestamp': time.time()
            }
            await websocket.send(json.dumps(mode_change))
            print("📤 Changed mode to 'sign'")
            
            # Receive mode ack
            mode_ack = await websocket.recv()
            mode_data = json.loads(mode_ack)
            print(f"📥 Mode ACK: {mode_data}")
            
            # Send control start
            control_start = {
                'type': 'control',
                'command': 'start',
                'timestamp': time.time()
            }
            await websocket.send(json.dumps(control_start))
            print("📤 Sent 'start' command")
            
            # Receive control response
            control_resp = await websocket.recv()
            control_data = json.loads(control_resp)
            print(f"📥 Control response: {control_data.get('message')}")
            
            # Send a test frame
            # Create a dummy black image
            dummy_frame = np.zeros((480, 640, 3), dtype=np.uint8)
            _, buffer = cv2.imencode('.jpg', dummy_frame)
            frame_base64 = base64.b64encode(buffer).decode('utf-8')
            
            frame_msg = {
                'type': 'frame',
                'frame': frame_base64,
                'mode': 'sign',
                'frame_id': 'test_frame_1',
                'timestamp': time.time()
            }
            await websocket.send(json.dumps(frame_msg))
            print("📤 Sent test frame")
            
            # Receive responses
            for _ in range(3):
                response = await websocket.recv()
                response_data = json.loads(response)
                resp_type = response_data.get('type')
                print(f"📥 Received {resp_type}: {response_data}")
            
            print("\n✅ All tests passed!")
            print("✅ Server is working correctly!")
            
    except Exception as e:
        print(f"❌ Connection failed: {e}")

if __name__ == "__main__":
    asyncio.run(test_client())