import os
from ultralytics import YOLO
from transformers import pipeline

# --- 1. LOAD POTHOLE MODEL (YOLO) ---
# Ito yung ite-train mo later. Sa ngayon, generic muna.
try:
    # Pag tapos mo na i-train, palitan mo to ng "best.pt"
    damage_model = YOLO("yolov8n.pt") 
    print("✅ YOLO Damage Model Loaded")
except Exception as e:
    print(f"❌ YOLO Error: {e}")
    damage_model = None

# --- 2. LOAD FAKE IMAGE DETECTOR (Hugging Face) ---
# Ito ang "Pre-trained" na open source model. Kusa itong magda-download sa first run.
# Model source: https://huggingface.co/umm-maybe/AI-image-detector
try:
    print("⏳ Loading AI Fake Detector... (First run might take time)")
    fake_detector = pipeline("image-classification", model="umm-maybe/AI-image-detector")
    print("✅ AI Fake Detector Loaded")
except Exception as e:
    print(f"❌ Fake Detector Error: {e}")
    fake_detector = None

def analyze_image(image_path: str):
    """
    Runs two analyses:
    1. Is the image Fake/AI-Generated? (Hugging Face)
    2. What kind of damage is it? (YOLO)
    """
    
    result = {
        "valid": True,
        "is_ai_generated": False,
        "ai_generated_confidence": 0.0,
        "damage_type": "Unknown",
        "severity": "Unknown",
        "confidence": 0.0,
        "reason": ""
    }

    # --- STEP A: Check if AI Generated ---
    if fake_detector:
        try:
            # Ang output nito ay list: [{'label': 'artificial', 'score': 0.99}, {'label': 'real', 'score': 0.01}]
            fake_analysis = fake_detector(image_path)
            
            # Hanapin ang score ng 'artificial'
            artificial_score = 0.0
            for item in fake_analysis:
                if item['label'] == 'artificial':
                    artificial_score = item['score']
                    break
            
            # LOGIC: Kapag lampas 70% sure na Artificial, i-flag natin
            if artificial_score > 0.70:
                result["valid"] = False
                result["is_ai_generated"] = True
                result["ai_generated_confidence"] = round(artificial_score, 2)
                result["reason"] = f"Warning: Image appears to be AI-generated ({round(artificial_score*100)}% match)."
                
                # Pwede mo i-return agad dito kung gusto mo i-reject agad
                # return result 
                
        except Exception as e:
            print(f"Fake Detection Failed: {e}")

    # --- STEP B: Detect Potholes (YOLO) ---
    if damage_model:
        try:
            # Run YOLO
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

            # Update Result
            if detected_objects:
                result["damage_type"] = detected_objects[0] # Kunin ang unang nakita
                result["confidence"] = round(highest_conf, 2)
                
                # Simple logic for Severity (Pabaguhin mo to pag may custom model ka na)
                if highest_conf > 0.8:
                    result["severity"] = "High"
                else:
                    result["severity"] = "Moderate"
                
                if result["valid"]: # Kung hindi fake, update reason
                    result["reason"] = f"Detected: {', '.join(detected_objects)}"
            else:
                if result["valid"]:
                    result["reason"] = "No road damage detected."

        except Exception as e:
            print(f"YOLO Analysis Failed: {e}")

    return result
