// frontend/src/hooks/useVideoStream.js

import { useState, useRef, useCallback } from "react";

const BASE_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

/**
 * Streams NDJSON from /analyze/video/stream.
 * Yields per-frame detections in real time.
 *
 * Returns: { stream, progress, detections, finalResult, error }
 */
export function useVideoStream() {
  const [progress, setProgress]         = useState(null);  // { processed, total }
  const [detections, setDetections]     = useState([]);    // current frame boxes
  const [finalResult, setFinalResult]   = useState(null);
  const [error, setError]               = useState(null);
  const abortRef = useRef(null);

  const stream = useCallback(async (file) => {
    setProgress(null);
    setDetections([]);
    setFinalResult(null);
    setError(null);

    const token = localStorage.getItem("access_token");
    const formData = new FormData();
    formData.append("file", file);

    abortRef.current = new AbortController();

    try {
      const res = await fetch(`${BASE_URL}/api/v1/ml/analyze/video/stream`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        setError(`Server error ${res.status}`);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop(); // keep incomplete line

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            handleEvent(event);
          } catch {
            // malformed line — skip
          }
        }
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        setError("Stream connection failed.");
      }
    }
  }, []);

  function handleEvent(event) {
    switch (event.type) {
      case "start":
        setProgress({ processed: 0, total: event.total_frames });
        break;
      case "progress":
        setProgress((p) => ({ ...p, processed: event.processed, total: event.total }));
        // Only update overlay if this frame had detections
        if (event.detections?.length) {
          setDetections(event.detections);
        }
        break;
      case "done":
        setFinalResult(event);
        if (!event.detected) setDetections([]);
        break;
      default:
        break;
    }
  }

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { stream, progress, detections, finalResult, error, cancel };
}