import requests
import time
from pathlib import Path
from app.core.config import settings

HF_API_URL = "https://api-inference.huggingface.co/models/dima806/deepfake_vs_real_image_detection"

_pothole_model = None
_crack_model = None


def _get_models():
    """Lazy-load YOLO models on first use. Returns (pothole_model, crack_model).
    Either may be None if the weight file is missing or AI is disabled."""
    global _pothole_model, _crack_model

    if _pothole_model is not None or _crack_model is not None:
        return _pothole_model, _crack_model

    if not settings.AI_ENABLED:
        return None, None

    try:
        from ultralytics import YOLO
    except ImportError:
        print("ultralytics not installed — YOLO inference unavailable.")
        return None, None

    pothole_path = Path(settings.POTHOLE_MODEL_PATH)
    crack_path = Path(settings.CRACK_MODEL_PATH)

    if pothole_path.exists():
        try:
            _pothole_model = YOLO(str(pothole_path))
            print(f"Pothole model loaded from {pothole_path}")
        except Exception as e:
            print(f"Failed to load pothole model: {e}")
    else:
        print(
            f"[ai_fake_detector] Pothole model not found at '{pothole_path.resolve()}'. "
            "Place the .pt file there and restart the server."
        )

    if crack_path.exists():
        try:
            _crack_model = YOLO(str(crack_path))
            print(f"Crack model loaded from {crack_path}")
        except Exception as e:
            print(f"Failed to load crack model: {e}")
    else:
        print(
            f"[ai_fake_detector] Crack model not found at '{crack_path.resolve()}'. "
            "Place the .pt file there and restart the server."
        )

    return _pothole_model, _crack_model


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

    if settings.AI_FAKE_DETECTION_ENABLED and settings.HF_API_TOKEN:
        try:
            print("Sending image to Hugging Face...")
            headers = {"Authorization": f"Bearer {settings.HF_API_TOKEN}"}

            with open(image_path, "rb") as f:
                image_data = f.read()

            response = requests.post(HF_API_URL, headers=headers, data=image_data)

            if response.status_code == 503:
                print("Hugging Face model is asleep. Waiting 15 seconds to wake it up...")
                time.sleep(15)
                print("Retrying Hugging Face...")
                response = requests.post(HF_API_URL, headers=headers, data=image_data)

            if response.status_code == 200:
                fake_analysis = response.json()
                print(f"HF RAW RESPONSE: {fake_analysis}")
                artificial_score = 0.0

                for item in fake_analysis:
                    label = item.get('label', '').lower()
                    if label in ['artificial', 'fake', 'ai', 'ai-generated']:
                        artificial_score = item.get('score', 0.0)
                        break

                if artificial_score > 0.70:
                    result["valid"] = False
                    result["is_ai_generated"] = True
                    result["ai_generated_confidence"] = round(artificial_score, 2)
                    result["reason"] = f"Warning: AI-generated image ({round(artificial_score * 100)}%)."
            else:
                print(f"HF Error ({response.status_code}): {response.text}")

        except Exception as e:
            print(f"HF Request Failed: {e}")

    if result["valid"]:
        pothole_model, crack_model = _get_models()
        try:
            highest_conf = 0.0
            damage_detected = None
            detected_types = []

            if pothole_model:
                p_results = pothole_model(image_path)
                for box in p_results[0].boxes:
                    conf = float(box.conf[0])
                    if conf > highest_conf:
                        highest_conf = conf
                        damage_detected = "POTHOLE"
                    detected_types.append("POTHOLE")

            if crack_model:
                c_results = crack_model(image_path)
                for box in c_results[0].boxes:
                    conf = float(box.conf[0])
                    if conf > highest_conf:
                        highest_conf = conf
                        damage_detected = "CRACK"
                    detected_types.append("CRACK")

            if damage_detected:
                result["damage_type"] = damage_detected
                result["confidence"] = round(highest_conf, 2)
                result["severity"] = "High" if highest_conf > 0.8 else "Moderate"
                unique_types = list(set(detected_types))
                result["reason"] = f"Detected: {', '.join(unique_types)}"
            else:
                result["reason"] = "No road damage detected."

        except Exception as e:
            print(f"YOLO Processing Failed: {e}")

    return result
