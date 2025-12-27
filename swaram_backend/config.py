# backend/config.py
import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    # Server Configuration
    HOST = os.getenv('HOST', '0.0.0.0')
    PORT = int(os.getenv('PORT', 5000))
    DEBUG = os.getenv('DEBUG', 'False').lower() == 'true'
    
    # Model Paths
    SIGN_MODEL_PATH = os.getenv('SIGN_MODEL_PATH', 'models/sign_language_3dcnn.h5')
    LIP_MODEL_PATH = os.getenv('LIP_MODEL_PATH', 'models/lip_reading_bilstm.h5')
    FUSION_MODEL_PATH = os.getenv('FUSION_MODEL_PATH', 'models/fusion_model.h5')
    
    # Processing Settings
    FRAME_BUFFER_SIZE = int(os.getenv('FRAME_BUFFER_SIZE', '30'))
    MAX_WORKERS = int(os.getenv('MAX_WORKERS', '4'))
    PROCESSING_QUEUE_SIZE = int(os.getenv('PROCESSING_QUEUE_SIZE', '100'))
    
    # WebSocket Settings
    WS_HOST = os.getenv('WS_HOST', '0.0.0.0')
    WS_PORT = int(os.getenv('WS_PORT', '8765'))
    
    # Redis Configuration (Optional)
    REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379')
    USE_REDIS = os.getenv('USE_REDIS', 'False').lower() == 'true'
    
    # Performance Settings
    TARGET_FPS = int(os.getenv('TARGET_FPS', '30'))
    MAX_LATENCY_MS = int(os.getenv('MAX_LATENCY_MS', '100'))
    
    # Malayalam Character Set
    MALAYALAM_CHARS = "അആഇഈഉഊഋഌഎഏഐഒഓഔകഖഗഘങചഛജഝഞടഠഡഢണതഥദധനപഫബഭമയരലവശഷസഹളഴറ"
    
    @classmethod
    def validate(cls):
        """Validate configuration"""
        required_dirs = ['models', 'data', 'logs']
        for dir_name in required_dirs:
            if not os.path.exists(dir_name):
                os.makedirs(dir_name)
                print(f"Created directory: {dir_name}")
        
        return True