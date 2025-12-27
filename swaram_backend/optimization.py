# backend/optimization.py
import time
import threading
from collections import deque
import numpy as np

class PerformanceOptimizer:
    def __init__(self, target_latency_ms=100):
        self.target_latency = target_latency_ms / 1000.0
        self.latency_history = deque(maxlen=100)
        self.frame_rate = 30
        self.quality_level = 1.0  # 0.0 to 1.0
        self.is_adjusting = False
        
    def update_latency(self, latency):
        """Update latency and adjust parameters"""
        self.latency_history.append(latency)
        
        if len(self.latency_history) >= 10 and not self.is_adjusting:
            self.adjust_parameters()
    
    def adjust_parameters(self):
        """Adjust processing parameters based on latency"""
        self.is_adjusting = True
        
        try:
            avg_latency = np.mean(self.latency_history)
            
            if avg_latency > self.target_latency * 1.2:
                # Latency too high, reduce quality
                if self.frame_rate > 15:
                    self.frame_rate = max(15, self.frame_rate - 5)
                    print(f"Reduced frame rate to {self.frame_rate} FPS")
                elif self.quality_level > 0.5:
                    self.quality_level = max(0.5, self.quality_level - 0.1)
                    print(f"Reduced quality to {self.quality_level:.1f}")
            
            elif avg_latency < self.target_latency * 0.8:
                # Latency low, can increase quality
                if self.quality_level < 1.0:
                    self.quality_level = min(1.0, self.quality_level + 0.1)
                    print(f"Increased quality to {self.quality_level:.1f}")
                elif self.frame_rate < 30:
                    self.frame_rate = min(30, self.frame_rate + 5)
                    print(f"Increased frame rate to {self.frame_rate} FPS")
        
        finally:
            self.is_adjusting = False
    
    def get_optimal_frame_size(self, original_size):
        """Calculate optimal frame size based on quality"""
        width, height = original_size
        scale = np.sqrt(self.quality_level)
        
        new_width = int(width * scale)
        new_height = int(height * scale)
        
        # Ensure dimensions are divisible by 32 for CNN
        new_width = (new_width // 32) * 32
        new_height = (new_height // 32) * 32
        
        return (max(64, new_width), max(64, new_height))
    
    def should_skip_frame(self, current_time, last_processed_time):
        """Determine if frame should be skipped to maintain frame rate"""
        target_interval = 1.0 / self.frame_rate
        return (current_time - last_processed_time) < target_interval
    
    def get_performance_metrics(self):
        """Get current performance metrics"""
        return {
            'frame_rate': self.frame_rate,
            'quality_level': self.quality_level,
            'avg_latency': np.mean(self.latency_history) if self.latency_history else 0,
            'target_latency': self.target_latency,
        }