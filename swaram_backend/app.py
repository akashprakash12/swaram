from flask import Flask, request, jsonify
from flask_cors import CORS
import base64
import cv2
import numpy as np
from PIL import Image
import io
import random
import time

app = Flask(__name__)
CORS(app)

# Malayalam words for mock responses
MALAYALAM_WORDS = [
    "നമസ്കാരം", "വണക്കം", "സ്നേഹം", "സഹായം", 
    "നന്ദി", "കുശലം", "വീട്", "പാഠശാല",
    "ആശുപത്രി", "ഭക്ഷണം", "ജലം", "സുഖം",
    "കാറ്", "മരം", "പുസ്തകം", "ഫോൺ"
]

# Store last prediction to avoid too frequent updates
last_prediction = ""
last_prediction_time = 0

@app.route('/api/lipread', methods=['POST'])
def lip_read():
    global last_prediction, last_prediction_time
    
    try:
        data = request.json
        
        if not data or 'image' not in data:
            return jsonify({
                'success': False,
                'error': 'No image data received'
            }), 400
        
        image_base64 = data['image']
        is_video_frame = data.get('is_video_frame', False)
        
        # Handle base64 data
        if ',' in image_base64:
            image_base64 = image_base64.split(',')[1]
        
        # Decode base64 image
        image_data = base64.b64decode(image_base64)
        image = Image.open(io.BytesIO(image_data))
        image_np = np.array(image)
        
        current_time = time.time()
        
        # For video frames, only process every 2 seconds to avoid overload
        if is_video_frame and (current_time - last_prediction_time < 2.0):
            return jsonify({
                'success': True,
                'text': last_prediction,
                'language': 'malayalam',
                'confidence': 0.8,
                'is_cached': True
            })
        
        # Mock AI prediction - replace with actual model later
        predicted_text = random.choice(MALAYALAM_WORDS)
        last_prediction = predicted_text
        last_prediction_time = current_time
        
        return jsonify({
            'success': True,
            'text': predicted_text,
            'language': 'malayalam',
            'confidence': round(random.uniform(0.7, 0.95), 2),
            'is_video_frame': is_video_frame,
            'image_size': f"{image_np.shape[1]}x{image_np.shape[0]}"
        })
        
    except Exception as e:
        print(f"Error in lip_read: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e),
            'text': 'പിശക് സംഭവിച്ചു'
        }), 500

@app.route('/api/test', methods=['GET'])
def test():
    return jsonify({
        'message': 'Swaram Backend is running! 🚀',
        'status': 'active',
        'version': '1.0.0'
    })

if __name__ == '__main__':
    print("🚀 Starting Swaram Backend with Real-time Video Support...")
    print("📱 Endpoints:")
    print("   GET  /api/test - Test endpoint")
    print("   POST /api/lipread - Real-time lip reading")
    app.run(host='0.0.0.0', port=5000, debug=True)