# debug_mediapipe.py
import mediapipe as mp
import inspect

print("MediaPipe version:", getattr(mp, '__version__', 'Unknown'))

print("\nChecking MediaPipe module structure...")
print("Type of mp:", type(mp))
print("MP location:", inspect.getfile(mp))

print("\nContents of mediapipe module:")
print(dir(mp))

print("\nChecking if it's a fake or modified package...")
print("Module file path:", mp.__file__)