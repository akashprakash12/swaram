import tensorflow as tf
import numpy as np

class LipReadingModel:
    def __init__(self, model_path=None):
        # Load your pre-trained CNN-LSTM model
        # For now, using a placeholder
        self.model = None
        self.load_model(model_path)
        
        # Malayalam character set
        self.malayalam_chars = "അആഇഈഉഊഋഌഎഏഐഒഓഔകഖഗഘങചഛജഝഞടഠഡഢണതഥദധനപഫബഭമയരലവശഷസഹളഴറഺംഃ"
        self.char_to_idx = {char: idx for idx, char in enumerate(self.malayalam_chars)}
        self.idx_to_char = {idx: char for idx, char in enumerate(self.malayalam_chars)}
    
    def load_model(self, model_path):
        if model_path:
            self.model = tf.keras.models.load_model(model_path)
        else:
            # Create a simple placeholder model structure
            # Replace with your actual trained model
            self.model = self.create_placeholder_model()
    
    def create_placeholder_model(self):
        """Create a placeholder model - replace with your trained model"""
        model = tf.keras.Sequential([
            tf.keras.layers.Conv2D(32, (3, 3), activation='relu', input_shape=(128, 128, 1)),
            tf.keras.layers.MaxPooling2D((2, 2)),
            tf.keras.layers.Conv2D(64, (3, 3), activation='relu'),
            tf.keras.layers.MaxPooling2D((2, 2)),
            tf.keras.layers.Flatten(),
            tf.keras.layers.Dense(128, activation='relu'),
            tf.keras.layers.Dense(len(self.malayalam_chars), activation='softmax')
        ])
        return model
    
    def predict(self, image):
        """Predict text from lip image"""
        if self.model:
            prediction = self.model.predict(image)
            predicted_idx = np.argmax(prediction[0])
            return self.idx_to_char.get(predicted_idx, "അ")
        else:
            return "ലിപ് വായന മോഡൽ ലഭ്യമല്ല"  # "Lip reading model not available"