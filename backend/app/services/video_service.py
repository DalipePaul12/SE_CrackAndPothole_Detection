import cv2, uuid, os
from pathlib import Path

FRAME_DIR = "static/frames"
MAX_DURATION_SEC = 10
SAMPLE_FPS = 5

def extract_and_analyze_frames(video_path: str, pothole_model, crack_model) -> list[dict]:
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = total_frames / fps

    if duration > MAX_DURATION_SEC:
        raise ValueError("Video exceeds 10 seconds")

    interval = int(fps / SAMPLE_FPS)
    results = []
    frame_idx = 0

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        if frame_idx % interval == 0:
            for model, damage_type in [(pothole_model, "pothole"), (crack_model, "crack")]:
                detections = model(frame)
                for det in detections[0].boxes:
                    conf = float(det.conf)
                    if conf >= 0.5:  # confidence threshold
                        # Save annotated frame crop
                        fname = f"{uuid.uuid4()}.jpg"
                        fpath = os.path.join(FRAME_DIR, fname)
                        # Draw bbox and save
                        x1,y1,x2,y2 = map(int, det.xyxy[0])
                        cropped = frame[y1:y2, x1:x2]
                        cv2.imwrite(fpath, cropped)

                        results.append({
                            "frame_index": frame_idx,
                            "damage_type": damage_type,
                            "confidence": conf,
                            "image_path": fpath,
                            "bbox": [x1,y1,x2,y2]
                        })
        frame_idx += 1

    cap.release()
    return results