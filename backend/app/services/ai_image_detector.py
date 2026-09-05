

from __future__ import annotations

import asyncio
import logging
from typing import Any

import cv2
import numpy as np

try:
    import httpx
    HAS_HTTPX = True
except ImportError:
    HAS_HTTPX = False

try:
    from app.core.config import settings
except ImportError:
    class _Settings:
        AI_FAKE_DETECTION_ENABLED = True
        HF_API_TOKEN = ""
    settings = _Settings()

logger = logging.getLogger(__name__)

# ── Configuration ───────────────────────────────────────────────────────────

_HF_MODEL = "umm-maybe/AI-image-detector"
_HF_TIMEOUT = 12

# THRESHOLDS (adjust these to tune sensitivity)
_AI_THRESHOLD = 0.25          # hardcoded weighted score >= this → AI
_HF_THRESHOLD = 0.25          # HF artificial score >= this → AI

# 8-signal weights (must sum to 1.0)
_WEIGHTS: dict[str, float] = {
    "noise_floor":          0.20,
    "texture_regularity":   0.18,
    "color_naturalness":    0.15,
    "edge_coherence":       0.14,
    "frequency_slope":      0.13,
    "chromatic_aberration": 0.10,
    "laplacian_ratio":      0.06,
    "dct_block_artifact":   0.04,
}
assert abs(sum(_WEIGHTS.values()) - 1.0) < 1e-6, "Weights must sum to 1.0"


# ═════════════════════════════════════════════════════════════════════════════
# PUBLIC API
# ═════════════════════════════════════════════════════════════════════════════

async def detect_ai_generated(
    image_bytes: bytes,
    *,
    max_dimension: int = 1024,
) -> dict[str, Any]:
    """
    Analyse image_bytes and return an authenticity verdict dict.

    Order:
      1. HuggingFace inference (if enabled & token present).
      2. If HF fails / timeouts / returns garbage → 8-signal hardcoded fallback.
      3. If image cannot be decoded → skipped.
    """
    # Try HF first
    hf_result = await _try_hf(image_bytes)
    if hf_result is not None:
        logger.info("HF verdict: %s", hf_result)
        return hf_result

    # Fallback to hardcoded 8-signal analysis
    logger.info("HF unavailable — falling back to hardcoded 8-signal detector")
    return _hardcoded_detect(image_bytes, max_dimension)


# ═════════════════════════════════════════════════════════════════════════════
# HUGGINGFACE PATH
# ═════════════════════════════════════════════════════════════════════════════

async def _try_hf(image_bytes: bytes) -> dict[str, Any] | None:
    """Return HF result, or None if we should fall back to hardcoded."""
    if not settings.AI_FAKE_DETECTION_ENABLED:
        return None
    if not HAS_HTTPX:
        logger.warning("httpx not installed — skipping HF.")
        return None

    token = (getattr(settings, "HF_API_TOKEN", None) or "").strip()
    if not token or len(token) < 20:
        logger.warning("HF_API_TOKEN missing or too short — skipping HF.")
        logger.info(f"HF token in use, first/last 4 chars: {token[:4]}...{token[-4:] if len(token) > 4 else ''}")
        return None

    url = f"https://router.huggingface.co/hf-inference/models/{_HF_MODEL}"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/octet-stream",
    }

    try:
        return await _hf_post(image_bytes, url, headers)
    except Exception as exc:
        logger.warning("HF async request failed: %s", exc)
        return None


