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
from app.core.config import settings
from app.services.ml_service import _severity_from_bbox_norm
from ultralytics import YOLO

logger = logging.getLogger(__name__)


pothole_model = None
crack_model = None


def _ensure_models_loaded():
    global pothole_model, crack_model
    if pothole_model is not None and crack_model is not None:
        return
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


# ── Image analysis (photo pipeline — MULTI-DETECTION) ─────────────────────────

def analyze_image(image_path: str) -> dict:
    _ensure_models_loaded()
    """
    Full analysis pipeline for a single image:
      1. HuggingFace AI-generated detection (if enabled)
      2. YOLO damage classification (pothole + crack) — ALL detections

    Returns a dict with keys:
      valid, is_ai_generated, ai_generated_confidence,
      damage_type, severity, confidence, reason,
      all_detections
    """

    result = {
        "valid":                  True,
        "is_ai_generated":        False,
        "ai_generated_confidence": 0.0,
        "damage_type":            "Unknown",
        "severity":               "Unknown",
        "confidence":             0.0,
        "reason":                 "",
        "all_detections":         [],
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

    # ── Step 2: YOLO damage classification — MULTI-DETECTION ───────────────
    if result["valid"]:
        try:
            all_detections = []

            if pothole_model:
                p_results = pothole_model(image_path)
                if p_results and p_results[0].boxes:
                    h, w = p_results[0].orig_shape[:2]
                    has_segments = hasattr(p_results[0], 'masks') and p_results[0].masks is not None
                    for i, box in enumerate(p_results[0].boxes):
                        conf = float(box.conf[0])
                        if conf < 0.35:
                            continue
                        x1, y1, x2, y2 = box.xyxy[0].tolist()
                        det = {
                            "class": "pothole",
                            "label": "pothole",
                            "confidence": round(conf, 4),
                            "severity": _severity_from_bbox_norm(
                                [round(x1/w,4), round(y1/h,4), round(x2/w,4), round(y2/h,4)],
                                confidence=conf
                            ),
                            "box": [round(x1, 2), round(y1, 2), round(x2, 2), round(y2, 2)],
                            "norm_bbox": [
                                round(x1 / w, 4), round(y1 / h, 4),
                                round(x2 / w, 4), round(y2 / h, 4)
                            ],
                            "x_norm": round(x1 / w, 4),
                            "y_norm": round(y1 / h, 4),
                            "w_norm": round((x2 - x1) / w, 4),
                            "h_norm": round((y2 - y1) / h, 4),
                        }
                        if has_segments and i < len(p_results[0].masks.xy):
                            seg = p_results[0].masks.xy[i]
                            if len(seg) >= 3:
                                det["segments"] = [[float(x), float(y)] for x, y in seg]
                                det["segments_norm"] = [
                                    [round(float(x) / w, 4), round(float(y) / h, 4)]
                                    for x, y in seg
                                ]

                        # ── FALLBACK: detection model → synthetic box polygon ──
                        if not det.get("segments"):
                            det["segments"] = [
                                [round(x1, 2), round(y1, 2)],
                                [round(x2, 2), round(y1, 2)],
                                [round(x2, 2), round(y2, 2)],
                                [round(x1, 2), round(y2, 2)],
                            ]
                            det["segments_norm"] = [
                                [round(x1 / w, 4), round(y1 / h, 4)],
                                [round(x2 / w, 4), round(y1 / h, 4)],
                                [round(x2 / w, 4), round(y2 / h, 4)],
                                [round(x1 / w, 4), round(y2 / h, 4)],
                            ]

                        all_detections.append(det)

            if crack_model:
                c_results = crack_model(image_path)
                if c_results and c_results[0].boxes:
                    h, w = c_results[0].orig_shape[:2]
                    has_segments = hasattr(c_results[0], 'masks') and c_results[0].masks is not None
                    for i, box in enumerate(c_results[0].boxes):
                        conf = float(box.conf[0])
                        if conf < 0.28:
                            continue
                        x1, y1, x2, y2 = box.xyxy[0].tolist()
                        det = {
                            "class": "crack",
                            "label": "crack",
                            "confidence": round(conf, 4),
                            "severity": _severity_from_bbox_norm(
                                [round(x1/w,4), round(y1/h,4), round(x2/w,4), round(y2/h,4)],
                                confidence=conf
                            ),
                            "box": [round(x1, 2), round(y1, 2), round(x2, 2), round(y2, 2)],
                            "norm_bbox": [
                                round(x1 / w, 4), round(y1 / h, 4),
                                round(x2 / w, 4), round(y2 / h, 4)
                            ],
                            "x_norm": round(x1 / w, 4),
                            "y_norm": round(y1 / h, 4),
                            "w_norm": round((x2 - x1) / w, 4),
                            "h_norm": round((y2 - y1) / h, 4),
                        }
                        if has_segments and i < len(c_results[0].masks.xy):
                            seg = c_results[0].masks.xy[i]
                            if len(seg) >= 3:
                                det["segments"] = [[float(x), float(y)] for x, y in seg]
                                det["segments_norm"] = [
                                    [round(float(x) / w, 4), round(float(y) / h, 4)]
                                    for x, y in seg
                                ]

                        # ── FALLBACK: detection model → synthetic box polygon ──
                        if not det.get("segments"):
                            det["segments"] = [
                                [round(x1, 2), round(y1, 2)],
                                [round(x2, 2), round(y1, 2)],
                                [round(x2, 2), round(y2, 2)],
                                [round(x1, 2), round(y2, 2)],
                            ]
                            det["segments_norm"] = [
                                [round(x1 / w, 4), round(y1 / h, 4)],
                                [round(x2 / w, 4), round(y1 / h, 4)],
                                [round(x2 / w, 4), round(y2 / h, 4)],
                                [round(x1 / w, 4), round(y2 / h, 4)],
                            ]

                        all_detections.append(det)

            if all_detections:
                all_detections.sort(key=lambda d: d["confidence"], reverse=True)
                best = all_detections[0]
                result["damage_type"] = best["class"]
                result["confidence"]  = best["confidence"]
                
                # Production-grade tiered severity
                crit_dets = [d for d in all_detections if d.get("severity") == "critical"]
                logger.info(f"[DEBUG] all_detections severities: {[d.get('severity') for d in all_detections]}")
                logger.info(f"[DEBUG] crit_dets count: {len(crit_dets)}, confidences: {[d.get('confidence') for d in crit_dets]}")
                if any(d.get("confidence", 0) >= 0.85 for d in crit_dets):
                    result["severity"] = "critical"
                elif len(crit_dets) >= 2:
                    result["severity"] = "critical"
                elif len(crit_dets) == 1 and crit_dets[0].get("confidence", 0) >= 0.70:
                    result["severity"] = "critical"
                else:
                    result["severity"] = "non_critical"
                unique_types = list(set(d["class"] for d in all_detections))
                result["reason"] = f"Detected: {', '.join(unique_types)}"
                logger.info("YOLO result — types: %s  best_conf: %.2f  total_dets: %d",
                            unique_types, best["confidence"], len(all_detections))
            else:
                result["reason"] = "No road damage detected."
                logger.info("YOLO found no damage in: %s", image_path)

            result["all_detections"] = all_detections

        except Exception as e:
            logger.exception("YOLO processing failed: %s", e)

    return result


def resolve_hybrid(frame_results: list[dict]) -> dict:
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

    total_detections = sum(len(c) for c in scores.values())
    all_confs        = [c for confs in scores.values() for c in confs]
    avg_conf         = sum(all_confs) / len(all_confs)

    # Majority-based severity: critical only if most detections are critical
    crit_count = sum(1 for r in frame_results if r.get("severity") == "critical")
    severity = "critical" if crit_count > len(frame_results) / 2 else "non_critical"
    
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