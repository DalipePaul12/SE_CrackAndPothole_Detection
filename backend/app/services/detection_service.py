"""
detection_service.py

Handles:
  - AI fake/real image detection via HuggingFace
  - Road damage classification via YOLO (pothole + crack models)
  - Hybrid video report resolution (aggregates per-frame results)
"""

import logging
import os
import time
from collections import defaultdict

import requests
from ultralytics import YOLO

from app.core.config import settings

logger = logging.getLogger(__name__)


# ── Model loading ─────────────────────────────────────────────────────────────

try:
    pothole_model = YOLO(settings.POTHOLE_MODEL_PATH)
    crack_model   = YOLO(settings.CRACK_MODEL_PATH)
    logger.info("YOLO models loaded — pothole: %s | crack: %s",
                settings.POTHOLE_MODEL_PATH, settings.CRACK_MODEL_PATH)
except Exception as e:
    logger.error("YOLO model load failed: %s", e)
    pothole_model = None
    crack_model   = None


# ── HuggingFace config ────────────────────────────────────────────────────────

HF_API_URL = (
    "https://api-inference.huggingface.co/models/"
    "dima806/deepfake_vs_real_image_detection"
)


# ── Image analysis (photo pipeline) ──────────────────────────────────────────

def analyze_image(image_path: str) -> dict:
    """
    Full analysis pipeline for a single image:
      1. HuggingFace AI-generated detection (if enabled)
      2. YOLO damage classification (pothole + crack)

    Returns a dict with keys:
      valid, is_ai_generated, ai_generated_confidence,
      damage_type, severity, confidence, reason
    """

    result = {
        "valid":                  True,
        "is_ai_generated":        False,
        "ai_generated_confidence": 0.0,
        "damage_type":            "Unknown",
        "severity":               "Unknown",
        "confidence":             0.0,
        "reason":                 "",
    }

    # ── Step 1: HuggingFace fake detection ────────────────────────────────────
    if settings.AI_FAKE_DETECTION_ENABLED and settings.HF_API_TOKEN:
        try:
            logger.info("Sending image to HuggingFace: %s", image_path)
            headers = {"Authorization": f"Bearer {settings.HF_API_TOKEN}"}

            with open(image_path, "rb") as f:
                image_data = f.read()

            response = requests.post(HF_API_URL, headers=headers, data=image_data, timeout=30)

            # Wake sleeping model and retry once
            if response.status_code == 503:
                logger.warning("HuggingFace model sleeping — waiting 15s then retrying...")
                time.sleep(15)
                response = requests.post(HF_API_URL, headers=headers, data=image_data, timeout=30)

            if response.status_code == 200:
                fake_analysis = response.json()
                logger.info("HuggingFace response: %s", fake_analysis)

                artificial_score = 0.0
                for item in fake_analysis:
                    label = item.get("label", "").lower()
                    if label in ("artificial", "fake", "ai", "ai-generated"):
                        artificial_score = item.get("score", 0.0)
                        break

                if artificial_score > 0.70:
                    result["valid"]                   = False
                    result["is_ai_generated"]         = True
                    result["ai_generated_confidence"] = round(artificial_score, 2)
                    result["reason"] = (
                        f"Warning: AI-generated image detected "
                        f"({round(artificial_score * 100)}% confidence)."
                    )
                    logger.warning("Image flagged as AI-generated: %.2f", artificial_score)
                    return result  # short-circuit — no YOLO needed

            else:
                logger.error("HuggingFace error %d: %s", response.status_code, response.text)

        except Exception as e:
            logger.exception("HuggingFace request failed: %s", e)

    # ── Step 2: YOLO damage classification ────────────────────────────────────
    if result["valid"]:
        try:
            highest_conf   = 0.0
            damage_detected = None
            detected_types  = []

            if pothole_model:
                p_results = pothole_model(image_path)
                for box in p_results[0].boxes:
                    conf = float(box.conf[0])
                    detected_types.append("pothole")
                    if conf > highest_conf:
                        highest_conf    = conf
                        damage_detected = "pothole"

            if crack_model:
                c_results = crack_model(image_path)
                for box in c_results[0].boxes:
                    conf = float(box.conf[0])
                    detected_types.append("crack")
                    if conf > highest_conf:
                        highest_conf    = conf
                        damage_detected = "crack"

            if damage_detected:
                result["damage_type"] = damage_detected
                result["confidence"]  = round(highest_conf, 2)

                result["severity"] = "critical" if highest_conf > 0.80 else "non-critical"

                unique_types   = list(set(detected_types))
                result["reason"] = f"Detected: {', '.join(unique_types)}"
                logger.info("YOLO result — type: %s  conf: %.2f  severity: %s",
                            damage_detected, highest_conf, result["severity"])
            else:
                result["reason"] = "No road damage detected."
                logger.info("YOLO found no damage in: %s", image_path)

        except Exception as e:
            logger.exception("YOLO processing failed: %s", e)

    return result


# ── Hybrid resolver (video pipeline) ─────────────────────────────────────────

def resolve_hybrid(frame_results: list[dict]) -> dict:
    """
    Aggregates per-frame YOLO detections from a video into a single report result.

    Each item in frame_results must have:
      { "damage_type": "pothole"|"crack", "confidence": float, ... }

    Returns:
      {
        "damage_type":      str | None,   — dominant type
        "secondary_damage": str | None,   — only on hybrid reports
        "is_hybrid":        bool,
        "severity":         str | None,   — "critical" | "low"
        "total_detections": int,
        "crack_frames":     list[dict],
        "pothole_frames":   list[dict],
      }
    """

    if not frame_results:
        return {
            "damage_type":      None,
            "secondary_damage": None,
            "is_hybrid":        False,
            "severity":         None,
            "total_detections": 0,
            "crack_frames":     [],
            "pothole_frames":   [],
        }

    scores: dict[str, list[float]] = defaultdict(list)

    for r in frame_results:
        dtype = r.get("damage_type")
        conf  = r.get("confidence", 0.0)
        if dtype in ("pothole", "crack"):
            scores[dtype].append(conf)

    if not scores:
        return {
            "damage_type":      None,
            "secondary_damage": None,
            "is_hybrid":        False,
            "severity":         None,
            "total_detections": 0,
            "crack_frames":     [],
            "pothole_frames":   [],
        }

    # Weighted score = frame count × average confidence
    weighted = {
        dtype: len(confs) * (sum(confs) / len(confs))
        for dtype, confs in scores.items()
    }

    primary   = max(weighted, key=weighted.get)
    is_hybrid = len(weighted) > 1
    secondary = (
        [d for d in weighted if d != primary][0]
        if is_hybrid else None
    )

    # Severity — only "critical" | "non-critical" to match SeverityLevel enum
    total_detections = sum(len(c) for c in scores.values())
    all_confs        = [c for confs in scores.values() for c in confs]
    avg_conf         = sum(all_confs) / len(all_confs)

    severity = "critical" if (avg_conf >= 0.80 or total_detections >= 10) else "non-critical"

    crack_frames   = [r for r in frame_results if r.get("damage_type") == "crack"]
    pothole_frames = [r for r in frame_results if r.get("damage_type") == "pothole"]

    logger.info(
        "resolve_hybrid — primary: %s  secondary: %s  hybrid: %s  "
        "severity: %s  total_detections: %d",
        primary, secondary, is_hybrid, severity, total_detections,
    )

    return {
        "damage_type":      primary,
        "secondary_damage": secondary,
        "is_hybrid":        is_hybrid,
        "severity":         severity,
        "total_detections": total_detections,
        "crack_frames":     crack_frames,
        "pothole_frames":   pothole_frames,
    }