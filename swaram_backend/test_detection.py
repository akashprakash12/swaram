# backend/test_detection.py
import cv2
import mediapipe as mp
import numpy as np
import time

# Initialize MediaPipe
mp_hands = mp.solutions.hands
mp_face_mesh = mp.solutions.face_mesh
mp_drawing = mp.solutions.drawing_utils

hands = mp_hands.Hands(
    static_image_mode=False,
    max_num_hands=2,
    min_detection_confidence=0.7,
    min_tracking_confidence=0.5
)

face_mesh = mp_face_mesh.FaceMesh(
    static_image_mode=False,
    max_num_faces=1,
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5
)

# Start webcam
cap = cv2.VideoCapture(0)

print("Starting real-time detection test...")
print("Press 'q' to quit")
print("Show your hands to see detection!")

while cap.isOpened():
    success, frame = cap.read()
    if not success:
        break
    
    # Flip frame horizontally for mirror effect
    frame = cv2.flip(frame, 1)
    
    # Convert BGR to RGB
    image_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    image_rgb.flags.writeable = False
    
    # Process hands
    hand_results = hands.process(image_rgb)
    
    # Process face
    face_results = face_mesh.process(image_rgb)
    
    image_rgb.flags.writeable = True
    frame = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2BGR)
    
    hand_count = 0
    gesture = "None"
    
    # Draw hand landmarks
    if hand_results.multi_hand_landmarks:
        hand_count = len(hand_results.multi_hand_landmarks)
        
        for hand_landmarks in hand_results.multi_hand_landmarks:
            mp_drawing.draw_landmarks(
                frame,
                hand_landmarks,
                mp_hands.HAND_CONNECTIONS,
                mp_drawing.DrawingSpec(color=(0, 255, 0), thickness=2, circle_radius=4),
                mp_drawing.DrawingSpec(color=(0, 255, 255), thickness=2)
            )
            
            # Get bounding box
            h, w, _ = frame.shape
            x_coords = [landmark.x for landmark in hand_landmarks.landmark]
            y_coords = [landmark.y for landmark in hand_landmarks.landmark]
            
            x_min = int(min(x_coords) * w)
            x_max = int(max(x_coords) * w)
            y_min = int(min(y_coords) * h)
            y_max = int(max(y_coords) * h)
            
            # Draw bounding box
            cv2.rectangle(frame, (x_min, y_min), (x_max, y_max), (0, 255, 0), 2)
            
            # Simple gesture recognition
            thumb_tip = hand_landmarks.landmark[4]
            index_tip = hand_landmarks.landmark[8]
            wrist = hand_landmarks.landmark[0]
            
            if thumb_tip.y < wrist.y and index_tip.y < wrist.y:
                gesture = "Thumbs up + Pointing"
            elif thumb_tip.y < wrist.y:
                gesture = "Thumbs up"
            elif index_tip.y < wrist.y:
                gesture = "Pointing"
            else:
                gesture = "Closed hand"
    
    # Draw face landmarks (lip region)
    if face_results.multi_face_landmarks:
        for face_landmarks in face_results.multi_face_landmarks:
            # Draw only lip landmarks (indices 61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291)
            lip_indices = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291]
            
            h, w, _ = frame.shape
            lip_points = []
            
            for idx in lip_indices:
                if idx < len(face_landmarks.landmark):
                    landmark = face_landmarks.landmark[idx]
                    x = int(landmark.x * w)
                    y = int(landmark.y * h)
                    lip_points.append((x, y))
                    cv2.circle(frame, (x, y), 2, (255, 0, 0), -1)
            
            # Draw lip polygon if we have enough points
            if len(lip_points) > 2:
                cv2.polylines(frame, [np.array(lip_points)], True, (255, 0, 0), 1)
    
    # Add info text
    cv2.putText(frame, f"Hands: {hand_count}", (10, 30), 
                cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
    cv2.putText(frame, f"Gesture: {gesture}", (10, 70), 
                cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
    cv2.putText(frame, "Press 'q' to quit", (10, 110), 
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
    
    # Center guide circle
    h, w, _ = frame.shape
    center_x, center_y = w // 2, h // 2
    cv2.circle(frame, (center_x, center_y), 100, (255, 255, 255), 2)
    cv2.putText(frame, "Place hands here", (center_x - 80, center_y - 120), 
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
    
    cv2.imshow('Hand & Lip Detection Test', frame)
    
    if cv2.waitKey(5) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()
hands.close()
face_mesh.close()