async def _hf_post(image_bytes: bytes, url: str, headers: dict) -> dict[str, Any] | None:
    try:
        async with httpx.AsyncClient(timeout=_HF_TIMEOUT) as client:
            resp = await client.post(url, headers=headers, content=image_bytes)
            logger.debug("HF status=%s body=%s", resp.status_code, resp.text[:200])

            # 503 = model loading; wait once then retry
            if resp.status_code == 503:
                logger.info("HF model loading (503) — waiting 5 s then retrying.")
                await asyncio.sleep(5)
                resp = await client.post(url, headers=headers, content=image_bytes)

            if resp.status_code != 200:
                logger.warning("HF returned %s — falling back.", resp.status_code)
                return None

        data = resp.json()
        if not isinstance(data, list) or not data:
            logger.warning("HF unexpected body shape — falling back.")
            return None

        # Normalise labels to lowercase for consistent lookup
        scores: dict[str, float] = {
            item["label"].lower(): item["score"] for item in data 
            if "label" in item and "score" in item
        }
        logger.info("HF RAW SCORES: %s", scores)

        # umm-maybe/AI-image-detector mapping:
        #   label_0 / "real" / "human"      = real
        #   label_1 / "artificial" / "fake" = AI
        artificial_score_raw = (
            scores.get("artificial")
            if scores.get("artificial") is not None
            else scores.get("ai-generated")
            if scores.get("ai-generated") is not None
            else scores.get("fake")
            if scores.get("fake") is not None
            else scores.get("deepfake")
            if scores.get("deepfake") is not None
            else scores.get("generated")
            if scores.get("generated") is not None
            else scores.get("label_1")
        )
        real_score_raw = (
            scores.get("real")
            if scores.get("real") is not None
            else scores.get("human")
            if scores.get("human") is not None
            else scores.get("authentic")
            if scores.get("authentic") is not None
            else scores.get("label_0")
        )

        # If the HF API returned only one label (top-1 response instead of
        # the full distribution), the other score is genuinely missing —
        # not zero. Derive it as the complement so a REAL result doesn't
        # display as a misleading 0% just because "real"/"human" wasn't
        # a key in the response.
        if artificial_score_raw is None and real_score_raw is not None:
            artificial_score_raw = max(0.0, 1.0 - real_score_raw)
        if real_score_raw is None and artificial_score_raw is not None:
            real_score_raw = max(0.0, 1.0 - artificial_score_raw)

        artificial_score: float = artificial_score_raw or 0.0
        real_score: float = real_score_raw or 0.0

        logger.info(
            "HF DECISION: artificial=%.3f real=%.3f",
            artificial_score, real_score
        )

        # Uninterpretable response → fall back to hardcoded
        if artificial_score == 0.0 and real_score == 0.0:
            logger.warning("HF scores uninterpretable — falling back.")
            return None

        # STRICT: Only call it REAL if real_score is clearly higher
        # STRICT DECISION LOGIC:
        # AI if: artificial_score >= threshold AND artificial_score >= real_score
        # Otherwise: REAL (but only if real_score is clearly higher)
        is_ai = artificial_score >= _HF_THRESHOLD and artificial_score >= real_score
        
        # For confidence display:
        # - If AI detected: show how confident we are it's AI (artificial_score)
        # - If REAL: show how confident we are it's REAL (real_score)
        # This fixes the "64% authenticity but says REAL" bug
        display_confidence = artificial_score if is_ai else real_score

        # NEW: If scores are close (within 0.15), don't blindly trust REAL
        # Instead, use hardcoded fallback for a second opinion
        score_gap = abs(artificial_score - real_score)
        if not is_ai and score_gap < 0.15 and artificial_score > 0.20:
            logger.warning(
                "HF uncertain: artificial=%.3f real=%.3f gap=%.3f — using hardcoded fallback",
                artificial_score, real_score, score_gap
            )
            return None  # Triggers hardcoded fallback

        return {
            "is_ai_generated": is_ai,
            "confidence": round(display_confidence, 4),
            "status": "rejected" if is_ai else "approved_for_classification",
            "method": "model",
            "model": _HF_MODEL,
            "ai_score": round(artificial_score, 4),
            "raw_scores": {
                **scores,
                "_artificial_score": round(artificial_score, 4),
                "_real_score": round(real_score, 4),
            },
        }

    except httpx.TimeoutException:
        logger.warning("HF request timed out — falling back.")
        return None
    except Exception as exc:
        logger.error("HF unexpected error: %s — falling back.", exc)
        return None


# ═════════════════════════════════════════════════════════════════════════════
# HARDCODED 8-SIGNAL FALLBACK
# ═════════════════════════════════════════════════════════════════════════════

