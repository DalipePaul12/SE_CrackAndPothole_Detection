import os
from ultralytics import YOLO
# from transformers import pipeline  # <--- I-comment muna para iwas download

# --- 1. LOAD POTHOLE MODEL (YOLO) ---
try:
    # Sa ngayon, gagamit muna ng default yolov8n.pt. 
    # Kapag may best.pt ka na, palitan mo ito.
    damage_model = YOLO("yolov8n.pt") 
    print("✅ YOLO Damage Model Loaded")
except Exception as e:
    print(f"❌ YOLO Error: {e}")
    damage_model = None

# --- 2. LOAD FAKE IMAGE DETECTOR (Hugging Face) ---
# Naka-comment muna para hindi mag-download ang 347MB na file.
fake_detector = None 
"""
try:
    print("⏳ Loading AI Fake Detector...")
    fake_detector = pipeline("image-classification", model="umm-maybe/AI-image-detector")
    print("✅ AI Fake Detector Loaded")
except Exception as e:
    print(f"❌ Fake Detector Error: {e}")
    fake_detector = None
"""

def analyze_image(image_path: str):
    result = {
        "valid": True,
        "is_ai_generated": False,
        "ai_generated_confidence": 0.0,
        "damage_type": "Unknown",
        "severity": "Unknown",
        "confidence": 0.0,
        "reason": ""
    }

    # --- STEP A: Check if AI Generated (SKIPPED FOR NOW) ---
    # Naka-skip muna ito dahil naka-comment ang fake_detector sa itaas.
    if fake_detector:
        try:
            fake_analysis = fake_detector(image_path)
            artificial_score = 0.0
            for item in fake_analysis:
                if item['label'] == 'artificial':
                    artificial_score = item['score']
                    break
            
            if artificial_score > 0.70:
                result["valid"] = False
                result["is_ai_generated"] = True
                result["ai_generated_confidence"] = round(artificial_score, 2)
                result["reason"] = f"Warning: AI-generated image ({round(artificial_score*100)}%)."
        except Exception as e:
            print(f"Fake Detection Failed: {e}")

    # --- STEP B: Detect Potholes (YOLO) ---
    if damage_model:
        try:
            results = damage_model(image_path)
            yolo_result = results[0]
            detected_objects = []
            highest_conf = 0.0
            
            for box in yolo_result.boxes:
                class_id = int(box.cls[0])
                conf = float(box.conf[0])
                class_name = damage_model.names[class_id]
                detected_objects.append(class_name)
                if conf > highest_conf:
                    highest_conf = conf

            if detected_objects:
                result["damage_type"] = detected_objects[0]
                result["confidence"] = round(highest_conf, 2)
                result["severity"] = "High" if highest_conf > 0.8 else "Moderate"
                result["reason"] = f"Detected: {', '.join(detected_objects)}"
            else:
                result["reason"] = "No road damage detected."
        except Exception as e:
            print(f"YOLO Analysis Failed: {e}")

    return result