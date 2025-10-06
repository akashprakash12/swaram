const API_URL = "http://192.168.49.90:5000";

export const getLipText = async (imageBase64, isVideoFrame = false) => {
  try {
    const response = await fetch(`${API_URL}/api/lipread`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({ 
        image: imageBase64,
        is_video_frame: isVideoFrame
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.success) {
      return data.text;
    } else {
      throw new Error(data.error || 'Unknown error from backend');
    }
  } catch (error) {
    console.error("API Error:", error);
    return "പിശക്: " + error.message;
  }
};

export const testBackendConnection = async () => {
  try {
    const response = await fetch(`${API_URL}/api/test`);
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Connection test failed:", error);
    return null;
  }
};