def _hardcoded_detect(image_bytes: bytes, max_dim: int = 1024) -> dict[str, Any]:
    """8-signal heuristic. Always returns a verdict — never None."""
    try:
        img = _decode(image_bytes, max_dim)
    except Exception as exc:
        logger.warning("Hardcoded detector: decode failed — %s", exc)
        return _skipped_result("decode_failed")

    if img is None:
        return _skipped_result("decode_failed")

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    raw: dict[str, float] = {}

    # Run all 8 signals — each returns float in [0, 1] (1 = AI)
    raw["noise_floor"]          = _signal_noise_floor(img)
    raw["texture_regularity"]   = _signal_texture_regularity(gray)
    raw["color_naturalness"]    = _signal_color_naturalness(img)
    raw["edge_coherence"]       = _signal_edge_coherence(gray)
    raw["frequency_slope"]      = _signal_frequency_slope(gray)
    raw["chromatic_aberration"] = _signal_chromatic_aberration(img)
    raw["laplacian_ratio"]      = _signal_laplacian_ratio(gray)
    raw["dct_block_artifact"]   = _signal_dct_block_artifact(gray)

    # Weighted sum
    ai_score = float(sum(_WEIGHTS[k] * raw[k] for k in _WEIGHTS))
    ai_score = max(0.0, min(1.0, ai_score))
    # Decision: reject if clearly AI, approve if clearly real
    is_ai = ai_score >= _AI_THRESHOLD

    # Confidence = distance from the ACTUAL decision threshold, not a fixed
    # 0.5 midpoint. The old formula disagreed with _AI_THRESHOLD (0.25),
    # so an ai_score of ~0.5 — well past the AI threshold — was showing as
    # 0% confidence while still being flagged as AI. This scales confidence
    # relative to how far ai_score sits from the threshold on whichever
    # side it falls.
    if is_ai:
        # How far above the AI threshold, scaled 0.0 (at threshold) to 1.0 (max score)
        span = max(1.0 - _AI_THRESHOLD, 1e-6)
        confidence = round(min(1.0, (ai_score - _AI_THRESHOLD) / span), 4)
    else:
        # How far below the AI threshold, scaled 0.0 (at threshold) to 1.0 (score of 0)
        span = max(_AI_THRESHOLD, 1e-6)
        confidence = round(min(1.0, (_AI_THRESHOLD - ai_score) / span), 4)

    logger.info(
        "Hardcoded detector: ai_score=%.3f is_ai=%s signals=%s",
        ai_score, is_ai,
        {k: round(v, 3) for k, v in raw.items()},
    )

    return {
        "is_ai_generated": is_ai,
        "confidence": confidence,
        "status": "rejected" if is_ai else "approved_for_classification",
        "method": "heuristic_fallback",
        "model": "hardcoded_multi_signal_v1",
        "ai_score": round(ai_score, 4),
        "raw_scores": {k: round(v, 4) for k, v in raw.items()},
    }


# ── Helpers ─────────────────────────────────────────────────────────────────

