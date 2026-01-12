#!/usr/bin/env python3
"""
Main backend server for Swaram - Sign Language & Lip Reading Translator
"""
import os
import sys
import logging
from pathlib import Path

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('swaram_backend.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

def main():
    """Main entry point"""
    print("=" * 60)
    print("SWARAM BACKEND SERVER")
    print("Sign Language & Lip Reading Translation System")
    print("=" * 60)
    
    try:
        # Check for required directories
        BASE_DIR = Path(__file__).parent
        models_dir = BASE_DIR / "models"
        
        if not models_dir.exists():
            logger.error(f"Models directory not found: {models_dir}")
            print("❌ ERROR: Models directory not found!")
            print(f"Please create: {models_dir}")
            return 1
        
        # Check for model files
        required_models = ["action.h5"]
        for model in required_models:
            model_path = models_dir / model
            if not model_path.exists():
                logger.warning(f"Model file not found: {model_path}")
                print(f"⚠️  Warning: {model} not found in models/")
        
        # Check for data directory
        data_dir = models_dir / "augmented_data_new"
        if not data_dir.exists():
            logger.warning(f"Data directory not found: {data_dir}")
            print(f"⚠️  Warning: Training data not found in {data_dir}")
        
        # Import and start WebSocket server
        from websocket_server import WebSocketServer
        
        server = WebSocketServer()
        
        print("\n✅ Starting WebSocket Server...")
        print("📡 Server will run on: ws://0.0.0.0:8765")
        print(f"📱 Connect from mobile app using IP: 192.168.73.170")
        print("\nPress Ctrl+C to stop the server")
        
        import asyncio
        asyncio.run(server.start())
        
    except KeyboardInterrupt:
        print("\n\n🛑 Server stopped by user")
    except Exception as e:
        logger.error(f"Server error: {e}", exc_info=True)
        print(f"❌ Server error: {e}")
        return 1
    
    return 0

if __name__ == "__main__":
    sys.exit(main())