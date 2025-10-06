import mediapipe as mp
import tensorflow as tf
import cv2
import numpy as np

class SignLanguageModel:
    def __init__(self, model_path=None):
        self.mp_hands = mp.solutions.hands
        self.hands = self.mp_hands.Hands(
            static_image_mode=True,
            max_num_hands=2,
            min_detection_confidence=0.5
        )
        
        # Load your sign language recognition model
        self.model = None
        self.load_model(model_path)
        
        # Malayalam sign language labels
        self.sign_labels = ["നമസ്കാരം", "നന്ദി", "സഹായം", "ആശുപത്രി", "വീട്"]
    
    def load_model(self, model_path):
        if model_path:
            self.model = tf.keras.models.load_model(model_path)
        else:
            # Placeholder model
            self.model = self.create_placeholder_model()
    
    def create_placeholder_model(self):
        """Create a placeholder model - replace with your trained model"""
        model = tf.keras.Sequential([
            tf.keras.layers.Dense(64, activation='relu', input_shape=(42,)),  # 21 hand landmarks * 2
            tf.keras.layers.Dense(32, activation='relu'),
            tf.keras.layers.Dense(len(self.sign_labels), activation='softmax')
        ])
        return model
    
    def extract_hand_landmarks(self, image):
        """Extract hand landmarks using MediaPipe"""
        rgb_image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        results = self.hands.process(rgb_image)
        
        landmarks = []
        if results.multi_hand_landmarks:
            for hand_landmarks in results.multi_hand_landmarks:
                for landmark in hand_landmarks.landmark:
                    landmarks.extend([landmark.x, landmark.y])
        
        # Pad or truncate to fixed size
        if len(landmarks) < 42:
            landmarks.extend([0] * (42 - len(landmarks)))
        else:
            landmarks = landmarks[:42]
            
        return np.array(landmarks)
    
    def predict(self, image):
        """Predict sign language from image"""
        landmarks = self.extract_hand_landmarks(image)
        
        if self.model and len(landmarks) == 42:
            prediction = self.model.predict(landmarks.reshape(1, -1))
            predicted_idx = np.argmax(prediction[0])
            return self.sign_labels[predicted_idx]
        else:
            return "സൈൻ ലഭ്യമല്ല"  # "Sign not available"