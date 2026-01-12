#!/bin/bash
# Start script for SWARAM backend

echo "Starting SWARAM Backend Server..."

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Install dependencies
echo "Installing dependencies..."
pip install -r requirements.txt

# Create necessary directories
mkdir -p models
mkdir -p logs

echo ""
echo "Configuration:"
echo "--------------"
echo "1. Place your model files in: models/"
echo "2. Create .env file with GEMINI_API_KEY for enhanced translation"
echo "3. Server will run on: ws://0.0.0.0:8765"
echo ""

# Check for .env file
if [ ! -f ".env" ]; then
    echo "⚠️  No .env file found. Creating template..."
    echo "# Gemini API Key" > .env
    echo "GEMINI_API_KEY=your_key_here" >> .env
    echo ""
    echo "Please edit .env file and add your Gemini API key"
    echo "Get a key from: https://makersuite.google.com/app/apikey"
    echo ""
fi

# Start server
echo "🚀 Starting WebSocket server..."
python main.py