def _decode(image_bytes: bytes, max_dim: int) -> np.ndarray | None:
    arr = np.frombuffer(image_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        return None
    h, w = img.shape[:2]
    if max(h, w) > max_dim:
        scale = max_dim / max(h, w)
        img = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
    return img


def _skipped_result(reason: str) -> dict[str, Any]:
    return {
        "is_ai_generated": False,
        "confidence": 0.0,
        "status": "skipped",
        "method": "heuristic_fallback",
        "model": "hardcoded_multi_signal_v1",
        "ai_score": 0.0,
        "raw_scores": {"skip_reason": reason},
    }


def _safe(fn, *args, fallback: float = 0.5, **kwargs) -> float:
    try:
        val = fn(*args, **kwargs)
        return float(np.clip(val, 0.0, 1.0))
    except Exception as exc:
        logger.debug("Signal failed: %s — %s", fn.__name__, exc)
        return float(fallback)


# ── Signal 1: Noise floor ─────────────────────────────────────────────────────

def _signal_noise_floor(img: np.ndarray) -> float:
    def _measure(ch: np.ndarray) -> float:
        smooth = cv2.bilateralFilter(ch, d=9, sigmaColor=75, sigmaSpace=75)
        residual = ch.astype(np.float32) - smooth.astype(np.float32)
        return float(np.std(residual))

    b, g, r = cv2.split(img)
    stds = [_measure(ch) for ch in (b, g, r)]
    avg_std = np.mean(stds)
    score = 1.0 - min(avg_std / 8.0, 1.0)
    return _safe(lambda: score)


# ── Signal 2: Texture regularity (LBP proxy) ────────────────────────────────

def _signal_texture_regularity(gray: np.ndarray) -> float:
    def _run() -> float:
        img_f = gray.astype(np.float32)
        blur = cv2.GaussianBlur(img_f, (5, 5), 0)
        sq_blur = cv2.GaussianBlur(img_f ** 2, (5, 5), 0)
        local_var = np.maximum(sq_blur - blur ** 2, 0.0)

        mean_lv = float(np.mean(local_var)) + 1e-6
        std_lv = float(np.std(local_var))
        cv_lv = std_lv / mean_lv

        return 1.0 - min(cv_lv / 1.5, 1.0)

    return _safe(_run)


# ── Signal 3: Color naturalness ───────────────────────────────────────────────

def _signal_color_naturalness(img: np.ndarray) -> float:
    def _run() -> float:
        hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
        sat = hsv[:, :, 1].astype(np.float32)

        mean_sat = float(np.mean(sat))
        high_sat_frac = float(np.mean(sat > 160))

        sat_score = min(mean_sat / 90.0, 1.0)
        frac_score = min(high_sat_frac / 0.15, 1.0)
        return sat_score * 0.6 + frac_score * 0.4

    return _safe(_run)


# ── Signal 4: Edge coherence ──────────────────────────────────────────────────

def _signal_edge_coherence(gray: np.ndarray) -> float:
    def _run() -> float:
        edges_tight = cv2.Canny(gray, 100, 200)
        edges_loose = cv2.Canny(gray, 30, 80)

        strong = float(np.sum(edges_tight > 0))
        weak = float(np.sum(edges_loose > 0)) - strong

        if (strong + weak) < 100:
            return 0.5

        ratio = strong / (strong + weak + 1e-6)
        score = (ratio - 0.35) / 0.40
        return float(np.clip(score, 0.0, 1.0))

    return _safe(_run)


# ── Signal 5: Frequency slope (1/f power spectrum) ────────────────────────────

def _signal_frequency_slope(gray: np.ndarray) -> float:
    def _run() -> float:
        h, w = gray.shape
        sz = min(h, w, 512)
        crop = gray[:sz, :sz].astype(np.float32)

        f = np.fft.fft2(crop)
        psd = np.abs(np.fft.fftshift(f)) ** 2

        cy, cx = sz // 2, sz // 2
        y_idx, x_idx = np.indices((sz, sz))
        r = np.sqrt((x_idx - cx) ** 2 + (y_idx - cy) ** 2).astype(int)

        max_r = sz // 2
        r_flat = r.ravel()
        psd_flat = psd.ravel()

        radial_mean = np.array([
            np.mean(psd_flat[r_flat == ri]) if np.any(r_flat == ri) else 1.0
            for ri in range(1, max_r)
        ])
        radial_mean = np.maximum(radial_mean, 1e-10)

        log_r = np.log(np.arange(1, max_r, dtype=np.float32))
        log_psd = np.log(radial_mean.astype(np.float32))

        n = len(log_r)
        slope = (n * np.dot(log_r, log_psd) - log_r.sum() * log_psd.sum()) / \
                (n * np.dot(log_r, log_r) - log_r.sum() ** 2 + 1e-9)

        score = (slope + 2.5) / 1.0
        return float(np.clip(score, 0.0, 1.0))

    return _safe(_run)


# ── Signal 6: Chromatic aberration ────────────────────────────────────────────

def _signal_chromatic_aberration(img: np.ndarray) -> float:
    def _run() -> float:
        b, g, r = cv2.split(img.astype(np.float32))
        edges = cv2.Canny(cv2.convertScaleAbs(g), 80, 160)
        edge_mask = edges > 0

        if edge_mask.sum() < 200:
            return 0.5

        rg_diff = float(np.mean(np.abs(r[edge_mask] - g[edge_mask])))
        bg_diff = float(np.mean(np.abs(b[edge_mask] - g[edge_mask])))
        ca_mean = (rg_diff + bg_diff) / 2.0

        score = 1.0 - min(ca_mean / 4.0, 1.0)
        return float(np.clip(score, 0.0, 1.0))

    return _safe(_run)


# ── Signal 7: Laplacian ratio (depth of field) ──────────────────────────────

def _signal_laplacian_ratio(gray: np.ndarray) -> float:
    def _run() -> float:
        h, w = gray.shape
        lap = cv2.Laplacian(gray, cv2.CV_64F)
        lap2 = lap ** 2

        cy, cx = h // 2, w // 2
        rh, rw = h // 6, w // 6
        centre = lap2[cy - rh: cy + rh, cx - rw: cx + rw]

        corner_size = min(h, w) // 6
        corners = np.concatenate([
            lap2[:corner_size, :corner_size].ravel(),
            lap2[:corner_size, -corner_size:].ravel(),
            lap2[-corner_size:, :corner_size].ravel(),
            lap2[-corner_size:, -corner_size:].ravel(),
        ])

        var_centre = float(np.mean(centre)) + 1e-6
        var_corner = float(np.mean(corners)) + 1e-6
        ratio = var_centre / var_corner

        score = 1.0 - (ratio - 1.3) / 1.2
        return float(np.clip(score, 0.0, 1.0))

    return _safe(_run)


# ── Signal 8: JPEG DCT block artifact ─────────────────────────────────────────

def _signal_dct_block_artifact(gray: np.ndarray) -> float:
    def _run() -> float:
        img_f = gray.astype(np.float32)
        h, w = img_f.shape

        h_crop = (h // 8) * 8
        w_crop = (w // 8) * 8
        img_f = img_f[:h_crop, :w_crop]

        h_diff = np.abs(
            img_f[8::8, :] - img_f[7:h_crop - 1:8, :]
        ).mean() if h_crop > 16 else 0.0

        v_diff = np.abs(
            img_f[:, 8::8] - img_f[:, 7:w_crop - 1:8]
        ).mean() if w_crop > 16 else 0.0

        internal_h = np.abs(np.diff(img_f, axis=0)).mean() + 1e-6
        internal_v = np.abs(np.diff(img_f, axis=1)).mean() + 1e-6

        ratio_h = h_diff / internal_h
        ratio_v = v_diff / internal_v
        ratio = (ratio_h + ratio_v) / 2.0

        score = 1.0 - (ratio - 0.8) / 0.7
        return float(np.clip(score, 0.0, 1.0))

    return _safe(_run)