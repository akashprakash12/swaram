# test_websocket.py
import asyncio
import websockets
import json

async def test_connection():
    try:
        uri = "ws://192.168.1.9:8081"
        print(f"Connecting to {uri}...")
        
        async with websockets.connect(uri) as websocket:
            # Wait for welcome message
            response = await websocket.recv()
            print("Connected! Server response:")
            print(json.dumps(json.loads(response), indent=2))
            
            # Send a ping
            ping_msg = {
                'type': 'ping',
                'timestamp': 1234567890
            }
            await websocket.send(json.dumps(ping_msg))
            
            # Get pong response
            pong = await websocket.recv()
            print("\nPong response:")
            print(json.dumps(json.loads(pong), indent=2))
            
    except Exception as e:
        print(f"Connection failed: {e}")

asyncio.run(test_connection())